// Generate a new chatId on page load
let chatId = generateChatId();
sessionStorage.setItem('chatId', chatId);

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

// Toggle the dropdown visibility when the "group" icon is clicked
tutorModeButton.addEventListener('click', function() {
    tutorModeDropdown.style.display = tutorModeDropdown.style.display === 'block' ? 'none' : 'block';
});

// Close the dropdown if the user clicks outside of it
window.addEventListener('click', function(event) {
    if (!event.target.matches('#tutor-mode-button')) {
        tutorModeDropdown.style.display = 'none';
    }
});

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

// Send message function - ensure tutorMode is passed
async function sendMessage(message) {
    const res = await fetch('/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            message: message, 
            chatId: chatId, 
            tutorMode: isTutorModeOn,
        }),
    });
    const data = await res.json();
    return data.response;
}

// Handle clicking the attach icon to trigger the file input
attachIcon.addEventListener('click', () => {
    //fileUpload.click(); // Manually trigger the file input
});

// Load existing chats from history and categorize them
async function loadChatHistory() {
    const res = await fetch('/chats');
    const chats = await res.json();

    chatHistoryList.innerHTML = ''; // Clear the existing list

    // Define the desired category order, with 'Today' at the top
    const orderedCategories = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days'];

    // Filter only the categories that are present in the fetched chats
    const availableCategories = orderedCategories.filter(category => chats[category]);

    // Loop through the ordered categories and render the chat items
    availableCategories.forEach(category => {
        const categoryItem = document.createElement('li');
        categoryItem.textContent = category;
        categoryItem.classList.add('chat-category-list');
        chatHistoryList.appendChild(categoryItem);

        const chatItems = document.createElement('ul');

        // Reverse the chats for each category to show most recent first
        const reversedChats = chats[category].slice().reverse();

        // Append each chat item
        reversedChats.forEach(chat => {
            const chatItem = document.createElement('li');
            chatItem.dataset.chatId = chat.chatId;
            chatItem.classList.add('chat-item');

            // Create a span for the chat title
            const chatTitle = document.createElement('span');
            chatTitle.textContent = chat.title;
            chatTitle.classList.add('chat-title');
            chatTitle.addEventListener('click', () => loadChat(chat.chatId));

            // Create the bin icon
            const binIcon = document.createElement('i');
            binIcon.classList.add('fas', 'fa-trash', 'bin-icon');

            // Add click event to bin icon
            binIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the click from triggering the loadChat
                deleteChat(chat.chatId);
            });

            // Append title and bin icon to chatItem
            chatItem.appendChild(chatTitle);
            chatItem.appendChild(binIcon);

            // Check the visibility property and set display accordingly
            if (chat.visibility !== 1 && chat.visibility !== undefined) {
                chatItem.style.display = 'none';
            }

            chatItems.appendChild(chatItem);
        });

        chatHistoryList.appendChild(chatItems);
    });
}

// Function to load a previous chat by chatId
async function loadChat(chatIdToLoad) {
    chatId = chatIdToLoad; // Set chatId to the one being loaded
    sessionStorage.setItem('chatId', chatId);

    const res = await fetch(`/chats/${chatId}`);
    const chat = await res.json();

    chatBox.innerHTML = ''; // Clear the chat window

    // If the chat has no messages, show the welcome screen
    if (chat.messages.length === 0) {
        showWelcomeScreen();
    } else {
        hideWelcomeScreen(); // Hide the welcome screen if there are messages
    }

    // Append the messages to the chat window
    chat.messages.forEach(msg => {
        appendMessage(msg.role === 'user' ? 'You' : 'AI', msg.content, false);
    });
}

newChatBtn.addEventListener('click', () => {
    // Clear chat window and show the welcome screen
    chatBox.innerHTML = '';
    showWelcomeScreen();

    // Generate a new chatId and store it in sessionStorage
    chatId = generateChatId();
    sessionStorage.setItem('chatId', chatId);

    loadChatHistory(); // Reload chat history in the side panel
    isFirstInteraction = true;
});

