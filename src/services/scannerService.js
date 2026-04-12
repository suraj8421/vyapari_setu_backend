// ============================================
// Scanner Service (Speed & Precision V3)
// ============================================

import prisma from '../config/database.js';
import config from '../config/index.js';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

class ScannerService {
    /**
     * Efficient Image Pre-processing
     */
    async cleanImage(buffer) {
        console.log('[ScannerService] Resizing and Optimizing image for speed...');
        try {
            return await sharp(buffer)
                .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }) // Fast & Readable
                .grayscale()         // Clearer for AI
                .normalize()         // Balanced lighting
                .toFormat('jpeg', { quality: 85 }) // Compressed for fast upload
                .toBuffer();
        } catch (err) {
            console.warn('[ScannerService] Optimization failed.');
            return buffer;
        }
    }

    /**
     * VIP AI Caller (Optimized Timeout)
     */
    async callAI(buffer, mimetype, prompt) {
        const apiKey = config.geminiKey;
        if (!apiKey) throw new Error('GEMINI_API_KEY missing');

        // We use the absolute fastest stable model
        const candidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-2.0-flash"];
        
        for (const model of candidates) {
            try {
                console.log(`[ScannerService] Fast-call with ${model}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                
                const response = await axios.post(url, {
                    contents: [{
                        parts: [
                            { text: prompt + " Output JSON only. Use your vision for precise extraction." },
                            { inline_data: { mime_type: "image/jpeg", data: buffer.toString('base64') } }
                        ]
                    }],
                    generationConfig: { response_mime_type: "application/json", temperature: 0 }
                }, { timeout: 20000 }); // Strict 20s timeout for speed

                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return JSON.parse(text.replace(/```json|```/gi, '').trim());
            } catch (err) {
                const msg = err.response?.data?.error?.message || err.message;
                console.warn(`[ScannerService] ${model} failed/timed out:`, msg);
                continue;
            }
        }
        return null;
    }

    async processDocument(buffer, mimetype, storeId, contextType = 'purchase') {
        // High-precision brief prompt for speed
        const prompt = `Invoice Parse: Metadata:{supplierName, totalAmount}, Items:[{name, quantity, unitPrice, gstRate}].`;

        // 1. Optimize Image
        const optimizedBuffer = mimetype.startsWith('image/') 
            ? await this.cleanImage(buffer) 
            : buffer;

        // 2. Fast AI Analysis
        let aiResult = await this.callAI(optimizedBuffer, mimetype, prompt);

        // 3. Last Resort: Smart Tesseract
        if (!aiResult && mimetype.startsWith('image/')) {
            console.log('[ScannerService] AI unavailable. Using Smart Local OCR...');
            const { data: { text } } = await Tesseract.recognize(optimizedBuffer, 'eng');
            if (text.trim().length > 10) {
                aiResult = { 
                    metadata: { supplierName: "Manual Search Required" }, 
                    items: [{ name: "Review: " + text.substring(0, 40).replace(/[^a-zA-Z0-9 ]/g, ""), quantity: 1, unitPrice: 0 }] 
                };
            }
        }

        if (!aiResult) throw new Error('System is busy. Please try again in 1 minute.');

        // Database Matching
        const items = await Promise.all((aiResult.items || []).map(async (item) => {
            const existing = await prisma.product.findFirst({
                where: { name: { equals: item.name, mode: 'insensitive' }, storeId: storeId, isActive: true }
            });
            return { extracted: item, matchFound: !!existing, existingProduct: existing };
        }));

        return { type: 'MULTI_PRODUCT_DOC', metadata: aiResult.metadata, items };
    }
}

export default new ScannerService();
