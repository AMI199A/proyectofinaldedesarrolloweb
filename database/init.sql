CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  firebase_uid TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

CREATE TABLE IF NOT EXISTS favorite_locations (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(150),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS weather_queries (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  city_name VARCHAR(150) NOT NULL,
  country_name VARCHAR(150),
  temperature DECIMAL(5,2),
  alert_type VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  city_name VARCHAR(150) NOT NULL,
  alert_type VARCHAR(120) NOT NULL,
  message TEXT,
  severity VARCHAR(12) NOT NULL DEFAULT 'media',
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(12) NOT NULL DEFAULT 'media';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);

INSERT INTO users (name, email, password_hash)
VALUES (
  'Usuario Demo',
  'demo@clima.app',
  '$2a$10$Q5YkdaQm4i1rT9L1QhP4bOuQW2Gm0kKzOe6rQScS1l7e2hZ2Uq3mC'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO favorite_locations (user_id, name, country, latitude, longitude)
VALUES (
  (SELECT id FROM users WHERE email = 'demo@clima.app'),
  'Guatemala',
  'GT',
  14.6349,
  -90.5069
)
ON CONFLICT (user_id, name) DO NOTHING;
