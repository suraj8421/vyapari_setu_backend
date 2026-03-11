// ============================================
// Vyaparisetu - Express Server (Prisma v7 / ESM)
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import errorHandler from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import productRoutes from './routes/productRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import translateRoutes from './routes/translateRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
// FIX: Register the new expense routes — previously expenses had no listing endpoint
import expenseRoutes from './routes/expenseRoutes.js';

const app = express();

// ─── Middleware ──────────────────────────────
app.use(helmet());
app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
}

// ─── Health Check ────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: config.nodeEnv,
    });
});

// ─── API Routes ──────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/transactions', transactionRoutes);
// FIX: New — expose expense management endpoints
app.use('/api/expenses', expenseRoutes);

// ─── 404 Handler ─────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`,
    });
});

// ─── Error Handler ───────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────
const PORT = config.port;

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║      Vyaparisetu API Server                  ║
║      Port: ${PORT}                              ║
║      Env:  ${config.nodeEnv.padEnd(17)}        ║
║      Prisma v7 + ESM                         ║
╚══════════════════════════════════════════════╝
    `);
});

export default app;
