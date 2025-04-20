// interactive_chat.js - handles the interactive StephAI chat window

document.addEventListener('DOMContentLoaded', function() {
    const chatWindow = document.getElementById('interactive-chat-log-area');
    const inputBox = document.getElementById('interactive-chat-input');
    const sendButton = document.getElementById('interactive-chat-send');
    let conversation = [];

    function renderConversation() {
        chatWindow.innerHTML = '';
        conversation.forEach(msg => {
            const div = document.createElement('div');
            div.className = msg.role === 'user' ? 'user-msg' : 'ai-msg';
            div.textContent = `${msg.role === 'user' ? 'You' : 'StephAI'}: ${msg.content}`;
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
});
