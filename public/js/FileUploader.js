import { isSupportedImageType, getFileExtension } from './utilities.js';

export class FileUploader {
    constructor(chatUI, displayPopupCallback) {
        this.chatUI = chatUI;
        this.displayPopup = displayPopupCallback;
        this.fileUpload = document.getElementById('file-upload');
        this.attachIcon = document.getElementById('attach-icon');
        this.inputContainer = document.querySelector('.input-container');

        this.selectedImageFiles = [];
        this.fileUploadInProgress = false;

        this.initEventListeners();
    }

    initEventListeners() {
        this.fileUpload.addEventListener('change', () => this.handleFileChange());
        this.inputContainer.addEventListener('dragenter', (e) => this.handleDragEnter(e), false);
        this.inputContainer.addEventListener('dragover', (e) => this.handleDragOver(e), false);
        this.inputContainer.addEventListener('dragleave', (e) => this.handleDragLeave(e), false);
        this.inputContainer.addEventListener('drop', (e) => this.handleDrop(e), false);
    }

    async handleFileChange() {
        if (this.fileUploadInProgress) return;
        this.fileUploadInProgress = true;

        const files = this.fileUpload.files;
        if (files.length > 0) {
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    if (!isSupportedImageType(file)) {
                        const fileExtension = getFileExtension(file.name);
                        this.displayPopup(`Image type .${fileExtension} not supported`);
                        continue;
                    }
                    this.selectedImageFiles.push(file);
                    const imageUrl = URL.createObjectURL(file);
                    this.chatUI.appendFileLink(file.name, imageUrl);
                    this._showDoneIcon();
                    this.fileUpload.value = '';
                } else {
                    await this.uploadDocument(file);
                }
            }
        }
        this.fileUploadInProgress = false;
    }

    _showDoneIcon() {
        this.attachIcon.textContent = "done";
        setTimeout(() => {
            this.attachIcon.textContent = "attach_file";
        }, 2000);
    }

    async uploadDocument(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chatId', sessionStorage.getItem('chatId'));

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            if (response.ok) {
                this._showDoneIcon();
                //this.chatUI.appendMessage('System', `File "${file.name}" uploaded successfully.`);
                const responseData = await response.json();
                const fileUrl = responseData.url || '#'; 
                this.chatUI.appendFileLink(file.name, fileUrl);
            } else {
                const errorData = await response.json();
                console.error('Upload error:', errorData.error);
                this.chatUI.appendMessage('System', `Error uploading file: ${errorData.error}`);

                if (errorData.error.includes('Unsupported file type')) {
                    const fileExtension = getFileExtension(file.name);
                    this.displayPopup(`Document type .${fileExtension} not supported`);
                } else {
                    this.displayPopup(`Error uploading file: ${errorData.error}`);
                }
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.chatUI.appendMessage('System', 'An error occurred while uploading the file.');
        } finally {
            setTimeout(() => { this.fileUpload.value = ''; }, 100);
        }
    }

    handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.inputContainer.classList.add('dragover');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.inputContainer.classList.remove('dragover');
    }

    async handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.inputContainer.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0 && !this.fileUploadInProgress) {
            this.fileUploadInProgress = true;
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    if (!isSupportedImageType(file)) {
                        const fileExtension = getFileExtension(file.name);
                        this.displayPopup(`Image type .${fileExtension} not supported`);
                        continue;
                    }
                    this.selectedImageFiles.push(file);
                    const imageUrl = URL.createObjectURL(file);
                    this.chatUI.appendFileLink(file.name, imageUrl);
                    this._showDoneIcon();
                } else {
                    await this.uploadDocument(file);
                }
            }
            this.fileUploadInProgress = false;  
        }
    }
}

