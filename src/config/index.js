// ============================================
// Vyaparisetu - Application Configuration
// ============================================

import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Bcrypt
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
};

// ── Security Guard ────────────────────────────────────────────────
// Prevent the server from starting in production with insecure defaults.
// In development this is skipped so that first-time setup is easier.
if (config.nodeEnv === 'production') {
  const insecureDefaults = [
    config.jwt.accessSecret === 'default-access-secret',
    config.jwt.refreshSecret === 'default-refresh-secret',
  ];
  if (insecureDefaults.some(Boolean)) {
    throw new Error(
      '[FATAL] JWT secrets are not set. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables before running in production.'
    );
  }
  if (!config.databaseUrl) {
    throw new Error('[FATAL] DATABASE_URL environment variable is not set.');
  }
}

export default config;

