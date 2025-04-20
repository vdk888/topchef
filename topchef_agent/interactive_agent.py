import threading
import time
import queue
import json
from typing import List, Dict, Any
from openai import OpenAI, APIError
from topchef_agent.agent import available_functions, log_to_ui, AGENT_NAME

# Conversation context memory per session (simple in-memory dict for demo; replace with Redis/DB for production)
_conversation_contexts = {}
_context_lock = threading.Lock()

class InteractiveStephAI:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.context = self._get_context()
        self.response_queue = queue.Queue()
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
            return {"status": "busy", "message": "StephAI is currently processing another request. Please wait."}
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
            self.response_queue.put({"status": "done", "response": response, "context": self.get_context()})
        except Exception as e:
            self.response_queue.put({"status": "error", "error": str(e)})
        finally:
            self.busy = False

    def _build_prompt(self) -> str:
        # Simple concatenation for now; can be improved to match LLM expectations
        history = self.get_context()
        prompt = "".join([f"{msg['role']}: {msg['content']}\n" for msg in history])
        return prompt

    def _call_llm(self, prompt: str) -> str:
        # Use the same logic as run_llm_driven_agent_cycle but single-turn
        # For demo, just echo prompt (replace with actual LLM call)
        # --- BEGIN LLM LOGIC ---
        # Here you would call OpenAI, Perplexity, etc.
        # For now, return a placeholder
        return f"[StephAI]: {prompt.strip().split('user:')[-1].strip()}"
        # --- END LLM LOGIC ---

    def get_response(self, timeout=0.1):
        try:
            return self.response_queue.get(timeout=timeout)
        except queue.Empty:
            return None

# Session management for interactive agents
_interactive_agents = {}
_agent_lock = threading.Lock()

def get_interactive_agent(session_id: str) -> InteractiveStephAI:
    with _agent_lock:
        if session_id not in _interactive_agents:
            _interactive_agents[session_id] = InteractiveStephAI(session_id)
        return _interactive_agents[session_id]
