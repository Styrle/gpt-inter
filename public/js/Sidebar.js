import { sanitizeText } from './utilities.js';

export class Sidebar {
    constructor(chatService, chatUI) {
        this.chatService = chatService;
        this.chatUI = chatUI;
        this.sidebar = document.getElementById('sidebar');
        this.chatHistoryList = document.getElementById('chat-history');
        this.collapseBtn = document.getElementById('collapse-btn');
        this.newChatBtn = document.getElementById('new-chat-btn');

        this.initEventListeners();
    }

    initEventListeners() {
        this.newChatBtn.addEventListener('click', () => {
            this.chatUI.clearChatBox();
            this.chatUI.showWelcomeScreen(sessionStorage.getItem('userName'));
            const newChatId = this.chatService.generateChatId();
            this.chatService.setChatId(newChatId);
            this.loadChatHistory();
            this.chatService.isFirstInteraction = true;
        });

        this.collapseBtn.addEventListener('click', () => this.toggleSidebar());
    }

    async loadChatHistory() {
        const chats = await this.chatService.loadChatHistory();
        if (!chats) return;

        this.chatHistoryList.innerHTML = '';
        const orderedCategories = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];
        const availableCategories = orderedCategories.filter(category => chats[category]);

        for (const category of availableCategories) {
            const categoryItem = document.createElement('li');
            categoryItem.textContent = category;
            categoryItem.classList.add('chat-category-list');
            this.chatHistoryList.appendChild(categoryItem);

            const chatItems = document.createElement('ul');
            const reversedChats = chats[category].slice().reverse();

            for (const chat of reversedChats) {
                const chatItem = document.createElement('li');
                chatItem.dataset.chatId = chat.chatId;
                chatItem.classList.add('chat-item');
                chatItem.setAttribute('role', 'group');
                chatItem.setAttribute('aria-label', `Chat item for ${sanitizeText(chat.title)}`);

                chatItem.addEventListener('click', () => this.loadChat(chat.chatId));

                const chatTitle = document.createElement('span');
                chatTitle.textContent = sanitizeText(chat.title);
                chatTitle.classList.add('chat-title');
                chatTitle.setAttribute('tabindex', '0');
                chatTitle.setAttribute('role', 'button');
                chatTitle.setAttribute('aria-label', `Chat titled ${sanitizeText(chat.title)}`);

                const binIconButton = document.createElement('button');
                binIconButton.classList.add('bin-icon-button');
                binIconButton.setAttribute('aria-label', `Delete chat titled ${sanitizeText(chat.title)}`);

                const binIcon = document.createElement('i');
                binIcon.classList.add('fas', 'fa-trash', 'bin-icon');
                binIconButton.appendChild(binIcon);

                binIconButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.chatService.deleteChat(chat.chatId);
                    this.loadChatHistory();
                });

                chatItem.appendChild(chatTitle);
                chatItem.appendChild(binIconButton);

                if (chat.visibility !== 1 && chat.visibility !== undefined) {
                    chatItem.style.display = 'none';
                }

                chatItems.appendChild(chatItem);
            }

            this.chatHistoryList.appendChild(chatItems);
        }
    }

    async loadChat(chatId) {
        const chatData = await this.chatService.loadChat(chatId);
        if (!chatData) return;
        this.chatService.setChatId(chatId);

        this.chatUI.clearChatBox();
        if (chatData.messages.length === 0) {
            this.chatUI.showWelcomeScreen(sessionStorage.getItem('userName'));
        } else {
            this.chatUI.hideWelcomeScreen();
            chatData.messages.forEach(msg => {
                this.chatUI.appendMessage(msg.role === 'user' ? 'You' : 'AI', msg.content, false);
            });
        }

        this.chatUI.chatInput.focus();
    }

    toggleSidebar() {
        // Similar to original logic
        if (this.sidebar.classList.contains('collapsed')) {
            this.sidebar.classList.remove('collapsed');
            this.chatUI.chatBox.classList.remove('collapsed');
            this.collapseBtn.textContent = 'left_panel_close';
            document.body.classList.remove('no-chat-scroll');
        } else {
            this.sidebar.classList.add('collapsed');
            this.chatUI.chatBox.classList.add('collapsed');
            this.collapseBtn.textContent = 'left_panel_open';
            document.body.classList.add('no-chat-scroll');
        }
    }
}
