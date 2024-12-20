export function sanitizeText(text) {
    return text.replace(/[^a-zA-Z0-9\s]/g, '');
}

export function getFileExtension(fileName) {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop() : 'unknown';
}

export function isSupportedImageType(file) {
    const allowedImageTypes = [
        'image/jpeg', 'image/png', 'image/gif', 
        'image/bmp', 'image/svg+xml', 'image/tiff', 'image/heic'
    ];
    return allowedImageTypes.includes(file.type.toLowerCase());
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
