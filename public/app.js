let chatId;

document.addEventListener("DOMContentLoaded", () => {
    if (window.MathJax) {
        MathJax.startup.promise.then(() => {
            console.log("MathJax is loaded and ready.");
        });
    } else {
        console.error("MathJax failed to load.");
    }
});

// Initialize variables
let isFirstInteraction = true;

const chatHistoryList = document.getElementById('chat-history');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const fileUpload = document.getElementById('file-upload');
const attachIcon = document.getElementById('attach-icon');

let isTutorModeOn = false;

const tutorModeButton = document.getElementById('tutor-mode-button');
const tutorModeDropdown = document.getElementById('tutor-mode-dropdown');
const dropdownItems = document.querySelectorAll('#tutor-mode-dropdown .dropdown-item');

const inputContainer = document.querySelector('.input-container');

inputContainer.addEventListener('dragenter', handleDragEnter, false);
inputContainer.addEventListener('dragover', handleDragOver, false);
inputContainer.addEventListener('dragleave', handleDragLeave, false);
inputContainer.addEventListener('drop', handleDrop, false);

let selectedImageFiles = [];

function isSupportedImageType(file) {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/tiff', 'image/heic'];
    return allowedImageTypes.includes(file.type.toLowerCase());
}

function handleFirstTab(e) {
    if (e.key === 'Tab') {
        document.body.classList.add('user-is-tabbing');
        window.removeEventListener('keydown', handleFirstTab);
        window.addEventListener('mousedown', handleMouseDownOnce);
    }
}

function handleMouseDownOnce() {
    document.body.classList.remove('user-is-tabbing');
    window.removeEventListener('mousedown', handleMouseDownOnce);
    window.addEventListener('keydown', handleFirstTab);
}

function setActiveChat(chatId) {
    // Remove .active from any currently-active items
    document.querySelectorAll('.chat-item.active').forEach(item => {
      item.classList.remove('active');
    });
  
    // Find the matching chatItem
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
    if (chatItem) {
      chatItem.classList.add('active');
    }
  }

// Add initial event listeners on page load
window.addEventListener('keydown', handleFirstTab);

// Function to update the checkmark based on the selected mode
function updateCheckmark() {
    dropdownItems.forEach(item => {
        const selectedMode = item.getAttribute('data-mode');
        const checkmark = item.querySelector('.checkmark');
        if ((isTutorModeOn && selectedMode === 'tutor') || (!isTutorModeOn && selectedMode === 'normal')) {
            checkmark.style.display = 'inline'; 
        } else {
            checkmark.style.display = 'none'; 
        }
    });
}

// Initialize the dropdown with the correct state (Normal selected by default)
updateCheckmark();

// Add event listeners to the dropdown items to toggle Tutor Mode
dropdownItems.forEach(item => {
    item.addEventListener('click', function() {
        const selectedMode = this.getAttribute('data-mode');

        // Update tutor mode based on the selected option
        if (selectedMode === 'tutor') {
            isTutorModeOn = true;
            console.log('Tutor Mode is now ON');
        } else {
            isTutorModeOn = false;
            console.log('Tutor Mode is now OFF');
        }

        // Update the checkmark
        updateCheckmark();

        // Close the dropdown after selecting
        tutorModeDropdown.style.display = 'none';
    });
});

function displayPopup(message) {
    // Create the popup container
    const popupContainer = document.createElement('div');
    popupContainer.classList.add('popup-container');

    // Create the popup message element
    const popupMessage = document.createElement('div');
    popupMessage.classList.add('popup-message');
    popupMessage.textContent = message;

    // Create a close button
    const closeButton = document.createElement('span');
    closeButton.classList.add('popup-close-button');
    closeButton.textContent = '×'; 

    closeButton.addEventListener('click', () => {
        popupContainer.remove();
    });

    popupContainer.appendChild(popupMessage);
    popupContainer.appendChild(closeButton);

    const chatWindow = document.querySelector('.chat-window');
    const inputContainer = document.querySelector('.input-container');
    chatWindow.insertBefore(popupContainer, inputContainer);

    setTimeout(() => {
        popupContainer.remove();
    }, 5000);
}

function getFileExtension(fileName) {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop() : 'unknown';
}

// Send message function - ensure tutorMode is passed
async function sendMessage(message) {
    try {
        const response = await fetch('/chat?stream=true', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ message, chatId, tutorMode: isTutorModeOn }),
        });

        if (response.status === 401) { window.location.href = '/login'; return null; }
        if (response.status === 429) {
            const { retryAfter } = await response.json();
            displayRateLimitMessage(retryAfter);
            return null;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        if (!response.ok)            { throw new Error(`HTTP ${response.status}`); }

        // sync chatId from response header (case-insensitive)
        const newId = response.headers.get('X-Chat-Id') || response.headers.get('x-chat-id');
        if (newId) {
            chatId = newId;
            sessionStorage.setItem('chatId', chatId);
        }

        return response.body;            // <── ReadableStream
    } catch (err) {
        console.error('Error in sendMessage:', err);
        return null;
    }
}

function displayRateLimitMessage(retryAfter) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'ai'); 
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    const aiIcon = document.createElement("img");
    aiIcon.src = "images/K_logo.svg";
    aiIcon.alt = "AI Icon";
    aiIcon.classList.add("ai-icon");

    const messageBody = document.createElement("div");
    messageBody.classList.add("message-body");

    const textElement = document.createElement('div');
    textElement.classList.add('message-text');
    textElement.textContent = `Sorry, the rate limit has been hit and will come online in ${retryAfter} seconds.`;
    messageBody.appendChild(textElement);

    messageContent.appendChild(aiIcon);
    messageContent.appendChild(messageBody);
    messageElement.appendChild(messageContent);

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Automatically remove the message after 'retryAfter' seconds
    setTimeout(() => {
        if (messageElement && messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
        }
    }, retryAfter * 100);
}


// // Handle clicking the attach icon to trigger the file input
// attachIcon.addEventListener('click', () => {
//     //fileUpload.click(); // Manually trigger the file input
// });

function isDevelopment() {
    return window.location.hostname === 'localhost';
}

