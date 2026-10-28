import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import keycloak from '../keycloak';
import { setAuthToken } from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    keycloak
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((auth) => {
        if (!isMounted) return;
        setAuthenticated(Boolean(auth));

        if (auth && keycloak.token) {
          setToken(keycloak.token);
          setAuthToken(keycloak.token);

          const parsed = keycloak.tokenParsed || {};
          const clientId = import.meta.env.VITE_KC_CLIENT_ID || 'jarvis-web';
          const roles = Array.from(
            new Set([
              ...(parsed.realm_access?.roles || []),
              ...(parsed.resource_access?.[clientId]?.roles || []),
            ]),
          );

          setUser({
            id: parsed.sub,
            username: parsed.preferred_username,
            name: parsed.name || parsed.preferred_username || 'Usuario',
            email: parsed.email || '',
            roles,
          });
        } else {
          setToken(null);
          setUser(null);
          setAuthToken(null);
        }
      })
      .catch((err) => {
        console.error('Error inicializando Keycloak:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    keycloak.onTokenExpired = () => {
      keycloak
        .updateToken(30)
        .then((refreshed) => {
          if (refreshed && keycloak.token) {
            setToken(keycloak.token);
            setAuthToken(keycloak.token);
          }
        })
        .catch(() => {
          console.warn('El token de Keycloak expiró y no se pudo renovar.');
        });
    };

    keycloak.onAuthLogout = () => {
      setAuthenticated(false);
      setUser(null);
      setToken(null);
      setAuthToken(null);
    };

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback((options = {}) => {
    return keycloak.login({
      redirectUri: window.location.origin,
      ...options,
    });
  }, []);

  const register = useCallback((options = {}) => {
    return keycloak.register({
      redirectUri: window.location.origin,
      ...options,
    });
  }, []);

  const logout = useCallback((options = {}) => {
    setAuthToken(null);
    return keycloak.logout({
      redirectUri: window.location.origin,
      ...options,
    });
  }, []);

  const hasRole = useCallback(
    (role) => {
      if (!role) return false;
      const userRoles = user?.roles || [];
      return (
        userRoles.includes(role) ||
        (keycloak.hasRealmRole && keycloak.hasRealmRole(role)) ||
        (keycloak.hasResourceRole && keycloak.hasResourceRole(role))
      );
    },
    [user],
  );

  const value = useMemo(
    () => ({
      authenticated,
      user,
      token,
      loading,
      login,
      register,
      logout,
      hasRole,
      keycloak,
    }),
    [authenticated, user, token, loading, login, register, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};

export default AuthContext;

