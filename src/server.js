import http from 'http';
import app, { initSocket } from './app.js';
import config from './config/index.js';
import b2bCronService from './services/b2bCronService.js';

const PORT = config.port || 5000;
const server = http.createServer(app);

// ─── Initialize Services ──────────────────────────────
initSocket(server);

function startCronSafely() {
    try {
        b2bCronService.start();
        console.log("[SERVER] Cron started successfully");
    } catch (err) {
        console.error("[SERVER] Cron start failed:", err);
    }
}

// ─── Global Exception Tracking ────────────────────────
process.on("uncaughtException", (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[FATAL ERROR] Port ${PORT} is already in use.`);
        console.error(`Please kill the process using port ${PORT} or wait a few seconds for it to release.`);
        process.exit(1);
    }
    console.error("[CRITICAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("[CRITICAL] Unhandled Rejection:", reason);
});

// ─── Start Listening ─────────────────────────────────
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║      Vyaparisetu API Server                  ║
║      Port: ${PORT}                              ║
║      Env:  ${config.nodeEnv.padEnd(17)}        ║
╚══════════════════════════════════════════════╝
    `);
    
    startCronSafely();
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[STILL REGISTERED] Port ${PORT} is busy. Checking for zombie processes...\n`);
        process.exit(1);
    }
});

// ─── Clean Shutdown Handlers ──────────────────────────
const closeServer = (signal) => {
    console.log(`[SERVER] ${signal} signal received. Closing HTTP server...`);
    server.close(() => {
        console.log('[SERVER] HTTP server closed.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => closeServer('SIGTERM'));
process.on('SIGINT', () => closeServer('SIGINT'));