function highlightActiveChat() {
    // Remove all existing .active classes
    document.querySelectorAll('.chat-item.active').forEach(item => {
        item.classList.remove('active');
    });

    // Figure out which chatId is currently “active”
    const currentChatId = sessionStorage.getItem('chatId');
    if (!currentChatId) return; 

    const chatItem = document.querySelector(`.chat-item[data-chat-id="${currentChatId}"]`);
    if (chatItem) {
        chatItem.classList.add('active');
    }
}

// Load existing chats from history and categorize them
async function loadChatHistory() {
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

        const chats = await res.json();
        highlightActiveChat();

        /* rebuild the sidebar list */
        chatHistoryList.innerHTML = '';

        const orderedCategories   = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];
        const availableCategories = orderedCategories.filter(c => chats[c]);

        for (const category of availableCategories) {
            const categoryItem = document.createElement('li');
            categoryItem.textContent = category;
            categoryItem.classList.add('chat-category-list');
            chatHistoryList.appendChild(categoryItem);

            const chatItems = document.createElement('ul');
            chats[category].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            for (const chat of chats[category]) {
                const chatItem = document.createElement('li');
                chatItem.dataset.chatId = chat.chatId;
                chatItem.classList.add('chat-item');
                chatItem.setAttribute('role', 'group');
                chatItem.setAttribute('aria-label', `Chat item for ${sanitizeText(chat.title)}`);
                chatItem.setAttribute('title', chat.title);

                chatItem.addEventListener('click', () => loadChat(chat.chatId));
                chatItem.addEventListener('click', () => {
                    document.querySelectorAll('.chat-item.active')
                            .forEach(item => item.classList.remove('active'));
                    chatItem.classList.add('active');
                    loadChat(chat.chatId);
                });
                chatItem.addEventListener('focus', () => chatItem.classList.add('active'));
                chatItem.addEventListener('blur',  () => chatItem.classList.remove('active'));

                const chatTitle = document.createElement('span');
                chatTitle.textContent = sanitizeText(chat.title);
                chatTitle.classList.add('chat-title');
                chatTitle.setAttribute('tabindex', '0');
                chatTitle.setAttribute('role', 'button');
                chatTitle.setAttribute('aria-label', `Chat titled ${sanitizeText(chat.title)}`);

                chatTitle.addEventListener('input', () => validateChatTitle(chatTitle));
                chatTitle.addEventListener('click', () => loadChat(chat.chatId));
                chatTitle.addEventListener('keydown', async e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        await loadChat(chat.chatId);
                    }
                });

                const binBtn  = document.createElement('button');
                binBtn.classList.add('bin-icon-button');
                binBtn.setAttribute('aria-label', `Delete chat titled ${sanitizeText(chat.title)}`);

                const binIcon = document.createElement('i');
                binIcon.classList.add('fas', 'fa-trash', 'bin-icon');
                binBtn.appendChild(binIcon);
                binBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    deleteChat(chat.chatId);
                });

                chatItem.appendChild(chatTitle);
                chatItem.appendChild(binBtn);

                if (chat.visibility !== 1 && chat.visibility !== undefined) {
                    chatItem.style.display = 'none';
                }
                chatItems.appendChild(chatItem);
            }
            chatHistoryList.appendChild(chatItems);
        }

        /* always start the sidebar at the top after a rebuild */
        document.getElementById('sidebar').scrollTop = 0;

    } catch (err) {
        console.error('Error loading chat history:', err);
    }
}


// Helper function to sanitize chat titles
function sanitizeText(text) {
    return text.replace(/[^a-zA-Z0-9\s]/g, '');
}

// Helper function to validate chat title input dynamically
function validateChatTitle(inputElement) {
    const sanitizedText = inputElement.textContent.replace(/[^a-zA-Z0-9\s]/g, ''); 
    if (inputElement.textContent !== sanitizedText) {
        inputElement.textContent = sanitizedText;
    }
}

function createScrollTable(index, element) {
    const root = element;
    const icon = root.querySelector(".swipe-icon");
    const table = root.querySelector(".table-responsive");
    const accessibleMessage = root.querySelector(".accessible-message");

    function setupAria(index, target) {
        let label = "message-label-" + index;
        target.setAttribute('id', label);
        table.setAttribute('aria-labelledby', label);
    }

    function updateDOM() {
        const hasScrollBar = table.scrollWidth > table.clientWidth;
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

        if (hasScrollBar && isTouchDevice) {
            icon.classList.remove("d-none");
        } else {
            icon.classList.add("d-none");
        }
    }

    // Setup ARIA attributes initially
    setupAria(index, accessibleMessage);

    // Run updateDOM now
    updateDOM();

    // Listen for resize
    window.addEventListener("resize", updateDOM);

    // Return any methods or properties that need external access (optional)
    return {
        updateDOM,
        setupAria
    };
}

// Update the showWelcomeScreen function:
function showWelcomeScreen() {
    const welcomeContainer = document.getElementById('welcome-container');
    const userName = sessionStorage.getItem('userName') || 'User';
    welcomeContainer.style.display = 'block';
    const welcomeMessage = welcomeContainer.querySelector('p');
    welcomeMessage.textContent = `Welcome ${userName} to KaplanGPT! This is a secure and welcoming environment where you can freely explore. Feel free to engage in conversation with me.`;
}


