import { useEffect, useRef, useState } from 'react';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import api, { setAuthToken } from './api';
import { firebaseAuth, isFirebaseConfigured } from './firebase';

const initialAuth = {
  name: '',
  email: '',
  password: '',
};

const getLocationLabel = (location) => [
  location.name,
  location.admin1 && location.admin1 !== 'N/A' ? location.admin1 : null,
  location.country,
].filter(Boolean).join(', ');

const cityHighlights = [
  { city: 'Guatemala', temp: 28, condition: 'Soleado', icon: '☀️' },
  { city: 'Ciudad de México', temp: 23, condition: 'Nublado', icon: '⛅' },
  { city: 'Bogotá', temp: 19, condition: 'Lluvia ligera', icon: '🌦️' },
];

const formatTime = (value) => {
  if (!value) return 'N/D';

  const match = String(value).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : 'N/D';
};

const formatDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'N/D';
};

const getWeekday = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';

  return new Intl.DateTimeFormat('es-GT', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`))
    .toLocaleUpperCase('es-GT');
};

const getWindDirection = (degrees) => {
  if (!Number.isFinite(Number(degrees))) return 'N/D';
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(Number(degrees) / 45) % 8];
};

const getMoonPhase = (phase) => {
  const value = ((Number(phase) % 1) + 1) % 1;
  if (value < 0.035 || value >= 0.965) return { icon: '🌑', label: 'Luna nueva' };
  if (value < 0.22) return { icon: '🌒', label: 'Creciente' };
  if (value < 0.28) return { icon: '🌓', label: 'Cuarto creciente' };
  if (value < 0.47) return { icon: '🌔', label: 'Gibosa creciente' };
  if (value < 0.53) return { icon: '🌕', label: 'Luna llena' };
  if (value < 0.72) return { icon: '🌖', label: 'Gibosa menguante' };
  if (value < 0.78) return { icon: '🌗', label: 'Cuarto menguante' };
  return { icon: '🌘', label: 'Menguante' };
};

function LocalClock({ timezone }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const options = { timeZone: timezone || undefined };
  const time = new Intl.DateTimeFormat('es-GT', {
    ...options,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const dateParts = new Intl.DateTimeFormat('es-GT', {
    ...options,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('es-GT', { ...options, weekday: 'long' })
    .format(now)
    .toLocaleUpperCase('es-GT');

  return (
    <div className="local-clock" aria-label={`Hora ${time}, fecha ${dateParts}, ${weekday}`}>
      <span className="local-clock-time">{time}</span>
      <span className="local-clock-date">{dateParts}</span>
      <span className="local-clock-day">{weekday}</span>
    </div>
  );
}

function SolarChart({ day, timezone }) {
  const sunrise = formatTime(day?.sunrise);
  const sunset = formatTime(day?.sunset);
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const sunriseMinutes = sunrise === 'N/D' ? null : toMinutes(sunrise);
  const sunsetMinutes = sunset === 'N/D' ? null : toMinutes(sunset);

  if (sunriseMinutes === null || sunsetMinutes === null) {
    return <p className="forecast-empty">La gráfica solar no está disponible para esta fecha.</p>;
  }

  const nowParts = new Intl.DateTimeFormat('en', {
    timeZone: timezone || undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const nowMinutes = Number(nowParts.find((part) => part.type === 'hour')?.value) * 60
    + Number(nowParts.find((part) => part.type === 'minute')?.value);
  const progress = Math.max(0, Math.min(1, (nowMinutes - sunriseMinutes) / (sunsetMinutes - sunriseMinutes)));
  const sunX = 56 + progress * 488;
  const sunY = 145 - Math.sin(progress * Math.PI) * 104;
  const daylightMinutes = sunsetMinutes - sunriseMinutes;
  const daylight = `${Math.floor(daylightMinutes / 60)} h ${daylightMinutes % 60} min`;

  return (
    <div className="solar-chart-wrap">
      <svg className="solar-chart" viewBox="0 0 600 190" role="img" aria-label={`Amanecer ${sunrise}, atardecer ${sunset}`}>
        <defs>
          <linearGradient id="solar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd27f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffd27f" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="solar-line" x1="0" x2="1">
            <stop offset="0%" stopColor="#f49a70" />
            <stop offset="50%" stopColor="#ffe09a" />
            <stop offset="100%" stopColor="#ef947e" />
          </linearGradient>
        </defs>
        <path d="M56 145 Q300 -42 544 145 L544 155 L56 155 Z" fill="url(#solar-fill)" />
        <path d="M56 145 Q300 -42 544 145" fill="none" stroke="url(#solar-line)" strokeWidth="4" strokeLinecap="round" />
        <line x1="34" y1="146" x2="566" y2="146" stroke="rgba(222, 235, 241, 0.42)" strokeWidth="2" />
        <circle cx="56" cy="145" r="7" fill="#ffbd87" />
        <circle cx="544" cy="145" r="7" fill="#f28c80" />
        <circle cx={sunX} cy={sunY} r="13" fill="#fff0bb" stroke="#ffca77" strokeWidth="4" />
        <text x="56" y="176" textAnchor="start">{sunrise}</text>
        <text x="544" y="176" textAnchor="end">{sunset}</text>
      </svg>
      <div className="solar-chart-caption">
        <span>Salida del sol</span>
        <strong>{daylight} de luz</strong>
        <span>Puesta del sol</span>
      </div>
    </div>
  );
}

const getWeatherIcon = (label = '') => {
  const normalized = label.toLowerCase();

  if (normalized.includes('lluv')) return '🌧️';
  if (normalized.includes('torment')) return '⛈️';
  if (normalized.includes('nublado') || normalized.includes('niebla')) return '☁️';
  if (normalized.includes('nieve')) return '❄️';
  return '☀️';
};

const getWeatherTheme = (current = {}) => {
  const code = Number(current.weatherCode);
  const label = String(current.weatherLabel || '').toLowerCase();

  if (code >= 95 || label.includes('torment')) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code) || label.includes('nieve')) return 'snow';
  if ([45, 48].includes(code) || label.includes('niebla')) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || label.includes('lluv')) return 'rain';
  if (Number(current.temperature) <= 5) return 'cold';
  if (code === 2 || code === 3 || label.includes('nublado')) return 'cloudy';
  if (current.isDay === false) return 'night';
  return 'sunny';
};

const getSolarPhase = (weather) => {
  const parseMinutes = (value) => {
    const match = String(value || '').match(/(?:T)?(\d{2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const timezone = weather.location?.timezone;
  let currentMinutes;

  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    currentMinutes = Number(parts.find((part) => part.type === 'hour')?.value) * 60
      + Number(parts.find((part) => part.type === 'minute')?.value);
  } catch (error) {
    currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  }

  const solarEvents = [
    { name: 'dawn', minutes: parseMinutes(weather.daily?.[0]?.sunrise) },
    { name: 'dusk', minutes: parseMinutes(weather.daily?.[0]?.sunset) },
  ].filter((event) => event.minutes !== null);

  if (solarEvents.length === 0) return { name: '', strength: 0 };

  const closestEvent = solarEvents.reduce((closest, event) => {
    const distance = Math.abs(currentMinutes - event.minutes);
    return distance < closest.distance ? { ...event, distance } : closest;
  }, { distance: Infinity });

  if (closestEvent.distance > 75) return { name: '', strength: 0 };
  return { name: closestEvent.name, strength: 1 - closestEvent.distance / 75 };
};

const getFriendlyWeatherMessage = (theme, locationName) => {
  const messages = {
    sunny: `¡Buen día en ${locationName}! El cielo acompaña para salir.`,
    cloudy: `En ${locationName} hay nubes; disfruta el día con calma.`,
    rain: `Parece que lloverá en ${locationName}; lleva paraguas al salir.`,
    storm: `Hay tormenta en ${locationName}; mejor quédate bajo resguardo.`,
    snow: `Hace frío en ${locationName}; abrígate bien al salir.`,
    cold: `El ambiente está frío en ${locationName}; abrígate bien al salir.`,
    fog: `Hay poca visibilidad en ${locationName}; conduce con precaución.`,
    night: `Buenas noches en ${locationName}; consulta el pronóstico antes de salir.`,
  };

  return messages[theme] || `Consulta las condiciones actuales de ${locationName}.`;
};

const weatherMarkerIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const getMapPageUrl = (location) => {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'https://www.openstreetmap.org/';
  }

  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=10/${latitude}/${longitude}`;
};

