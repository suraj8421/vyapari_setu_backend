// ============================================
// API Response Helper
// ============================================

/**
 * Standard success response
 */
export function success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
}

/**
 * Standard error response
 */
export function error(res, message = 'Internal Server Error', statusCode = 500, errors = null) {
    const response = {
        success: false,
        message,
    };
    if (errors) {
        response.errors = errors;
    }
    return res.status(statusCode).json(response);
}

/**
 * Paginated response
 */
export function paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
        success: true,
        message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: Math.ceil(pagination.total / pagination.limit),
        },
    });
}