// Function to load a previous chat by chatId
async function loadChat(chatIdToLoad) {
    chatId = chatIdToLoad;
    sessionStorage.setItem('chatId', chatId);

    /* ── Fetch the chat object ─────────────────────────────── */
    const res  = await fetch(`/chats/${chatId}`);
    const chat = await res.json();

    /* ── Clear the chat box ────────────────────────────────── */
    chatBox.innerHTML = '';

    /* ── No messages? Show welcome – then scroll bottom ───── */
    if (!chat.messages || chat.messages.length === 0) {
        showWelcomeScreen();
        requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
        return;
    } else {
        hideWelcomeScreen();
    }

    /* ── Files that are still cached on the server ─────────── */
    const inSessionList = chat.stillInSessionFiles || [];

    /* ── Render each message/file card ─────────────────────── */
    chat.messages.forEach(msg => {
        if (msg.type === 'file-upload' && msg.fileName) {
            const fileName    = msg.fileName;
            const isAvailable = inSessionList.includes(fileName);
            appendFileLink(fileName, '#', isAvailable);
        } else {
            const senderName = (msg.role === 'user') ? 'You' : 'AI';
            appendMessage(senderName, msg.content);
        }
    });

    /* ── Focus input & jump to page bottom ─────────────────── */
    chatInput.focus();
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

newChatBtn.addEventListener('click', async () => {
    console.log("newChatBtn clicked. Checking sessionStorage userId...");
    debugSessionStorage("INSIDE newChatBtn");

    let storedUserId = sessionStorage.getItem('userId');

    if (!storedUserId || storedUserId === 'anonymous') {
        console.error("newChatBtn: userId is null/anonymous. Possibly sessionStorage was cleared.");

        // Try one-time re-fetch of /user-info:
        try {
            console.warn("newChatBtn: Attempting to re-fetch /user-info to recover user session...");
            const response = await fetch('/user-info', {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            if (response.ok) {
                const data = await response.json();
                console.warn("newChatBtn: /user-info re-fetch =>", data);
                // Re-store:
                sessionStorage.setItem('userId', data.userId);
                sessionStorage.setItem('userName', data.userName);

                // Check if that helped:
                storedUserId = data.userId;
                if (!storedUserId || storedUserId === 'anonymous') {
                    console.error("newChatBtn: Even after re-fetch, userId is empty. Aborting new chat.");
                    alert("Cannot create new chat, user info not loaded. Please refresh the page or log in again.");
                    return;
                }
                console.log("newChatBtn: Re-fetch succeeded. userId=", storedUserId);
            } else {
                console.error("newChatBtn: Re-fetch /user-info failed =>", response.status);
                alert("Cannot create new chat, user info is missing. Please refresh the page or log in again.");
                return;
            }
        } catch (err) {
            console.error("newChatBtn: Error re-fetching /user-info =>", err);
            alert("Cannot create new chat, user info not loaded. Refresh or log in again.");
            return;
        }
    }

    // If we reach here, we have a valid userId.
    chatBox.innerHTML = '';
    showWelcomeScreen();

    chatId = generateChatId();
    sessionStorage.setItem('chatId', chatId);

    console.log("newChatBtn: Created new chatId =", chatId);
    debugSessionStorage("AFTER generating new chatId");

    loadChatHistory();

    isFirstInteraction = true;
});

function debugSessionStorage(label = "") {
    console.log(`\n--- Debugging sessionStorage: ${label} ---`);
    if (sessionStorage.length === 0) {
        console.warn("sessionStorage is EMPTY (length=0)");
    } else {
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            const val = sessionStorage.getItem(key);
            console.log(`[${key}] =`, val);
        }
    }
    console.log("--- End of sessionStorage debug ---\n");
}


function appendMessage(sender, message, imageFile = null, isLoading = false) {
    const chatBox = document.getElementById("chat-box");
    const messageElement = document.createElement("div");
    
    // If it's from "You", add "user" class; if AI, add "ai"
    if (sender === "You") {
        messageElement.classList.add("message", "user");
        // If we're loading on the user side, add an extra class
        // so we can override the background color in CSS
        if (isLoading) {
            messageElement.classList.add("user-loading");
        }
    } else {
        messageElement.classList.add("message", "ai");
    }

    const messageContent = document.createElement("div");
    messageContent.classList.add("message-content");

    // Regex to detect math segments
    const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[\s\S]*?\$)|(\\\[[\s\S]*?\\\])/g;

    // Helper to handle Markdown + MathJax placeholders
    function processTextWithMarkdownAndMath(text) {
        const mathSegments = [];
        let placeholderIndex = 0;

        // Extract math segments and replace with placeholders
        const textWithPlaceholders = text.replace(mathPattern, (match) => {
            mathSegments.push(match);
            return `%%%MATH${placeholderIndex++}%%%`;
        });

        // Convert Markdown (excluding math) to HTML
        const parsedHTML = marked.parse(textWithPlaceholders);

        // Restore math segments
        let finalHTML = parsedHTML;
        mathSegments.forEach((segment, i) => {
            finalHTML = finalHTML.replace(`%%%MATH${i}%%%`, segment);
        });

        return finalHTML;
    }

    if (sender === "AI") {
        // ----- AI Message -----
        const aiIcon = document.createElement("img");
        aiIcon.src = "images/K_logo.svg";
        aiIcon.alt = "AI Icon";
        aiIcon.classList.add("ai-icon");

        const messageBody = document.createElement("div");
        messageBody.classList.add("message-body");

        let entireMessage = "";

        // Split text into normal segments and code blocks
        const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
        const parts = message ? message.split(codeBlockRegex) : [""];

        let language = "";

        parts.forEach((part, index) => {
            const safePart = (part || "").trim();

            if (index % 3 === 0) {
                // Plain text segment
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");

                const finalHTML = processTextWithMarkdownAndMath(safePart);
                messageText.innerHTML = finalHTML;

                // Wrap tables, if any
                const tables = messageText.querySelectorAll("table");
                tables.forEach((table) => {
                    table.classList.add("table", "table-bordered");

                    const tableContainer = document.createElement("div");
                    tableContainer.classList.add("table-responsive-container");

                    const scrollableDiv = document.createElement("div");
                    scrollableDiv.classList.add("table-responsive");
                    scrollableDiv.setAttribute("tabindex", "0");
                    scrollableDiv.setAttribute("role", "region");

                    const accessibleMessage = document.createElement("span");
                    accessibleMessage.classList.add("accessible-message", "visually-hidden");
                    accessibleMessage.textContent =
                        "Horizontal Scrolling Table - Use the arrow keys to scroll left and right";

                    const swipeIcon = document.createElement("div");
                    swipeIcon.classList.add("svg-icon", "swipe-icon");
                    swipeIcon.setAttribute("data-url", "assets/img/base/icons/swipe_icon.svg");

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
                // Code block language
                language = safePart;
            } else if (index % 3 === 2) {
                // Code block content
                const codeBlock = document.createElement("div");
                codeBlock.classList.add("code-block-container");

                const codeBlockHeader = document.createElement("div");
                codeBlockHeader.classList.add("code-block-header");
                codeBlockHeader.textContent = language || "Code";
                codeBlock.appendChild(codeBlockHeader);

                const codeElement = document.createElement("pre");
                const codeContent = document.createElement("code");

                if (language) {
                    codeContent.classList.add(`language-${language}`);
                }

                codeContent.textContent = safePart;
                codeElement.appendChild(codeContent);

                // HighlightJS
                hljs.highlightElement(codeContent);

                // Copy button inside code block
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
            // Show loading dots for AI
            const loadingDots = document.createElement("div");
            loadingDots.classList.add("loading-dots");
            loadingDots.innerHTML = `<div></div><div></div><div></div>`;
            messageBody.appendChild(loadingDots);
        } else {
            // Entire AI message copy button
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
        // ----- User Message -----
        const messageBody = document.createElement("div");
        messageBody.classList.add("message-body");

        if (isLoading) {
            // Show loading dots for user
            const loadingDots = document.createElement("div");
            loadingDots.classList.add("loading-dots");
            loadingDots.innerHTML = `<div></div><div></div><div></div>`;
            messageBody.appendChild(loadingDots);
        } else {
            // If we have actual user text, display it
            if (message) {
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");
                messageText.textContent = message;
                messageBody.appendChild(messageText);
            }
        }

        messageContent.appendChild(messageBody);
    }

    messageElement.appendChild(messageContent);
    chatBox.appendChild(messageElement);

    // Always scroll chat box to bottom
    chatBox.scrollTop = chatBox.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);

    // Auto-scroll entire page if the sender is 'You'
    if (sender === "You") {
        window.scrollTo(0, document.body.scrollHeight);
    }

    // Dynamically typeset MathJax for newly added elements
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([messageElement]).catch((err) => {
            console.error("MathJax rendering failed:", err);
        });
    } else {
        console.error("MathJax is not loaded or does not support typesetPromise.");
    }

    return messageElement;
}

function generateChatId() {
    const userId = sessionStorage.getItem('userId') || 'anonymous';
    const randomNumber = Math.random().toString(36).substr(2, 9);
    return `${userId}_chat_${randomNumber}`;
}

let selectedImageFile = null;

// Handle file upload and sending message
let fileUploadInProgress = false; 

fileUpload.addEventListener('change', async function () {
    if (fileUploadInProgress) return;
    fileUploadInProgress = true;

    // Show the loading message on the user side (right)
    const loadingMessageElement = appendMessage('You', '', null, true);

    try {
        const files = fileUpload.files;
        if (files.length > 0) {
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    // Check if the image type is supported
                    if (!isSupportedImageType(file)) {
                        const fileExtension = getFileExtension(file.name);
                        displayPopup(`Image type .${fileExtension} not supported`);
                        continue;
                    }

                    // It's a supported image, add it to the selectedImageFiles array
                    selectedImageFiles.push(file);

                    // Generate a blob URL for the image
                    const imageUrl = URL.createObjectURL(file);

                    // Display the image link in the chat
                    appendFileLink(file.name, imageUrl);

                    // Change the attach icon to 'done'
                    attachIcon.textContent = "done";

                    // Revert back to attach icon after 2 seconds
                    setTimeout(() => {
                        attachIcon.textContent = "attach_file";
                    }, 2000);

                    // Reset the file input
                    fileUpload.value = '';
                } else {
                    // Not an image, upload it immediately
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('chatId', chatId);

                    try {
                        const response = await fetch('/upload', {
                            method: 'POST',
                            body: formData,
                        });

                        if (response.ok) {
                            // Change the attach icon to 'done'
                            attachIcon.textContent = "done"; 
                            
                            // Revert back to attach icon after 2 seconds
                            setTimeout(() => {
                                attachIcon.textContent = "attach_file";
                            }, 2000);

                            // Inform the user that the file was uploaded
                            appendMessage('System', `File "${file.name}" uploaded successfully.`);

                            const responseData = await response.json();
                            const fileUrl = responseData.url || '#'; 
                            appendFileLink(file.name, fileUrl);
                        } else {
                            const errorData = await response.json();
                            console.error('Upload error:', errorData.error);
                            appendMessage('System', `Error uploading file: ${errorData.error}`);

                            if (errorData.error.includes('Unsupported file type')) {
                                const fileExtension = getFileExtension(file.name);
                                displayPopup(`Document type .${fileExtension} not supported`);
                            } else {
                                displayPopup(`Error uploading file: ${errorData.error}`);
                            }
                        }
                    } catch (error) {
                        console.error('Error uploading file:', error);
                        appendMessage('System', 'An error occurred while uploading the file.');
                    } finally {
                        setTimeout(() => {
                            fileUpload.value = '';  
                        }, 100);  
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling file upload:', error);
    } finally {
        // Remove the loading dots once all uploads are done
        if (loadingMessageElement && loadingMessageElement.parentNode) {
            loadingMessageElement.parentNode.removeChild(loadingMessageElement);
        }
        fileUploadInProgress = false;
    }
});

function appendFileLink(fileName, fileUrl, isDocumentAvailable = true) {
    const chatBox = document.getElementById('chat-box');

    /* ── build the DOM exactly as before ───────────────────── */
    const fileElement  = document.createElement('div');
    fileElement.classList.add('file-upload-container', 'user');

    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    const fileIconLink  = document.createElement('a');
    fileIconLink.classList.add('file-link');

    const fileIcon      = document.createElement('span');
    fileIcon.classList.add('material-symbols-rounded', 'file-icon');

    const fileNameSpan  = document.createElement('span');
    fileNameSpan.classList.add('file-name');

    if (!isDocumentAvailable) {
        /* unavailable document – greyed-out link */
        fileIcon.textContent = 'insert_drive_file';
        fileIcon.classList.add('grey-file-icon');
        fileNameSpan.textContent = 'document is no longer available';
        fileNameSpan.classList.add('file-name-disabled');

        fileIconLink.href = '#';
        fileIconLink.style.cursor = 'default';
        fileIconLink.appendChild(fileIcon);
        fileIconLink.appendChild(fileNameSpan);
        messageContent.appendChild(fileIconLink);
    } else {
        /* normal link + optional delete button */
        fileIcon.textContent = 'insert_drive_file';
        fileNameSpan.textContent = fileName;

        if (fileUrl && fileUrl !== '#') {
            fileIconLink.href   = fileUrl;
            fileIconLink.target = '_blank';
        }

        fileIconLink.appendChild(fileIcon);
        fileIconLink.appendChild(fileNameSpan);
        messageContent.appendChild(fileIconLink);

        const deleteButton = document.createElement('span');
        deleteButton.classList.add('material-symbols-rounded', 'delete-button');
        deleteButton.textContent = 'delete';
        deleteButton.addEventListener('click', async () => {
            try {
                const encoded = encodeURIComponent(fileName);
                const resp    = await fetch(`/chats/${chatId}/files/${encoded}`, { method: 'DELETE' });
                if (!resp.ok) {
                    const err = await resp.json();
                    displayPopup(`Error removing file: ${err.error || resp.statusText}`);
                } else {
                    chatBox.removeChild(fileElement);
                }
            } catch (err) {
                displayPopup(`Error deleting file: ${err}`);
            }
        });
        messageContent.appendChild(deleteButton);
    }

    fileElement.appendChild(messageContent);
    chatBox.appendChild(fileElement);

    /* ── NEW: keep both the inner box *and* the page bottom-aligned ── */
    chatBox.scrollTop = chatBox.scrollHeight;
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}


const sidebar = document.getElementById('sidebar');

function toggleSidebar() {
    const sidebar        = document.getElementById('sidebar');
    const chatBox        = document.getElementById('chat-box');
    const collapseBtn    = document.getElementById('collapse-btn');
    const newChatBtn     = document.getElementById('new-chat-btn');
    const attachIcon     = document.getElementById('attach-icon');
    const chatWindow     = document.querySelector('.chat-window');
    const iconContainer  = document.querySelector('.icon-container');
    const inputContainer = document.querySelector('.input-container');
    const inputBg        = document.querySelector('.input-background');

    if (sidebar.classList.contains('collapsed')) {
        /* —— EXPAND —— */
        sidebar.classList.remove('collapsed');
        chatBox.classList.remove('collapsed');
        chatWindow.classList.remove('collapsed');
        inputContainer.classList.remove('collapsed');
        iconContainer.classList.remove('collapsed');
        inputBg.classList.remove('collapsed');

        /* after the width change is applied, jump to the very top */
        requestAnimationFrame(() => { sidebar.scrollTop = 0; });

        collapseBtn.textContent = 'left_panel_close';
        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        iconContainer.classList.add('active');
        inputBg.classList.add('active');
    } else {
        /* —— COLLAPSE —— */
        sidebar.classList.add('collapsed');
        chatBox.classList.add('collapsed');
        chatWindow.classList.add('collapsed');
        inputContainer.classList.add('collapsed');
        iconContainer.classList.add('collapsed');
        inputBg.classList.add('collapsed');

        collapseBtn.textContent = 'left_panel_open';
        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        iconContainer.classList.remove('active');

        /* removed: no more page-scroll-to-bottom here */
    }
}


function initializeActiveState() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const attachIcon = document.getElementById('attach-icon');
    const iconContainer = document.querySelector('.icon-container');

    iconContainer.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const firstChatItem = document.querySelector('.chat-item');
            if (firstChatItem) {
                firstChatItem.focus();
            }
        }
    });

    if (!sidebar.classList.contains('collapsed')) {
        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        iconContainer.classList.add('active');
    } else {
        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        iconContainer.classList.remove('active');
    }
}

// Call the initializeActiveState function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeActiveState();

       // Add keyboard accessibility for the collapse button
       const collapseBtn = document.getElementById('collapse-btn');
       collapseBtn.addEventListener('keydown', function(event) {
           if (event.key === 'Enter' || event.key === ' ') {
               event.preventDefault();
               toggleSidebar();
           }
       });
   
       // Ensure dropdown items are focusable and can be activated via keyboard
       dropdownItems.forEach(item => {
           item.setAttribute('tabindex', '0');
           item.addEventListener('keydown', function(event) {
               if (event.key === 'Enter' || event.key === ' ') {
                   event.preventDefault();
                   this.click();
               }
           });
       });
});

