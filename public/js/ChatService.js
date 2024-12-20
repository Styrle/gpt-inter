export class ChatService {
    constructor() {
        this.chatId = null;
        this.isTutorModeOn = false;
        this.isFirstInteraction = true;
    }

    setChatId(chatId) {
        this.chatId = chatId;
        sessionStorage.setItem('chatId', chatId);
    }

    setTutorMode(mode) {
        this.isTutorModeOn = mode;
    }

    generateChatId() {
        const userId = sessionStorage.getItem('userId') || 'anonymous';
        const randomNumber = Math.random().toString(36).substr(2, 9);
        return `${userId}_chat_${randomNumber}`;
    }

    async loadUserInfo() {
        const response = await fetch('/user-info', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login';
            return null;
        }
        const data = await response.json();
        sessionStorage.setItem('userId', data.userId);
        sessionStorage.setItem('userName', data.userName);
        return data;
    }

    async loadChatHistory() {
        try {
            const res = await fetch('/chats', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            return await res.json();
        } catch (error) {
            console.error('Error loading chat history:', error);
            return null;
        }
    }

    async loadChat(chatIdToLoad) {
        try {
            const res = await fetch(`/chats/${chatIdToLoad}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return await res.json();
        } catch (error) {
            console.error('Error retrieving chat:', error);
            return null;
        }
    }

    async deleteChat(chatId) {
        try {
            const res = await fetch(`/chats/${chatId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete chat');
            return true;
        } catch (error) {
            console.error('Error deleting chat:', error);
            return false;
        }
    }

    async sendMessage(message, selectedImageFiles = []) {
        try {
            let body;
            let headers;

            if (selectedImageFiles.length > 0) {
                body = new FormData();
                body.append('message', message);
                body.append('chatId', this.chatId);
                body.append('tutorMode', this.isTutorModeOn);
                selectedImageFiles.forEach(img => body.append('image', img));
                headers = { 'X-Requested-With': 'XMLHttpRequest' };
            } else {
                body = JSON.stringify({ message, chatId: this.chatId, tutorMode: this.isTutorModeOn });
                headers = { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                };
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: headers,
                body: body,
                credentials: 'include',
            });

            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }

            if (response.status === 429) {
                const { retryAfter } = await response.json();
                return { rateLimit: true, retryAfter };
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Error sending message:', error);
            return null;
        }
    }
}
