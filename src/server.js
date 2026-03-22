// ============================================
// Vyaparisetu - Express Server (Prisma v7 / ESM)
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import errorHandler from './middleware/errorHandler.js';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

// ─── Global Error Handling ──────────────────────────────
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED REJECTION:", err);
});

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
import scannerRoutes from './routes/scannerRoutes.js';
import customerPortalRoutes from './routes/customerPortalRoutes.js';
import b2bRoutes from './routes/b2bRoutes.js';
import b2bCronService from './services/b2bCronService.js';
import approvalRoutes from './routes/approvalRoutes.js';

const app = express();
const server = http.createServer(app);

// Setup Socket.IO
const io = new SocketIOServer(server, {
    cors: { origin: config.frontendUrl, credentials: true }
});

app.locals.io = io;

io.on('connection', (socket) => {
    // When a store logs in, they should join a room with their storeId
    socket.on('join_store', (storeId) => {
        socket.join(`store_${storeId}`);
    });

    // For specific chat rooms
    socket.on('join_invoice', (invoiceId) => {
        socket.join(`invoice_${invoiceId}`);
        console.log(`Socket ${socket.id} joined invoice room ${invoiceId}`);
    });

    socket.on('disconnect', () => {
        // Handle disconnect if tracking presence is needed
    });
});

// ─── Middleware ──────────────────────────────
app.use(helmet());
app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
}));

// Gzip/Brotli compression — reduces JSON response sizes by 20-80%
app.use(compression());

// Rate Limiting — protects against DoS and brute-force attacks
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 100,                  // max 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                  // max 20 auth attempts per 15 min (brute force protection)
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts. Please wait 15 minutes.' },
});

app.use('/api/', generalLimiter);

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
// Apply strict auth rate limiter to sensitive authentication endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/customer-portal/register', authLimiter);
app.use('/api/customer-portal/login', authLimiter);

// Auth routes (profile, logout, token refresh) use the generalLimiter
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
app.use('/api/scanner', scannerRoutes);
// Customer Portal — two-way customer sync network
app.use('/api/customer-portal', customerPortalRoutes);

// B2B Transaction Network
app.use('/api/b2b', b2bRoutes);

// Unified Approval & Notification System
app.use('/api/approvals', approvalRoutes);

// ─── Cron Health Check ───────────────────────────────────
app.get('/api/cron-status', (req, res) => {
    res.json(b2bCronService.getStatus());
});

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

function startCronSafely() {
    try {
        b2bCronService.start();
        console.log("Cron started successfully");
    } catch (err) {
        console.error("Cron start failed:", err);
    }
}

server.listen(PORT, async () => {
    console.log(`
╔══════════════════════════════════════════════╗
║      Vyaparisetu API Server                  ║
║      Port: ${PORT}                              ║
║      Env:  ${config.nodeEnv.padEnd(17)}        ║
║      Prisma v7 + ESM                         ║
║      Host: ${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}
╚══════════════════════════════════════════════╝
    `);

    try {
        console.log("Starting startup services...");
        console.log("Configured Port:", PORT);
        console.log("Environment:", config.nodeEnv);
        startCronSafely();
    } catch (err) {
        console.error("Startup error:", err);
    }
});

export default app;
