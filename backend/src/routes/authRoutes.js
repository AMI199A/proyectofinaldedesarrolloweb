import { Router } from 'express';
import pool from '../config/db.js';
import authenticate from '../middleware/auth.js';

const router = Router();

// Endpoint informativo o fallback para register / login
router.post('/register', (req, res) => {
  return res.status(400).json({
    message: 'El registro se gestiona a través de Keycloak. Por favor utilice la opción Registrarse en la interfaz.',
  });
});

router.post('/login', (req, res) => {
  return res.status(400).json({
    message: 'El inicio de sesión se gestiona a través de Keycloak. Por favor utilice la opción Iniciar sesión en la interfaz.',
  });
});

router.get('/me', authenticate, async (req, res) => {
  const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Usuario no encontrado.' });
  }

  return res.json({
    user: {
      ...result.rows[0],
      roles: req.user.roles || [],
      username: req.user.username,
    },
  });
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

    return res.json({
      user: {
        ...result.rows[0],
        roles: req.user.roles || [],
      },
    });
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
