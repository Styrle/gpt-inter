const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const tesseract = require('tesseract.js');
const textract = require('textract');
const { htmlToText } = require('html-to-text');
const mime = require('mime-types');
const removeMarkdown = require('remove-markdown');
const path = require('path');

async function extractTextFromFile(file) {
    if (file.mimetype.startsWith('image/')) {
        const { data: { text } } = await tesseract.recognize(file.buffer);
        return text;
    } else {
        const extension = path.extname(file.originalname).toLowerCase();
        const mimetype = mime.lookup(extension) || file.mimetype;
        switch (true) {
            case mimetype === 'application/pdf' || extension === '.pdf':
                const pdfData = await pdfParse(file.buffer);
                return pdfData.text;
            case mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === '.docx':
                const { value } = await mammoth.extractRawText({ buffer: file.buffer });
                return value;
            case mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || extension === '.xlsx':
                const workbook = xlsx.read(file.buffer, { type: 'buffer' });
                let text = '';
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    text += xlsx.utils.sheet_to_csv(sheet) + '\n';
                });
                return text;
            case mimetype === 'text/plain' || extension === '.txt':
                return file.buffer.toString('utf-8');
            case mimetype === 'text/markdown' || extension === '.md':
                return removeMarkdown(file.buffer.toString('utf-8'));
            case mimetype === 'text/html' || extension === '.html' || extension === '.htm':
                return htmlToText(file.buffer.toString('utf-8'), { wordwrap: 130 });
            case mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || extension === '.pptx':
                return new Promise((resolve, reject) => {
                    textract.fromBufferWithMime(file.mimetype, file.buffer, (err, text) => {
                        if (err) reject(err);
                        else resolve(text);
                    });
                });
            default:
                throw new Error('Unsupported file type.');
        }
    }
}

module.exports = {
    extractTextFromFile
};