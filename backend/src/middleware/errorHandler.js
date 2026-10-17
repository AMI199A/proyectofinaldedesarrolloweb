export const errorHandler = (err, req, res, next) => {
  console.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    message,
    error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export default errorHandler;