sendBtn.addEventListener('click', async () => {
    const message = chatInput.value.trim();
    if (message || selectedImageFiles.length > 0) {
        console.log("---- sendBtn clicked ----");
        console.log("  userId from sessionStorage =", sessionStorage.getItem('userId'));
        console.log("  chatId from sessionStorage =", sessionStorage.getItem('chatId'));
        console.log(`Sending message with Tutor Mode: ${isTutorModeOn ? 'ON' : 'OFF'}`);

        if (isFirstInteraction) {
            hideWelcomeScreen();
            isFirstInteraction = false;
        }

        // Append the user's message
        const userMessageElement = appendMessage('You', message);
        console.log("  Just appended user message, userMessageElement =", userMessageElement);

        // Show AI loading
        const loadingMessageElement = appendMessage('AI', '', null, true);

        resetInputHeight();
        chatInput.value = '';
        sendBtn.classList.remove('active');

        let response;
        try {
            if (selectedImageFiles.length > 0) {
                response = await sendMessageWithImage(message, selectedImageFiles);
            } else {
                response = await sendMessage(message);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }

        // If we hit a rate limit or there's no response
        if (response === null) {
            console.warn("sendBtn: response is null (rate limit or error). Removing user message & loader...");
            if (userMessageElement && userMessageElement.parentNode) {
                userMessageElement.parentNode.removeChild(userMessageElement);
            }
            if (loadingMessageElement && loadingMessageElement.parentNode) {
                loadingMessageElement.parentNode.removeChild(loadingMessageElement);
            }
            return;
        }

        // If we got a successful response
        const messageContent = loadingMessageElement.querySelector('.message-content');
        console.log("  sendBtn: AI responded, streaming AI response into messageContent =", messageContent);
        streamParsedResponse(messageContent, response);

        console.log("  sendBtn: calling loadChatHistory after AI response");
        try {
            await loadChatHistory();
            setActiveChat(chatId);
            console.log("  sendBtn: loadChatHistory finished.");
        } catch (err) {
            console.error('Error loading chat history:', err);
        }
    }
});


chatInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();

        const message = chatInput.value.trim();

        if (message || selectedImageFiles.length > 0) {
            console.log(`Sending message with Tutor Mode: ${isTutorModeOn ? 'ON' : 'OFF'}`);

            if (isFirstInteraction) {
                hideWelcomeScreen();
                isFirstInteraction = false;
            }

            // Append the user's message immediately
            const userMessageElement = appendMessage('You', message);

            // Show AI loading message immediately
            const loadingMessageElement = appendMessage('AI', '', null, true);

            resetInputHeight();
            chatInput.value = '';
            sendBtn.classList.remove('active');

            let response;
            try {
                if (selectedImageFiles.length > 0) {
                    response = await sendMessageWithImage(message, selectedImageFiles);
                } else {
                    response = await sendMessage(message);
                }
            } catch (error) {
                console.error('Error sending message:', error);
            }

            // If we hit a rate limit or there's no response
            if (response === null) {
                if (userMessageElement && userMessageElement.parentNode) {
                    userMessageElement.parentNode.removeChild(userMessageElement);
                }
                if (loadingMessageElement && loadingMessageElement.parentNode) {
                    loadingMessageElement.parentNode.removeChild(loadingMessageElement);
                }
                return;
            }

            if (response) {
                const messageContent = loadingMessageElement.querySelector('.message-content');
                streamParsedResponse(messageContent, response);

                try {
                    await loadChatHistory();
                    setActiveChat(chatId);
                } catch (err) {
                    console.error('Error loading chat history:', err);
                }
            } else {
                console.error('Response is undefined.');
            }
        }
    }
});



