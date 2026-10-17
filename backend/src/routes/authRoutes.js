import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import pool from '../config/db.js';
import { getFirebaseAdminAuth } from '../config/firebaseAdmin.js';
import authenticate from '../middleware/auth.js';

const router = Router();

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET || 'supersecretkey',
    { expiresIn: '7d' },
  );

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: 'El correo electrónico no es válido.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name.trim(), email.toLowerCase(), hashedPassword],
    );

    const user = result.rows[0];
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Usuario registrado correctamente.',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'El correo ya está registrado.' });
    }
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Correo y contraseña obligatorios.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];
    const isValid = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!isValid) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const token = generateToken(user);

    return res.json({
      message: 'Inicio de sesión correcto.',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/firebase', async (req, res, next) => {
  let client;

  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ message: 'Falta el token de autenticación.' });
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const email = decodedToken.email?.toLowerCase();

    if (!email || !decodedToken.email_verified || !validator.isEmail(email)) {
      return res.status(401).json({ message: 'El proveedor no confirmó un correo válido.' });
    }

    const name = String(decodedToken.name || email.split('@')[0]).trim().slice(0, 120);
    client = await pool.connect();
    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT id, name, email, firebase_uid FROM users WHERE firebase_uid = $1 OR email = $2 ORDER BY (firebase_uid = $1) DESC LIMIT 1 FOR UPDATE',
      [decodedToken.uid, email],
    );

    let user;

    if (existingResult.rows.length > 0) {
      user = existingResult.rows[0];

      if (user.firebase_uid && user.firebase_uid !== decodedToken.uid) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'El correo ya está vinculado a otra cuenta social.' });
      }

      const updateResult = await client.query(
        'UPDATE users SET firebase_uid = $1, name = $2 WHERE id = $3 RETURNING id, name, email',
        [decodedToken.uid, name, user.id],
      );
      user = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        'INSERT INTO users (name, email, password_hash, firebase_uid) VALUES ($1, $2, NULL, $3) RETURNING id, name, email',
        [name, email, decodedToken.uid],
      );
      user = insertResult.rows[0];
    }

    await client.query('COMMIT');

    return res.json({
      message: 'Inicio de sesión social correcto.',
      token: generateToken(user),
      user,
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    if (error.code === '23505') {
      return res.status(409).json({ message: 'La cuenta social ya está vinculada a otro usuario.' });
    }

    return next(error);
  } finally {
    client?.release();
  }
});

router.get('/me', authenticate, async (req, res) => {
  const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Usuario no encontrado.' });
  }

  return res.json({ user: result.rows[0] });
});

router.put('/me', authenticate, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ message: 'El nombre debe tener entre 2 y 120 caracteres.' });
    }

    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email',
      [name, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get('/preferences', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT preferences FROM user_preferences WHERE user_id = $1',
      [req.user.id],
    );

    return res.json({ preferences: result.rows[0]?.preferences || {} });
  } catch (error) {
    return next(error);
  }
});

router.put('/preferences', authenticate, async (req, res, next) => {
  try {
    const { autoRefreshSensors } = req.body;
    const { sensorRefreshSeconds } = req.body;

    if (typeof autoRefreshSensors !== 'boolean'
      || !Number.isInteger(sensorRefreshSeconds)
      || sensorRefreshSeconds < 5
      || sensorRefreshSeconds > 300) {
      return res.status(400).json({ message: 'Las preferencias de actualización no son válidas.' });
    }

    const preferences = { autoRefreshSensors, sensorRefreshSeconds };
    const result = await pool.query(
      `INSERT INTO user_preferences (user_id, preferences)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE
       SET preferences = EXCLUDED.preferences, updated_at = CURRENT_TIMESTAMP
       RETURNING preferences`,
      [req.user.id, JSON.stringify(preferences)],
    );

    return res.json({ preferences: result.rows[0].preferences });
  } catch (error) {
    return next(error);
  }
});

export default router;
