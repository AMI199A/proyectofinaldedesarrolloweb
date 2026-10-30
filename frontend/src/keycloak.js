import './crypto-polyfill';
import Keycloak from 'keycloak-js';

// Detección dinámica de la URL de Keycloak:
// Si VITE_KC_URL apunta a una IP o dominio específico, se respeta.
// Si apunta a localhost o está vacía y el navegador accede desde una IP pública/remota (ej. Azure),
// se deduce dinámicamente con la IP/host del cliente en el puerto 8081.
const getKcUrl = () => {
  const envUrl = import.meta.env.VITE_KC_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `${window.location.protocol}//${window.location.hostname}:8081`;
  }
  return envUrl || 'http://localhost:8081';
};

const keycloakConfig = {
  url: getKcUrl(),
  realm: import.meta.env.VITE_KC_REALM || 'jarvis',
  clientId: import.meta.env.VITE_KC_CLIENT_ID || 'jarvis-web',
};

const keycloak = new Keycloak(keycloakConfig);

export default keycloak;