sendBtn.addEventListener('keydown', function(event) {
    if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        const firstChatItem = document.querySelector('.chat-item');
        if (firstChatItem) {
            firstChatItem.focus();
        }
    }
});

function streamMessageFromServer() {
    const eventSource = new EventSource('/chat-stream');

    eventSource.onmessage = function (event) {
        const content = event.data;
        if (content === '[DONE]') {
            eventSource.close();
        } else {
            appendMessage('AI', content);
        }
    };

    eventSource.onerror = function (event) {
        console.error('Error in event source:', event);
        eventSource.close();
    };
}

function streamParsedResponse(messageContent, source) {
    const messageBody = messageContent.querySelector('.message-body');

    // remove the three loading dots, if still present
    const loadingDots = messageBody.querySelector('.loading-dots');
    if (loadingDots) loadingDots.remove();

    /* ensure we have a <div.message-text> to write into */
    let messageText = messageBody.querySelector('.message-text');
    if (!messageText) {
        messageText      = document.createElement('div');
        messageText.classList.add('message-text');
        messageBody.appendChild(messageText);
    }

    /* ─── 1.  TRUE STREAMING BRANCH (ReadableStream) ─── */
    if (source && typeof source.getReader === 'function') {
        const reader  = source.getReader();
        const decoder = new TextDecoder();
        let fullText  = '';

        (async () => {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;                         // stream closed by server

                const chunk = decoder.decode(value, { stream: true });
                if (chunk.trim() === '[DONE]') break;    // end-token

                fullText                += chunk;
                messageText.textContent += chunk;

                chatBox.scrollTop = chatBox.scrollHeight;
                window.scrollTo(0, document.body.scrollHeight);
            }

            /*  finished – prettify, then refresh sidebar after a short pause  */
            finalizeResponseFormatting(messageBody, fullText);

            /*  wait ≈1 s so the server finishes title-generation & upsert  */
            setTimeout(async () => {
                try {
                    await loadChatHistory();   // new title now in DB
                    setActiveChat(chatId);
                } catch (err) {
                    console.error('streamParsedResponse → loadChatHistory failed', err);
                }
            }, 1100);        // tweak if your titles still lag

        })();

        return;   // nothing else to do
    }

    /* ─── 2.  LEGACY PSEUDO-STREAM BRANCH (whole string) ─── */
    if (typeof source === 'string') {
        const words         = source.split(/(\s+)/);
        let idx             = 0;
        let accumulated     = '';
        const intervalSpeed = 10;   // ms
        const wordsPerTick  = 5;

        const id = setInterval(() => {
            if (idx < words.length) {
                accumulated += words.slice(idx, idx + wordsPerTick).join('');
                idx         += wordsPerTick;
                messageText.textContent = accumulated;
                chatBox.scrollTop       = chatBox.scrollHeight;
            } else {
                clearInterval(id);
                finalizeResponseFormatting(messageBody, accumulated);
            }
        }, intervalSpeed);
    }
}

