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
    
        // Regex pattern for math includes:
        // - $$...$$
        // - \( ... \)
        // - $...$
        // - \[ ... \]
        const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[\s\S]*?\$)|(\\\[[\s\S]*?\\\])/g;
    
        function processTextWithMarkdownAndMath(text) {
            const mathSegments = [];
            let placeholderIndex = 0;
    
            // Extract math segments and replace them with placeholders
            const textWithPlaceholders = text.replace(mathPattern, (match) => {
                mathSegments.push(match);
                return `%%%MATH${placeholderIndex++}%%%`;
            });
    
            // Convert markdown (excluding math) to HTML using marked.js
            const parsedHTML = marked.parse(textWithPlaceholders);
    
            // Restore math segments
            let finalHTML = parsedHTML;
            mathSegments.forEach((segment, i) => {
                finalHTML = finalHTML.replace(`%%%MATH${i}%%%`, segment);
            });
    
            return finalHTML;
        }
    
        if (sender === "AI") {
            const aiIcon = document.createElement("img");
            aiIcon.src = "images/K_logo.svg";
            aiIcon.alt = "AI Icon";
            aiIcon.classList.add("ai-icon");
    
            const messageBody = document.createElement("div");
            messageBody.classList.add("message-body");
    
            let entireMessage = '';
    
            // Split text into normal segments and code blocks
            // Code blocks are identified by triple backticks: ```language ... ```
            const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
            const parts = message.split(codeBlockRegex);
    
            let language = '';
    
            parts.forEach((part, index) => {
                const safePart = (part || '').trim(); // Ensure safe trimming
    
                if (index % 3 === 0) {
                    // Regular text (may contain markdown & math)
                    const messageText = document.createElement("div");
                    messageText.classList.add("message-text");
    
                    const finalHTML = processTextWithMarkdownAndMath(safePart);
                    messageText.innerHTML = finalHTML;
    
                    // Add 'table' class to tables and wrap them for horizontal scroll
                    const tables = messageText.querySelectorAll('table');
                    tables.forEach((table) => {
                        table.classList.add('table', 'table-bordered');
    
                        const tableContainer = document.createElement('div');
                        tableContainer.classList.add('table-responsive-container');
    
                        const scrollableDiv = document.createElement('div');
                        scrollableDiv.classList.add('table-responsive');
                        scrollableDiv.setAttribute('tabindex', '0');
                        scrollableDiv.setAttribute('role', 'region');
    
                        const accessibleMessage = document.createElement('span');
                        accessibleMessage.classList.add('accessible-message', 'visually-hidden');
                        accessibleMessage.textContent = 'Horizontal Scrolling Table - Use the arrow keys to scroll left and right';
    
                        const swipeIcon = document.createElement('div');
                        swipeIcon.classList.add('svg-icon', 'swipe-icon');
                        swipeIcon.setAttribute('data-url', 'assets/img/base/icons/swipe_icon.svg');
    
                        const oldParent = table.parentNode;
                        oldParent.insertBefore(tableContainer, table);
    
                        tableContainer.appendChild(scrollableDiv);
                        tableContainer.appendChild(accessibleMessage);
                        tableContainer.appendChild(swipeIcon);
    
                        scrollableDiv.appendChild(table);
                    });
    
                    messageBody.appendChild(messageText);
                    entireMessage += safePart;
                } else if (index % 3 === 1) {
                    // Language for the code block
                    language = safePart;
                } else if (index % 3 === 2) {
                    // Code block content
                    const codeBlock = document.createElement("div");
                    codeBlock.classList.add("code-block-container");
    
                    const codeElement = document.createElement("pre");
                    const codeContent = document.createElement("code");
    
                    if (language) {
                        codeContent.classList.add(`language-${language}`);
                    }
    
                    codeContent.textContent = safePart;
                    codeElement.appendChild(codeContent);
    
                    // Highlight the code
                    if (window.hljs) {
                        hljs.highlightElement(codeContent);
                    }
    
                    const codeCopyButton = document.createElement("span");
                    codeCopyButton.classList.add("material-symbols-rounded", "code-copy-button");
                    codeCopyButton.textContent = "content_copy";
    
                    codeCopyButton.addEventListener("click", () => {
                        navigator.clipboard.writeText(safePart).then(() => {
                            codeCopyButton.textContent = "done";
                            setTimeout(() => {
                                codeCopyButton.textContent = "content_copy";
                            }, 2000);
                        });
                    });
    
                    codeBlock.appendChild(codeElement);
                    codeBlock.appendChild(codeCopyButton);
                    messageBody.appendChild(codeBlock);
                    entireMessage += `\n\n${safePart}`;
                }
            });
    
            if (isLoading) {
                // Show loading dots if still processing
                const loadingDots = document.createElement("div");
                loadingDots.classList.add("loading-dots");
                loadingDots.innerHTML = `<div></div><div></div><div></div>`;
                messageBody.appendChild(loadingDots);
            } else {
                // Add copy button for the entire AI message
                const copyButtonContainer = document.createElement("div");
                copyButtonContainer.classList.add("copy-button-container");
    
                const copyButton = document.createElement("span");
                copyButton.classList.add("material-symbols-rounded", "copy-button");
                copyButton.textContent = "content_copy";
                copyButtonContainer.appendChild(copyButton);
    
                messageBody.appendChild(copyButtonContainer);
    
                copyButton.addEventListener("click", () => {
                    navigator.clipboard.writeText(entireMessage).then(() => {
                        copyButton.textContent = "done";
                        setTimeout(() => {
                            copyButton.textContent = "content_copy";
                        }, 2000);
                    });
                });
            }
    
            messageContent.appendChild(aiIcon);
            messageContent.appendChild(messageBody);
    
        } else if (sender === "You") {
            // User message
            const messageBody = document.createElement("div");
            messageBody.classList.add("message-body");
    
            if (message) {
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");
                messageText.textContent = message;
                messageBody.appendChild(messageText);
            }
    
            messageContent.appendChild(messageBody);
    
        } else if (sender === "System") {
            // System message
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
    
        // Dynamically typeset MathJax for the newly added message element
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([messageElement])
                .catch(err => console.error("MathJax rendering failed:", err));
        } else {
            console.error("MathJax is not loaded or does not support typesetPromise.");
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
