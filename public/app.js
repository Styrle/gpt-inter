// Generate a new chatId on page load
let chatId = generateChatId();
sessionStorage.setItem('chatId', chatId);

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
const attachIcon = document.getElementById('attach-icon'); // Attach icon reference

let isTutorModeOn = false; // Track the state of Tutor Mode

const tutorModeButton = document.getElementById('tutor-mode-button');
const tutorModeDropdown = document.getElementById('tutor-mode-dropdown');
const dropdownItems = document.querySelectorAll('#tutor-mode-dropdown .dropdown-item');

const inputContainer = document.querySelector('.input-container');

// Add drag-and-drop event listeners
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

// This function listens for the first mouse click after a Tab press.
// When a mouse is used, we remove the 'user-is-tabbing' class.
function handleMouseDownOnce() {
    document.body.classList.remove('user-is-tabbing');
    window.removeEventListener('mousedown', handleMouseDownOnce);
    window.addEventListener('keydown', handleFirstTab);
}

// Add initial event listeners on page load
window.addEventListener('keydown', handleFirstTab);

// Function to update the checkmark based on the selected mode
function updateCheckmark() {
    dropdownItems.forEach(item => {
        const selectedMode = item.getAttribute('data-mode');
        const checkmark = item.querySelector('.checkmark');
        if ((isTutorModeOn && selectedMode === 'tutor') || (!isTutorModeOn && selectedMode === 'normal')) {
            checkmark.style.display = 'inline'; // Show the checkmark for the active item
        } else {
            checkmark.style.display = 'none'; // Hide the checkmark for inactive items
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
    closeButton.textContent = '×'; // Unicode multiplication sign

    // Add click event to close the popup
    closeButton.addEventListener('click', () => {
        popupContainer.remove();
    });

    // Append message and close button to the container
    popupContainer.appendChild(popupMessage);
    popupContainer.appendChild(closeButton);

    // Insert the popup container above the input-container
    const chatWindow = document.querySelector('.chat-window');
    const inputContainer = document.querySelector('.input-container');
    chatWindow.insertBefore(popupContainer, inputContainer);

    // Optional: Auto-remove the popup after a certain time (e.g., 5 seconds)
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
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ message, chatId, tutorMode: isTutorModeOn }),
            credentials: 'include',
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (response.status === 429) {
            const { retryAfter } = await response.json();
            displayRateLimitMessage(retryAfter);
            // Return null to indicate we should not append the user's message
            return null;
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

function displayRateLimitMessage(retryAfter) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'ai'); // Apply AI message styling (assuming 'ai' or 'ai-message' class)
    
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


// Handle clicking the attach icon to trigger the file input
attachIcon.addEventListener('click', () => {
    //fileUpload.click(); // Manually trigger the file input
});

function isDevelopment() {
    return window.location.hostname === 'localhost';
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

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const chats = await res.json();

        // Clear the existing chat history list
        chatHistoryList.innerHTML = '';

        // Define the category order
        const orderedCategories = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

        // Filter only the categories present in the fetched chats
        const availableCategories = orderedCategories.filter(category => chats[category]);

        // Loop through the categories and render the chat items
        for (const category of availableCategories) {
            // Create and append category heading
            const categoryItem = document.createElement('li');
            categoryItem.textContent = category;
            categoryItem.classList.add('chat-category-list');
            chatHistoryList.appendChild(categoryItem);

            const chatItems = document.createElement('ul');
            const reversedChats = chats[category].slice().reverse();

            for (const chat of reversedChats) {
                // Create the chat item container
                const chatItem = document.createElement('li');
                chatItem.dataset.chatId = chat.chatId;
                chatItem.classList.add('chat-item');
                chatItem.setAttribute('role', 'group');
                chatItem.setAttribute('aria-label', `Chat item for ${sanitizeText(chat.title)}`);

                // Add click event listener to load chat
                chatItem.addEventListener('click', () => loadChat(chat.chatId));

                // Add focus and blur event listeners for active state
                chatItem.addEventListener('focus', () => chatItem.classList.add('active'));
                chatItem.addEventListener('blur', () => chatItem.classList.remove('active'));

                // Create and sanitize the chat title
                const chatTitle = document.createElement('span');
                chatTitle.textContent = sanitizeText(chat.title);
                chatTitle.classList.add('chat-title');
                chatTitle.setAttribute('tabindex', '0'); // Make focusable
                chatTitle.setAttribute('role', 'button'); // Semantics for screen readers
                chatTitle.setAttribute('aria-label', `Chat titled ${sanitizeText(chat.title)}`);

                // Attach input validation logic to the chat title
                chatTitle.addEventListener('input', () => validateChatTitle(chatTitle));

                // Add click event listener to load chat
                chatTitle.addEventListener('click', () => loadChat(chat.chatId));

                // Add keyboard event listener for Enter and Space keys
                chatTitle.addEventListener('keydown', async function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        await loadChat(chat.chatId);
                    }
                });

                // Create delete button
                const binIconButton = document.createElement('button');
                binIconButton.classList.add('bin-icon-button');
                binIconButton.setAttribute('aria-label', `Delete chat titled ${sanitizeText(chat.title)}`);

                const binIcon = document.createElement('i');
                binIcon.classList.add('fas', 'fa-trash', 'bin-icon');
                binIconButton.appendChild(binIcon);

                // Add click event to delete the chat
                binIconButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent click from triggering loadChat
                    deleteChat(chat.chatId);
                });

                // Append the chat title and delete button to the chat item
                chatItem.appendChild(chatTitle);
                chatItem.appendChild(binIconButton);

                // Handle visibility
                if (chat.visibility !== 1 && chat.visibility !== undefined) {
                    chatItem.style.display = 'none';
                }

                chatItems.appendChild(chatItem);
            }

            chatHistoryList.appendChild(chatItems);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Helper function to sanitize chat titles
