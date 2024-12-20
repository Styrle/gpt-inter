import { processTextWithMathAndMarkdown } from './mathProcessing.js';

export class ChatUI {
    constructor() {
        this.chatBox = document.getElementById('chat-box');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.chatHistoryList = document.getElementById('chat-history');
        this.welcomeContainer = document.getElementById('welcome-container');
    }

    showWelcomeScreen(userName) {
        this.welcomeContainer.style.display = 'block';
        const welcomeMessage = this.welcomeContainer.querySelector('p');
        welcomeMessage.textContent = `Welcome ${userName} to KaplanGPT! ...`;
    }

    hideWelcomeScreen() {
        this.welcomeContainer.style.display = 'none';
    }

    appendMessage(sender, message, isLoading = false) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("message", sender === "You" ? "user" : "ai");

        const messageContent = document.createElement("div");
        messageContent.classList.add("message-content");
        
        if (sender === "AI") {
            const aiIcon = document.createElement("img");
            aiIcon.src = "images/K_logo.svg";
            aiIcon.alt = "AI Icon";
            aiIcon.classList.add("ai-icon");

            const messageBody = document.createElement("div");
            messageBody.classList.add("message-body");
            
            if (isLoading) {
                const loadingDots = document.createElement("div");
                loadingDots.classList.add("loading-dots");
                loadingDots.innerHTML = "<div></div><div></div><div></div>";
                messageBody.appendChild(loadingDots);
            } else {
                // Render message with markdown & math
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");
                messageText.innerHTML = processTextWithMathAndMarkdown(message);
                messageBody.appendChild(messageText);
            }

            messageContent.appendChild(aiIcon);
            messageContent.appendChild(messageBody);
        } else if (sender === "You") {
            const messageBody = document.createElement("div");
            messageBody.classList.add("message-body");
            const messageText = document.createElement("div");
            messageText.classList.add("message-text");
            messageText.textContent = message;
            messageBody.appendChild(messageText);
            messageContent.appendChild(messageBody);
        } else if (sender === "System") {
            const messageBody = document.createElement("div");
            messageBody.classList.add("message-body");
            const messageText = document.createElement("div");
            messageText.classList.add("message-text");
            messageText.textContent = message;
            messageBody.appendChild(messageText);
            messageContent.appendChild(messageBody);
        }

        messageElement.appendChild(messageContent);
        this.chatBox.appendChild(messageElement);
        this.chatBox.scrollTop = this.chatBox.scrollHeight;

        // MathJax rendering if needed
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([messageElement]).catch(err => console.error("MathJax rendering failed:", err));
        }

        return messageElement;
    }

    clearChatBox() {
        this.chatBox.innerHTML = '';
    }

    appendFileLink(fileName, fileUrl) {
        const fileElement = document.createElement('div');
        fileElement.classList.add('file-upload-container', 'user');
        
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');

        const fileLink = document.createElement('a');
        fileLink.href = fileUrl || '#';
        fileLink.textContent = fileName;
        fileLink.classList.add('file-link');

        messageContent.appendChild(fileLink);

        const deleteButton = document.createElement('span');
        deleteButton.classList.add('material-symbols-rounded', 'delete-button');
        deleteButton.textContent = 'delete';
        deleteButton.title = 'Delete this file message';

        deleteButton.addEventListener('click', () => {
            this.chatBox.removeChild(fileElement);
        });

        messageContent.appendChild(deleteButton);
        fileElement.appendChild(messageContent);
        this.chatBox.appendChild(fileElement);
        
        this.chatBox.scrollTop = this.chatBox.scrollHeight; 
    }
}
