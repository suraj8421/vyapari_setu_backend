// ============================================
// Product Service
// ============================================

import prisma from '../config/database.js';
import { parsePagination, parseSort } from '../utils/helpers.js';
import { AppError } from '../utils/AppError.js';

class ProductService {
    /**
     * Create product with initial inventory
     */
    async create(data) {
        const {
            initialStock: rawInitialStock,
            minStockLevel: rawMinStockLevel,
            maxStockLevel: rawMaxStockLevel,
            batchNumber,
            expiryDate,
            location,
            ...productData
        } = data;

        const initialStock = (rawInitialStock === '' || rawInitialStock === null || rawInitialStock === undefined) ? 0 : Number(rawInitialStock);
        const minStockLevel = (rawMinStockLevel === '' || rawMinStockLevel === null || rawMinStockLevel === undefined) ? 10 : Number(rawMinStockLevel);
        const maxStockLevel = (rawMaxStockLevel === '' || rawMaxStockLevel === null || rawMaxStockLevel === undefined) ? null : Number(rawMaxStockLevel);

        // Generate a unique SKU if missing or empty
        if (!productData.sku || productData.sku.trim() === '') {
            const cleanName = (productData.name || 'PROD')
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 10)
                .toUpperCase();
            const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            productData.sku = `${cleanName}-${randSuffix}`;
        }

        // Handle optional costPrice and sellingPrice
        if (productData.costPrice === undefined || productData.costPrice === null || productData.costPrice === '') {
            productData.costPrice = 0;
        } else {
            productData.costPrice = Number(productData.costPrice);
        }

        if (productData.sellingPrice === undefined || productData.sellingPrice === null || productData.sellingPrice === '') {
            productData.sellingPrice = 0;
        } else {
            productData.sellingPrice = Number(productData.sellingPrice);
        }

        if (productData.unitsPerBox === '' || productData.unitsPerBox === null) {
            productData.unitsPerBox = null;
        } else if (productData.unitsPerBox !== undefined) {
            productData.unitsPerBox = Number(productData.unitsPerBox);
        }

        if (productData.gstRate === undefined || productData.gstRate === null || productData.gstRate === '') {
            productData.gstRate = 0;
        } else {
            productData.gstRate = Number(productData.gstRate);
        }

        if (productData.unit === undefined || productData.unit === null || productData.unit === '') {
            productData.unit = 'PCS';
        }

        // Normalize empty strings to null for unique/optional fields
        if (productData.barcode === '') productData.barcode = null;
        if (productData.category === '') productData.category = null;
        if (productData.hsnCode === '') productData.hsnCode = null;

