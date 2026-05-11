import { GoogleGenerativeAI, Schema, Type } from '@google/generative-ai';
import prisma from '../src/config/database.js';

// Normalise a string for fuzzy comparison
function normalise(s = '') {
    if (typeof s !== 'string') s = String(s || '');
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Perform a fast DB-level fuzzy search for a supplier.
 */
function fastSupplierMatch(extractedName, suppliers) {
    if (!extractedName || !suppliers.length) return null;
    
    const needle = normalise(extractedName);
    
    // 1. Exact match
    const exact = suppliers.find(s => normalise(s.name) === needle);
    if (exact) return exact;
    
    // 2. Contains match
    const contains = suppliers.find(s => {
        const hay = normalise(s.name);
        return hay.includes(needle) || needle.includes(hay);
    });
    
    return contains || null;
}

/**
 * Perform a fast DB-level fuzzy search for a product.
 */
function fastProductMatch(extractedName, products) {
    if (!extractedName || !products.length) return null;
    
    const needle = normalise(extractedName);
    
    // 1. Exact match
    const exact = products.find(p => normalise(p.name) === needle);
    if (exact) return exact;
    
    // 2. Contains match
    const contains = products.find(p => {
        const hay = normalise(p.name);
        return hay.includes(needle) || needle.includes(hay);
    });
    
    return contains || null;
}

/**
 * Use Gemini 1.5 Flash to intelligently match a name against a list of records.
 */
async function llmSemanticMatch(extractedName, records, type = 'Supplier') {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('[SemanticMatcher] GEMINI_API_KEY missing. Skipping LLM match.');
        return null;
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        matched_id: {
                            type: Type.STRING,
                            description: `The ID of the matched ${type}. If no reasonable match is found, return an empty string.`
                        },
                        confidence: {
                            type: Type.NUMBER,
                            description: "Confidence score between 0 and 1"
                        }
                    },
                    required: ["matched_id", "confidence"]
                }
            }
        });

        const recordsList = records.map(r => `ID: ${r.id} | Name: ${r.name}`).join('\n');
        
        const prompt = `
You are an expert semantic matching agent for an ERP system.
Your goal is to match an extracted ${type} name from an OCR document to an existing database record.
Take into account typical OCR errors, abbreviations, and missing legal entity suffixes (like Pvt Ltd).

Extracted Name: "${extractedName}"

Available Database Records:
${recordsList}

Find the best match. If none of the records are a plausible match (e.g. completely different companies), return an empty string for matched_id.
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonResponse = JSON.parse(responseText);

        if (jsonResponse.matched_id && jsonResponse.confidence >= 0.7) {
            console.log(`[SemanticMatcher] LLM successfully matched "${extractedName}" to ID ${jsonResponse.matched_id} (Confidence: ${jsonResponse.confidence})`);
            return records.find(r => r.id === jsonResponse.matched_id) || null;
        }

        return null;
    } catch (error) {
        console.error('[SemanticMatcher] LLM Match Error:', error.message);
        return null;
    }
}

/**
 * Main matching function to enrich the AI result with database IDs.
 */
export async function matchDatabaseRecords(aiResult, storeId) {
    console.log(`[SemanticMatcher] Beginning semantic matching for Store ${storeId}...`);
    
    if (!storeId) {
        return aiResult; // Cannot match without store context
    }

    // 1. Fetch Store Data
    const [suppliers, products] = await Promise.all([
        prisma.supplier.findMany({ where: { storeId, isActive: true }, select: { id: true, name: true } }),
        prisma.product.findMany({ where: { storeId, isActive: true }, select: { id: true, name: true } })
    ]);

    // 2. Match Supplier
    let matchedSupplier = null;
    if (aiResult.vendor && aiResult.vendor !== 'Unknown') {
        matchedSupplier = fastSupplierMatch(aiResult.vendor, suppliers);
        if (!matchedSupplier) {
            console.log(`[SemanticMatcher] Fast match failed for supplier "${aiResult.vendor}". Attempting LLM match...`);
            matchedSupplier = await llmSemanticMatch(aiResult.vendor, suppliers, 'Supplier');
        }
    }

    if (matchedSupplier) {
        aiResult.supplier_exists = true;
        aiResult.matched_supplier_id = matchedSupplier.id;
        aiResult.matched_supplier = { id: matchedSupplier.id, name: matchedSupplier.name };
    } else {
        aiResult.supplier_exists = false;
        aiResult.matched_supplier_id = null;
        aiResult.matched_supplier = null;
    }

    // 3. Match Products
    if (aiResult.items && Array.isArray(aiResult.items)) {
        for (let item of aiResult.items) {
            const itemName = item.name || item.description || '';
            let matchedProduct = fastProductMatch(itemName, products);
            
            // Note: We skip LLM match per-product to avoid hitting rate limits or high latency.
            // If absolute accuracy is needed per line item, we could batch the prompt.
            
            if (matchedProduct) {
                item.productId = matchedProduct.id;
                item.exists = true;
            } else {
                item.productId = '';
                item.exists = false;
            }
        }
    }

    console.log(`[SemanticMatcher] Matching complete. Found Supplier: ${!!matchedSupplier}`);
    return aiResult;
}
