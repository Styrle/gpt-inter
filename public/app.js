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
            return null;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

function displayRateLimitMessage(retryAfter) {
    const chatBox = document.getElementById('chat-box');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'ai-message'); // Apply appropriate styling classes
    messageElement.textContent = `KaplanGPT has hit its limit. Please wait ${retryAfter} seconds.`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
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

        parts.forEach((part, index) => {
            if (index % 3 === 0) {
                // Regular text may contain markdown & math
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");

                const finalHTML = processTextWithMarkdownAndMath(part.trim());
                messageText.innerHTML = finalHTML;

                // Add 'table' class to tables
                const tables = messageText.querySelectorAll('table');
                tables.forEach(table => {
                    table.classList.add('table');
                });

                messageBody.appendChild(messageText);
                entireMessage += part.trim();
            } else if (index % 3 === 1) {
                // Language for the code block
                var language = part.trim();
            } else if (index % 3 === 2) {
                // Code block content
                const codeBlock = document.createElement("div");
                codeBlock.classList.add("code-block-container");

                const codeElement = document.createElement("pre");
                const codeContent = document.createElement("code");

                if (language) {
                    codeContent.classList.add(`language-${language}`);
                }

                codeContent.textContent = part.trim();
                codeElement.appendChild(codeContent);

                hljs.highlightElement(codeContent);

                const codeCopyButton = document.createElement("span");
                codeCopyButton.classList.add("material-symbols-rounded", "code-copy-button");
                codeCopyButton.textContent = "content_copy";

                codeCopyButton.addEventListener("click", () => {
                    navigator.clipboard.writeText(part.trim()).then(() => {
                        codeCopyButton.textContent = "done";
                        setTimeout(() => {
                            codeCopyButton.textContent = "content_copy";
                        }, 2000);
                    });
                });

                codeBlock.appendChild(codeElement);
                codeBlock.appendChild(codeCopyButton);
                messageBody.appendChild(codeBlock);
                entireMessage += `\n\n${part.trim()}`;
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

        if (imageFile) {
            const imageElement = document.createElement("img");
            imageElement.src = URL.createObjectURL(imageFile);
            imageElement.alt = "Uploaded Image";
            imageElement.classList.add("uploaded-image");
            messageBody.appendChild(imageElement);
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
                // It's an image, store it for sending with the next message
                selectedImageFile = file;

                // Optionally, display the selected file in the chat
                appendFileLink(file.name);

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

                        // Optionally, display the file name in the chat
                        appendFileLink(file.name);
                    } else {
                        const errorData = await response.json();
                            console.error('Upload error:', errorData.error);
                            appendMessage('System', `Error uploading file: ${errorData.error}`);

                            // Display the popup if the error is about unsupported file type
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
                    // Ensure that fileUpload is reset after processing
                    setTimeout(() => {
                        fileUpload.value = '';  // Reset the file input, but with a delay to ensure upload completes
                    }, 100);  // Small delay to ensure the input reset doesn't cause interference
                }
            }
        }
    }
    fileUploadInProgress = false;  // Clear the upload flag
});

function appendFileLink(fileName, fileUrl) {
    const chatBox = document.getElementById('chat-box');
    
    // Create a container for the file link
    const fileElement = document.createElement('div');
    fileElement.classList.add('file-upload-container', 'user'); // Add 'user' class to align it with user messages
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content'); // Apply message content styling

    // File link element
    const fileLink = document.createElement('a');
    fileLink.href = fileUrl;
    fileLink.textContent = fileName;
    fileLink.target = '_blank'; // Open in a new tab
    fileLink.classList.add('file-link'); // Optional class for styling
    
    messageContent.appendChild(fileLink);
    
    // Create delete button
    const deleteButton = document.createElement('span');
    deleteButton.classList.add('material-symbols-rounded', 'delete-button');
    deleteButton.textContent = 'delete';
    
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

    if (sidebar.classList.contains('collapsed')) {
        // Sidebar is currently collapsed, so let's expand it
        sidebar.classList.remove('collapsed');
        chatBox.classList.remove('collapsed');
        collapseBtn.textContent = 'left_panel_close';
        chatWindow.classList.remove('collapsed');
        inputContainer.classList.remove('collapsed');

        document.body.classList.remove('no-chat-scroll'); // Remove class when expanded

        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        tutorModeButton.classList.add('active');
        iconContainer.classList.add('active');
    } else {
        // Sidebar is currently expanded, so let's collapse it
        sidebar.classList.add('collapsed');
        chatBox.classList.add('collapsed');
        collapseBtn.textContent = 'left_panel_open';
        chatWindow.classList.add('collapsed');
        inputContainer.classList.add('collapsed');

        document.body.classList.add('no-chat-scroll'); // Add class when collapsed

        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        tutorModeButton.classList.remove('active');
        iconContainer.classList.remove('active');
    }
}

