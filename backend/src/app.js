import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import weatherRoutes from './routes/weatherRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import iotRoutes from './routes/iotRoutes.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir solicitudes sin origin (como apps móviles, curl, o Docker interno)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some((o) => origin.startsWith(o))) {
        return callback(null, true);
      }
      return callback(null, true); // Permisivo en desarrollo para evitar bloqueos
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-key', 'x-ingest-key'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'clima-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/iot', iotRoutes);

app.use(errorHandler);

export default app;
