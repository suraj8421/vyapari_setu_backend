import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    // Path to the schema file
    schema: 'prisma/schema.prisma',

    // Migration configuration
    migrations: {
        path: 'prisma/migrations',
        seed: 'node prisma/seed.js',
    },

    // Database connection (replaces datasource.url in schema.prisma)
    datasource: {
        url: env('DATABASE_URL'),
    },
})