function sanitizeText(text) {
    return text.replace(/[^a-zA-Z0-9\s]/g, ''); // Allow only alphanumeric characters and spaces
}

// Helper function to validate chat title input dynamically
function validateChatTitle(inputElement) {
    const sanitizedText = inputElement.textContent.replace(/[^a-zA-Z0-9\s]/g, ''); // Remove invalid characters
    if (inputElement.textContent !== sanitizedText) {
        inputElement.textContent = sanitizedText; // Update if invalid characters are removed
    }
}

function createScrollTable(index, element) {
    const root = element; // element is a DOM element, not a jQuery object
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


// Function to load a previous chat by chatId
async function loadChat(chatIdToLoad) {
    chatId = chatIdToLoad; // Set chatId to the one being loaded
    sessionStorage.setItem('chatId', chatId);

    const res = await fetch(`/chats/${chatId}`);
    const chat = await res.json();

    chatBox.innerHTML = '';

    // If the chat has no messages, show the welcome screen
    if (chat.messages.length === 0) {
        showWelcomeScreen();
    } else {
        hideWelcomeScreen();
    }

    // Append the messages to the chat window
    chat.messages.forEach(msg => {
        appendMessage(msg.role === 'user' ? 'You' : 'AI', msg.content, false);
    });

    chatInput.focus();
}

newChatBtn.addEventListener('click', () => {
    chatBox.innerHTML = '';
    showWelcomeScreen();

    // Generate a new chatId and store it in sessionStorage
    chatId = generateChatId();
    sessionStorage.setItem('chatId', chatId);

    loadChatHistory();
    isFirstInteraction = true;
});

function appendMessage(sender, message, imageFile = null, isLoading = false) {
    const chatBox = document.getElementById("chat-box");
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender === "You" ? "user" : "ai");

    const messageContent = document.createElement("div");
    messageContent.classList.add("message-content");

    // Regex pattern now includes:
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

        // Convert markdown (excluding math) to HTML
        const parsedHTML = marked.parse(textWithPlaceholders);

        // Restore math segments
        let finalHTML = parsedHTML;
        mathSegments.forEach((segment, i) => {
            // Insert the original math segment back into the final HTML
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
        const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
        const parts = message.split(codeBlockRegex);

        let language = ''; // Define language here so we can use it after the second part

        parts.forEach((part, index) => {
            const safePart = (part || '').trim(); // Ensure safe trimming

            if (index % 3 === 0) {
                // Regular text may contain markdown & math
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");

                const finalHTML = processTextWithMarkdownAndMath(safePart);
                messageText.innerHTML = finalHTML;

                // Add 'table' class to tables, then wrap them as requested
                const tables = messageText.querySelectorAll('table');
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

                hljs.highlightElement(codeContent);

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

        // Handle loading or add copy button for entire AI message
        if (isLoading) {
            const loadingDots = document.createElement("div");
            loadingDots.classList.add("loading-dots");
            loadingDots.innerHTML = `<div></div><div></div><div></div>`;
            messageBody.appendChild(loadingDots);
        } else {
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
    }

    messageElement.appendChild(messageContent);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Dynamically typeset MathJax for the newly added message element
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([messageElement])
            .catch(err => console.error("MathJax rendering failed:", err));
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
let fileUploadInProgress = false;  // Flag to prevent multiple uploads

fileUpload.addEventListener('change', async function () {
    if (fileUploadInProgress) return;  // Prevent multiple uploads
    fileUploadInProgress = true;

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
                // Not an image, upload it immediately via /upload endpoint
                const formData = new FormData();
                formData.append('file', file);
                formData.append('chatId', chatId); // Ensure chatId is sent along with the file

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
    fileUploadInProgress = false;  
});

function appendFileLink(fileName, fileUrl) {
    const chatBox = document.getElementById('chat-box');
    
    // Create a container for the file link
    const fileElement = document.createElement('div');
    fileElement.classList.add('file-upload-container', 'user'); // Align with user messages
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content'); // Apply message content styling

    // File link element
    const fileLink = document.createElement('a');
    fileLink.href = fileUrl || '#'; // Use '#' if fileUrl is not provided
    fileLink.textContent = fileName;
    fileLink.classList.add('file-link'); // Optional class for styling

    // Determine if the file is an image based on its extension
    const isImage = /\.(jpeg|jpg|gif|png|bmp|svg|tif|heic)$/i.test(fileName);

    if (isImage && fileUrl) {
        // It's an image, attach event listener to open in modal
        fileLink.addEventListener('click', (e) => {
            e.preventDefault();
            showImageModal(fileUrl);
        });
        fileLink.style.cursor = 'pointer'; // Indicate that it's clickable
    } else if (fileUrl) {
        // For non-image files, keep the default behavior
        fileLink.target = '_blank'; // Open in a new tab
    }

    messageContent.appendChild(fileLink);
    
    // Create delete button
    const deleteButton = document.createElement('span');
    deleteButton.classList.add('material-symbols-rounded', 'delete-button');
    deleteButton.textContent = 'delete';
    deleteButton.title = 'Delete this file message';

    // Add click event to delete the file message
    deleteButton.addEventListener('click', () => {
        chatBox.removeChild(fileElement); // Remove the file message from the chat
    });

    messageContent.appendChild(deleteButton);
    fileElement.appendChild(messageContent);
    chatBox.appendChild(fileElement);
    
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom
}

const sidebar = document.getElementById('sidebar');

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const chatBox = document.getElementById('chat-box');
    const collapseBtn = document.getElementById('collapse-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const attachIcon = document.getElementById('attach-icon');
    const chatWindow = document.querySelector('.chat-window');
    const tutorModeButton = document.getElementById('tutor-mode-button');
    const iconContainer = document.querySelector('.icon-container');
    const inputContainer = document.querySelector('.input-container');
    const inputBackground = document.querySelector('.input-background');

    if (sidebar.classList.contains('collapsed')) {
        // Sidebar is currently collapsed, so let's expand it
        sidebar.classList.remove('collapsed');
        chatBox.classList.remove('collapsed');
        collapseBtn.textContent = 'left_panel_close';
        chatWindow.classList.remove('collapsed');
        inputContainer.classList.remove('collapsed');
        iconContainer.classList.remove('collapsed');
        inputBackground.classList.remove('collapsed');

        document.body.classList.remove('no-chat-scroll'); // Remove class when expanded

        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        //tutorModeButton.classList.add('active');
        iconContainer.classList.add('active');
        inputBackground.classList.add('active');
    } else {
        // Sidebar is currently expanded, so let's collapse it
        sidebar.classList.add('collapsed');
        chatBox.classList.add('collapsed');
        collapseBtn.textContent = 'left_panel_open';
        chatWindow.classList.add('collapsed');
        inputContainer.classList.add('collapsed');
        iconContainer.classList.add('collapsed');
        inputBackground.classList.add('collapsed');

        document.body.classList.add('no-chat-scroll'); // Add class when collapsed

        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        //tutorModeButton.classList.remove('active');
        iconContainer.classList.remove('active');
    }
}

function initializeActiveState() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const attachIcon = document.getElementById('attach-icon');
    //const tutorModeButton = document.getElementById('tutor-mode-button');
    const iconContainer = document.querySelector('.icon-container');

    iconContainer.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            // Move focus to the first chatItem
            const firstChatItem = document.querySelector('.chat-item');
            if (firstChatItem) {
                firstChatItem.focus();
            }
        }
    });

    if (!sidebar.classList.contains('collapsed')) {
        // Sidebar is open, add 'active' class to icons and icon-container
        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        //tutorModeButton.classList.add('active');
        iconContainer.classList.add('active');
    } else {
        // Sidebar is collapsed, remove 'active' class from icons and icon-container
        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        //tutorModeButton.classList.remove('active');
        iconContainer.classList.remove('active');
    }
}

// Call the initializeActiveState function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeActiveState();
    loadChatHistory(); // Load chat history on page load

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
        console.log(`Sending message with Tutor Mode: ${isTutorModeOn ? 'ON' : 'OFF'}`);

        if (isFirstInteraction) {
            hideWelcomeScreen();
            isFirstInteraction = false;
        }

        // Append the user's message immediately
        const userMessageElement = appendMessage('You', message);

        // Show AI loading message immediately
        const loadingMessageElement = appendMessage('AI', '', null, true);

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

        // If we hit a rate limit or there's no response (error)
        if (response === null) {
            // Remove the user's message and loading message
            if (userMessageElement && userMessageElement.parentNode) {
                userMessageElement.parentNode.removeChild(userMessageElement);
            }
            if (loadingMessageElement && loadingMessageElement.parentNode) {
                loadingMessageElement.parentNode.removeChild(loadingMessageElement);
            }
            return;
        }

        // If we got a successful response, replace loading dots with streamed AI message
        const messageContent = loadingMessageElement.querySelector('.message-content');
        streamParsedResponse(messageContent, response);

        loadChatHistory();
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

            chatInput.value = '';
            sendBtn.classList.remove('active');

            setTimeout(() => {
                resetInputHeight();
            }, 0);

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
                // Remove the user's message and loading message
                if (userMessageElement && userMessageElement.parentNode) {
                    userMessageElement.parentNode.removeChild(userMessageElement);
                }
                if (loadingMessageElement && loadingMessageElement.parentNode) {
                    loadingMessageElement.parentNode.removeChild(loadingMessageElement);
                }
                return;
            }

            // If we got a successful response, handle AI message streaming
            if (response) {
                const messageContent = loadingMessageElement.querySelector('.message-content');
                streamParsedResponse(messageContent, response);
                loadChatHistory();
            } else {
                console.error('Response is undefined.');
            }
        }
    }
});


