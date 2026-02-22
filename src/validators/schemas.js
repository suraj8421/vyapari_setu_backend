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
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'STORE_USER']).optional(),
    storeId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Store Schemas ───────────────────────────

export const createStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    phone: z.string().optional(),
    gstNumber: z.string().optional(),
});

export const updateStoreSchema = createStoreSchema.partial();

// ─── Product Schemas ─────────────────────────

export const createProductSchema = z.object({
    name: z.string().min(1, 'Product name is required').max(200),
    description: z.string().optional(),
    sku: z.string().min(1, 'SKU is required'),
    barcode: z.string().optional(),
    category: z.string().optional(),
    unit: z.string().default('pcs'),
    costPrice: z.number().positive('Cost price must be positive'),
    sellingPrice: z.number().positive('Selling price must be positive'),
    gstRate: z.number().min(0).max(100).default(0),
    hsnCode: z.string().optional(),
    storeId: z.string().uuid('Valid store ID required'),
    // Inventory fields
    initialStock: z.number().int().min(0).default(0),
    minStockLevel: z.number().int().min(0).default(10),
    maxStockLevel: z.number().int().min(0).optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().datetime().optional(),
    location: z.string().optional(),
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
    quantity: z.number().int().positive('Quantity must be positive'),
    unitPrice: z.number().positive('Unit price must be positive'),
    discount: z.number().min(0).default(0),
});

export const createSaleSchema = z.object({
    storeId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    items: z.array(saleItemSchema).min(1, 'At least one item is required'),
    discount: z.number().min(0).default(0),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']).default('CASH'),
    paidAmount: z.number().min(0).default(0),
    notes: z.string().optional(),
});

// ─── Purchase Schemas ────────────────────────

const purchaseItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
});

export const createPurchaseSchema = z.object({
    storeId: z.string().uuid(),
    supplierId: z.string().uuid(),
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
