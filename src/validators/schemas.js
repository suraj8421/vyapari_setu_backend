// ============================================
// Zod Validation Schemas
// ============================================

import { z } from 'zod';

// ─── Auth Schemas ────────────────────────────

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    firstName: z.string().min(1, 'First name is required').max(50),
    lastName: z.string().min(1, 'Last name is required').max(50),
    phone: z.string().min(10, 'Valid phone number is required'),
    role: z.enum(['ADMIN', 'STORE_USER']).optional(),
    storeId: z.string().uuid().optional(),
    storeName: z.string().min(1, 'Store name is required').optional(), // Optional to support staff registration too
    planId: z.string().uuid().optional(),
    employeeCode: z.string().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

// ─── Store Schemas ───────────────────────────

export const createStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    gstNumber: z.string().optional(),
    bankName: z.string().optional(),
    accountHolderName: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    branchName: z.string().optional(),
    upiId: z.string().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

// ─── Product Schemas ─────────────────────────

export const createProductSchema = z.object({
    name: z.string().min(1, 'Product name is required').max(200),
    description: z.string().optional().or(z.literal('')).or(z.null()),
    sku: z.string().max(100).optional().or(z.literal('')).or(z.null()),
    barcode: z.string().optional().or(z.literal('')).or(z.null()),
    category: z.string().optional().or(z.literal('')).or(z.null()),
    unit: z.enum(['PCS', 'BOX', 'KG', 'LTR', 'BAG', 'SET', 'PACK', 'DOZEN', 'TONS', 'CUSTOM']).default('PCS').optional().or(z.literal('')).or(z.null()),
    unitsPerBox: z.number().int().positive().optional().or(z.literal('')).or(z.null()),
    allowLooseSale: z.boolean().default(true).optional().or(z.null()),
    costPrice: z.number().min(0, 'Cost price must be zero or positive').optional().or(z.literal('')).or(z.null()),
    sellingPrice: z.number().min(0, 'Selling price must be zero or positive').optional().or(z.literal('')).or(z.null()),
    gstRate: z.number().min(0).max(100).default(0).optional().or(z.literal('')).or(z.null()),
    hsnCode: z.string().optional().or(z.literal('')).or(z.null()),
    storeId: z.string().uuid('Valid store ID required'),
    // Inventory fields
    initialStock: z.number().int().min(0).default(0).optional().or(z.literal('')).or(z.null()),
    minStockLevel: z.number().int().min(0).default(10).optional().or(z.literal('')).or(z.null()),
    maxStockLevel: z.number().int().min(0).optional().or(z.literal('')).or(z.null()),
    batchNumber: z.string().optional().or(z.literal('')).or(z.null()),
    expiryDate: z.string().datetime().optional().or(z.literal('')).or(z.null()),
    location: z.string().optional().or(z.literal('')).or(z.null()),
});

export const updateProductSchema = createProductSchema.partial().omit({ storeId: true });

// ─── Customer Schemas ────────────────────────

export const createCustomerSchema = z.object({
    name: z.string().min(1, 'Customer name is required').max(100),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    gstNumber: z.string().optional(),
    creditLimit: z.number().min(0).default(0),
    storeId: z.string().uuid('Valid store ID required'),
});

export const updateCustomerSchema = createCustomerSchema.partial().omit({ storeId: true });

// ─── Supplier Schemas ────────────────────────

export const createSupplierSchema = z.object({
    name: z.string().min(1, 'Supplier name is required').max(100),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    gstNumber: z.string().optional(),
    storeId: z.string().uuid('Valid store ID required'),
});

export const updateSupplierSchema = createSupplierSchema.partial().omit({ storeId: true });

// ─── Sale Schemas ────────────────────────────

const saleItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive('Quantity must be positive').optional(), // Optional if boxes is used
    unitPrice: z.number().min(0, 'Unit price must be zero or positive').default(0).optional().or(z.null()).or(z.literal('')),
    discount: z.number().min(0).default(0),
    unit: z.enum(['PCS', 'BOX', 'KG', 'LTR', 'BAG', 'SET', 'PACK', 'DOZEN', 'TONS', 'CUSTOM']).optional(),
    boxes: z.number().int().positive().optional(),
    gstRate: z.number().min(0).max(100).optional(),
    discountAmount: z.number().min(0).optional(),
    // Optional: allow manual batch/inventory selection from frontend
    sourceInventoryId: z.string().uuid().optional(),
});

export const createSaleSchema = z.object({
    storeId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    invoiceType: z.enum(['GST', 'NON_GST']).default('GST'),
    items: z.array(saleItemSchema).min(1, 'At least one item is required'),
    discount: z.number().min(0).default(0),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']).default('CASH'),
    payments: z.array(z.object({
        method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
        amount: z.number().positive()
    })).optional(),
    paidAmount: z.number().min(0).default(0),
    notes: z.string().optional(),
});

// ─── Purchase Schemas ────────────────────────

const purchaseItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().min(0, 'Unit price must be zero or positive').default(0).optional().or(z.null()).or(z.literal('')),
    // FIX: gstRate was also missing from the purchase item schema
    gstRate: z.number().min(0).max(100).default(0),
});

export const createPurchaseSchema = z.object({
    storeId: z.string().uuid(),
    supplierId: z.string().uuid().optional().or(z.literal('')).or(z.null()),
    invoiceNumber: z.string().optional(),
    items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
    notes: z.string().optional(),
    paidAmount: z.number().min(0).default(0),
});

// ─── Ledger Schemas ──────────────────────────

export const createLedgerEntrySchema = z.object({
    customerId: z.string().uuid(),
    type: z.enum(['CREDIT', 'DEBIT']),
    amount: z.number().positive('Amount must be positive'),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']).default('CASH'),
    description: z.string().optional(),
    reference: z.string().optional(),
});

// ─── User Management Schemas ─────────────────

export const updateUserSchema = z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'STORE_USER']).optional(),
    storeId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().optional(),
});

// ─── Customer Portal Schemas ─────────────────

export const customerPortalRegisterSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().min(10, 'Phone number is required'),
});

export const customerPortalLoginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});
