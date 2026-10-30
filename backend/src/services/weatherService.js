import { setTimeout as delay } from 'node:timers/promises';

const WEATHER_CODES = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna ligera',
  53: 'Llovizna moderada',
  55: 'Llovizna intensa',
  56: 'Llovizna helada ligera',
  57: 'Llovizna helada intensa',
  61: 'Lluvia ligera',
  63: 'Lluvia moderada',
  65: 'Lluvia fuerte',
  66: 'Lluvia helada ligera',
  67: 'Lluvia helada fuerte',
  71: 'Nieve ligera',
  73: 'Nieve moderada',
  75: 'Nieve intensa',
  77: 'Granizo',
  80: 'Lluvias aisladas',
  81: 'Lluvias fuertes',
  82: 'Lluvias muy fuertes',
  85: 'Nevadas ligeras',
  86: 'Nevadas intensas',
  95: 'Tormenta',
  96: 'Tormenta con granizo',
  99: 'Tormenta severa con granizo',
};

const nominatimCache = new Map();
let lastNominatimRequestAt = 0;

const normalizeNominatimLocation = (result) => {
  const address = result.address || {};
  const name = address.city
    || address.town
    || address.village
    || address.municipality
    || result.name
    || result.display_name?.split(',')[0]
    || 'Ubicación';

  return {
    id: result.place_id,
    name,
    country: address.country || 'N/A',
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    timezone: 'auto',
    admin1: address.state || address.region || 'N/A',
  };
};

const searchNominatim = async (query, count) => {
  const cacheKey = `${query.toLocaleLowerCase('es')}|${count}`;
  const cached = nominatimCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.locations;
  }

  const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
  if (waitMs > 0) await delay(waitMs);
  lastNominatimRequestAt = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(count));
  url.searchParams.set('accept-language', 'es');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'ClimaJarvisSquad/1.0 (educational weather dashboard)' },
  });

  if (!response.ok) {
    throw new Error('No se pudo consultar el servicio alternativo de lugares.');
  }

  const locations = (await response.json()).map(normalizeNominatimLocation);
  nominatimCache.set(cacheKey, { locations, expiresAt: Date.now() + 5 * 60 * 1000 });

  if (nominatimCache.size > 100) {
    const [oldestKey] = nominatimCache.keys();
    nominatimCache.delete(oldestKey);
  }

  return locations;
};

const normalizeLocation = (result) => ({
  id: result.id,
  name: result.name,
  country: result.country,
  latitude: result.latitude,
  longitude: result.longitude,
  timezone: result.timezone,
  admin1: result.admin1 || 'N/A',
});

const findLocations = async (query, count) => {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'es');
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('No se pudo consultar Open-Meteo.');
    }

    const payload = await response.json();
    const locations = (payload.results || []).map(normalizeLocation);
    return locations.length > 0 ? locations : searchNominatim(query, count);
  } catch (error) {
    return searchNominatim(query, count);
  }
};

export const searchLocations = async (query) => findLocations(query.trim(), 6);

export const geocodeCity = async (city) => {
  const locations = await findLocations(city.trim(), 1);
  return locations[0] || null;
};

export const buildOpenStreetMapUrl = ({ latitude, longitude, zoom = 10 }) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return '';
  }

  const url = new URL('https://www.openstreetmap.org/');
  url.searchParams.set('mlat', String(lat));
  url.searchParams.set('mlon', String(lon));
  url.hash = `map=${zoom}/${lat}/${lon}`;

  return url.toString();
};

