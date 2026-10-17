import pool from './db.js';

export const migrateAuthSchema = async () => {
  await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT');
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique ON users (firebase_uid)',
  );
  await pool.query("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(12) NOT NULL DEFAULT 'media'");
  await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6)');
  await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6)');
};