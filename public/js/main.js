import { ChatUI } from './ChatUI.js';
import { ChatService } from './ChatService.js';
import { FileUploader } from './FileUploader.js';
import { TutorModeToggle } from './TutorModeToggle.js';
import { Sidebar } from './Sidebar.js';

document.addEventListener("DOMContentLoaded", async () => {
    const chatUI = new ChatUI();
    const chatService = new ChatService();
    const sidebar = new Sidebar(chatService, chatUI);

    function displayPopup(message) {
        const popupContainer = document.createElement('div');
        popupContainer.classList.add('popup-container');
        const popupMessage = document.createElement('div');
        popupMessage.classList.add('popup-message');
        popupMessage.textContent = message;
        const closeButton = document.createElement('span');
        closeButton.classList.add('popup-close-button');
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => popupContainer.remove());
        popupContainer.appendChild(popupMessage);
        popupContainer.appendChild(closeButton);

        const chatWindow = document.querySelector('.chat-window');
        const inputContainer = document.querySelector('.input-container');
        chatWindow.insertBefore(popupContainer, inputContainer);

        setTimeout(() => {
            popupContainer.remove();
        }, 5000);
    }

    const fileUploader = new FileUploader(chatUI, displayPopup);
    const tutorModeToggle = new TutorModeToggle(chatService);

    const data = await chatService.loadUserInfo();
    if (!data) return; // User not authenticated
    chatService.setChatId(sessionStorage.getItem('chatId') || chatService.generateChatId());
    sidebar.loadChatHistory();
    chatUI.showWelcomeScreen(sessionStorage.getItem('userName'));

    // Event listener for send button
    chatUI.sendBtn.addEventListener('click', async () => {
        await handleSendMessage();
    });

    // Handle input 'Enter' key
    chatUI.chatInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await handleSendMessage();
        }
    });

    async function handleSendMessage() {
        const message = chatUI.chatInput.value.trim();
        if (message || fileUploader.selectedImageFiles.length > 0) {
            if (chatService.isFirstInteraction) {
                chatUI.hideWelcomeScreen();
                chatService.isFirstInteraction = false;
            }

            const userMessageElement = chatUI.appendMessage('You', message);
            const loadingMessageElement = chatUI.appendMessage('AI', '', true);

            chatUI.chatInput.value = '';
            chatUI.sendBtn.classList.remove('active');

            let response = await chatService.sendMessage(message, fileUploader.selectedImageFiles);
            if (response && response.rateLimit) {
                // handle rate limit message
                loadingMessageElement.remove();
                userMessageElement.remove();
                const retryAfter = response.retryAfter;
                chatUI.appendMessage('AI', `Sorry, the rate limit has been hit. Try again in ${retryAfter} seconds.`);
                return;
            }

            if (response === null) {
                loadingMessageElement.remove();
                userMessageElement.remove();
                return;
            }

            loadingMessageElement.remove();
            chatUI.appendMessage('AI', response);

            sidebar.loadChatHistory();
        }
    }

    // Additional logic for UI resizing, input growth, etc. can be added here, 
    // referencing smaller utility functions or classes as needed.
});