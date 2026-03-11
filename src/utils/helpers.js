// ============================================
// Invoice Number Generator
// ============================================

// FIX: The old generator used Math.random() which could produce the same 5-digit
// number for two simultaneous requests on the same day, causing a unique constraint
// violation on `invoiceNumber`. The new approach uses a per-process atomic counter
// combined with the last 4 digits of Date.now() (milliseconds) to guarantee
// uniqueness within a single Node.js process for all practical loads.
let _invoiceCounter = 0;

/**
 * Generate a unique invoice number.
 * Format: PREFIX-YYYYMMDD-SSSS-CCCC
 *   SSSS = last 4 digits of epoch milliseconds (sub-second uniqueness)
 *   CCCC = per-process sequence counter (prevents same-millisecond collisions)
 */
export function generateInvoiceNumber(prefix = 'INV') {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    // Last 4 digits of ms timestamp for sub-second uniqueness
    const timeSuffix = String(Date.now()).slice(-4);
    // Incrementing counter resets each time the server restarts — sufficient for normal load
    _invoiceCounter = (_invoiceCounter + 1) % 10000;
    const counter = String(_invoiceCounter).padStart(4, '0');
    return `${prefix}-${dateStr}-${timeSuffix}${counter}`;
}

/**
 * Parse pagination params from request query
 */
export function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

/**
 * Parse search and filter params
 */
export function parseFilters(query, allowedFields = []) {
    const filters = {};
    for (const field of allowedFields) {
        if (query[field] !== undefined && query[field] !== '') {
            filters[field] = query[field];
        }
    }
    return filters;
}

/**
 * Parse sort params
 */
export function parseSort(query, defaultField = 'createdAt', defaultOrder = 'desc') {
    const sortBy = query.sortBy || defaultField;
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : defaultOrder;
    return { [sortBy]: sortOrder };
}
