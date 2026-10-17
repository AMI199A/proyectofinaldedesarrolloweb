import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

export default authenticate;
