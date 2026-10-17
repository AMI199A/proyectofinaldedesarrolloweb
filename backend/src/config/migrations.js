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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_devices (
      device_id VARCHAR(100) PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_readings (
      id BIGSERIAL PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL REFERENCES iot_devices(device_id) ON DELETE CASCADE,
      temperature DECIMAL(5,2) NOT NULL,
      humidity DECIMAL(5,2) NOT NULL,
      pressure DECIMAL(7,2),
      precipitation DECIMAL(7,2),
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS iot_readings_device_recorded_idx ON iot_readings (device_id, recorded_at DESC)',
  );
};