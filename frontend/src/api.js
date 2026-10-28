import axios from 'axios';
import keycloak from './keycloak';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
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
