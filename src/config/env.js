import dotenv from 'dotenv';

dotenv.config();

export const env = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    nodeEnv: process.env.NODE_ENV || 'development',
};
