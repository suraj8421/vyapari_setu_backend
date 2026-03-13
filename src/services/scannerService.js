// ============================================
// Scanner Service (Modular OCR/AI parsing)
// ============================================

import prisma from '../config/database.js';

class ScannerService {
    /**
     * Look up product by exact barcode/SKU
     */
    async lookupBarcode(barcode, storeId) {
        const product = await prisma.product.findFirst({
            where: {
                OR: [
                    { barcode: barcode },
                    { sku: barcode }
                ],
                storeId: storeId,
                isActive: true
            },
            include: {
                inventory: true,
                store: { select: { id: true, name: true } }
            }
        });

        if (!product) {
            return null; // Signals frontend to open "Create New" with prefilled barcode
        }

        return product; // Signals frontend to open "Edit/Match" flow
    }

    /**
     * Process product label image to extract details
     * (Currently mocked - easily swapped with Tesseract.js / AWS Textract / Google Cloud Vision)
     */
    async processProductImage(buffer, mimetype, storeId) {
        // MOCK OCR DELAY
        await new Promise(r => setTimeout(r, 1500));

        // Simulated highly-structured extraction from a product label
        const extracted = {
            name: "Sample Product (Extracted)",
            brand: "Sample Brand",
            category: "Groceries",
            barcode: "8901234567890",
            sku: "SCAN-" + Math.floor(Math.random() * 10000),
            unit: "kg",
            weight: 1.5,
            mrp: 150.00,
            sellingPrice: 140.00,
            gstRate: 5,
            description: "Extracted via smart scanner vision AI."
        };

        // Check if a product with this barcode already exists
        const existing = await this.lookupBarcode(extracted.barcode, storeId);

        return {
            type: 'SINGLE_PRODUCT',
            extracted,
            matchFound: !!existing,
            existingProduct: existing,
            confidence: 0.92
        };
    }

    /**
     * Process full page/document (Invoice, Stock Sheet, Catalog)
     * (Currently mocked returning an array of items)
     */
    async processDocument(buffer, mimetype, storeId) {
        // MOCK OCR DELAY
        await new Promise(r => setTimeout(r, 2000));

        // Simulated table extraction from an invoice or stock sheet
        const extractedItems = [
            {
                name: "Premium Tea 500g",
                barcode: "TEA500G",
                category: "Beverages",
                costPrice: 200.00,
                sellingPrice: 220.00,
                quantity: 50,
                unit: "pcs"
            },
            {
                name: "Sugar 1kg Pack",
                barcode: "SUG1KG",
                category: "Groceries",
                costPrice: 40.00,
                sellingPrice: 45.00,
                quantity: 100,
                unit: "kg"
            },
            {
                name: "Biscuits Family Pack",
                barcode: "BISCUIT-FP",
                category: "Snacks",
                costPrice: 80.00,
                sellingPrice: 95.00,
                quantity: 30,
                unit: "pcs"
            }
        ];

        // Try to match each item
        const processedItems = await Promise.all(extractedItems.map(async (item) => {
            const existing = await this.lookupBarcode(item.barcode, storeId);
            return {
                extracted: item,
                matchFound: !!existing,
                existingProduct: existing,
                confidence: 0.85
            };
        }));

        return {
            type: 'MULTI_PRODUCT_DOC',
            metadata: {
                documentType: "Invoice/Stock Sheet",
                date: new Date().toISOString(),
                supplierName: "Vendor Inc"
            },
            items: processedItems
        };
    }
}

export default new ScannerService();
