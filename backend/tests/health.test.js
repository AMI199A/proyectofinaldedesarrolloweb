process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import weatherService, { buildOpenStreetMapUrl } from '../src/services/weatherService.js';
import { getWeatherAlert } from '../src/services/weatherAlerts.js';

test('the application exposes the API app object', () => {
  assert.ok(app);
});

test('protected account, assistant and sensor endpoints require a signed-in user', async () => {
  const responses = await Promise.all([
    request(app).get('/api/auth/me'),
    request(app).get('/api/auth/preferences'),
    request(app).post('/api/assistant').send({ question: '¿Qué tiempo hará?' }),
    request(app).get('/api/iot/readings?deviceId=esp32-01'),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
});

test('Gemini reports missing server configuration without making an external request', async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const token = jwt.sign(
    { id: 1, name: 'Test', email: 'test@example.test' },
    process.env.JWT_SECRET || 'supersecretkey',
  );

  try {
    const response = await request(app)
      .post('/api/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '¿Qué ropa recomiendas?', weather: { temperature: 20 } });

    assert.equal(response.status, 503);
    assert.match(response.body.message, /GEMINI_API_KEY/);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }
});

test('sensor ingestion rejects an incorrect Node-RED credential', async () => {
  const originalIngestKey = process.env.IOT_DEVICE_INGEST_KEY;
  process.env.IOT_DEVICE_INGEST_KEY = 'test-ingest-secret';

  try {
    const response = await request(app)
      .post('/api/iot/ingest')
      .set('x-ingest-key', 'incorrect')
      .send({ deviceId: 'esp32-01', temperature: 20, humidity: 50 });

    assert.equal(response.status, 401);
  } finally {
    if (originalIngestKey === undefined) {
      delete process.env.IOT_DEVICE_INGEST_KEY;
    } else {
      process.env.IOT_DEVICE_INGEST_KEY = originalIngestKey;
    }
  }
});

test('weather service includes an OpenStreetMap link for a location', () => {
  const mapUrl = buildOpenStreetMapUrl({ latitude: 14.6349, longitude: -90.5069 });

  assert.ok(mapUrl.includes('www.openstreetmap.org'));
  assert.ok(mapUrl.includes('mlat=14.6349'));
  assert.ok(mapUrl.includes('mlon=-90.5069'));
  assert.ok(mapUrl.includes('14.6349'));
  assert.ok(mapUrl.includes('-90.5069'));
  assert.ok(typeof weatherService.getWeatherData === 'function');
});

test('weather service normalizes eight hourly forecasts and five days of astronomy data', async () => {
  const originalFetch = globalThis.fetch;
  const hourlyTimes = Array.from({ length: 24 }, (_, index) => `2026-10-07T${String(index).padStart(2, '0')}:00`);
  const dailyDates = Array.from({ length: 5 }, (_, index) => `2026-10-${String(7 + index).padStart(2, '0')}`);
  const hourly = {
    time: hourlyTimes,
    temperature_2m: hourlyTimes.map((_, index) => 20 + index),
    relative_humidity_2m: hourlyTimes.map(() => 70),
    precipitation_probability: hourlyTimes.map(() => 15),
    precipitation: hourlyTimes.map(() => 0.2),
    weather_code: hourlyTimes.map((_, index) => (index === 6 ? 95 : 3)),
    wind_speed_10m: hourlyTimes.map(() => 12),
    wind_direction_10m: hourlyTimes.map(() => 180),
    apparent_temperature: hourlyTimes.map(() => 21),
    pressure_msl: hourlyTimes.map(() => 1014),
    visibility: hourlyTimes.map(() => 1200),
    uv_index: hourlyTimes.map(() => 2),
    is_day: hourlyTimes.map(() => 1),
  };
  const daily = {
    time: dailyDates,
    temperature_2m_max: dailyDates.map(() => 28),
    temperature_2m_min: dailyDates.map(() => 18),
    apparent_temperature_max: dailyDates.map(() => 29),
    relative_humidity_2m_mean: dailyDates.map(() => 80),
    precipitation_probability_max: dailyDates.map(() => 60),
    precipitation_sum: dailyDates.map(() => 4.5),
    weather_code: dailyDates.map(() => 3),
    sunrise: dailyDates.map((date) => `${date}T05:52`),
    sunset: dailyDates.map((date) => `${date}T17:47`),
    uv_index_max: dailyDates.map(() => 5),
    wind_speed_10m_max: dailyDates.map(() => 18),
    wind_direction_10m_dominant: dailyDates.map(() => 180),
    moonrise: dailyDates.map((date) => `${date}T03:09`),
    moonset: dailyDates.map((date) => `${date}T15:49`),
    moon_phase: dailyDates.map(() => 0.25),
  };

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl);
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.equal(url.searchParams.get('forecast_days'), '5');
    assert.match(url.searchParams.get('hourly'), /precipitation_probability.*pressure_msl.*is_day/);
    assert.match(url.searchParams.get('daily'), /moonrise.*moonset.*moon_phase/);

    return {
      ok: true,
      json: async () => ({
        timezone: 'America/Guatemala',
        current: { time: '2026-10-07T06:00', weather_code: 3 },
        hourly,
        daily,
      }),
    };
  };

  try {
    const weather = await weatherService.getWeatherAtLocation({
      name: 'Guatemala',
      country: 'Guatemala',
      latitude: 14.6349,
      longitude: -90.5069,
    });

    assert.equal(weather.location.timezone, 'America/Guatemala');
    assert.equal(weather.hourly.length, 8);
    assert.equal(weather.hourly[0].time, '2026-10-07T06:00');
    assert.equal(weather.hourly[0].weatherCode, 95);
    assert.equal(weather.hourly[0].visibility, 1.2);
    assert.equal(weather.hourly[0].isDay, true);
    assert.equal(weather.daily.length, 5);
    assert.equal(weather.daily[0].sunrise, '2026-10-07T05:52');
    assert.equal(weather.daily[0].moonPhase, 0.25);
    assert.equal(weather.daily[0].moonrise, '2026-10-07T03:09');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('location suggestions preserve the geocoder result coordinates', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl);
    assert.equal(url.searchParams.get('name'), 'Guatema');
    assert.equal(url.searchParams.get('count'), '6');

    return {
      ok: true,
      json: async () => ({
        results: [{
          id: 3598132,
          name: 'Guatemala City',
          country: 'Guatemala',
          admin1: 'Guatemala',
          latitude: 14.6349,
          longitude: -90.5069,
          timezone: 'America/Guatemala',
        }],
      }),
    };
  };

  try {
    const locations = await weatherService.searchLocations('Guatema');

    assert.equal(locations.length, 1);
    assert.equal(locations[0].name, 'Guatemala City');
    assert.equal(locations[0].latitude, 14.6349);
    assert.equal(locations[0].longitude, -90.5069);
    assert.equal(locations[0].admin1, 'Guatemala');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('location suggestions fall back to Nominatim when Open-Meteo is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;

  globalThis.fetch = async (requestUrl, options = {}) => {
    requests += 1;
    const url = new URL(requestUrl);

    if (url.hostname === 'geocoding-api.open-meteo.com') {
      throw new Error('ETIMEDOUT');
    }

    assert.equal(url.hostname, 'nominatim.openstreetmap.org');
    assert.equal(url.searchParams.get('q'), 'guatemala-fallback-test');
    assert.match(options.headers['User-Agent'], /ClimaJarvisSquad/);

    return {
      ok: true,
      json: async () => [{
        place_id: 12345,
        name: 'Ciudad de Guatemala',
        lat: '14.6349',
        lon: '-90.5069',
        address: {
          city: 'Ciudad de Guatemala',
          state: 'Departamento de Guatemala',
          country: 'Guatemala',
        },
      }],
    };
  };

  try {
    const locations = await weatherService.searchLocations('guatemala-fallback-test');

    assert.equal(requests, 2);
    assert.equal(locations[0].name, 'Ciudad de Guatemala');
    assert.equal(locations[0].latitude, 14.6349);
    assert.equal(locations[0].longitude, -90.5069);
    assert.equal(locations[0].country, 'Guatemala');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('weather alert rules classify severe storms and ignore normal conditions', () => {
  const normalWeather = {
    current: {
      weatherCode: 2,
      temperature: 24,
      windSpeed: 12,
      precipitation: 0,
      uvIndex: 4,
    },
  };
  const stormWeather = {
    current: { ...normalWeather.current, weatherCode: 95 },
  };

  assert.equal(getWeatherAlert(normalWeather), null);
  assert.deepEqual(getWeatherAlert(stormWeather), {
    type: 'Tormenta eléctrica',
    severity: 'alta',
    message: 'Tormenta detectada en esta ubicación.',
  });
});

test('OpenWeatherMap tile proxy keeps its API key on the backend', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENWEATHER_API_KEY;
  let requestedUrl;

  process.env.OPENWEATHER_API_KEY = 'test-only-map-key';
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    };
  };

  try {
    const response = await request(app)
      .get('/api/weather/map/precipitation_new/5/8/14.png')
      .expect(200);

    assert.equal(requestedUrl.hostname, 'tile.openweathermap.org');
    assert.equal(requestedUrl.pathname, '/map/precipitation_new/5/8/14.png');
    assert.equal(requestedUrl.searchParams.get('appid'), 'test-only-map-key');
    assert.equal(response.headers['content-type'], 'image/png');
    assert.equal(response.body.toString('utf8').includes('test-only-map-key'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENWEATHER_API_KEY;
    } else {
      process.env.OPENWEATHER_API_KEY = originalApiKey;
    }
  }
});

test('OpenWeatherMap tile proxy reports missing API key clearly', async () => {
  const originalApiKey = process.env.OPENWEATHER_API_KEY;
  delete process.env.OPENWEATHER_API_KEY;

  try {
    const response = await request(app)
      .get('/api/weather/map/temp_new/5/8/14.png')
      .expect(503);

    assert.match(response.body.message, /OPENWEATHER_API_KEY/);
  } finally {
    if (originalApiKey !== undefined) {
      process.env.OPENWEATHER_API_KEY = originalApiKey;
    }
  }
});
