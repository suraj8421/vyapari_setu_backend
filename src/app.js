import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import errorHandler from './middleware/errorHandler.js';
import { Server as SocketIOServer } from 'socket.io';

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
import expenseRoutes from './routes/expenseRoutes.js';
import customerPortalRoutes from './routes/customerPortalRoutes.js';
import b2bRoutes from './routes/b2bRoutes.js';
import approvalRoutes from './routes/approvalRoutes.js';
import planRoutes from './routes/planRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import saUserRoutes from './routes/saUserRoutes.js';
import saDashboardRoutes from './routes/saDashboardRoutes.js';
import saLeadRoutes from './routes/saLeadRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import b2bCronService from './services/b2bCronService.js';

const app = express();

/**
 * Initialize WebSockets on a given HTTP server instance
 */
export const initSocket = (server) => {
    const io = new SocketIOServer(server, {
        cors: { origin: config.frontendUrl, credentials: true }
    });

    app.locals.io = io;

    io.on('connection', (socket) => {
        socket.on('join_store', (storeId) => socket.join(`store_${storeId}`));
        socket.on('join_invoice', (invoiceId) => {
            socket.join(`invoice_${invoiceId}`);
            console.log(`Socket ${socket.id} joined invoice room ${invoiceId}`);
        });
    });
    
    return io;
};

// Middleware
app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(compression());

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later.' },
});

app.use('/api/', generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
}

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.nodeEnv });
});

// API Routes
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
app.use('/api/expenses', expenseRoutes);
app.use('/api/customer-portal', customerPortalRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/sa-users', saUserRoutes);
app.use('/api/sa-dashboard', saDashboardRoutes);
app.use('/api/sa-leads', saLeadRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/cron-status', (req, res) => res.json(b2bCronService.getStatus()));

// 404 & Error Handlers
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
});
app.use(errorHandler);

export default app;
