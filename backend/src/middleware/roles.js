/**
 * Middleware para validar que el usuario autenticado posee uno o varios roles requeridos.
 * @param  {...string} requiredRoles - Roles requeridos (por ejemplo: 'admin', 'user')
 */
export const requireRole = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !Array.isArray(req.user.roles)) {
      return res.status(401).json({ message: 'Usuario no autenticado o sin roles asignados.' });
    }

    const hasPermission = requiredRoles.some((role) => req.user.roles.includes(role));

    if (!hasPermission) {
      return res.status(403).json({
        message: 'Acceso denegado: rol insuficiente.',
        requiredRoles,
        userRoles: req.user.roles,
      });
    }

    return next();
  };
};

export default requireRole;

