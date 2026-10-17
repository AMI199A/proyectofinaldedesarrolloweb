import { Router } from 'express';
import authenticate from '../middleware/auth.js';
import pool from '../config/db.js';

const router = Router();

router.post('/devices', authenticate, async (req, res, next) => {
  try {
    const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const claimCode = typeof req.body.claimCode === 'string' ? req.body.claimCode : '';
    const expectedClaimCode = process.env.IOT_DEVICE_CLAIM_CODE;

    if (!expectedClaimCode) {
      return res.status(503).json({ message: 'El registro de dispositivos no está configurado en el servidor.' });
    }

    if (claimCode !== expectedClaimCode) {
      return res.status(403).json({ message: 'El código de vinculación del dispositivo no es válido.' });
    }

    if (!/^[a-zA-Z0-9_-]{2,100}$/.test(deviceId)) {
      return res.status(400).json({ message: 'El identificador debe tener entre 2 y 100 caracteres (letras, números, guion o guion bajo).' });
    }

    const result = await pool.query(
      `INSERT INTO iot_devices (device_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET user_id = EXCLUDED.user_id
       WHERE iot_devices.user_id = EXCLUDED.user_id
       RETURNING device_id`,
      [deviceId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'El dispositivo ya está vinculado a otra cuenta.' });
    }

    return res.status(201).json({ deviceId: result.rows[0].device_id });
  } catch (error) {
    return next(error);
  }
});

router.get('/readings', authenticate, async (req, res, next) => {
  try {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    if (!/^[a-zA-Z0-9_-]{2,100}$/.test(deviceId)) {
      return res.status(400).json({ message: 'Indica un identificador de dispositivo válido.' });
    }

    const result = await pool.query(
      `SELECT r.id, r.device_id AS "deviceId", r.temperature, r.humidity,
              r.pressure, r.precipitation, r.recorded_at AS "recordedAt"
       FROM iot_readings r
       JOIN iot_devices d ON d.device_id = r.device_id
       WHERE r.device_id = $1 AND d.user_id = $2
       ORDER BY r.recorded_at DESC
       LIMIT 24`,
      [deviceId, req.user.id],
    );

    const readings = result.rows.reverse().map((reading) => ({
      ...reading,
      temperature: Number(reading.temperature),
      humidity: Number(reading.humidity),
      pressure: reading.pressure === null ? null : Number(reading.pressure),
      precipitation: reading.precipitation === null ? null : Number(reading.precipitation),
    }));

    return res.json({ deviceId, readings, latest: readings.at(-1) || null });
  } catch (error) {
    return next(error);
  }
});

router.post('/ingest', async (req, res, next) => {
  const expectedKey = process.env.IOT_DEVICE_INGEST_KEY;
  const providedKey = req.get('x-ingest-key');

  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ message: 'Credencial de Node-RED inválida.' });
  }

  try {
    const { deviceId, temperature, humidity, pressure, precipitation } = req.body;
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';

    if (!/^[a-zA-Z0-9_-]{2,100}$/.test(normalizedDeviceId)
      || !Number.isFinite(temperature) || temperature < -80 || temperature > 100
      || !Number.isFinite(humidity) || humidity < 0 || humidity > 100
      || (pressure !== undefined && pressure !== null
        && (!Number.isFinite(pressure) || pressure < 300 || pressure > 1200))
      || (precipitation !== undefined && precipitation !== null
        && (!Number.isFinite(precipitation) || precipitation < 0 || precipitation > 10000))) {
      return res.status(400).json({ message: 'La lectura de sensores contiene valores no válidos.' });
    }

    const result = await pool.query(
      `INSERT INTO iot_readings (device_id, temperature, humidity, pressure, precipitation)
       SELECT device_id, $2, $3, $4, $5
       FROM iot_devices
       WHERE device_id = $1
       RETURNING id, device_id AS "deviceId", temperature, humidity, pressure,
                 precipitation, recorded_at AS "recordedAt"`,
      [
        normalizedDeviceId,
        temperature,
        humidity,
        pressure ?? null,
        precipitation ?? null,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'El dispositivo todavía no está vinculado a un usuario.' });
    }

    return res.status(201).json({ reading: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

export default router;
