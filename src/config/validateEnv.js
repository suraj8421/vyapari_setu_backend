// ============================================
// Environment Variable Validation
// ============================================
// Called at server startup BEFORE any routes are registered.
// Exits immediately with a clear error if required vars are missing,
// instead of failing silently with cryptic errors at request time.

const REQUIRED_ENV_VARS = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'PORT',
];

export function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error('');
        console.error('❌  Missing required environment variables:');
        missing.forEach((key) => console.error(`    • ${key}`));
        console.error('');
        console.error('    Please check your .env file and restart the server.');
        console.error('');
        process.exit(1);
    }
}
