import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
const missingConfigKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);

if (missingConfigKeys.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfigKeys
      .map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`)
      .join(', ')}`,
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = isSupported().then((supported) => (supported ? getAnalytics(app) : null));
const fns = getFunctions(app); // default region us-central1
export const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

export async function createStudent(data) {
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