export const getWeatherAtLocation = async (location) => {
  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', String(location.latitude));
  weatherUrl.searchParams.set('longitude', String(location.longitude));
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,apparent_temperature,pressure_msl,surface_pressure,visibility,wind_direction_10m,uv_index,is_day',
  );
  weatherUrl.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,apparent_temperature,pressure_msl,visibility,uv_index,is_day',
  );
  weatherUrl.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,precipitation_probability_max,precipitation_sum,weather_code,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant,moonrise,moonset,moon_phase',
  );
  weatherUrl.searchParams.set('timezone', 'auto');
  weatherUrl.searchParams.set('forecast_days', '5');

  const response = await fetch(weatherUrl.toString());

  if (!response.ok) {
    throw new Error('No se pudo obtener el pronóstico del clima.');
  }

  const payload = await response.json();

  const current = payload.current || {};
  const hourly = payload.hourly || { time: [] };
  const daily = payload.daily || {
    time: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_probability_max: [],
    weather_code: [],
    sunrise: [],
    sunset: [],
    uv_index_max: [],
  };
  const currentHourIndex = Math.max(0, hourly.time.findIndex((time) => time >= current.time));

  const currentLabel = WEATHER_CODES[current.weather_code] || 'Condición variable';

  const mapUrl = buildOpenStreetMapUrl({
    latitude: location.latitude,
    longitude: location.longitude,
  });

  return {
    location: { ...location, timezone: payload.timezone || location.timezone || 'UTC' },
    mapUrl,
    current: {
      time: current.time || null,
      temperature: current.temperature_2m ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      precipitation: current.precipitation ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      windDirection: current.wind_direction_10m ?? 0,
      feelsLike: current.apparent_temperature ?? current.temperature_2m ?? 0,
      pressure: current.surface_pressure ?? current.pressure_msl ?? 0,
      visibility: current.visibility ? Math.round(current.visibility / 1000) : 0,
      uvIndex: current.uv_index ?? 0,
      weatherCode: current.weather_code ?? 0,
      weatherLabel: currentLabel,
      isDay: current.is_day === 1,
    },
    hourly: hourly.time.slice(currentHourIndex, currentHourIndex + 8).map((time, offset) => {
      const index = currentHourIndex + offset;
      const visibility = hourly.visibility?.[index];

      return {
        time,
        temperature: hourly.temperature_2m?.[index] ?? null,
        humidity: hourly.relative_humidity_2m?.[index] ?? null,
        precipitation: hourly.precipitation?.[index] ?? null,
        precipitationProbability: hourly.precipitation_probability?.[index] ?? null,
        weatherCode: hourly.weather_code?.[index] ?? 0,
        weatherLabel: WEATHER_CODES[hourly.weather_code?.[index]] || 'Condición variable',
        windSpeed: hourly.wind_speed_10m?.[index] ?? null,
        windDirection: hourly.wind_direction_10m?.[index] ?? null,
        feelsLike: hourly.apparent_temperature?.[index] ?? null,
        pressure: hourly.pressure_msl?.[index] ?? null,
        visibility: Number.isFinite(visibility) ? Number((visibility / 1000).toFixed(1)) : null,
        uvIndex: hourly.uv_index?.[index] ?? null,
        isDay: hourly.is_day?.[index] === 1,
      };
    }),
    daily: daily.time.slice(0, 5).map((date, index) => ({
      date,
      max: daily.temperature_2m_max[index] ?? 0,
      min: daily.temperature_2m_min[index] ?? 0,
      feelsLikeMax: daily.apparent_temperature_max?.[index] ?? null,
      humidity: daily.relative_humidity_2m_mean?.[index] ?? null,
      precipitation: daily.precipitation_probability_max[index] ?? 0,
      precipitationSum: daily.precipitation_sum?.[index] ?? null,
      weatherCode: daily.weather_code[index] ?? 0,
      weatherLabel: WEATHER_CODES[daily.weather_code[index]] || 'Condición variable',
      sunrise: daily.sunrise?.[index] || null,
      sunset: daily.sunset?.[index] || null,
      uvIndex: daily.uv_index_max?.[index] ?? 0,
      windSpeedMax: daily.wind_speed_10m_max?.[index] ?? null,
      windDirection: daily.wind_direction_10m_dominant?.[index] ?? null,
      moonrise: daily.moonrise?.[index] || null,
      moonset: daily.moonset?.[index] || null,
      moonPhase: daily.moon_phase?.[index] ?? null,
    })),
  };
};

export const getWeatherData = async (city) => {
  const location = await geocodeCity(city);

  if (!location) {
    return null;
  }

  return getWeatherAtLocation(location);
};

export default {
  geocodeCity,
  searchLocations,
  getWeatherAtLocation,
  getWeatherData,
  buildOpenStreetMapUrl,
};