function WeatherAtmosphere({ theme, windSpeed, windDirection, solarPhase, hasClouds }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    let width = 0;
    let height = 0;
    let frameId;
    let particles = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(240, Math.max(70, Math.round((width * height) / 8500)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 0.7 + Math.random() * 2.2,
        speed: 0.45 + Math.random() * 1.8,
        drift: Math.random() * 2 - 1,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const drawCloud = (x, y, scale, alpha, color) => {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 24 * scale;
      context.beginPath();
      context.ellipse(x, y, 70 * scale, 20 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x - 34 * scale, y - 9 * scale, 32 * scale, 27 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x + 2 * scale, y - 20 * scale, 40 * scale, 36 * scale, 0, 0, Math.PI * 2);
      context.ellipse(x + 38 * scale, y - 7 * scale, 34 * scale, 25 * scale, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const visualScale = 1.65;

      if (theme === 'sunny') {
        const x = solarPhase.name === 'dawn'
          ? width * 0.32
          : width * (solarPhase.name === 'dusk' ? 0.76 : 0.78 + Math.sin(time * 0.000035) * 0.035);
        const y = solarPhase.name ? height * 0.68 : height * 0.2;
        const radius = Math.min(width, height) * 0.095 * visualScale;
        const glow = context.createRadialGradient(x, y, radius * 0.12, x, y, radius * 2.9);
        glow.addColorStop(0, solarPhase.name ? 'rgba(255, 204, 151, 0.42)' : 'rgba(255, 241, 177, 0.36)');
        glow.addColorStop(0.42, solarPhase.name ? 'rgba(255, 139, 112, 0.2)' : 'rgba(255, 208, 111, 0.13)');
        glow.addColorStop(1, 'rgba(255, 208, 111, 0)');
        context.fillStyle = glow;
        context.fillRect(x - radius * 3, y - radius * 3, radius * 6, radius * 6);
        context.beginPath();
        context.arc(x, y, radius * 0.43, 0, Math.PI * 2);
        context.fillStyle = 'rgba(255, 244, 197, 0.88)';
        context.shadowColor = 'rgba(255, 225, 151, 0.8)';
        context.shadowBlur = 34;
        context.fill();
        context.shadowBlur = 0;
        const cloudColor = solarPhase.name ? '#ffd8c2' : '#fff8e7';
        drawCloud(width * 0.23 + Math.sin(time * 0.00005) * 34, height * 0.3, 0.72 * visualScale, 0.32, cloudColor);
        drawCloud(width * 0.58 - Math.sin(time * 0.00004) * 28, height * 0.13, 0.48 * visualScale, 0.2, cloudColor);
      }

      if (theme === 'cloudy' || hasClouds) {
        const cloudColors = solarPhase.name === 'dawn'
          ? ['#ffe0c8', '#e8bec2', '#fff0d9']
          : solarPhase.name === 'dusk'
            ? ['#ffd0ad', '#d8a7b9', '#ffe1c2']
            : ['#eef4f3', '#dce7e9', '#f5f5ed'];
        drawCloud(width * 0.2 + Math.sin(time * 0.00005) * 52, height * 0.22, 1.3 * visualScale, 0.28, cloudColors[0]);
        drawCloud(width * 0.72 - Math.sin(time * 0.00004) * 58, height * 0.34, 1.65 * visualScale, 0.25, cloudColors[1]);
        drawCloud(width * 1.02 + Math.sin(time * 0.000045) * 40, height * 0.16, 1.15 * visualScale, 0.2, cloudColors[2]);
        drawCloud(width * 0.43 - Math.sin(time * 0.000035) * 44, height * 0.48, 0.92 * visualScale, 0.16, cloudColors[1]);
        drawCloud(width * 0.9 + Math.sin(time * 0.00003) * 36, height * 0.54, 0.78 * visualScale, 0.14, cloudColors[0]);
      }

      if (theme === 'rain' || theme === 'storm') {
        const intensity = theme === 'storm' ? 1.75 : 1;
        context.lineWidth = (theme === 'storm' ? 1.6 : 1.15) * visualScale;
        for (const particle of particles) {
          const length = (12 + particle.speed * 8) * intensity * visualScale;
          const x = particle.x;
          const y = particle.y;
          const streak = context.createLinearGradient(x, y - length, x + 5, y);
          streak.addColorStop(0, 'rgba(218, 240, 255, 0)');
          streak.addColorStop(1, theme === 'storm' ? 'rgba(230, 245, 255, 0.62)' : 'rgba(224, 244, 255, 0.52)');
          context.strokeStyle = streak;
          context.beginPath();
          context.moveTo(x, y - length);
          context.lineTo(x + 5 * visualScale, y);
          context.stroke();
          particle.x -= (1.2 + particle.speed * 0.65) * intensity;
          particle.y += (5 + particle.speed * 3) * intensity;
          if (particle.y > height + length || particle.x < -12) {
            particle.x = Math.random() * (width + 80) + 20;
            particle.y = -length - Math.random() * height * 0.2;
          }
        }
        if (theme === 'storm' && time % 11000 < 95) {
          context.fillStyle = 'rgba(255, 249, 218, 0.2)';
          context.fillRect(0, 0, width, height);
        }
      }

      if (theme === 'snow' || theme === 'cold') {
        for (const particle of particles) {
          const size = particle.size * (theme === 'snow' ? 1 : 0.55) * visualScale;
          context.beginPath();
          context.arc(particle.x, particle.y, size, 0, Math.PI * 2);
          context.fillStyle = theme === 'snow'
            ? `rgba(255, 255, 255, ${0.35 + particle.size * 0.18})`
            : `rgba(211, 241, 255, ${0.2 + particle.size * 0.12})`;
          context.shadowColor = '#e7f7ff';
          context.shadowBlur = theme === 'snow' ? 8 : 5;
          context.fill();
          context.shadowBlur = 0;
          particle.phase += 0.018 * particle.speed;
          particle.x += Math.sin(particle.phase) * (theme === 'snow' ? 0.7 : 2.2) + particle.drift * 0.25;
          particle.y += particle.speed * (theme === 'snow' ? 0.72 : 0.32);
          if (particle.y > height + 8) {
            particle.y = -8;
            particle.x = Math.random() * width;
          }
          if (particle.x < -8) particle.x = width + 8;
          if (particle.x > width + 8) particle.x = -8;
        }
      }

      if (theme === 'fog' || theme === 'cold') {
        for (let band = 0; band < 3; band += 1) {
          const y = height * (0.58 + band * 0.13) + Math.sin(time * 0.00025 + band) * 18;
          const mistHeight = 45 * visualScale;
          const mist = context.createLinearGradient(0, y - mistHeight, 0, y + mistHeight);
          mist.addColorStop(0, 'rgba(235, 244, 242, 0)');
          mist.addColorStop(0.5, theme === 'cold' ? 'rgba(213, 237, 248, 0.1)' : 'rgba(238, 244, 239, 0.18)');
          mist.addColorStop(1, 'rgba(235, 244, 242, 0)');
          context.fillStyle = mist;
          context.fillRect(0, y - mistHeight, width, mistHeight * 2);
        }
      }

      if (theme === 'night') {
        for (const particle of particles.slice(0, 50)) {
          const alpha = 0.28 + (Math.sin(time * 0.001 + particle.phase) + 1) * 0.22;
          context.beginPath();
          context.arc(particle.x, particle.y * 0.72, particle.size * 0.65 * visualScale, 0, Math.PI * 2);
          context.fillStyle = `rgba(231, 244, 255, ${alpha})`;
          context.fill();
        }
        const moonX = width * 0.78;
        const moonY = height * 0.2;
        context.beginPath();
        context.arc(moonX, moonY, 31 * visualScale, 0, Math.PI * 2);
        context.fillStyle = 'rgba(240, 244, 222, 0.82)';
        context.shadowColor = 'rgba(218, 236, 255, 0.55)';
        context.shadowBlur = 34;
        context.fill();
        context.shadowBlur = 0;
      }

      if (windSpeed >= 15) {
        const angle = ((windDirection + 180) % 360) * (Math.PI / 180);
        const windX = Math.sin(angle);
        const windY = -Math.cos(angle);
        const windStrength = Math.min(windSpeed / 30, 1.8);
        context.lineCap = 'round';
        for (const particle of particles.slice(0, 55)) {
          const length = (30 + particle.size * 24) * visualScale * (0.8 + windStrength * 0.25);
          const startX = particle.x;
          const startY = particle.y;
          const endX = startX + windX * length;
          const endY = startY + windY * length;
          const breeze = Math.sin(time * 0.001 + particle.phase) * 8;
          const trail = context.createLinearGradient(startX, startY, endX, endY);
          trail.addColorStop(0, 'rgba(224, 241, 249, 0)');
          trail.addColorStop(0.55, 'rgba(224, 241, 249, 0.18)');
          trail.addColorStop(1, 'rgba(245, 251, 255, 0.48)');
          context.strokeStyle = trail;
          context.lineWidth = (0.8 + particle.size * 0.25) * visualScale;
          context.beginPath();
          context.moveTo(startX, startY);
          context.quadraticCurveTo(
            startX + windX * length * 0.5 - windY * breeze,
            startY + windY * length * 0.5 + windX * breeze,
            endX,
            endY,
          );
          context.stroke();
          particle.x += windX * particle.speed * (0.8 + windStrength * 0.35);
          particle.y += windY * particle.speed * (0.8 + windStrength * 0.35);
          if (particle.x < -100 || particle.x > width + 100 || particle.y < -100 || particle.y > height + 100) {
            particle.x = Math.random() * width;
            particle.y = Math.random() * height;
          }
        }
      }
    };

    resize();
    draw();
    const animate = (time) => {
      draw(time);
      frameId = window.requestAnimationFrame(animate);
    };
    if (!reducedMotion) frameId = window.requestAnimationFrame(animate);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, [theme, windSpeed, windDirection, solarPhase.name, solarPhase.strength, hasClouds]);

  return <canvas ref={canvasRef} className="weather-atmosphere" aria-hidden="true" />;
}

function WeatherMap({ location, mapUrl, currentAlert, alerts }) {
  const [weatherMapEnabled, setWeatherMapEnabled] = useState(false);
  const [activeLayer, setActiveLayer] = useState('');
  const [tileError, setTileError] = useState(false);
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  useEffect(() => {
    api.get('/weather/map/status')
      .then((response) => {
        const enabled = response.data.weatherMapEnabled;
        setWeatherMapEnabled(enabled);
        if (enabled) setActiveLayer('precipitation_new');
      })
      .catch(() => setWeatherMapEnabled(false));
  }, []);

  const baseUrl = api.defaults.baseURL.replace(/\/$/, '');
  const currentAlertColor = currentAlert?.severity === 'alta' ? '#f05b5b' : '#f4b942';

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return <div className="map-unavailable">No hay coordenadas para mostrar el mapa.</div>;
  }

  return (
    <div className="map-card">
      <div className="map-header">
        <span className="badge badge-soft">Mapa climático</span>
        <div className="map-controls">
          <label htmlFor="weather-map-layer">Capa</label>
          <select
            id="weather-map-layer"
            value={activeLayer}
            disabled={!weatherMapEnabled}
            onChange={(event) => {
              setActiveLayer(event.target.value);
              setTileError(false);
            }}
          >
            <option value="">Mapa base</option>
            <option value="precipitation_new">Precipitación</option>
            <option value="temp_new">Temperatura</option>
            <option value="wind_new">Viento</option>
            <option value="clouds_new">Nubosidad</option>
          </select>
          <a className="map-link" href={mapUrl || getMapPageUrl(location)} target="_blank" rel="noreferrer">
            Abrir mapa
          </a>
        </div>
      </div>
      <MapContainer
        key={`${latitude},${longitude}`}
        center={[latitude, longitude]}
        zoom={10}
        minZoom={1}
        maxZoom={12}
        scrollWheelZoom
        className="weather-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {activeLayer && weatherMapEnabled && (
          <TileLayer
            key={activeLayer}
            attribution='Weather data &copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>'
            url={`${baseUrl}/weather/map/${activeLayer}/{z}/{x}/{y}.png`}
            opacity={0.68}
            updateWhenIdle
            updateWhenZooming={false}
            keepBuffer={1}
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
        )}
        <Marker position={[latitude, longitude]} icon={weatherMarkerIcon}>
          <Popup>
            <strong>{location.name}, {location.country}</strong>
            {currentAlert && (
              <p className="map-popup-alert">{currentAlert.type}: {currentAlert.message}</p>
            )}
          </Popup>
        </Marker>
        {currentAlert && (
          <Circle
            center={[latitude, longitude]}
            radius={10000}
            pathOptions={{ color: currentAlertColor, fillColor: currentAlertColor, fillOpacity: 0.16 }}
          >
            <Popup>{currentAlert.type}: {currentAlert.message}</Popup>
          </Circle>
        )}
        {alerts.map((alert) => {
          const alertLatitude = Number(alert.latitude);
          const alertLongitude = Number(alert.longitude);

          if (!Number.isFinite(alertLatitude) || !Number.isFinite(alertLongitude)) return null;

          const color = alert.severity === 'alta' ? '#f05b5b' : '#f4b942';
          return (
            <Circle
              key={`saved-alert-${alert.id}`}
              center={[alertLatitude, alertLongitude]}
              radius={8000}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.12 }}
            >
              <Popup>
                <strong>{alert.city_name}: {alert.alert_type}</strong>
                <p>{alert.message}</p>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
      {!weatherMapEnabled && (
        <p className="map-note">Agrega OPENWEATHER_API_KEY a backend/.env para activar las capas meteorológicas.</p>
      )}
      {tileError && (
        <p className="map-note map-note-error">
          OpenWeatherMap no pudo cargar esta capa; puede haber un límite temporal de solicitudes o la clave no tener acceso. El mapa base y las alertas siguen disponibles.
        </p>
      )}
      <div className="map-legend">
        <span><i className="legend-dot warning" /> Alerta media</span>
        <span><i className="legend-dot critical" /> Alerta alta</span>
        <span>Los círculos muestran ubicaciones asociadas a alertas.</span>
      </div>
    </div>
  );
}

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authData, setAuthData] = useState(initialAuth);
  const [token, setToken] = useState(localStorage.getItem('clima-token') || '');
  const [city, setCity] = useState('Guatemala');
  const [weather, setWeather] = useState({
    location: {
      name: 'Guatemala',
      country: 'Guatemala',
      latitude: 14.6349,
      longitude: -90.5069,
    },
    current: {
      temperature: 28,
      humidity: 61,
      precipitation: 12,
      windSpeed: 16,
      windDirection: 135,
      feelsLike: 27,
      pressure: 1013,
      visibility: 10,
      uvIndex: 5,
      weatherLabel: 'Parcialmente nublado',
      isDay: true,
    },
    mapUrl: 'https://www.openstreetmap.org/?mlat=14.6349&mlon=-90.5069#map=10/14.6349/-90.5069',
    daily: [
      { date: 'Hoy', max: 29, min: 22, precipitation: 18, weatherLabel: 'Soleado', sunrise: '2026-10-05T05:40:00', sunset: '2026-10-05T18:25:00', uvIndex: 5 },
      { date: 'Mañana', max: 30, min: 22, precipitation: 28, weatherLabel: 'Parcialmente nublado', sunrise: '2026-10-06T05:40:00', sunset: '2026-10-06T18:24:00', uvIndex: 4 },
      { date: 'Miércoles', max: 27, min: 21, precipitation: 35, weatherLabel: 'Lluvia ligera', sunrise: '2026-10-07T05:41:00', sunset: '2026-10-07T18:23:00', uvIndex: 3 },
    ],
    alertType: 'Sin datos recientes',
  });
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeQuickView, setActiveQuickView] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState('');
  const [message, setMessage] = useState({ type: 'info', text: 'Consulta rápida del clima.' });

  useEffect(() => {
    if (token) {
      setAuthToken(token);
      localStorage.setItem('clima-token', token);
      fetchProtectedData();
    } else {
      setAuthToken(null);
      localStorage.removeItem('clima-token');
      setFavorites([]);
      setHistory([]);
      setAlerts([]);
    }
  }, [token]);

  useEffect(() => {
    const query = city.trim();

    if (!showLocationSuggestions || query.length < 2
      || (selectedLocation && getLocationLabel(selectedLocation) === query)) {
      setLocationSuggestions([]);
      setSearchingLocations(false);
      return undefined;
    }

    const controller = new AbortController();
    const debounceTimer = setTimeout(async () => {
      setSearchingLocations(true);
      setLocationSearchError('');

      try {
        const response = await api.get('/weather/locations', {
          params: { q: query },
          signal: controller.signal,
        });
        setLocationSuggestions(response.data.locations || []);
        setActiveSuggestionIndex(0);
      } catch (error) {
        if (error.code !== 'ERR_CANCELED') {
          setLocationSuggestions([]);
          setLocationSearchError('No se pudo consultar los lugares. Revisa tu conexión e intenta de nuevo.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchingLocations(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [city, selectedLocation, showLocationSuggestions]);

  const fetchProtectedData = async () => {
    try {
      const [favoritesRes, historyRes, alertsRes] = await Promise.all([
        api.get('/weather/favorites'),
        api.get('/weather/history'),
        api.get('/weather/alerts'),
      ]);

      setFavorites(favoritesRes.data || []);
      setHistory(historyRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (error) {
      console.error('Protected data error', error);
    }
  };

  const handleAuthChange = (field, value) => {
    setAuthData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const response = await api.post(endpoint, authData);

      setToken(response.data.token);
      setMessage({ type: 'success', text: response.data.message });
      setAuthData(initialAuth);
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'No se pudo completar la operación.';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (providerName) => {
    if (!firebaseAuth) {
      setMessage({ type: 'error', text: 'Configura Firebase para habilitar el inicio social.' });
      return;
    }

    setLoading(true);

    try {
      let provider;

      if (providerName === 'google') {
        provider = new GoogleAuthProvider();
      } else if (providerName === 'facebook') {
        provider = new FacebookAuthProvider();
      } else {
        provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
      }

      const result = await signInWithPopup(firebaseAuth, provider);
      const idToken = await result.user.getIdToken();
      const response = await api.post('/auth/firebase', { idToken });

      setToken(response.data.token);
      setMessage({ type: 'success', text: response.data.message });
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'No se pudo iniciar sesión con este proveedor.';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const executeWeatherSearch = async (params) => {
    setLoading(true);
    setWeather((previous) => ({
      ...previous,
      alert: null,
      alertType: 'Verificando alertas...',
    }));

    try {
      const response = await api.get('/weather/search', { params });
      const hasAlertResult = Object.prototype.hasOwnProperty.call(response.data, 'alert');
      const currentAlert = hasAlertResult ? response.data.alert : null;

      setWeather({
        ...response.data.weather,
        alertType: hasAlertResult
          ? response.data.alertType || currentAlert?.type || 'Condición normal'
          : 'Sin datos recientes',
        alert: currentAlert,
      });
      if (token) {
        await fetchProtectedData();
      }
      setMessage({ type: 'success', text: response.data.message });
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'No se pudo consultar el clima.';
      setMessage({ type: 'error', text: errorMessage });
      setWeather((prev) => ({
        ...prev,
        alert: null,
        alertType: 'Sin datos recientes',
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    setShowLocationSuggestions(false);

    const params = selectedLocation
      ? {
        name: selectedLocation.name,
        country: selectedLocation.country,
        admin1: selectedLocation.admin1,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        timezone: selectedLocation.timezone,
      }
      : { city };

    await executeWeatherSearch(params);
  };

  const handleSelectRecentSearch = async (item) => {
    setActiveQuickView('');
    setCity(item.city_name);
    setSelectedLocation(null);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    await executeWeatherSearch({ city: item.city_name });
  };

  const handleSelectFavorite = async (favorite) => {
    setActiveQuickView('');
    setCity(favorite.name);
    setSelectedLocation(null);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    await executeWeatherSearch({
      name: favorite.name,
      country: favorite.country,
      latitude: favorite.latitude,
      longitude: favorite.longitude,
    });
  };

  const handleSelectLocation = (location) => {
    setSelectedLocation(location);
    setCity(getLocationLabel(location));
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    setActiveSuggestionIndex(0);
  };

  const handleLocationKeyDown = (event) => {
    if (event.key === 'ArrowDown' && locationSuggestions.length > 0) {
      event.preventDefault();
      setShowLocationSuggestions(true);
      setActiveSuggestionIndex((index) => (index + 1) % locationSuggestions.length);
    } else if (event.key === 'ArrowUp' && locationSuggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (
        index - 1 + locationSuggestions.length
      ) % locationSuggestions.length);
    } else if (event.key === 'Enter' && showLocationSuggestions && locationSuggestions.length > 0) {
      event.preventDefault();
      handleSelectLocation(locationSuggestions[activeSuggestionIndex]);
    } else if (event.key === 'Escape') {
      setShowLocationSuggestions(false);
    }
  };

  const handleAddFavorite = async () => {
    if (!weather || !token) {
      setMessage({ type: 'error', text: 'Inicia sesión para guardar ubicaciones favoritas.' });
      return;
    }

    try {
      const payload = {
        name: weather.location.name,
        country: weather.location.country,
        latitude: weather.location.latitude,
        longitude: weather.location.longitude,
      };

      await api.post('/weather/favorites', payload);
      await fetchProtectedData();
      setMessage({ type: 'success', text: 'Ubicación guardada en favoritos.' });
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'No se pudo guardar la ubicación.';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleLogout = () => {
    setToken('');
    setWeather({
      location: { name: 'Guatemala', country: 'Guatemala', latitude: 14.6349, longitude: -90.5069 },
      current: {
        temperature: 28,
        humidity: 61,
        precipitation: 12,
        windSpeed: 16,
        windDirection: 135,
        feelsLike: 27,
        pressure: 1013,
        visibility: 10,
        uvIndex: 5,
        weatherLabel: 'Parcialmente nublado',
        isDay: true,
      },
      mapUrl: 'https://www.openstreetmap.org/?mlat=14.6349&mlon=-90.5069#map=10/14.6349/-90.5069',
      daily: [],
      alertType: 'Sin datos recientes',
    });
    setMessage({ type: 'info', text: 'Sesión cerrada.' });
  };

  const weatherIcon = getWeatherIcon(weather.current?.weatherLabel || '');
  const weatherTheme = getWeatherTheme(weather.current);
  const solarPhase = getSolarPhase(weather);
  const alertUnverified = ['Verificando alertas...', 'Sin datos recientes'].includes(weather.alertType);
  const weatherCode = Number(weather.current.weatherCode);
  const hasClouds = [1, 2, 3].includes(weatherCode)
    || String(weather.current.weatherLabel || '').toLowerCase().includes('nublado');
  const stormHours = (weather.hourly || []).filter((hour) => [95, 96, 99].includes(Number(hour.weatherCode)));
  const stormDays = (weather.daily || []).filter((day) => [95, 96, 99].includes(Number(day.weatherCode)));

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-visual">
          <div className="visual-overlay">
            <div className="brand-wrap">
              <img className="brand-logo" src="/jarvis-squad-logo.svg" alt="Logo Jarvis Squad" />
              <div>
                <p className="eyebrow">Sistema ambiental</p>
                <h1>Clima Jarvis Squad</h1>
              </div>
            </div>

            <div className="visual-stat">
              <span className="stat-label">Reporte global</span>
              <h2>+18 ciudades monitoreadas</h2>
            </div>

            <div className="main-city-card">
              <div className="weather-mini-icon">☀️</div>
              <div>
                <strong>Guatemala</strong>
                <span>28°C · Parcialmente nublado</span>
              </div>
            </div>
          </div>

          <div className="city-list">
            {cityHighlights.map((item) => (
              <div key={item.city} className="city-item">
                <span>{item.icon}</span>
                <div>
                  <strong>{item.city}</strong>
                  <small>{item.condition}</small>
                </div>
                <b>{item.temp}°C</b>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-card">
          <p className="eyebrow">Bienvenido</p>
          <h2>{authMode === 'login' ? 'Accede a tu panel climático' : 'Crea tu cuenta'}</h2>
          <p className="login-subtitle">
            Consulta pronósticos, alertas atmosféricas y tus ubicaciones favoritas en un solo lugar.
          </p>

          <div className="auth-toggle">
            <button
              type="button"
              className={authMode === 'login' ? 'chip active' : 'chip'}
              onClick={() => setAuthMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'chip active' : 'chip'}
              onClick={() => setAuthMode('register')}
            >
              Registrarme
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="card-form">
            {authMode === 'register' && (
              <label>
                <span>Nombre completo</span>
                <input
                  type="text"
                  value={authData.name}
                  onChange={(e) => handleAuthChange('name', e.target.value)}
                  placeholder="Ej. Ana García"
                />
              </label>
            )}

            <label>
              <span>Correo electrónico</span>
              <input
                type="email"
                value={authData.email}
                onChange={(e) => handleAuthChange('email', e.target.value)}
                placeholder="usuario@correo.com"
              />
            </label>

            <label>
              <span>Contraseña</span>
              <input
                type="password"
                value={authData.password}
                onChange={(e) => handleAuthChange('password', e.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Procesando...' : authMode === 'login' ? 'Entrar al panel' : 'Crear cuenta'}
            </button>
          </form>

          {authMode === 'login' && (
            <div className="social-auth">
              <div className="social-divider"><span>o continúa con</span></div>
              <button
                type="button"
                className="social-btn"
                onClick={() => handleSocialSignIn('google')}
                disabled={loading || !firebaseAuth}
              >
                <span className="provider-mark google-mark" aria-hidden="true">G</span>
                Continuar con Google
              </button>
              <button
                type="button"
                className="social-btn"
                onClick={() => handleSocialSignIn('facebook')}
                disabled={loading || !firebaseAuth}
              >
                <span className="provider-mark facebook-mark" aria-hidden="true">f</span>
                Continuar con Facebook
              </button>
              <button
                type="button"
                className="social-btn"
                onClick={() => handleSocialSignIn('apple')}
                disabled={loading || !firebaseAuth}
              >
                <span className="provider-mark apple-mark" aria-hidden="true">A</span>
                Continuar con Apple
              </button>
              {!isFirebaseConfigured && (
                <p className="social-config-note">Completa las variables Firebase del frontend y backend para habilitar estos accesos.</p>
              )}
            </div>
          )}

          {message.text && <div className={`message ${message.type}`}>{message.text}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`page-shell weather-scene theme-${weatherTheme}${solarPhase.name ? ` solar-${solarPhase.name}` : ''}`}
      style={{ '--solar-strength': solarPhase.strength }}
    >
      <WeatherAtmosphere
        theme={weatherTheme}
        windSpeed={Number(weather.current.windSpeed) || 0}
        windDirection={Number(weather.current.windDirection) || 0}
        solarPhase={solarPhase}
        hasClouds={hasClouds}
      />
      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-logo" src="/jarvis-squad-logo.svg" alt="Logo Jarvis Squad" />
          <div>
            <p className="eyebrow">Sistema ambiental</p>
            <h1>Clima Jarvis Squad</h1>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Secciones del panel">
          <a href="#dashboard-overview">Resumen</a>
          <a href="#hourly-forecast">Próximas horas</a>
          <a href="#five-day-forecast">5 días</a>
          <a href="#dashboard-overview" onClick={() => setActiveQuickView('history')}>Mi actividad</a>
        </nav>

        <div className="topbar-actions">
          <button type="button" className="secondary-btn" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="dashboard-metrics" id="dashboard-overview" aria-label="Resumen de uso">
        <article className="usage-stat">
          <span className="metric-icon">📍</span>
          <div>
            <p>Ciudad consultada</p>
            <strong>{weather.location.name}</strong>
          </div>
        </article>
        <button
          type="button"
          className={`usage-stat usage-stat-button${activeQuickView === 'history' ? ' active' : ''}`}
          onClick={() => setActiveQuickView((active) => (active === 'history' ? '' : 'history'))}
          aria-expanded={activeQuickView === 'history'}
          aria-controls="quick-view-panel"
        >
          <span className="metric-icon">🔎</span>
          <div>
            <p>Consultas recientes</p>
            <strong>{history.length}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`usage-stat usage-stat-button${activeQuickView === 'favorites' ? ' active' : ''}`}
          onClick={() => setActiveQuickView((active) => (active === 'favorites' ? '' : 'favorites'))}
          aria-expanded={activeQuickView === 'favorites'}
          aria-controls="quick-view-panel"
        >
          <span className="metric-icon">⭐</span>
          <div>
            <p>Favoritos guardados</p>
            <strong>{favorites.length}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`usage-stat usage-stat-button${activeQuickView === 'alerts' ? ' active' : ''}`}
          onClick={() => setActiveQuickView((active) => (active === 'alerts' ? '' : 'alerts'))}
          aria-expanded={activeQuickView === 'alerts'}
          aria-controls="quick-view-panel"
        >
          <span className="metric-icon">⚠️</span>
          <div>
            <p>Alertas registradas</p>
            <strong>{alerts.length}</strong>
          </div>
        </button>
      </section>

      {activeQuickView && (
        <section className="quick-view-panel" id="quick-view-panel" aria-live="polite">
          <div className="quick-view-heading">
            <div>
              <span className="section-kicker">Acceso rápido</span>
              <h2>
                {activeQuickView === 'history' && 'Consultas recientes'}
                {activeQuickView === 'favorites' && 'Ubicaciones guardadas'}
                {activeQuickView === 'alerts' && 'Sistema de alertas'}
              </h2>
            </div>
            <button
              type="button"
              className="quick-view-close"
              aria-label="Cerrar panel"
              title="Cerrar panel"
              onClick={() => setActiveQuickView('')}
            >
              ×
            </button>
          </div>

          {activeQuickView === 'history' && (
            <ul className="list-view compact quick-view-list">
              {history.length > 0 ? history.slice(0, 10).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="history-select"
                    aria-label={`Volver a buscar ${item.city_name}`}
                    onClick={() => handleSelectRecentSearch(item)}
                    disabled={loading}
                  >
                    <span><strong>{item.city_name}</strong><small>{item.alert_type}</small></span>
                    <span className="history-retry" aria-hidden="true">↻</span>
                  </button>
                </li>
              )) : <li className="empty-item">Sin historial disponible.</li>}
            </ul>
          )}

          {activeQuickView === 'favorites' && (
            <ul className="list-view compact quick-view-list">
              {favorites.length > 0 ? favorites.map((favorite) => (
                <li key={favorite.id}>
                  <button
                    type="button"
                    className="history-select"
                    aria-label={`Consultar favorito ${favorite.name}`}
                    onClick={() => handleSelectFavorite(favorite)}
                    disabled={loading}
                  >
                    <span><strong>{favorite.name}</strong><small>{favorite.country}</small></span>
                    <span className="history-retry" aria-hidden="true">↗</span>
                  </button>
                </li>
              )) : <li className="empty-item">No hay favoritos todavía.</li>}
            </ul>
          )}

          {activeQuickView === 'alerts' && (
            <ul className="list-view compact quick-view-list quick-alert-list">
              {alerts.length > 0 ? alerts.map((item) => (
                <li key={item.id} className={`saved-alert severity-${item.severity || 'media'}`}>
                  <strong>{item.alert_type}</strong>
                  <span>{item.city_name} · {item.severity || 'media'}</span>
                  {item.message && <small>{item.message}</small>}
                </li>
              )) : <li className="empty-item">Sin alertas de riesgo registradas.</li>}
            </ul>
          )}
        </section>
      )}

      <main className="dashboard-grid">
        <aside className="panel side-panel">
          <div className="panel-header">
            <span className="badge">Resumen</span>
            <h2>Estado del día</h2>
          </div>

          <div className="mini-metric-card primary">
            <span className="metric-icon">🌡️</span>
            <div>
              <p>Temperatura</p>
              <strong>{Math.round(weather.current.temperature)}°C</strong>
            </div>
          </div>

          <div className="mini-metric-card">
            <span className="metric-icon">💧</span>
            <div>
              <p>Humedad</p>
              <strong>{weather.current.humidity}%</strong>
            </div>
          </div>

          <div className="mini-metric-card">
            <span className="metric-icon">🌧️</span>
            <div>
              <p>Precipitación</p>
              <strong>{weather.current.precipitation} mm</strong>
            </div>
          </div>
        </aside>

        <section className="main-content">
          <div className="panel hero-panel">
            <div className="hero-header">
              <div>
                <span className="badge badge-soft">Pronóstico</span>
                <h2>Consulta del clima en tiempo real</h2>
                <p className="weather-greeting">
                  {weatherIcon} {getFriendlyWeatherMessage(weatherTheme, weather.location.name)}
                </p>
              </div>
              <div className="status-chip">🟢 Operativo</div>
            </div>

            <form className="search-box" onSubmit={handleSearch}>
              <div className="location-search">
                <input
                  type="text"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setSelectedLocation(null);
                    setShowLocationSuggestions(true);
                  }}
                  onFocus={() => setShowLocationSuggestions(true)}
                  onBlur={() => setShowLocationSuggestions(false)}
                  onKeyDown={handleLocationKeyDown}
                  placeholder="Escribe una ciudad o lugar"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showLocationSuggestions && city.trim().length >= 2}
                  aria-controls="location-suggestions"
                  aria-activedescendant={locationSuggestions[activeSuggestionIndex]
                    ? `location-option-${locationSuggestions[activeSuggestionIndex].id}`
                    : undefined}
                />
                {showLocationSuggestions && city.trim().length >= 2 && (
                  <div className="location-suggestions" id="location-suggestions" role="listbox">
                    {searchingLocations ? (
                      <p className="suggestion-status">Buscando lugares...</p>
                    ) : locationSearchError ? (
                      <p className="suggestion-status">{locationSearchError}</p>
                    ) : locationSuggestions.length > 0 ? (
                      locationSuggestions.map((location, index) => (
                        <button
                          key={`${location.id}-${location.latitude}-${location.longitude}`}
                          id={`location-option-${location.id}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeSuggestionIndex}
                          className={index === activeSuggestionIndex ? 'location-option active' : 'location-option'}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelectLocation(location)}
                        >
                          <span className="location-pin" aria-hidden="true">📍</span>
                          <span>
                            <strong>{location.name}</strong>
                            <small>{[location.admin1, location.country].filter(Boolean).join(', ')}</small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="suggestion-status">No encontramos lugares. Prueba otra escritura.</p>
                    )}
                  </div>
                )}
              </div>
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {message.text && <div className={`message ${message.type}`}>{message.text}</div>}
          </div>

          <div className="panel weather-panel" id="weather-panel">
            <div className="weather-header">
              <div>
                <p className="eyebrow">Ubicación actual</p>
                <h3>
                  {weather.location.name}, {weather.location.country}
                </h3>
              </div>
              <LocalClock timezone={weather.location.timezone} />
              <button type="button" className="secondary-btn" onClick={handleAddFavorite}>
                Guardar favorito
              </button>
            </div>

            <div className="weather-summary">
              <div className="weather-main">
                  <div className="main-weather-icon">{weatherIcon}</div>
                <div>
                  <span className="temperature">{Math.round(weather.current.temperature)}°C</span>
                  <p>{weather.current.weatherLabel}</p>
                </div>
              </div>

              <div className="weather-stats">
                <div>
                  <span>Humedad</span>
                  <strong>{weather.current.humidity}%</strong>
                </div>
                <div>
                  <span>Precipitación</span>
                  <strong>{weather.current.precipitation} mm</strong>
                </div>
                <div>
                  <span>Viento</span>
                  <strong>{weather.current.windSpeed} km/h</strong>
                </div>
              </div>
            </div>

            <section className="sun-moon-grid" aria-label="Datos solares y lunares">
              <article className="astro-panel solar-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">Ciclo del día</span>
                    <h3>Salida y puesta del sol</h3>
                  </div>
                  <span className="astro-date">{getWeekday(weather.daily[0]?.date)}</span>
                </div>
                <SolarChart day={weather.daily[0]} timezone={weather.location.timezone} />
              </article>

              <article className="astro-panel lunar-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">Calendario lunar</span>
                    <h3>Fases y paso de la luna</h3>
                  </div>
                  <span className="moon-current-phase">
                    {weather.daily[0]?.moonPhase !== null && weather.daily[0]?.moonPhase !== undefined
                      ? getMoonPhase(weather.daily[0].moonPhase).icon
                      : '☾'}
                  </span>
                </div>
                <div className="moon-calendar">
                  {weather.daily.length > 0 ? weather.daily.map((day) => {
                    const phase = day.moonPhase === null || day.moonPhase === undefined
                      ? null
                      : getMoonPhase(day.moonPhase);
                    return (
                      <article className="moon-day" key={`moon-${day.date}`}>
                        <span className="moon-day-name">{getWeekday(day.date).slice(0, 3)}</span>
                        <span className="moon-phase-icon" aria-hidden="true">{phase?.icon || '☾'}</span>
                        <strong>{phase?.label || 'Sin datos'}</strong>
                        <small>Sale {formatTime(day.moonrise)}</small>
                        <small>Se oculta {formatTime(day.moonset)}</small>
                      </article>
                    );
                  }) : <p className="forecast-empty">Busca una ubicación para cargar el calendario lunar.</p>}
                </div>
              </article>
            </section>

            <section className="forecast-section" id="hourly-forecast">
              <div className="section-heading forecast-heading">
                <div>
                  <span className="section-kicker">Pronóstico detallado</span>
                  <h3>Próximas 8 horas</h3>
                </div>
                <span className="section-note">Datos por hora local</span>
              </div>
              <div className="hourly-grid">
                {weather.hourly?.length ? weather.hourly.map((hour) => {
                  const isStorm = [95, 96, 99].includes(Number(hour.weatherCode));
                  return (
                    <article className={`hour-card${isStorm ? ' hour-card-storm' : ''}`} key={hour.time}>
                      <div className="hour-card-heading">
                        <time dateTime={hour.time}>{formatTime(hour.time)}</time>
                        <span>{getWeekday(hour.time).slice(0, 3)}</span>
                      </div>
                      <div className="hour-condition">
                        <span className="hour-weather-icon" aria-hidden="true">{getWeatherIcon(hour.weatherLabel)}</span>
                        <span>{hour.weatherLabel}</span>
                      </div>
                      <strong className="hour-temperature">{Math.round(hour.temperature)}°</strong>
                      {isStorm && <p className="hour-storm">⚡ Tormenta prevista</p>}
                      <dl className="hour-data-grid">
                        <div><dt>Sensación</dt><dd>{Math.round(hour.feelsLike)}°C</dd></div>
                        <div><dt>Humedad</dt><dd>{hour.humidity}%</dd></div>
                        <div><dt>Lluvia</dt><dd>{Number(hour.precipitation).toFixed(1)} mm · {hour.precipitationProbability}%</dd></div>
                        <div><dt>Viento</dt><dd>{Math.round(hour.windSpeed)} km/h {getWindDirection(hour.windDirection)}</dd></div>
                        <div><dt>Presión</dt><dd>{Math.round(hour.pressure)} hPa</dd></div>
                        <div><dt>Visibilidad</dt><dd>{hour.visibility} km</dd></div>
                        <div><dt>Índice UV</dt><dd>{Number(hour.uvIndex).toFixed(1)}</dd></div>
                        <div><dt>Periodo</dt><dd>{hour.isDay ? 'Día' : 'Noche'}</dd></div>
                      </dl>
                    </article>
                  );
                }) : <p className="forecast-empty">Busca una ciudad para consultar el pronóstico horario.</p>}
              </div>
            </section>

            <WeatherMap
              location={weather.location}
              mapUrl={weather.mapUrl}
              currentAlert={weather.alert}
              alerts={alerts}
            />

            <div className="details-grid">
              <div className="detail-card">
                <span>🌡️ Sensación</span>
                <strong>{Math.round(weather.current.feelsLike)}°C</strong>
              </div>
              <div className="detail-card">
                <span>🧭 Viento</span>
                <strong>{Math.round(weather.current.windSpeed)} km/h</strong>
              </div>
              <div className="detail-card">
                <span>📈 Presión</span>
                <strong>{Math.round(weather.current.pressure)} hPa</strong>
              </div>
              <div className="detail-card">
                <span>👁️ Visibilidad</span>
                <strong>{weather.current.visibility || 0} km</strong>
              </div>
              <div className="detail-card">
                <span>☀️ UV</span>
                <strong>{Number(weather.current.uvIndex || 0).toFixed(1)}</strong>
              </div>
              <div className="detail-card">
                <span>🌅 Amanecer</span>
                <strong>{formatTime(weather.daily[0]?.sunrise)}</strong>
              </div>
              <div className="detail-card">
                <span>🌇 Atardecer</span>
                <strong>{formatTime(weather.daily[0]?.sunset)}</strong>
              </div>
              <div className="detail-card">
                <span>🏷️ Día</span>
                <strong>{weather.current.isDay ? 'Diurno' : 'Nocturno'}</strong>
              </div>
            </div>

            <div className={`weather-alert-current ${weather.alert ? `severity-${weather.alert.severity}` : alertUnverified ? 'severity-unknown' : 'severity-normal'}`}>
              <span aria-hidden="true">{weather.alert ? '⚠' : alertUnverified ? '?' : '✓'}</span>
              <div>
                <strong>
                  {weather.alert?.type || (alertUnverified ? 'Estado de alertas sin verificar' : 'Sin alertas activas')}
                </strong>
                <p>
                  {weather.alert?.message || (alertUnverified
                    ? 'La alerta de la búsqueda actual aún no se pudo confirmar.'
                    : `Condiciones normales en ${weather.location.name}.`)}
                </p>
              </div>
            </div>

            {(stormHours.length > 0 || stormDays.length > 0) && (
              <aside className="storm-forecast" role="status">
                <span className="storm-forecast-icon" aria-hidden="true">⚡</span>
                <div>
                  <strong>Tormenta en el pronóstico</strong>
                  <p>
                    {stormHours.length > 0
                      ? `Se esperan condiciones de tormenta a las ${stormHours.map((hour) => formatTime(hour.time)).join(', ')}.`
                      : `Se esperan tormentas ${stormDays.map((day) => getWeekday(day.date).toLocaleLowerCase('es-GT')).join(' y ')}.`}
                  </p>
                </div>
              </aside>
            )}

            <section className="forecast-section" id="five-day-forecast">
              <div className="section-heading forecast-heading">
                <div>
                  <span className="section-kicker">Tendencia extendida</span>
                  <h3>Pronóstico de 5 días</h3>
                </div>
                <span className="section-note">Máximas, mínimas y condiciones</span>
              </div>
              <div className="daily-grid">
                {weather.daily.length > 0 ? weather.daily.slice(0, 5).map((day) => {
                  const isStorm = [95, 96, 99].includes(Number(day.weatherCode));
                  return (
                    <article className={`daily-card${isStorm ? ' daily-card-storm' : ''}`} key={day.date}>
                      <div className="daily-card-heading">
                        <div>
                          <span>{getWeekday(day.date)}</span>
                          <time dateTime={day.date}>{formatDate(day.date)}</time>
                        </div>
                        <span className="daily-weather-icon" aria-hidden="true">{getWeatherIcon(day.weatherLabel)}</span>
                      </div>
                      <strong className="daily-condition">{day.weatherLabel}</strong>
                      {isStorm && <p className="hour-storm">⚡ Tormenta prevista</p>}
                      <div className="daily-temperatures">
                        <strong>{Math.round(day.max)}°</strong>
                        <span>{Math.round(day.min)}°</span>
                        <small>Sensación máx. {day.feelsLikeMax === null || day.feelsLikeMax === undefined ? 'N/D' : `${Math.round(day.feelsLikeMax)}°`}</small>
                      </div>
                      <dl className="daily-data-grid">
                        <div><dt>Humedad media</dt><dd>{day.humidity === null || day.humidity === undefined ? 'N/D' : `${day.humidity}%`}</dd></div>
                        <div><dt>Lluvia</dt><dd>{day.precipitation}% · {day.precipitationSum === null || day.precipitationSum === undefined ? 'N/D' : `${Number(day.precipitationSum).toFixed(1)} mm`}</dd></div>
                        <div><dt>Viento máx.</dt><dd>{day.windSpeedMax === null || day.windSpeedMax === undefined ? 'N/D' : `${Math.round(day.windSpeedMax)} km/h ${getWindDirection(day.windDirection)}`}</dd></div>
                        <div><dt>Índice UV</dt><dd>{Number(day.uvIndex || 0).toFixed(1)}</dd></div>
                        <div><dt>Amanecer</dt><dd>{formatTime(day.sunrise)}</dd></div>
                        <div><dt>Atardecer</dt><dd>{formatTime(day.sunset)}</dd></div>
                      </dl>
                    </article>
                  );
                }) : <p className="forecast-empty">Busca una ciudad para consultar los próximos cinco días.</p>}
              </div>
            </section>
          </div>
        </section>

      </main>
    </div>
  );
}

export default App;