function finalizeResponseFormatting(messageBody, rawResponseText) {
    messageBody.innerHTML = '';

    reRenderMessageWithCodeBlocks(messageBody, rawResponseText);

    // After re-rendering, wrap any tables found:
    const tables = messageBody.querySelectorAll('table');
    tables.forEach((table, tIndex) => {
        // Add classes to the table
        table.classList.add('table', 'table-bordered');

        // Create the container element
        const tableContainer = document.createElement('div');
        tableContainer.classList.add('table-responsive-container');

        // Create the scrollable div
        const scrollableDiv = document.createElement('div');
        scrollableDiv.classList.add('table-responsive');
        scrollableDiv.setAttribute('tabindex', '0');
        scrollableDiv.setAttribute('role', 'region');

        // Create the accessible message (visually hidden)
        const accessibleMessage = document.createElement('span');
        accessibleMessage.classList.add('accessible-message', 'visually-hidden');
        accessibleMessage.textContent = 'Horizontal Scrolling Table - Use the arrow keys to scroll left and right';

        // Create the swipe icon div
        const swipeIcon = document.createElement('div');
        swipeIcon.classList.add('svg-icon', 'swipe-icon');
        swipeIcon.setAttribute('data-url', 'assets/img/base/icons/swipe_icon.svg');

        // Insert the new structure before moving the table
        const oldParent = table.parentNode;
        oldParent.insertBefore(tableContainer, table);

        // Now append the scrollable div and children to the container
        tableContainer.appendChild(scrollableDiv);
        tableContainer.appendChild(accessibleMessage);
        tableContainer.appendChild(swipeIcon);

        // Finally, move the table inside the scrollable div
        scrollableDiv.appendChild(table);
    });

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([messageBody])
            .catch(err => console.error("MathJax rendering failed:", err));
    }
    chatBox.scrollTop = chatBox.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
}


