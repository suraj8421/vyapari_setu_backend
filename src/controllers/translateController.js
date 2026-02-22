
// ============================================
// Translate Controller
// ============================================

import { translate } from 'google-translate-api-x';

const translateText = async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        if (!text || !targetLang) {
            return res.status(400).json({ status: 'error', message: 'Text and targetLang are required' });
        }

        // Check if multiple strings (array)
        if (Array.isArray(text)) {
            // Translate each item
            // Note: This API might be slow for many items if loop is used. 
            // Better to join them or use Promise.all but be careful of rate limits.
            // For now, let's assume simple single text or small array.

            const results = await Promise.all(text.map(async (t) => {
                try {
                    const res = await translate(t, { to: targetLang });
                    return res.text;
                } catch (e) {
                    return t; // Fallback to original
                }
            }));
            return res.json({ status: 'success', data: results });
        }

        const result = await translate(text, { to: targetLang });
        res.json({ status: 'success', data: result.text });

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ status: 'error', message: 'Translation failed' });
    }
};

export default { translateText };
