import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function checkDB() {
    try {
        await client.connect();
        const res = await client.query("SELECT current_database(), current_user");
        console.log('Current DB info:', res.rows[0]);

        const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log('Tables in public schema:');
        console.table(tables.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkDB();
