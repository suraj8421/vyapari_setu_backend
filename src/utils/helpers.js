// ============================================
// Invoice Number Generator
// ============================================

/**
 * Generate unique invoice number
 * Format: INV-YYYYMMDD-XXXXX
 */
export function generateInvoiceNumber(prefix = 'INV') {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(10000 + Math.random() * 90000);
    return `${prefix}-${dateStr}-${random}`;
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