function initializeActiveState() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const attachIcon = document.getElementById('attach-icon');
    const tutorModeButton = document.getElementById('tutor-mode-button');
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
        tutorModeButton.classList.add('active');
        iconContainer.classList.add('active');
    } else {
        // Sidebar is collapsed, remove 'active' class from icons and icon-container
        collapseBtn.classList.remove('active');
        newChatBtn.classList.remove('active');
        attachIcon.classList.remove('active');
        tutorModeButton.classList.remove('active');
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
    if (message || selectedImageFile) {
        // Log current tutor mode before sending the message
        console.log(`Sending message with Tutor Mode: ${isTutorModeOn ? 'ON' : 'OFF'}`);

        // Hide the welcome screen if it's the first interaction
        if (isFirstInteraction) {
            hideWelcomeScreen();
            isFirstInteraction = false; // Mark that the first interaction is done
        }

        // Append the user's message to the chat, including the image if any
        appendMessage('You', message, selectedImageFile);

        chatInput.value = ''; // Clear the input value
        sendBtn.classList.remove('active'); // Reset button state

        // Append an empty message with loading dots for AI response
        const loadingMessageElement = appendMessage('AI', '', null, true);

        try {
            let response;
            if (selectedImageFile) {
                // Use sendMessageWithImage if an image is selected
                response = await sendMessageWithImage(message, selectedImageFile);
                selectedImageFile = null; // Reset the selected image after sending
            } else {
                // Use sendMessage if no image is selected
                response = await sendMessage(message);
            }

            if (response) {
                streamParsedResponse(messageContent, response);
            } else {
                console.error('Response is undefined.');
            }

            const messageContent = loadingMessageElement.querySelector('.message-content');

            // Stream the raw AI response text
            streamParsedResponse(messageContent, response);

            // Update the chat history sidebar
            loadChatHistory();

        } catch (error) {
            console.error('Error sending message:', error);
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
    const words = rawResponseText.split(/(\s+)/); // Split by spaces, keeping them
    let currentWordIndex = 0;
    let accumulatedText = ''; // To accumulate the words as they stream in
    let lastRenderedWordIndex = 0; // Track the last index rendered for heavy tasks

    // Ensure messageBody exists
    const messageBody = messageContent.querySelector('.message-body');
    if (!messageBody) {
        console.error("Message body not found.");
        return;
    }

    let messageText = messageBody.querySelector('.message-text');
    if (!messageText) {
        messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageBody.appendChild(messageText);
    }

    // Remove loading dots once streaming starts
    const loadingDots = messageBody.querySelector('.loading-dots');
    if (loadingDots) {
        loadingDots.remove();
    }

    const wordInterval = setInterval(() => {
        if (currentWordIndex < words.length) {
            accumulatedText += words[currentWordIndex];
            currentWordIndex++;

            // Update text frequently for real-time effect
            messageText.innerHTML = marked.parse(accumulatedText);

            // Perform heavy operations less frequently
            if (currentWordIndex - lastRenderedWordIndex >= 20 || currentWordIndex === words.length) {
                lastRenderedWordIndex = currentWordIndex;

                // Re-render code blocks and MathJax less often
                reRenderMessageWithCodeBlocks(messageBody, accumulatedText);

                if (window.MathJax && MathJax.typesetPromise) {
                    MathJax.typesetPromise().catch((err) => console.error("MathJax rendering failed:", err));
                }
            }

            chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to bottom
        } else {
            clearInterval(wordInterval);

            // Final rendering after streaming completes
            reRenderMessageWithCodeBlocks(messageBody, accumulatedText);

            if (window.MathJax && MathJax.typesetPromise) {
                MathJax.typesetPromise().catch((err) => console.error("MathJax rendering failed:", err));
            }
        }
    }, 20); // Maintain the original speed
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
    const parts = rawResponseText.split(codeBlockRegex);

    for (let i = 0; i < parts.length; i++) {
        if (i % 3 === 0) {
            const messageText = document.createElement('div');
            messageText.classList.add('message-text');
            const finalHTML = processTextWithMarkdownAndMath(parts[i].trim());
            messageText.innerHTML = finalHTML;

            const tables = messageText.querySelectorAll('table');
            tables.forEach(table => table.classList.add('table'));

            messageBody.appendChild(messageText);
            entireMessage += parts[i].trim();

        } else if (i % 3 === 1) {
            var language = parts[i].trim();
        } else if (i % 3 === 2) {
            const codeBlock = document.createElement('div');
            codeBlock.classList.add('code-block-container');

            const codeElement = document.createElement('pre');
            const codeContent = document.createElement('code');

            if (language) {
                codeContent.classList.add(`language-${language}`);
            }

            codeContent.textContent = parts[i].trim();
            codeElement.appendChild(codeContent);

            hljs.highlightElement(codeContent);

            const codeCopyButton = document.createElement('span');
            codeCopyButton.classList.add('material-symbols-rounded', 'code-copy-button');
            codeCopyButton.textContent = 'content_copy';

            codeCopyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(parts[i].trim()).then(() => {
                    codeCopyButton.textContent = 'done';
                    setTimeout(() => {
                        codeCopyButton.textContent = 'content_copy';
                    }, 2000);
                });
            });

            codeBlock.appendChild(codeElement);
            codeBlock.appendChild(codeCopyButton);
            messageBody.appendChild(codeBlock);
            entireMessage += `\n\n${parts[i].trim()}`;
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

chatInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent adding a new line

        const message = chatInput.value.trim();

        if (message || selectedImageFile) {
            console.log(`Sending message with Tutor Mode: ${isTutorModeOn ? 'ON' : 'OFF'}`);

            if (isFirstInteraction) {
                hideWelcomeScreen();
                isFirstInteraction = false;
            }

            // Append the user's message to the chat
            appendMessage('You', message || '');

            chatInput.value = '';
            sendBtn.classList.remove('active');

            // Reset input height
            setTimeout(() => {
                resetInputHeight();
            }, 0);

            // Append an empty message with loading dots for AI
            const loadingMessageElement = appendMessage('AI', '', null, true);

            try {
                let response;
                if (selectedImageFile) {
                    response = await sendMessageWithImage(message, selectedImageFile);
                    selectedImageFile = null;
                } else {
                    response = await sendMessage(message);
                }

                const messageContent = loadingMessageElement.querySelector('.message-content');

                // **Removed the code that was removing loading dots here**

                // Stream the AI response
                streamParsedResponse(messageContent, response);

                // Update the chat history sidebar
                loadChatHistory();

            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
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
async function sendMessageWithImage(message, imageFile) {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('chatId', chatId);
    formData.append('tutorMode', isTutorModeOn);

    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const res = await fetch('/chat', {
            method: 'POST', // Include the HTTP method
            body: formData, // Include the form data in the body
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                // Note: Do not set 'Content-Type' header when sending FormData
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

        // Access total_image_count and total_image_size
        console.log('Total Images:', data.total_image_count);
        console.log('Total Image Size:', data.total_image_size);

        // Optionally, update the UI with this information
        updateImageStats(data.total_image_count, data.total_image_size);

        return data.response;
    } catch (error) {
        console.error('Error sending message with image:', error);
        throw error; // Optionally re-throw the error to be caught by the caller
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

function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
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
    inputContainer.classList.remove('dragover');
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    inputContainer.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        if (fileUploadInProgress) return;  // Prevent multiple uploads
        fileUploadInProgress = true;

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                // It's an image, store it for sending with the next message
                selectedImageFile = file;

                // Optionally, display the selected file in the chat
                appendFileLink(file.name);

                // Change the attach icon to 'done'
                attachIcon.textContent = "done"; 

                // Revert back to attach icon after 2 seconds
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
                        // Change the attach icon to 'done'
                        attachIcon.textContent = "done"; 
                        
                        // Revert back to attach icon after 2 seconds
                        setTimeout(() => {
                            attachIcon.textContent = "attach_file";
                        }, 2000);

                        // Inform the user that the file was uploaded
                        appendMessage('System', `File "${file.name}" uploaded successfully.`);

                        // Optionally, display the file name in the chat afw
                        appendFileLink(file.name);
                    } else {
                        const errorData = await response.json();
                            console.error('Upload error:', errorData.error);
                            appendMessage('System', `Error uploading file: ${errorData.error}`);

                            // Display the popup if the error is about unsupported file type
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
        fileUploadInProgress = false;  // Clear the upload flag
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
