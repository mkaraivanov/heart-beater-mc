/**
 * Heart Beater MC — Express server entry point.
 * Runs on port 3001 (or PORT env var).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import rulesRouter from './routes/rules';
import authRouter from './routes/auth';
import spotifyRouter from './routes/spotify';
import bpmRouter from './routes/bpm';
import streamRouter from './routes/stream';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use('/api/rules', rulesRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/bpm', bpmRouter);
app.use('/api/stream', streamRouter);
app.use('/auth', authRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Heart Beater MC server running on http://localhost:${PORT}`);
  console.log(`Spotify auth: http://localhost:${PORT}/auth/spotify/login`);
});

export default app;
