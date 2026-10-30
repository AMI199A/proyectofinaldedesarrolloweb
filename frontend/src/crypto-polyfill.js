import { sha256 } from 'js-sha256';

// Polyfill para Web Crypto API en contextos no seguros (HTTP sobre IP pública)
// En navegadores modernos (Chrome, Firefox, Edge, Safari), crypto.randomUUID y crypto.subtle
// están deshabilitados cuando la página se sirve por HTTP en una IP pública (isSecureContext = false).
// Este polyfill provee randomUUID y crypto.subtle.digest('SHA-256') para permitir que keycloak-js funcione sobre HTTP.

export function ensureWebCrypto() {
  const globalObj = typeof window !== 'undefined' ? window : globalThis;

  if (!globalObj.crypto) {
    globalObj.crypto = {};
  }

  // 1. Polyfill para getRandomValues si fuera necesario
  if (typeof globalObj.crypto.getRandomValues !== 'function') {
    globalObj.crypto.getRandomValues = function (array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    };
  }

  // 2. Polyfill para crypto.randomUUID
  const generateUUID = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
      const num = Number(c);
      const rnd = globalObj.crypto.getRandomValues(new Uint8Array(1))[0];
      return (num ^ (rnd & (15 >> (num / 4)))).toString(16);
    });
  };

  if (typeof globalObj.crypto.randomUUID !== 'function') {
    try {
      Object.defineProperty(globalObj.crypto, 'randomUUID', {
        value: generateUUID,
        writable: true,
        configurable: true,
      });
    } catch (_) {
      globalObj.crypto.randomUUID = generateUUID;
    }
  }

  if (typeof Crypto !== 'undefined' && Crypto.prototype && typeof Crypto.prototype.randomUUID !== 'function') {
    try {
      Crypto.prototype.randomUUID = generateUUID;
    } catch (_) {}
  }

  // 3. Polyfill para crypto.subtle.digest('SHA-256', data)
  const subtleDigest = async (algorithm, data) => {
    return sha256.arrayBuffer(data);
  };

  if (!globalObj.crypto.subtle) {
    const subtleObj = { digest: subtleDigest };
    try {
      Object.defineProperty(globalObj.crypto, 'subtle', {
        value: subtleObj,
        writable: true,
        configurable: true,
      });
    } catch (_) {
      globalObj.crypto.subtle = subtleObj;
    }
  } else if (typeof globalObj.crypto.subtle.digest !== 'function') {
    globalObj.crypto.subtle.digest = subtleDigest;
  }

  if (typeof Crypto !== 'undefined' && Crypto.prototype) {
    try {
      if (!Crypto.prototype.subtle) {
        Object.defineProperty(Crypto.prototype, 'subtle', {
          value: { digest: subtleDigest },
          writable: true,
          configurable: true,
        });
      }
    } catch (_) {}
  }
}

// Ejecutar inmediatamente al importar el módulo
ensureWebCrypto();

export default ensureWebCrypto;