function reRenderMessageWithCodeBlocks(messageBody, rawResponseText) {
    const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[\s\S]*?\$)|(\\\[[\s\S]*?\\\])/g;

    function processTextWithMarkdownAndMath(text) {
        const mathSegments = [];
        let placeholderIndex = 0;

        // Extract math segments, replace with placeholders
        const textWithPlaceholders = text.replace(mathPattern, (match) => {
            mathSegments.push(match);
            return `%%%MATH${placeholderIndex++}%%%`;
        });

        // Convert markdown to HTML
        const parsedHTML = marked.parse(textWithPlaceholders);

        // Restore math segments
        let finalHTML = parsedHTML;
        mathSegments.forEach((segment, i) => {
            finalHTML = finalHTML.replace(`%%%MATH${i}%%%`, segment);
        });

        return finalHTML;
    }

    // Clear existing content
    messageBody.innerHTML = '';
    let entireMessage = '';

    const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;

    // Safely split text by code blocks
    const parts = rawResponseText ? rawResponseText.split(codeBlockRegex) : [''];
    let language = '';

    for (let i = 0; i < parts.length; i++) {
        const currentPart = parts[i] || '';

        if (i % 3 === 0) {
            // Regular text parts
            const textToProcess = currentPart.trim();
            const messageText = document.createElement('div');
            messageText.classList.add('message-text');

            const finalHTML = processTextWithMarkdownAndMath(textToProcess);
            messageText.innerHTML = finalHTML;

            // Basic table styling
            const tables = messageText.querySelectorAll('table');
            tables.forEach((table) => {
                table.classList.add('table');
            });

            messageBody.appendChild(messageText);
            entireMessage += textToProcess;

        } else if (i % 3 === 1) {
            // Language for the code block
            language = currentPart ? currentPart.trim() : '';

        } else if (i % 3 === 2) {
            // Code block content
            const codeContentText = currentPart ? currentPart.trim() : '';
            const codeBlock = document.createElement('div');
            codeBlock.classList.add('code-block-container');

            // ADDED: Code block header
            const codeBlockHeader = document.createElement('div');
            codeBlockHeader.classList.add('code-block-header');
            codeBlockHeader.textContent = language ? language : 'Code';
            codeBlock.appendChild(codeBlockHeader);

            const codeElement = document.createElement('pre');
            const codeContent = document.createElement('code');

            if (language) {
                codeContent.classList.add(`language-${language}`);
            }

            codeContent.textContent = codeContentText;
            codeElement.appendChild(codeContent);

            hljs.highlightElement(codeContent);

            const codeCopyButton = document.createElement('span');
            codeCopyButton.classList.add('material-symbols-rounded', 'code-copy-button');
            codeCopyButton.textContent = 'content_copy';

            codeCopyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeContentText).then(() => {
                    codeCopyButton.textContent = 'done';
                    setTimeout(() => {
                        codeCopyButton.textContent = 'content_copy';
                    }, 2000);
                });
            });

            codeBlock.appendChild(codeElement);
            codeBlock.appendChild(codeCopyButton);
            messageBody.appendChild(codeBlock);
            entireMessage += `\n\n${codeContentText}`;
        }
    }

    // Entire message copy button
    const copyButtonContainer = document.createElement('div');
    copyButtonContainer.classList.add('copy-button-container');

    const copyButton = document.createElement('span');
    copyButton.classList.add('material-symbols-rounded', 'copy-button');
    copyButton.textContent = 'content_copy';
    copyButtonContainer.appendChild(copyButton);

    messageBody.appendChild(copyButtonContainer);

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(entireMessage).then(() => {
            copyButton.textContent = 'done';
            setTimeout(() => {
                copyButton.textContent = 'content_copy';
            }, 2000);
        });
    });

    // Typeset MathJax again
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([messageBody])
            .catch(err => console.error("MathJax rendering failed:", err));
    } else {
        console.error("MathJax is not loaded or does not support typesetPromise.");
    }
}

// Function to reset the input height after sending a message
function resetInputHeight() {
    const input = document.getElementById("chat-input");
    input.style.height = "50%";
    input.style.overflowY = "hidden";
  }

// Auto-growing input logic
function autoGrowInput() {
    const input = document.getElementById("chat-input");

    input.style.height = 'auto'; 

    if (input.scrollHeight > input.offsetHeight) {
        input.style.height = input.scrollHeight + 'px';
    } else {
        input.style.height = '';
    }

    if (input.scrollHeight > 200) {
        input.style.overflowY = 'auto';
    } else {
        input.style.overflowY = 'hidden';
    }
}
// Existing event listener for input event
chatInput.addEventListener('input', () => {
    autoGrowInput();

    // Change the color of the send button if input has content
    if (chatInput.value.trim() !== '') {
        sendBtn.classList.add('active');
    } else {
        sendBtn.classList.remove('active');
    }
});

// **Add these event listeners for focus and blur events**
chatInput.addEventListener('focus', () => {
    sendBtn.classList.add('active');
});

chatInput.addEventListener('blur', () => {
    if (chatInput.value.trim() === '') {
        sendBtn.classList.remove('active');
    }
});

// Function to hide the welcome screen
function hideWelcomeScreen() {
    const welcomeContainer = document.getElementById('welcome-container');
    welcomeContainer.style.display = 'none'; 
}

function updateImageStats(totalCount, totalSize) {
    const imageStatsElement = document.getElementById('image-stats');

    if (imageStatsElement) {
        imageStatsElement.textContent = `Total Images: ${totalCount}, Total Size: ${formatBytes(totalSize)}`;
    }
}

