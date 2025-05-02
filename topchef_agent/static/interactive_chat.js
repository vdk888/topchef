// interactive_chat.js - handles the interactive StephAI chat window

document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('interactive-chat-log-area');
    const inputBox = document.getElementById('interactive-chat-input');
    const sendButton = document.getElementById('interactive-chat-send');
    let conversation = [];

    function renderConversation() {
        chatWindow.innerHTML = '';
        conversation.forEach(msg => {
            const div = document.createElement('div');
            div.className = msg.role === 'user' ? 'user-msg' : 'ai-msg';
            div.textContent = `${msg.role === 'user' ? 'You' : 'StephAI Botenberg'}: ${msg.content}`;
            chatWindow.appendChild(div);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function sendMessage() {
        const message = inputBox.value.trim();
        if (!message) return;
        conversation.push({role: 'user', content: message});
        renderConversation();
        inputBox.value = '';
        sendButton.disabled = true;
        fetch('/interactive_chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({message: message})
        })
        .then(resp => resp.json())
        .then(data => {
            if (data.status === 'done' && data.response) {
                conversation.push({role: 'assistant', content: data.response});
            } else if (data.status === 'busy') {
                conversation.push({role: 'assistant', content: data.message});
            } else if (data.status === 'processing') {
                // Poll for response
                setTimeout(() => fetchResponse(), 500);
                return;
            } else if (data.status === 'error') {
                conversation.push({role: 'assistant', content: 'Error: ' + data.error});
            }
            renderConversation();
        })
        .catch(err => {
            conversation.push({role: 'assistant', content: 'Error: ' + err});
            renderConversation();
        })
        .finally(() => {
            sendButton.disabled = false;
        });
    }

    function fetchResponse() {
        // Re-send last message to check status
        fetch('/interactive_chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({message: ''}) // Empty message triggers status check
        })
        .then(resp => resp.json())
        .then(data => {
            if (data.status === 'done' && data.response) {
                conversation.push({role: 'assistant', content: data.response});
                renderConversation();
            } else if (data.status === 'processing') {
                setTimeout(() => fetchResponse(), 500);
            }
        });
    }

    sendButton.addEventListener('click', sendMessage);
    inputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') sendMessage();
    });

    // Use variables/functions made global in index.html
    const logArea = window.interactiveLogArea;
    const logStorageKey = window.INTERACTIVE_LOG_KEY;
    let chatLogs = window.interactiveLogs || []; // Use logs loaded by index.html

    if (!logArea || !logStorageKey || !window.addLogEntry) {
        console.error("Interactive chat dependencies not found in global scope!");
        return; // Prevent errors if index.html didn't set up globals
    }

    // Load existing logs on initialization
    chatLogs.forEach(log => window.addLogEntry(log, logArea, logStorageKey, chatLogs));

    async function asyncSendMessage() {
        const message = inputBox.value.trim();
        if (!message) return;

        // Display user message immediately and save
        const userLog = { role: 'user', content: message, timestamp: Date.now() / 1000 };
        // Ensure window.userSessionId exists, otherwise use a placeholder or handle error
        const sessionId = window.userSessionId || null; 
        if (!sessionId) {
            console.error("User Session ID not found!");
             const errorLog = { role: 'system', error: `Erreur: ID de session utilisateur introuvable. Impossible d'envoyer le message.`, timestamp: Date.now() / 1000 };
             window.addLogEntry(errorLog, logArea, logStorageKey, chatLogs);
            return; // Stop if no session ID
        }

        window.addLogEntry(userLog, logArea, logStorageKey, chatLogs);

        inputBox.value = '';
        sendButton.disabled = true;
        inputBox.disabled = true;

        // Display thinking indicator
        const thinkingLog = { role: 'system', content: 'StephAI réfléchit...', timestamp: Date.now() / 1000 };
        window.addLogEntry(thinkingLog, logArea, logStorageKey, chatLogs);

        try {
            const response = await fetch('/interactive_chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message, session_id: sessionId }), // Include session_id
            });

            // Remove thinking indicator (consider moving this to SSE handler when response arrives)
            // Find and remove the 'thinking' message if needed - complex, maybe skip for now

            if (!response.ok) {
                let errorMsg = `Erreur ${response.status}`; // Default error
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorData.message || errorMsg;
                } catch (e) { /* Ignore parsing error, use status */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // REMOVED: Handling of data.status === 'done' here.
            // The final response will arrive via the SSE stream.

            if (data.status === 'error') {
                 const errorLog = { role: 'system', error: data.error, timestamp: Date.now() / 1000 };
                 window.addLogEntry(errorLog, logArea, logStorageKey, chatLogs);
            } else if (data.status === 'busy') {
                const busyLog = { role: 'system', content: data.message, timestamp: Date.now() / 1000 };
                window.addLogEntry(busyLog, logArea, logStorageKey, chatLogs);
                 // Maybe re-enable input slightly later?
                 setTimeout(() => {
                    // Check if still busy before re-enabling?
                    sendButton.disabled = false;
                    inputBox.disabled = false;
                 }, 2000);
            } else if (data.status === 'processing') {
                // This is the expected successful status now. Do nothing here, wait for SSE.
                console.log("Message sent, processing started.");
            } else {
                 // Handle other statuses or unexpected responses if necessary
                 const unknownLog = { role: 'system', content: `Réponse initiale inattendue: ${JSON.stringify(data)}`, timestamp: Date.now() / 1000 };
                 window.addLogEntry(unknownLog, logArea, logStorageKey, chatLogs);
            }

        } catch (error) {
            console.error('Error sending message:', error);
             const errorLog = { role: 'system', error: `Erreur de communication: ${error.message}`, timestamp: Date.now() / 1000 };
             window.addLogEntry(errorLog, logArea, logStorageKey, chatLogs);
        } finally {
             // Re-enable input ONLY IF NOT BUSY? Maybe move enabling to SSE handler?
             // For now, keep enabling, but could be improved.
            sendButton.disabled = false;
            inputBox.disabled = false;
            inputBox.focus();
        }
    }

    sendButton.addEventListener('click', asyncSendMessage);
    inputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') asyncSendMessage();
    });
});
