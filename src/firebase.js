import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredConfigKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];
const toEnvironmentVariable = (key) =>
  `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;

export const missingFirebaseConfig = requiredConfigKeys
  .filter((key) => !firebaseConfig[key]?.trim())
  .map(toEnvironmentVariable);
export const firebaseConfigured = missingFirebaseConfig.length === 0;

const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const analytics = app
  ? isSupported().then((supported) => (supported ? getAnalytics(app) : null))
  : Promise.resolve(null);

export async function manageStudent(action, data) {
  if (!auth) {
    throw Object.assign(new Error('Firebase is not configured.'), { code: 'firebase/not-configured' });
  }

  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error('Sign in as an admin to manage students.'), { code: 'unauthenticated' });
  }

  const endpoint = import.meta.env.DEV
    ? 'http://127.0.0.1:8787/api/students'
    : '/api/students';
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...data }),
    });
  } catch {
    throw Object.assign(
      new Error(import.meta.env.DEV
        ? 'The local Spark admin service is not running. Start it in a second terminal and try again.'
        : 'The student management API is unavailable. Check your Vercel deployment and server environment variables.'),
      { code: 'local-service/unavailable' },
    );
  }

  const result = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(result.message || 'Could not manage this student.'), { code: result.code });
  }
  return result;
}

export async function createStudent(data) {
  if (!auth) {
    throw Object.assign(new Error('Firebase is not configured.'), { code: 'firebase/not-configured' });
  }

  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error('Sign in as an admin to add students.'), { code: 'unauthenticated' });
  }

  const endpoint = import.meta.env.DEV
    ? 'http://127.0.0.1:8787/api/students'
    : '/api/students';
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw Object.assign(
      new Error(import.meta.env.DEV
        ? 'The local Spark admin service is not running. Start it in a second terminal and try again.'
        : 'The student creation API is unavailable. Check your Vercel deployment and server environment variables.'),
      { code: 'local-service/unavailable' },
    );
  }

  const result = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(result.message || 'Could not add student.'), { code: result.code });
  }
  return result;
}
