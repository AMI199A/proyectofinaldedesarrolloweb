import Keycloak from 'keycloak-js';

const keycloakConfig = {
  url: import.meta.env.VITE_KC_URL || 'http://localhost:8081',
  realm: import.meta.env.VITE_KC_REALM || 'jarvis',
  clientId: import.meta.env.VITE_KC_CLIENT_ID || 'jarvis-web',
};

const keycloak = new Keycloak(keycloakConfig);

export default keycloak;