        return prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: productData,
            });

            // Create initial inventory record
            if (initialStock > 0 || minStockLevel) {
                await tx.inventory.create({
                    data: {
                        productId: product.id,
                        storeId: productData.storeId,
                        quantity: initialStock || 0,
                        minStockLevel: minStockLevel || 10,
                        maxStockLevel: maxStockLevel || null,
                        batchNumber: batchNumber || null,
                        expiryDate: expiryDate ? new Date(expiryDate) : null,
                        location: location || null,
                    },
                });
            }

            return product;
        });
    }

    /**
     * Get all products with filters, search, pagination
     */
    async getAll(query = {}, storeId = null) {
        const { skip, limit, page } = parsePagination(query);
        const orderBy = parseSort(query, 'name', 'asc');

        const where = {};
        if (storeId) {
            where.storeId = storeId;
        } else if (query.storeId) {
            where.storeId = query.storeId;
        }
        if (query.category) where.category = query.category;
        if (query.isActive !== undefined) {
            where.isActive = query.isActive === 'true';
        } else {
            where.isActive = true;
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
                { barcode: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    inventory: {
                        select: {
                            id: true,
                            quantity: true,
                            minStockLevel: true,
                            maxStockLevel: true,
                            batchNumber: true,
                            expiryDate: true,
                            location: true,
                        },
                    },
                    store: {
                        select: { id: true, name: true },
                    },
                },
            }),
            prisma.product.count({ where }),
        ]);

        return { products, pagination: { page, limit, total } };
    }

    /**
     * Get product by ID
     */
    async getById(id) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                inventory: true,
                store: { select: { id: true, name: true } },
            },
        });

        if (!product) {
            throw new AppError('Product not found', 404);
        }

        return product;
    }

    /**
     * Update product
     */
    async update(id, data) {
        const { initialStock, minStockLevel, maxStockLevel, batchNumber, expiryDate, location, ...productData } = data;

        // Handle optional SKU on update (do not update if empty/missing)
        if (productData.sku === '' || productData.sku === undefined || productData.sku === null) {
            delete productData.sku;
        }

        // Handle optional prices on update (keep current values if omitted or empty string)
        if (productData.costPrice === '' || productData.costPrice === undefined || productData.costPrice === null) {
            delete productData.costPrice;
        } else {
            productData.costPrice = Number(productData.costPrice);
        }

        if (productData.sellingPrice === '' || productData.sellingPrice === undefined || productData.sellingPrice === null) {
            delete productData.sellingPrice;
        } else {
            productData.sellingPrice = Number(productData.sellingPrice);
        }

        if (productData.unitsPerBox === '' || productData.unitsPerBox === null) {
            productData.unitsPerBox = null;
        } else if (productData.unitsPerBox !== undefined) {
            productData.unitsPerBox = Number(productData.unitsPerBox);
        }

        if (productData.unit === '' || productData.unit === undefined || productData.unit === null) {
            delete productData.unit;
        }

        if (productData.gstRate === '' || productData.gstRate === undefined || productData.gstRate === null) {
            delete productData.gstRate;
        } else {
            productData.gstRate = Number(productData.gstRate);
        }

        // Normalize empty strings to null for unique/optional fields
        if (productData.barcode === '') productData.barcode = null;
        if (productData.category === '') productData.category = null;
        if (productData.hsnCode === '') productData.hsnCode = null;

        return prisma.$transaction(async (tx) => {
            const product = await tx.product.update({
                where: { id },
                data: productData,
                include: {
                    inventory: true,
                },
            });

            // Update quantity (initialStock) if provided
            if (initialStock !== undefined && initialStock !== null && initialStock !== '') {
                const existingInventory = await tx.inventory.findFirst({
                    where: { productId: id }
                });

                if (existingInventory) {
                    await tx.inventory.update({
                        where: { id: existingInventory.id },
                        data: { quantity: Number(initialStock) }
                    });
                } else {
                    await tx.inventory.create({
                        data: {
                            productId: id,
                            storeId: product.storeId,
                            quantity: Number(initialStock),
                            minStockLevel: (minStockLevel !== undefined && minStockLevel !== null && minStockLevel !== '') ? Number(minStockLevel) : 10
                        }
                    });
                }
            }

            // Update minStockLevel if provided
            if (minStockLevel !== undefined && minStockLevel !== null && minStockLevel !== '') {
                await tx.inventory.updateMany({
                    where: { productId: id },
                    data: { minStockLevel: Number(minStockLevel) },
                });
            }

            return product;
        });
    }

    /**
     * Soft delete product
     */
    async delete(id) {
        return prisma.product.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Get all unique categories
     */
    async getCategories(storeId = null) {
        const where = { isActive: true };
        if (storeId) where.storeId = storeId;

        const categories = await prisma.product.findMany({
            where,
            select: { category: true },
            distinct: ['category'],
            orderBy: { category: 'asc' },
        });

        return categories
            .map((p) => p.category)
            .filter(Boolean);
    }

    /**
     * Get low stock products with reorder suggestions
     */
    async getLowStock(storeId = null) {
        const query = storeId
            ? prisma.$queryRaw`
                SELECT i.*, 
                       p.id as "p_id", p.name as "p_name", p.sku as "p_sku", p.category as "p_category", p.unit as "p_unit",
                       s.id as "s_id", s.name as "s_name"
                FROM inventory i
                JOIN products p ON i.product_id = p.id
                JOIN stores s ON i.store_id = s.id
                WHERE i.store_id = ${storeId}
                  AND p.is_active = true
                  AND i.quantity <= i.min_stock_level
                ORDER BY i.quantity ASC`
            : prisma.$queryRaw`
                SELECT i.*, 
                       p.id as "p_id", p.name as "p_name", p.sku as "p_sku", p.category as "p_category", p.unit as "p_unit",
                       s.id as "s_id", s.name as "s_name"
                FROM inventory i
                JOIN products p ON i.product_id = p.id
                JOIN stores s ON i.store_id = s.id
                WHERE p.is_active = true
                  AND i.quantity <= i.min_stock_level
                ORDER BY i.quantity ASC`;

        const lowStockItems = await query;

        return lowStockItems.map((item) => {
            const quantity = Number(item.quantity);
            const minStockLevel = Number(item.min_stock_level);
            const maxStockLevel = item.max_stock_level ? Number(item.max_stock_level) : null;

            // Calculation logic for "Order X more":
            let suggestion = 0;
            if (maxStockLevel && maxStockLevel > quantity) {
                suggestion = maxStockLevel - quantity;
            } else {
                const target = Math.max(minStockLevel * 2, 20);
                suggestion = Math.max(0, target - quantity);
            }

            return {
                id: item.id,
                quantity: quantity,
                minStockLevel: minStockLevel,
                maxStockLevel: maxStockLevel,
                batchNumber: item.batch_number,
                expiryDate: item.expiry_date,
                location: item.location,
                productId: item.product_id,
                storeId: item.store_id,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                product: {
                    id: item.p_id,
                    name: item.p_name,
                    sku: item.p_sku,
                    category: item.p_category,
                    unit: item.p_unit
                },
                store: {
                    id: item.s_id,
                    name: item.s_name
                },
                reorderSuggestion: suggestion,
            };
        });
    }

    /**
     * Get chronological inventory movement history for a product
     */
    async getMovementHistory(id) {
        const [sales, purchases] = await Promise.all([
            prisma.saleItem.findMany({
                where: { productId: id },
                include: {
                    sale: {
                        select: { invoiceNumber: true, createdAt: true, status: true, customer: { select: { name: true } } }
                    }
                }
            }),
            prisma.purchaseItem.findMany({
                where: { productId: id },
                include: {
                    purchase: {
                        select: { invoiceNumber: true, createdAt: true, status: true, supplier: { select: { name: true } } }
                    }
                }
            })
        ]);

        const history = [];

        sales.forEach(s => {
            if (s.sale && s.sale.status !== 'CANCELLED') {
                const isReturn = s.sale.status === 'RETURNED' || s.sale.status === 'PARTIAL_RETURN';
                history.push({
                    id: `sale-${s.id}`,
                    date: s.sale.createdAt,
                    type: isReturn ? 'STOCK_RESTORE' : 'STOCK_OUT',
                    quantity: isReturn ? s.quantity : -s.quantity,
                    reference: s.sale.invoiceNumber || 'Sale',
                    party: s.sale.customer?.name || 'Walk-in Customer',
                    rawStatus: s.sale.status
                });
            }
        });

        purchases.forEach(p => {
            if (p.purchase && p.purchase.status !== 'CANCELLED') {
                history.push({
                    id: `purch-${p.id}`,
                    date: p.purchase.createdAt,
                    type: 'STOCK_IN',
                    quantity: p.quantity,
                    reference: p.purchase.invoiceNumber || 'Purchase',
                    party: p.purchase.supplier?.name || 'Supplier',
                    rawStatus: p.purchase.status
                });
            }
        });

        // Sort completely descending by date
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        return history;
    }

    /**
     * Manual Stock Adjustment (Quick Restock)
     */
    async adjustStock(id, data) {
        const { quantity, type, reference, storeId } = data; // type: 'ADD' | 'SUBTRACT'
        const adjustment = type === 'SUBTRACT' ? -Math.abs(quantity) : Math.abs(quantity);

        return prisma.$transaction(async (tx) => {
            const existingInventory = await tx.inventory.findFirst({
                where: { productId: id, storeId }
            });

            if (!existingInventory) {
                return tx.inventory.create({
                    data: {
                        productId: id,
                        storeId,
                        quantity: adjustment,
                        minStockLevel: 10
                    }
                });
            }

            return tx.inventory.update({
                where: { id: existingInventory.id },
                data: { quantity: { increment: adjustment } }
            });
        });
    }
}

export default new ProductService();
