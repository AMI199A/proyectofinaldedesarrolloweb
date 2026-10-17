import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const getFirebaseAdminAuth = () => {
  const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountValue) {
    const error = new Error('El inicio social no está configurado en el servidor.');
    error.statusCode = 503;
    throw error;
  }

  const serviceAccount = JSON.parse(serviceAccountValue);
  serviceAccount.private_key = serviceAccount.private_key?.replace(/\\n/g, '\n');
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });

  return getAuth(app);
};