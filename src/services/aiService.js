import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs/promises';
import matchService from './matchService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/ocr';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;

const aiService = {
    /**
     * Call the external AI service with files (PaddleOCR Fallback)
     */
    async callAIService(files) {
        const form = new FormData();
        for (const f of files) {
            const content = f.buffer || await fs.readFile(f.filepath);
            form.append('files', content, { filename: f.originalname, contentType: f.mimetype });
        }

        const AI_MULTI_URL = AI_SERVICE_URL.replace('/ocr', '/ocr/multi');
        console.log(`[AIService] 📤 Calling Local AI service: ${AI_MULTI_URL}`);
        
        const response = await axios.post(AI_MULTI_URL, form, {
            headers: form.getHeaders(),
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        return response.data;
    },

    /**
     * Direct Gemini Extraction (Ultra Fast Path)
     */
    async extractWithGemini(files) {
        if (!model) throw new Error('Gemini API key missing');
        
        console.log(`[AIService] ✨ Using Gemini Direct Extraction for ${files.length} file(s)`);
        
        const fileParts = await Promise.all(files.map(async f => {
            const buffer = f.buffer || await fs.readFile(f.filepath);
            return {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: f.mimetype
                }
            };
        }));

        const prompt = `
            Extract structured data from this invoice. Return ONLY JSON.
            Fields:
            - vendor: Company name
            - invoice_no: Invoice number
            - date: DD-MM-YYYY
            - gstin: Supplier GSTIN
            - total: Total amount (number)
            - items: Array of { name: string, hsn_code: string, qty: number, rate: number, amount: number, gst_rate: number }
            
            Return JSON only, no markdown.
        `;

        const result = await model.generateContent([prompt, ...fileParts]);
        const response = await result.response;
        const text = response.text();
        
        // Clean markdown backticks if present
        const jsonStr = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr);
    },

    /**
     * Full processing pipeline: OCR + Matching/Enrichment
     */
    async process(files, storeId) {
        let rawData = null;

        // Try Gemini first (Fast Path)
        if (model && files.length <= 3) {
            try {
                rawData = await this.extractWithGemini(files);
            } catch (err) {
                console.warn('[AIService] ⚠️ Gemini extraction failed, falling back to local OCR:', err.message);
            }
        }

        // Fallback to local Python/PaddleOCR service
        if (!rawData) {
            rawData = await this.callAIService(files);
        }
        
        if (!rawData) return null;

        console.log(`[AIService] ✅ Extraction complete. Enriching results for store ${storeId}...`);

        // 2. Enrich results with local database matching
        try {
            if (storeId) {
                // Match Supplier
                const supplierMatch = await matchService.matchSupplier(rawData.vendor, rawData.gstin, storeId);
                rawData.supplier_exists = supplierMatch.exists;
                rawData.matched_supplier_id = supplierMatch.supplier?.id || null;
                rawData.matched_supplier = supplierMatch.supplier;

                // Match Items
                if (rawData.items && Array.isArray(rawData.items)) {
                    rawData.items = await matchService.matchItems(rawData.items, storeId);
                }
            }
        } catch (err) {
            console.error('[AIService] ⚠️ Enrichment failed:', err.message);
        }

        return rawData;
    }
};

export default aiService;