// Helper function to format bytes into a human-readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Function to handle sending message with optional image
async function sendMessageWithImage(message, imageFiles) {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('chatId', chatId);
    formData.append('tutorMode', isTutorModeOn);

    // Append all selected images
    for (const img of imageFiles) {
        formData.append('image', img);
    }
    try {
        const res = await fetch('/chat', {
            method: 'POST',
            body: formData,
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

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        if (data.chatId) {
            chatId = data.chatId;
            sessionStorage.setItem('chatId', chatId);
        }
        updateImageStats(data.total_image_count, data.total_image_size);
        return data.response;
    } catch (error) {
        console.error('Error sending message with images:', error);
        throw error;
    }
}

function renderMath() {
    MathJax.typeset();
}

function appendFormula(formula) {
    const chatBox = document.getElementById('chat-box');
    const formulaContainer = document.createElement('div');
    formulaContainer.className = 'display-formula';
    formulaContainer.innerHTML = `$$${formula}$$`;

    chatBox.appendChild(formulaContainer);
    MathJax.typesetPromise();
}

let dragCounter = 0;

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    inputContainer.classList.add('dragover');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Decrement the counter and only remove 'dragover' if it's zero
    dragCounter--;
    if (dragCounter === 0) {
        inputContainer.classList.remove('dragover');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    inputContainer.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        if (fileUploadInProgress) return;
        fileUploadInProgress = true;

        // Show the loading message on the user side (right)
        const loadingMessageElement = appendMessage('You', '', null, true);

        try {
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    // Check if the image type is supported
                    if (!isSupportedImageType(file)) {
                        const fileExtension = getFileExtension(file.name);
                        displayPopup(`Image type .${fileExtension} not supported`);
                        continue;
                    }
                    selectedImageFiles.push(file);

                    const imageUrl = URL.createObjectURL(file);
                    appendFileLink(file.name, imageUrl);

                    attachIcon.textContent = "done";
                    setTimeout(() => {
                        attachIcon.textContent = "attach_file";
                    }, 2000);
                } else {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('chatId', chatId);

                    try {
                        const response = await fetch('/upload', {
                            method: 'POST',
                            body: formData,
                        });

                        if (response.ok) {
                            attachIcon.textContent = "done"; 
                            setTimeout(() => {
                                attachIcon.textContent = "attach_file";
                            }, 2000);

                            appendMessage('System', `File "${file.name}" uploaded successfully.`);

                            const responseData = await response.json();
                            const fileUrl = responseData.url || '#';
                            appendFileLink(file.name, fileUrl);
                        } else {
                            const errorData = await response.json();
                            console.error('Upload error:', errorData.error);
                            appendMessage('System', `Error uploading file: ${errorData.error}`);

                            if (errorData.error.includes('Unsupported file type')) {
                                const fileExtension = getFileExtension(file.name);
                                displayPopup(`Document type .${fileExtension} not supported`);
                            } else {
                                displayPopup(`Error uploading file: ${errorData.error}`);
                            }
                        }
                    } catch (error) {
                        console.error('Error uploading file:', error);
                        appendMessage('System', 'An error occurred while uploading the file.');
                    }
                }
            }
        } catch (error) {
            console.error('Error handling drop:', error);
        } finally {
            // Remove the loading dots once all uploads are done
            if (loadingMessageElement && loadingMessageElement.parentNode) {
                loadingMessageElement.parentNode.removeChild(loadingMessageElement);
            }
            fileUploadInProgress = false;
        }
    }
}

// Add event listeners for chat-title validation
document.addEventListener("DOMContentLoaded", () => {
    const chatTitleElements = document.querySelectorAll('.chat-title'); 
    chatTitleElements.forEach(chatTitle => {
        chatTitle.addEventListener('input', () => validateChatTitle(chatTitle));
    });
});


function deleteChat(chatIdToDelete) {
    fetch(`/chats/${chatIdToDelete}`, {
        method: 'DELETE',
    })
    .then(async response => {
        if (!response.ok) {
            console.error('Failed to delete chat');
            return;
        }

        // Reload chat history so the sidebar no longer shows the deleted chat
        await loadChatHistory();
        setActiveChat(chatId);

        if (chatIdToDelete === chatId) {
            newChatBtn.click();
        } else {
            highlightActiveChat();
        }
    })
    .catch(error => {
        console.error('Error deleting chat:', error);
    });
}

// === Modal Functions ===
function createImageModal() {
    // Check if the modal already exists
    let modal = document.getElementById('image-modal');
    if (modal) return modal;

    // Create modal elements
    modal = document.createElement('div');
    modal.id = 'image-modal';

    const modalContent = document.createElement('div');
    modalContent.classList.add('modal-content');

    const img = document.createElement('img');
    img.id = 'modal-image';
    img.alt = 'Image Preview';

    const closeBtn = document.createElement('span');
    closeBtn.classList.add('close-btn');
    closeBtn.innerHTML = '&times;';

    // Add click event to close the modal
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close modal when clicking outside the image
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Assemble modal content
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(img);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    return modal;
}

// Function to display the modal with the specified image URL
function showImageModal(imageUrl) {
    const modal = createImageModal();
    const modalImage = document.getElementById('modal-image');
    modalImage.src = imageUrl;
    modal.style.display = 'flex'; // Show the modal
}

window.onload = async () => {
    console.log("window.onload: Starting user-info fetch...");
  
    try {
      debugSessionStorage("BEFORE /user-info fetch (window.onload)");
  
      const response = await fetch('/user-info', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
  
      if (response.status === 401) {
        console.warn("window.onload: /user-info => 401 => /login");
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP error from /user-info! status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log("window.onload: /user-info =>", data);
  
      // Store user info in sessionStorage
      sessionStorage.setItem('userId', data.userId);
      sessionStorage.setItem('userName', data.userName);
      console.log("window.onload: set userId =", data.userId);
      console.log("window.onload: set userName =", data.userName);
  
      chatId = generateChatId();
      sessionStorage.setItem('chatId', chatId);
      console.log("window.onload: Forcing brand-new chatId on every refresh:", chatId);
  
      debugSessionStorage("AFTER /user-info fetch and chatId setup");
  
      // Proceed with loading the chat history, showing welcome, etc.
      await loadChatHistory();
      setActiveChat(chatId);
      showWelcomeScreen();
      debugSessionStorage("AFTER loadChatHistory & showWelcomeScreen");
  
      console.log("window.onload: Done initialization.");
    } catch (error) {
      console.error('Error in window.onload:', error);
      window.location.href = '/login';
    }
  };