sendBtn.addEventListener('keydown', function(event) {
    if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        // Move focus to the first chatItem
        const firstChatItem = document.querySelector('.chat-item');
        if (firstChatItem) {
            firstChatItem.focus();
        }
    }
});

function streamMessageFromServer() {
    const eventSource = new EventSource('/chat-stream'); // Adjust the endpoint if needed

    eventSource.onmessage = function (event) {
        const content = event.data;
        if (content === '[DONE]') {
            eventSource.close(); // Close the stream when done
        } else {
            // Append the content to the chat as it arrives
            appendMessage('AI', content);
        }
    };

    eventSource.onerror = function (event) {
        console.error('Error in event source:', event);
        eventSource.close(); // Close the stream on error
    };
}

function streamParsedResponse(messageContent, rawResponseText) {
    // Remove any loading dots if present
    const messageBody = messageContent.querySelector('.message-body');
    if (!messageBody) {
        console.error("Message body not found.");
        return;
    }

    const loadingDots = messageBody.querySelector('.loading-dots');
    if (loadingDots) {
        loadingDots.remove();
    }

    // Create or select a messageText element to display the streaming text
    let messageText = messageBody.querySelector('.message-text');
    if (!messageText) {
        messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageBody.appendChild(messageText);
    }

    // We'll stream the text as plain text first, then do a final parse at the end
    messageText.textContent = ''; // Ensure empty at start of streaming

    const words = rawResponseText.split(/(\s+)/); // Split by spaces, keeping them
    let currentWordIndex = 0;
    let accumulatedText = '';

    const intervalSpeed = 10; // Faster interval for smoother streaming
    const maxWordsPerChunk = 5; // Append a few words per iteration for even smoother streaming

    const wordInterval = setInterval(() => {
        if (currentWordIndex < words.length) {
            // Append a few words each iteration for smoother streaming
            const chunkEnd = Math.min(currentWordIndex + maxWordsPerChunk, words.length);
            for (let i = currentWordIndex; i < chunkEnd; i++) {
                accumulatedText += words[i];
            }
            currentWordIndex = chunkEnd;

            // Update the textContent quickly (no markdown, just raw text now)
            messageText.textContent = accumulatedText;
            chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
        } else {
            clearInterval(wordInterval);

            // Streaming done, now we do the final parsing & formatting
            finalizeResponseFormatting(messageBody, accumulatedText);
        }
    }, intervalSpeed);
}

