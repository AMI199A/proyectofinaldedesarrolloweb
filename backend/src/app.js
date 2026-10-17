import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import weatherRoutes from './routes/weatherRoutes.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'clima-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/weather', weatherRoutes);

app.use(errorHandler);

export default app;
