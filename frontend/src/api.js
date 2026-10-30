import axios from 'axios';
import keycloak from './keycloak';

// Detección dinámica de la URL del Backend:
// Si VITE_API_URL apunta a una IP o dominio específico, se respeta.
// Si apunta a localhost o está vacía y el navegador accede desde una IP pública/remota (ej. Azure),
// se deduce dinámicamente con la IP/host del cliente en el puerto 4000.
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
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
