import threading
import time
import queue
import json
import inspect
from typing import List, Dict, Any
from openai import OpenAI, APIError
from topchef_agent.agent import available_functions, log_to_ui, AGENT_NAME, openrouter_client
from topchef_agent.config import LLM_MODELS_TO_TRY

# Conversation context memory per session (simple in-memory dict for demo; replace with Redis/DB for production)
_conversation_contexts = {}
_context_lock = threading.Lock()

# Rate limiting data
_message_timestamps = {}
_timestamps_lock = threading.Lock()
RATE_LIMIT_COUNT = 10
RATE_LIMIT_WINDOW = 3600 # 1 hour in seconds

class InteractiveStephAI:
    def __init__(self, session_id: str, log_queue: queue.Queue = None, db_update_queue: queue.Queue = None):
        self.session_id = session_id
        self.log_queue = log_queue  # Main queue for SSE
        self.db_update_queue = db_update_queue # Keep this if agent needs to signal DB updates
        self.context = self._get_context()
        self.thread = None
        self.busy = False

    def _get_context(self) -> List[Dict[str, Any]]:
        with _context_lock:
            return _conversation_contexts.setdefault(self.session_id, [])

    def append_to_context(self, role: str, content: str):
        with _context_lock:
            self.context.append({"role": role, "content": content})

    def get_context(self) -> List[Dict[str, Any]]:
        with _context_lock:
            return list(self.context)

    def clear_context(self):
        with _context_lock:
            _conversation_contexts[self.session_id] = []
            self.context = _conversation_contexts[self.session_id]

    def is_busy(self):
        return self.busy

    def ask(self, user_message: str):
        if self.busy:
            return {"status": "busy", "message": "StephAI Botenberg est actuellement en train de traiter une autre requête. Veuillez patienter."}

        # --- RATE LIMITING START ---
        current_time = time.time()
        with _timestamps_lock:
            session_timestamps = _message_timestamps.get(self.session_id, [])
            # Filter timestamps older than the window
            valid_timestamps = [ts for ts in session_timestamps if current_time - ts < RATE_LIMIT_WINDOW]
            if len(valid_timestamps) >= RATE_LIMIT_COUNT:
                log_to_ui("rate_limit_exceeded", {"session_id": self.session_id, "count": len(valid_timestamps)}, role="system")
                rate_limit_message = f"Limite de {RATE_LIMIT_COUNT} messages par heure atteinte. Veuillez réessayer dans environ une heure."
                # Return the error immediately for the ask() caller
                return {"status": "error", "message": rate_limit_message}
            # Add current timestamp and update the stored list
            valid_timestamps.append(current_time)
            _message_timestamps[self.session_id] = valid_timestamps
        # --- RATE LIMITING END ---

        self.busy = True
        self.append_to_context("user", user_message)
        self.thread = threading.Thread(target=self._run_agent, args=(user_message,))
        self.thread.start()
        return {"status": "processing"}

    def _run_agent(self, user_message: str):
        try:
            # Compose prompt from conversation history
            prompt = self._build_prompt()
            # Use the same LLM logic as the background agent, but in a separate thread/context
            response = self._call_llm(prompt)
            self.append_to_context("assistant", response)
            # Put the final response onto the main log_queue for SSE stream
            if self.log_queue:
                response_data = {
                    "type": "interactive_response", 
                    "session_id": self.session_id, 
                    "data": {"response": response, "context": self.get_context()}
                }
                self.log_queue.put(response_data)
            else:
                print(f"Warning: log_queue not available for session {self.session_id} to send final response.")

        except Exception as e:
            print(f"Error during interactive agent run for session {self.session_id}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            # Put error onto the main log_queue
            if self.log_queue:
                error_data = {
                    "type": "interactive_error", # Use a specific error type
                    "session_id": self.session_id,
                    "data": {"error": str(e)}
                }
                self.log_queue.put(error_data)
            else:
                print(f"Warning: log_queue not available for session {self.session_id} to send error message.")

        finally:
            self.busy = False

    def _build_prompt(self) -> str:
        # Simple concatenation for now; can be improved to match LLM expectations
        history = self.get_context()
        prompt = "".join([f"{msg['role']}: {msg['content']}\n" for msg in history])
        return prompt

    def _call_llm(self, prompt: str) -> str:
        # --- OPENAI FUNCTION CALLING LOGIC (ALL TOOLS) ---
        if openrouter_client is None:
            log_to_ui("llm_error", {"error": "LLM client not configured. Check OPENROUTER_API_KEY."}, role="system")
            return "[StephAI Botenberg]: Désolé, le backend LLM n'est pas configuré. Veuillez contacter l'administrateur."

        # Dynamically build function schemas for all available tools
        function_schemas = []
        for fn_name, fn in available_functions.items():
            sig = inspect.signature(fn)
            params = {}
            required = []
            for pname, param in sig.parameters.items():
                ann = param.annotation
                if ann == int:
                    ptype = "integer"
                elif ann == float:
                    ptype = "number"
                elif ann == bool:
                    ptype = "boolean"
                else:
                    ptype = "string"
                params[pname] = {"type": ptype}
                if param.default == inspect.Parameter.empty:
                    required.append(pname)
            description = fn.__doc__.strip() if fn.__doc__ else f"Tool: {fn_name}"
            function_schemas.append({
                "name": fn_name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": params,
                    "required": required if required else [],
                }
            })

        llm_models_to_try = LLM_MODELS_TO_TRY
        tools = [{"type": "function", "function": schema} for schema in function_schemas]

        history = self.get_context()
        messages = []
        messages.append({
            "role": "system",
            "content": (
                "Tu es StephAI Botenberg, l'assistant expert pour la curation des données de Top Chef France. Tu réponds toujours en français, avec le style et le charisme de Stéphane Rotenberg. Fais preuve d'élégance, d'humour subtil, et guide l'utilisateur comme dans l'émission Top Chef. Tu expliques chaque action et résultat de façon claire, pédagogique et engageante, sans jamais briser le personnage."
            )
        })
        for msg in history:
            role = msg["role"] if msg["role"] in ("user", "assistant", "system") else "user"
            messages.append({"role": role, "content": msg["content"]})

        last_api_error = None
        successful_model = None
        max_iterations = 6  # Prevent infinite loops
        iteration = 0
        while iteration < max_iterations:
            iteration += 1
            response = None
            for model_name in llm_models_to_try:
                log_to_ui("llm_attempt", {"model": model_name, "iteration": iteration}, role="system")
                try:
                    log_to_ui("llm_request", {"messages": messages, "tools": tools, "model": model_name}, role="system")
                    response = openrouter_client.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        tools=tools,
                        tool_choice="auto",
                        max_tokens=300,
                        temperature=0.7,
                        stream=False
                    )
                    try:
                        log_to_ui("llm_raw_response", {"raw_response": str(response)}, role="system")
                    except Exception as log_exc:
                        print(f"Failed to log raw LLM response: {log_exc}", flush=True)
                    if not response or not response.choices or len(response.choices) == 0:
                        log_to_ui("llm_error", {"model": model_name, "error": "Invalid or empty response", "response_raw": str(response)}, role="system")
                        response = None
                        continue
                    successful_model = model_name
                    break
                except Exception as e:
                    log_to_ui("llm_error", {"model": model_name, "error": str(e)}, role="system")
                    last_api_error = e
                    continue

            if not successful_model:
                log_to_ui("llm_error", {"error": "All LLM models failed", "last_api_error": str(last_api_error)}, role="system")
                return "[StephAI Botenberg]: Désolé, tous les modèles de langage ont échoué. Veuillez réessayer plus tard."

            choice = response.choices[0] if hasattr(response, 'choices') and response.choices else None
            msg = getattr(choice, "message", None) if choice else None
            # --- SUPPORT BOTH tool_calls (list) AND tool_call (single) ---
            tool_calls = []
            if msg:
                # OpenAI v1: tool_calls is a list of tool call objects
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    tool_calls = msg.tool_calls
                # OpenAI v0: tool_call is a single object
                elif hasattr(msg, "tool_call") and msg.tool_call:
                    tool_calls = [msg.tool_call]
            
            if choice and getattr(choice, "finish_reason", None) in ("tool_call", "tool_calls") and tool_calls:
                for tool_call in tool_calls:
                    tool_name = getattr(tool_call, "function", None)
                    if tool_name and hasattr(tool_name, "name"):
                        tool_name = tool_name.name
                        tool_args = json.loads(getattr(tool_call.function, "arguments", "{}")) if getattr(tool_call.function, "arguments", None) else {}
                    else:
                        tool_name = getattr(tool_call, "name", None)
                        tool_args = json.loads(getattr(tool_call, "arguments", "{}")) if getattr(tool_call, "arguments", None) else {}
                    log_to_ui("llm_tool_call", {"tool": tool_name, "arguments": tool_args, "iteration": iteration}, role=AGENT_NAME)
                    if tool_name in available_functions:
                        try:
                            tool_result = available_functions[tool_name](**tool_args)
                        except Exception as tool_exc:
                            log_to_ui("tool_error", {"tool": tool_name, "error": str(tool_exc)}, role="system")
                            return f"[StephAI Botenberg]: Désolé, il y a eu une erreur lors de l'exécution de l'outil {tool_name} : {tool_exc}"
                        # Add the function result as a function response
                        messages.append({
                            "role": "function",
                            "name": tool_name,
                            "content": tool_result
                        })
                    else:
                        return f"[StephAI Botenberg]: Outil inconnu: {tool_name}"
                continue  # Loop again so LLM can react to tool result (may chain tools)
            # If no tool call, return the LLM's message
            if msg and getattr(msg, "content", None):
                return msg.content
        # If we exit loop without a return, something went wrong
        return "[StephAI Botenberg]: Je n'ai pas compris la demande ou trop d'appels d'outils."


# Session management for interactive agents
_interactive_agents = {}
_agent_lock = threading.Lock()

def get_interactive_agent(session_id: str, log_queue: queue.Queue = None, db_update_queue: queue.Queue = None) -> InteractiveStephAI:
    """Retrieves or creates an interactive agent instance for a given session ID."""
    with _agent_lock:
        if session_id not in _interactive_agents:
            print(f"Creating new interactive agent for session: {session_id}")
            # Pass the queues to the constructor
            _interactive_agents[session_id] = InteractiveStephAI(session_id, log_queue, db_update_queue)
        else:
             # Ensure existing agent has queues if they were not passed initially (e.g. server restart)
             agent = _interactive_agents[session_id]
             if not agent.log_queue and log_queue:
                 agent.log_queue = log_queue
             if not agent.db_update_queue and db_update_queue:
                 agent.db_update_queue = db_update_queue

        return _interactive_agents[session_id]
