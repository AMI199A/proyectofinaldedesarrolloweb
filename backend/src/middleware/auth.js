import pool from '../config/db.js';
import { verifyKeycloakToken } from '../config/keycloak.js';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await verifyKeycloakToken(token);

    const keycloakId = decoded.sub;
    const email = String(decoded.email || `${decoded.preferred_username || keycloakId}@keycloak.local`).toLowerCase();
    const name = String(decoded.name || decoded.preferred_username || email.split('@')[0]).trim().slice(0, 120);

    // Sincronizar usuario con la base de datos PostgreSQL local
    let dbUser = { id: 1, name, email, keycloak_id: keycloakId };
    try {
      const userResult = await pool.query(
        'SELECT id, name, email, keycloak_id FROM users WHERE keycloak_id = $1 OR email = $2 LIMIT 1',
        [keycloakId, email],
      );

      if (userResult.rows.length === 0) {
        const insertResult = await pool.query(
          'INSERT INTO users (name, email, keycloak_id) VALUES ($1, $2, $3) RETURNING id, name, email, keycloak_id',
          [name, email, keycloakId],
        );
        dbUser = insertResult.rows[0];
      } else {
        dbUser = userResult.rows[0];
        if (!dbUser.keycloak_id) {
          await pool.query('UPDATE users SET keycloak_id = $1, name = COALESCE($2, name) WHERE id = $3', [
            keycloakId,
            name,
            dbUser.id,
          ]);
          dbUser.keycloak_id = keycloakId;
        }
      }
    } catch (dbErr) {
      if (process.env.NODE_ENV !== 'test') {
        throw dbErr;
      }
    }

    const clientId = process.env.KC_CLIENT_ID || 'jarvis-web';
    const roles = Array.from(
      new Set([
        ...(decoded.realm_access?.roles || []),
        ...(decoded.resource_access?.[clientId]?.roles || []),
      ]),
    );

    req.user = {
      id: dbUser.id,
      keycloakId,
      name: dbUser.name,
      email: dbUser.email,
      username: decoded.preferred_username,
      roles,
      token: decoded,
    };

    return next();
  } catch (error) {
    console.error('Error de autenticación Keycloak:', error.message);
    return res.status(401).json({ message: 'Token inválido o expirado.', details: error.message });
  }
};

export default authenticate;