function finalizeResponseFormatting(messageBody, rawResponseText) {
    // Now parse markdown, handle code blocks, math, etc.
    // Clear existing content
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
}


function reRenderMessageWithCodeBlocks(messageBody, rawResponseText) {
    const mathPattern = /(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[\s\S]*?\$)|(\\\[[\s\S]*?\\\])/g;

    function processTextWithMarkdownAndMath(text) {
        const mathSegments = [];
        let placeholderIndex = 0;

        const textWithPlaceholders = text.replace(mathPattern, (match) => {
            mathSegments.push(match);
            return `%%%MATH${placeholderIndex++}%%%`;
        });

        const parsedHTML = marked.parse(textWithPlaceholders);

        let finalHTML = parsedHTML;
        mathSegments.forEach((segment, i) => {
            finalHTML = finalHTML.replace(`%%%MATH${i}%%%`, segment);
        });

        return finalHTML;
    }

    messageBody.innerHTML = '';
    let entireMessage = '';

    const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;

    // Split the response text safely
    const parts = rawResponseText ? rawResponseText.split(codeBlockRegex) : [''];

    for (let i = 0; i < parts.length; i++) {
        const currentPart = parts[i] || '';

        if (i % 3 === 0) {
            // Regular text parts
            const textToProcess = currentPart.trim();
            const messageText = document.createElement('div');
            messageText.classList.add('message-text');
            const finalHTML = processTextWithMarkdownAndMath(textToProcess);
            messageText.innerHTML = finalHTML;

            const tables = messageText.querySelectorAll('table');
            tables.forEach(table => table.classList.add('table'));

            messageBody.appendChild(messageText);
            entireMessage += textToProcess;

        } else if (i % 3 === 1) {
            // Language for the code block
            var language = currentPart ? currentPart.trim() : '';
        } else if (i % 3 === 2) {
            // Code block content
            const codeContentText = currentPart ? currentPart.trim() : '';
            const codeBlock = document.createElement('div');
            codeBlock.classList.add('code-block-container');

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
    input.style.height = '20px'; // Reset to initial height
    input.style.overflowY = 'hidden'; // Hide scrollbar when resetting
}

// Auto-growing input logic
function autoGrowInput() {
    const input = document.getElementById("chat-input");
    input.style.height = "20px"; // Set to default height first
    input.style.overflowY = "hidden"; // Ensure overflow is hidden initially

    // Check if the content height exceeds the current height, and grow as needed
    if (input.scrollHeight > input.clientHeight) {
        input.style.height = input.scrollHeight + "px"; // Set to the scrollHeight to grow dynamically
        input.style.overflowY = input.scrollHeight > 300 ? "auto" : "hidden"; // Show scrollbar if exceeds max height
    }
}

// Existing event listener for input event
chatInput.addEventListener('input', () => {
    // Automatically grow the input field as the user types
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

// Function to show the welcome screen
function showWelcomeScreen() {
    const welcomeContainer = document.getElementById('welcome-container');
    welcomeContainer.style.display = 'block'; // Show the welcome screen
}

// Function to hide the welcome screen
function hideWelcomeScreen() {
    const welcomeContainer = document.getElementById('welcome-container');
    welcomeContainer.style.display = 'none'; // Hide the welcome screen
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
    MathJax.typesetPromise(); // Re-render MathJax equations
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
    dragCounter = 0; // Reset counter on drop
    inputContainer.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        if (fileUploadInProgress) return;  // Prevent multiple uploads
        fileUploadInProgress = true;

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

                // Revert after 2 seconds
                setTimeout(() => {
                    attachIcon.textContent = "attach_file";
                }, 2000);
            } else {
                // Not an image, upload it immediately via /upload endpoint
                const formData = new FormData();
                formData.append('file', file);
                formData.append('chatId', chatId); // Ensure chatId is sent along with the file

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
        fileUploadInProgress = false;  
    }
}

// Add event listeners for chat-title validation
document.addEventListener("DOMContentLoaded", () => {
    const chatTitleElements = document.querySelectorAll('.chat-title'); // Select all elements with the class 'chat-title'
    chatTitleElements.forEach(chatTitle => {
        chatTitle.addEventListener('input', () => validateChatTitle(chatTitle)); // Validate on input
    });
});


function deleteChat(chatId) {
    fetch(`/chats/${chatId}`, {
        method: 'DELETE',
    })
    .then(response => {
        if (response.ok) {
            // Reload the chat history to reflect the changes
            loadChatHistory();
        } else {
            console.error('Failed to delete chat');
        }
    })
    .catch(error => {
        console.error('Error deleting chat:', error);
    });
}

// Load the chat history when the page loads
window.onload = async () => {
    try {
        const response = await fetch('/user-info', {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        sessionStorage.setItem('userId', data.userId);
        sessionStorage.setItem('userName', data.userName);

        chatId = sessionStorage.getItem('chatId') || generateChatId();
        sessionStorage.setItem('chatId', chatId);

        loadChatHistory();  // Load chats that belong to the user
        showWelcomeScreen();
    } catch (error) {
        console.error('Error fetching user info:', error);
        window.location.href = '/login'; // Redirect to login on error
    }
};

// Update the showWelcomeScreen function:
function showWelcomeScreen() {
    const welcomeContainer = document.getElementById('welcome-container');
    const userName = sessionStorage.getItem('userName') || 'User';
    welcomeContainer.style.display = 'block'; // Show the welcome screen
    const welcomeMessage = welcomeContainer.querySelector('p');
    welcomeMessage.textContent = `Welcome ${userName} to KaplanGPT! This is a secure and welcoming environment where you can freely explore. Feel free to engage in conversation with me.`;
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
    closeBtn.innerHTML = '&times;'; // Unicode multiplication sign

    // Add click event to close the modal
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        // We do NOT revokeObjectURL here because we may need to show the same image again.
        // If you do need to revoke, do so only when the image will never be displayed again.
    });

    // Close modal when clicking outside the image
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            // Same note as above about revokeObjectURL.
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


