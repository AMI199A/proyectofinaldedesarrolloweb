import axios from 'axios';
import keycloak from './keycloak';

// Detección dinámica de la URL del Backend:
// En producción servida por Nginx o en desarrollo con Vite proxy, se utiliza la ruta relativa '/api'.
// Esto garantiza que todas las peticiones viajen a través del mismo puerto del Frontend (5173 / 80)
// y Nginx las reenvíe internamente a http://backend:4000/api, evitando bloqueos por puertos cerrados
// en el firewall / NSG de Azure (ERR_CONNECTION_TIMED_OUT en puerto 4000).
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    // Si se especificó explícitamente una URL remota completa que no sea localhost
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1') && !envUrl.startsWith('/')) {
      return envUrl;
    }
    return '/api';
  }
  return envUrl || 'http://localhost:4000/api';
};

const api = axios.create({
  baseURL: getApiUrl(),
});

api.interceptors.request.use(
  async (config) => {
    if (keycloak && keycloak.token) {
      try {
        // Renueva el token si expirará en menos de 30 segundos
        await keycloak.updateToken(30);
      } catch (err) {
        // En caso de fallo de refresco, continúa con el token disponible
      }
      config.headers.Authorization = `Bearer ${keycloak.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }
  delete api.defaults.headers.common.Authorization;
};

export default api;
