import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/clima_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

export const testDbConnection = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.warn('Database is not available yet. Continuing without DB connection:', error.message);
    return false;
  }
};

export default pool;
