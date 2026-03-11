// ============================================
// AppError - Custom Error Class
// ============================================
// FIX: Previously, all service errors were thrown as plain objects like:
//   throw { statusCode: 404, message: 'Not found' }
// This caused stack traces to be lost, making debugging impossible.
// Now all service errors extend the native Error class so stack traces
// are preserved and the error handler can identify them properly.

export class AppError extends Error {
    constructor(message, statusCode = 500) {
        // Call the native Error constructor so stack trace is captured
        super(message);

        // Set the name to 'AppError' so we can identify it in the error handler
        this.name = 'AppError';

        // HTTP status code to be sent to the client
        this.statusCode = statusCode;

        // Mark this as an operational error (expected, not a programming bug)
        this.isOperational = true;

        // Capture the proper stack trace (V8 engine only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

// ── Shorthand factory functions ──────────────────────────────

/** 400 Bad Request */
export const badRequest = (msg) => new AppError(msg, 400);

/** 401 Unauthorized */
export const unauthorized = (msg) => new AppError(msg, 401);

/** 403 Forbidden */
export const forbidden = (msg) => new AppError(msg, 403);

/** 404 Not Found */
export const notFound = (msg) => new AppError(msg, 404);

/** 409 Conflict */
export const conflict = (msg) => new AppError(msg, 409);

export default AppError;
