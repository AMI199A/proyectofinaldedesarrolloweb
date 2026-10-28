import { Router } from 'express';
import pool from '../config/db.js';
import weatherService from '../services/weatherService.js';
import { getWeatherAlert } from '../services/weatherAlerts.js';
import authenticate from '../middleware/auth.js';
import { verifyKeycloakToken } from '../config/keycloak.js';

const router = Router();
const openWeatherLayers = new Set(['precipitation_new', 'temp_new', 'wind_new', 'clouds_new']);

router.get('/map/status', (req, res) => {
  return res.json({ weatherMapEnabled: Boolean(process.env.OPENWEATHER_API_KEY), provider: 'OpenWeatherMap' });
});

router.get('/map/:layer/:zoom/:x/:y.png', async (req, res, next) => {
  try {
    const { layer } = req.params;
    const zoom = Number(req.params.zoom);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!openWeatherLayers.has(layer)) {
      return res.status(400).json({ message: 'La capa meteorológica solicitada no está permitida.' });
    }

    if (!apiKey) {
      return res.status(503).json({ message: 'Configura OPENWEATHER_API_KEY para habilitar las capas del mapa.' });
    }

    if (!Number.isInteger(zoom) || zoom < 0 || zoom > 18
      || !Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || y < 0 || x >= 2 ** zoom || y >= 2 ** zoom) {
      return res.status(400).json({ message: 'Las coordenadas de la tesela no son válidas.' });
    }

    const baseUrl = (process.env.OPENWEATHER_MAP_TILES_URL || 'https://tile.openweathermap.org/map')
      .replace(/\/$/, '');
    const tileUrl = new URL(`${baseUrl}/${layer}/${zoom}/${x}/${y}.png`);
    tileUrl.searchParams.set('appid', apiKey);

    const tileResponse = await fetch(tileUrl);

    if (!tileResponse.ok) {
      return res.status(tileResponse.status === 401 ? 502 : tileResponse.status)
        .json({ message: 'OpenWeatherMap no pudo entregar esta capa del mapa.' });
    }

    res.set('Content-Type', tileResponse.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=600');
    return res.send(Buffer.from(await tileResponse.arrayBuffer()));
  } catch (error) {
    return next(error);
  }
});

router.get('/locations', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();

    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({ message: 'Escribe entre 2 y 100 caracteres para buscar lugares.' });
    }

    const locations = await weatherService.searchLocations(query);
    return res.json({ locations });
  } catch (error) {
    return next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const city = String(req.query.city || '').trim();
    const hasCoordinates = req.query.latitude !== undefined || req.query.longitude !== undefined;

    if (hasCoordinates) {
      const latitude = Number(req.query.latitude);
      const longitude = Number(req.query.longitude);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ message: 'Las coordenadas seleccionadas no son válidas.' });
      }
    } else if (!city || city.length < 2) {
      return res.status(400).json({ message: 'Debes indicar una ciudad válida.' });
    }

    const weather = hasCoordinates
      ? await weatherService.getWeatherAtLocation({
        name: String(req.query.name || city || 'Ubicación seleccionada'),
        country: String(req.query.country || 'N/A'),
        admin1: String(req.query.admin1 || 'N/A'),
        latitude: Number(req.query.latitude),
        longitude: Number(req.query.longitude),
        timezone: String(req.query.timezone || 'auto'),
      })
      : await weatherService.getWeatherData(city);

    if (!weather) {
      return res.status(404).json({ message: 'No se encontraron resultados para la ciudad solicitada.' });
    }

    const alert = getWeatherAlert(weather);
    const alertType = alert?.type || 'Condición normal';

    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
        const decoded = await verifyKeycloakToken(token);
        const userRes = await pool.query('SELECT id FROM users WHERE keycloak_id = $1 LIMIT 1', [decoded.sub]);
        const userId = userRes.rows[0]?.id;

        if (userId) {
          await pool.query(
            `INSERT INTO weather_queries (user_id, city_name, country_name, temperature, alert_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, weather.location.name, weather.location.country, weather.current.temperature, alertType],
          );

          if (alert) {
            await pool.query(
              `INSERT INTO alerts (user_id, city_name, alert_type, message, severity, latitude, longitude)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                userId,
                weather.location.name,
                alert.type,
                alert.message,
                alert.severity,
                weather.location.latitude,
                weather.location.longitude,
              ],
            );
          }
        }
      } catch (error) {
        // Se ignora si no se autentica correctamente para consultas anónimas
      }
    }

    return res.json({
      weather,
      alertType,
      alert,
      message: alert
        ? `${alert.severity === 'alta' ? 'Alerta alta' : 'Aviso'}: ${alert.type}. ${alert.message}`
        : 'Consulta completada; no hay alertas para esta ubicación.',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/favorites', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM favorite_locations WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id],
  );

  return res.json(result.rows);
});

router.post('/favorites', authenticate, async (req, res, next) => {
  try {
    const { name, country, latitude, longitude } = req.body;

    if (!name || !latitude || !longitude) {
      return res.status(400).json({ message: 'Faltan datos de la ubicación favorita.' });
    }

    const result = await pool.query(
      `INSERT INTO favorite_locations (user_id, name, country, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING *`,
      [req.user.id, name, country || 'N/A', latitude, longitude],
    );

    return res.status(201).json({
      message: result.rows.length > 0 ? 'Ubicación guardada en favoritos.' : 'La ubicación ya estaba guardada.',
      favorite: result.rows[0] || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/history', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM weather_queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
    [req.user.id],
  );

  return res.json(result.rows);
});

router.get('/alerts', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
    [req.user.id],
  );

  return res.json(result.rows);
});

export default router;
