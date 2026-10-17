import 'dotenv/config';
import app from './app.js';
import { testDbConnection } from './config/db.js';
import { migrateAuthSchema } from './config/migrations.js';

const port = Number(process.env.PORT || 4000);

const startServer = async () => {
  const dbReady = await testDbConnection();

  if (dbReady) {
    console.log('PostgreSQL connection success.');
    await migrateAuthSchema();
    console.log('Authentication schema is up to date.');
  } else {
    console.log('Application running without a PostgreSQL connection for now.');
  }

  app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
};

startServer();
