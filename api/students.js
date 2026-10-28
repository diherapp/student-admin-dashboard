import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  const existingApp = getApps().find((app) => app.name === 'vercel-admin-api');
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!projectId || !serviceAccountJson) {
    throw new Error('Missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT server environment variable.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.');
  }
  if (serviceAccount.project_id !== projectId) {
    throw new Error('FIREBASE_PROJECT_ID does not match the service account project.');
  }

  return initializeApp({ credential: cert(serviceAccount), projectId }, 'vercel-admin-api');
}

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    send(response, 405, { code: 'method-not-allowed', message: 'Use POST to create a student.' });
    return;
  }

  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > 16_384) {
    send(response, 413, { code: 'invalid-argument', message: 'Request is too large.' });
    return;
  }

  try {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      send(response, 401, { code: 'unauthenticated', message: 'Sign in as an admin first.' });
      return;
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const decodedToken = await adminAuth.verifyIdToken(token, true);
    if (decodedToken.admin !== true) {
      send(response, 403, { code: 'permission-denied-api', message: 'Only admins can add students.' });
      return;
    }

    const { studentId, password, name, rollNo = '', department = '', year = '' } = request.body || {};
    if (
      typeof studentId !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(studentId.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      typeof name !== 'string' ||
      !name.trim() ||
      ![rollNo, department, year].every((value) => typeof value === 'string')
    ) {
      send(response, 400, { code: 'invalid-argument', message: 'Enter a valid student username, password, and name.' });
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const username = studentId.trim().toLowerCase();
    const email = `${username}@${projectId}.firebaseapp.com`;
    let student;
    try {
      student = await adminAuth.createUser({ email, password, displayName: name.trim() });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        send(response, 409, { code: 'already-exists', message: 'That student username is already in use.' });
        return;
      }
      throw error;
    }

    try {
      await getFirestore(app).doc(`students/${student.uid}`).set({
        username,
        name: name.trim(),
        rollNo: rollNo.trim(),
        email,
        department: department.trim(),
        year: year.trim(),
      });
    } catch (error) {
      try {
        await adminAuth.deleteUser(student.uid);
      } catch (cleanupError) {
        console.error('Could not remove the Auth user after Firestore profile creation failed:', cleanupError);
      }
      throw error;
    }

    send(response, 201, { uid: student.uid, username });
  } catch (error) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      send(response, 401, { code: 'unauthenticated', message: 'Your sign-in expired. Sign in again.' });
      return;
    }
    console.error('Failed to create student through the Vercel API:', error);
    send(response, 500, {
      code: 'internal',
      message: 'Could not add the student. Check the Vercel function logs for the server error.',
    });
  }
}
