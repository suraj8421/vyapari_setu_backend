// ============================================
// Match Service
// ============================================

import prisma from '../config/database.js';

/**
 * Normalize string for fuzzy matching
 */
function normalize(s = '') {
    if (typeof s !== 'string') s = String(s || '');
    return s.toLowerCase()
        .replace(/(?:pvt\.?\s*ltd\.?|ltd\.?|llc|inc\.?|co\.?|corp\.?)$/g, '') // strip suffixes
        .replace(/[^a-z0-9\s]/g, '')                                          // remove symbols
        .trim();
}

const matchService = {
    /**
     * Match a vendor name/gstin against existing suppliers
     */
    async matchSupplier(name, gstin, storeId) {
        if (!storeId) return { exists: false, supplier: null, confidence: 0 };

        // 1. Try GSTIN match (Highest confidence)
        if (gstin) {
            const supplier = await prisma.supplier.findFirst({
                where: {
                    storeId,
                    gstNumber: { equals: gstin, mode: 'insensitive' },
                    isActive: true
                }
            });
            if (supplier) return { exists: true, supplier, confidence: 1.0 };
        }

        // 2. Try Exact Name match
        const exactName = await prisma.supplier.findFirst({
            where: {
                storeId,
                name: { equals: name, mode: 'insensitive' },
                isActive: true
            }
        });
        if (exactName) return { exists: true, supplier: exactName, confidence: 0.95 };

        // 3. Try Normalized Fuzzy match
        const normalizedInput = normalize(name);
        if (normalizedInput.length < 3) return { exists: false, supplier: null, confidence: 0 };

        const allSuppliers = await prisma.supplier.findMany({
            where: { storeId, isActive: true },
            select: { id: true, name: true, phone: true, address: true, gstNumber: true }
        });

        const fuzzyMatch = allSuppliers.find(s => normalize(s.name).includes(normalizedInput) || normalizedInput.includes(normalize(s.name)));

        if (fuzzyMatch) {
            return { exists: true, supplier: fuzzyMatch, confidence: 0.85 };
        }

        return { exists: false, supplier: null, confidence: 0 };
    },

    /**
     * Match extracted items against existing products
     */
    async matchItems(extractedItems = [], storeId) {
        if (!storeId || !extractedItems.length) return [];

        const results = [];
        
        // Fetch all products for this store once to avoid N+1 queries
        const dbProducts = await prisma.product.findMany({
            where: { storeId, isActive: true },
            select: { id: true, name: true, sku: true, barcode: true, hsnCode: true, costPrice: true, gstRate: true }
        });

        for (const item of extractedItems) {
            const name = item.name || item.description || '';
            const hsn  = item.hsn_code || '';
            const normalizedName = normalize(name);

            // 1. Try HSN match
            let matchedProduct = null;
            if (hsn) {
                matchedProduct = dbProducts.find(p => p.hsnCode === hsn);
            }

            // 2. Try Name match
            if (!matchedProduct && normalizedName) {
                matchedProduct = dbProducts.find(p => {
                    const dbNorm = normalize(p.name);
                    return dbNorm === normalizedName || dbNorm.includes(normalizedName) || normalizedName.includes(dbNorm);
                });
            }

            results.push({
                ...item,
                exists: !!matchedProduct,
                productId: matchedProduct ? matchedProduct.id : null,
                hsn_exists: hsn ? dbProducts.some(p => p.hsnCode === hsn) : true,
                matchedProduct: matchedProduct || null
            });
        }

        return results;
    }
};

export default matchService;