function appendMessage(sender, message, imageFile = null, isLoading = false) {
    const chatBox = document.getElementById("chat-box");
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender === "You" ? "user" : "ai");

    const messageContent = document.createElement("div");
    messageContent.classList.add("message-content");

    // AI message handling
    if (sender === "AI") {
        const aiIcon = document.createElement("img");
        aiIcon.src = "images/K_logo.svg";
        aiIcon.alt = "AI Icon";
        aiIcon.classList.add("ai-icon");

        const messageBody = document.createElement("div");
        messageBody.classList.add("message-body");

        let entireMessage = ''; // To store the entire message

        // Use a regex to split the content into normal text and code blocks
        const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
        const parts = message.split(codeBlockRegex);

        parts.forEach((part, index) => {
            if (index % 3 === 0) {
                // Regular text part
                const messageText = document.createElement("div");
                messageText.classList.add("message-text");

                // Use the same text rendering method for normal text
                const parsedText = marked.parse(part.trim());
                messageText.innerHTML = parsedText;

                // Add 'table' class to any tables
                const tables = messageText.querySelectorAll('table');
                tables.forEach(table => {
                    table.classList.add('table');
                });

                messageBody.appendChild(messageText);
                entireMessage += part.trim();
            } else if (index % 3 === 1) {
                // Capture language identifier (e.g., python, javascript)
                var language = part.trim(); // Extract language from the first part of the regex capture group.
            } else if (index % 3 === 2) {
                // Code block part
                const codeBlock = document.createElement("div");
                codeBlock.classList.add("code-block-container");

                const codeElement = document.createElement("pre");
                const codeContent = document.createElement("code");

                // Set the appropriate language class if language was detected
                if (language) {
                    codeContent.classList.add(`language-${language}`);
                }

                codeContent.textContent = part.trim(); // Add code inside <pre><code></code></pre>
                codeElement.appendChild(codeContent);

                // Initialize Highlight.js for the code block
                hljs.highlightElement(codeContent);

                // Create copy button for the code block
                const codeCopyButton = document.createElement("span");
                codeCopyButton.classList.add("material-symbols-rounded", "code-copy-button");
                codeCopyButton.textContent = "content_copy";

                // Bind the copy event right after appending the code
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

        // Handle the loading state if necessary
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

            // Copy the entire message
            copyButton.addEventListener("click", () => {
                navigator.clipboard.writeText(entireMessage).then(() => {
                    copyButton.textContent = "done";
                    setTimeout(() => {
                        copyButton.textContent = "content_copy";
                    }, 2000);
                });
            });
        }

        // Add AI icon and message content to the final element
        messageContent.appendChild(aiIcon);
        messageContent.appendChild(messageBody);
    } else if (sender === "You") {
        // User message handling with image support
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
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom

    return messageElement; // Return the element for further manipulation
}

function generateChatId() {
    const sessionSecret = sessionStorage.getItem('sessionSecret') || 'defaultSecret3';  // Retrieve session secret or set a default
    const randomNumber = Math.random().toString(36).substr(2, 9); 
    return `${sessionSecret}_chat_${randomNumber}`; 
}

let selectedImageFile = null;

// Handle file upload and sending message
let fileUploadInProgress = false;  // Flag to prevent multiple uploads

fileUpload.addEventListener('change', async function () {
    if (fileUploadInProgress) return;  // Prevent multiple uploads
    fileUploadInProgress = true;

    const file = fileUpload.files[0];
    if (file) {
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
            fileUploadInProgress = false;  // Clear the upload flag
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

                    // Since the server does not return a file URL, we can inform the user that the file was uploaded
                    appendMessage('System', `File "${file.name}" uploaded successfully.`);

                    // Optionally, you can also display the file name in the chat
                    appendFileLink(file.name);
                } else {
                    const errorData = await response.json();
                    console.error('Upload error:', errorData.error);
                    appendMessage('System', `Error uploading file: ${errorData.error}`);
                }
            } catch (error) {
                console.error('Error uploading file:', error);
                appendMessage('System', 'An error occurred while uploading the file.');
            } finally {
                // Ensure that fileUpload is reset and the upload flag is cleared after processing
                setTimeout(() => {
                    fileUpload.value = '';  // Reset the file input, but with a delay to ensure upload completes
                }, 100);  // Small delay to ensure the input reset doesn't cause interference
                fileUploadInProgress = false;  // Clear the upload flag
            }
        }
    }
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
    const collapseBtn = document.getElementById('collapse-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const attachIcon = document.getElementById('attach-icon');
    const chatWindow = document.querySelector('.chat-window');
    const tutorModeButton = document.getElementById('tutor-mode-button');
    const iconContainer = document.querySelector('.icon-container'); // Get the icon-container

    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        collapseBtn.textContent = 'left_panel_close';
        chatWindow.classList.remove('collapsed');

        // Add 'active' class to icons and icon-container when sidebar is open
        collapseBtn.classList.add('active');
        newChatBtn.classList.add('active');
        attachIcon.classList.add('active');
        tutorModeButton.classList.add('active');
        iconContainer.classList.add('active');
    } else {
        sidebar.classList.add('collapsed');
        collapseBtn.textContent = 'left_panel_open';
        chatWindow.classList.add('collapsed');

        // Remove 'active' class from icons and icon-container when sidebar is closed
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

            const messageContent = loadingMessageElement.querySelector('.message-content');

            // **Removed the code that was removing loading dots here**

            // Stream the raw AI response text
            streamParsedResponse(messageContent, response);

            // Update the chat history sidebar
            loadChatHistory();

        } catch (error) {
            console.error('Error sending message:', error);
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

    // Get the messageBody and ensure there's a messageText element
    const messageBody = messageContent.querySelector('.message-body');
    let messageText = messageBody.querySelector('.message-text');
    if (!messageText) {
        messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageBody.appendChild(messageText);
    }

    const wordInterval = setInterval(() => {
        if (currentWordIndex < words.length) {
            accumulatedText += words[currentWordIndex];
            currentWordIndex++;

            // Update the messageText content
            messageText.innerHTML = marked.parse(accumulatedText);

            chatBox.scrollTop = chatBox.scrollHeight; // Scroll to bottom
        } else {
            clearInterval(wordInterval);

            // **Remove the loading dots here**
            const loadingDots = messageBody.querySelector('.loading-dots');
            if (loadingDots) {
                loadingDots.remove();
            }

            // After streaming is complete, re-render the message to handle code blocks
            reRenderMessageWithCodeBlocks(messageBody, rawResponseText);
        }
    }, 20); // Adjust the interval as needed for speed
}

function reRenderMessageWithCodeBlocks(messageBody, rawResponseText) {
    // Clear the existing content
    messageBody.innerHTML = '';

    let entireMessage = ''; // To store the entire message

    // Use regex to split the content into normal text and code blocks
    const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
    const parts = rawResponseText.split(codeBlockRegex);

    parts.forEach((part, index) => {
        if (index % 3 === 0) {
            // Regular text part
            const messageText = document.createElement('div');
            messageText.classList.add('message-text');

            // Parse the text with Markdown
            const parsedText = marked.parse(part.trim());
            messageText.innerHTML = parsedText;

            // Add 'table' class to any tables
            const tables = messageText.querySelectorAll('table');
            tables.forEach(table => {
                table.classList.add('table');
            });

            messageBody.appendChild(messageText);
            entireMessage += part.trim();
        } else if (index % 3 === 1) {
            // Capture language identifier
            var language = part.trim();
        } else if (index % 3 === 2) {
            // Code block part
            const codeBlock = document.createElement('div');
            codeBlock.classList.add('code-block-container');

            const codeElement = document.createElement('pre');
            const codeContent = document.createElement('code');

            // Set the appropriate language class if language was detected
            if (language) {
                codeContent.classList.add(`language-${language}`);
            }

            codeContent.textContent = part.trim();
            codeElement.appendChild(codeContent);

            // Initialize Highlight.js for the code block
            hljs.highlightElement(codeContent);

            // Create copy button for the code block
            const codeCopyButton = document.createElement('span');
            codeCopyButton.classList.add('material-symbols-rounded', 'code-copy-button');
            codeCopyButton.textContent = "content_copy";

            codeCopyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(part.trim()).then(() => {
                    codeCopyButton.textContent = 'done';
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

    // Add copy button for the entire AI message
    const copyButtonContainer = document.createElement("div");
    copyButtonContainer.classList.add("copy-button-container");

    const copyButton = document.createElement("span");
    copyButton.classList.add("material-symbols-rounded", "copy-button");
    copyButton.textContent = "content_copy";
    copyButtonContainer.appendChild(copyButton);

    messageBody.appendChild(copyButtonContainer);

    // Copy the entire message
    copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(entireMessage).then(() => {
            copyButton.textContent = "done";
            setTimeout(() => {
                copyButton.textContent = "content_copy";
            }, 2000);
        });
    });
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

    const res = await fetch('/chat', {
        method: 'POST',
        body: formData,
    });

    const data = await res.json();

    // You can access total_image_count and total_image_size here
    console.log('Total Images:', data.total_image_count);
    console.log('Total Image Size:', data.total_image_size);

    // Optionally, update the UI with this information
    updateImageStats(data.total_image_count, data.total_image_size);

    return data.response;
}

async function updateChatsVisibility() {
    const querySpec = {
        query: 'SELECT * FROM c WHERE NOT IS_DEFINED(c.visibility)',
    };

    const { resources: chats } = await container.items.query(querySpec).fetchAll();

    for (const chat of chats) {
        chat.visibility = 1;
        await container.items.upsert(chat);
    }
}

// Call the function
updateChatsVisibility().then(() => {
    console.log('Updated visibility for existing chats.');
}).catch(error => {
    console.error('Error updating chats:', error);
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
    const response = await fetch('/session-secret');
    const data = await response.json();
    sessionStorage.setItem('sessionSecret', data.secret);  // Store session secret in sessionStorage
    chatId = sessionStorage.getItem('chatId') || generateChatId();
    sessionStorage.setItem('chatId', chatId);
    loadChatHistory();  // Load chats that belong to the secret
    showWelcomeScreen();
};
