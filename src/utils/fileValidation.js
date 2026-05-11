import { AppError } from './AppError.js';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);

export function validateUploadedDocument(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
    if (!file) throw new AppError('Document file required', 400);
    if (!ALLOWED_MIME.has(file.mimetype)) {
        throw new AppError(`Unsupported file type: ${file.mimetype}`, 415);
    }
    if (typeof file.size === 'number' && file.size > maxBytes) {
        throw new AppError(`File too large. Max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB`, 413);
    }
}

