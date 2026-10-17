import { Router } from 'express';
import authenticate from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, async (req, res, next) => {
  const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';

  if (question.length < 2 || question.length > 2000) {
    return res.status(400).json({ message: 'Escribe una pregunta de entre 2 y 2000 caracteres.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: 'La IA no está configurada. Agrega GEMINI_API_KEY al entorno del backend.' });
  }

  const current = req.body.weather && typeof req.body.weather === 'object'
    ? req.body.weather
    : {};
  const context = {
    location: String(current.location || '').slice(0, 150),
    temperature: Number.isFinite(Number(current.temperature)) ? Number(current.temperature) : null,
    humidity: Number.isFinite(Number(current.humidity)) ? Number(current.humidity) : null,
    precipitation: Number.isFinite(Number(current.precipitation)) ? Number(current.precipitation) : null,
    condition: String(current.condition || '').slice(0, 100),
  };
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'Eres un asistente meteorológico. Responde en español, con recomendaciones prácticas basadas en los datos entregados. Distingue claramente los datos observados de cualquier inferencia y no inventes pronósticos.',
            }],
          },
          contents: [{
            role: 'user',
            parts: [{
              text: `Datos actuales: ${JSON.stringify(context)}\n\nPregunta: ${question}`,
            }],
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const error = new Error(
        response.status === 429
          ? 'Gemini alcanzó el límite de solicitudes. Intenta de nuevo más tarde.'
          : detail.error?.message || 'Gemini no pudo generar una respuesta.',
      );
      error.statusCode = response.status === 429 ? 429 : 502;
      throw error;
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!answer) {
      const error = new Error('Gemini devolvió una respuesta vacía.');
      error.statusCode = 502;
      throw error;
    }

    return res.json({ answer, model });
  } catch (error) {
    if (error.name === 'AbortError') {
      error.statusCode = 504;
      error.message = 'Gemini tardó demasiado en responder. Intenta de nuevo.';
    }
    return next(error);
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
