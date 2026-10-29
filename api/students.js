import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  const existingApp = getApps().find((app) => app.name === 'vercel-admin-api');
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!projectId || !serviceAccountJson) {
    throw Object.assign(
      new Error('Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT in Vercel Project Settings > Environment Variables, then redeploy.'),
      { code: 'server-config/missing' },
    );
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

function hasAdminConfiguration() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!projectId || !serviceAccountJson) return false;

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return serviceAccount.type === 'service_account'
      && serviceAccount.project_id === projectId
      && typeof serviceAccount.client_email === 'string'
      && typeof serviceAccount.private_key === 'string';
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    send(response, 200, { configured: hasAdminConfiguration() });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    send(response, 405, { code: 'method-not-allowed', message: 'Use GET to check setup or POST to manage staff accounts.' });
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
      send(response, 403, { code: 'permission-denied-api', message: 'Only admins can manage staff records.' });
      return;
    }

    const { action, uid, newPassword } = request.body || {};
    if (action === 'resetStudentPassword') {
      if (typeof uid !== 'string' || !uid.trim() || uid !== uid.trim() || uid.length > 128 ||
        typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 4096) {
        send(response, 400, { code: 'invalid-argument', message: 'Enter a staff ID and a password of at least 6 characters.' });
        return;
      }
      try {
        await adminAuth.updateUser(uid, { password: newPassword });
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          send(response, 404, { code: 'not-found', message: 'The staff account no longer exists.' });
          return;
        }
        console.error('Failed to reset staff password:', error);
        send(response, 500, { code: 'internal', message: 'Could not reset the staff password. Check the Vercel Function logs.' });
        return;
      }
      send(response, 200, { ok: true });
      return;
    }

    if (action === 'deleteStudent') {
      if (typeof uid !== 'string' || !uid.trim() || uid !== uid.trim() || uid.length > 128) {
        send(response, 400, { code: 'invalid-argument', message: 'A valid staff ID is required.' });
        return;
      }
      try {
        try {
          await adminAuth.deleteUser(uid);
        } catch (error) {
          if (error.code !== 'auth/user-not-found') throw error;
        }
        await getFirestore(app).recursiveDelete(getFirestore(app).doc(`students/${uid}`));
      } catch (error) {
        console.error('Failed to delete staff member:', error);
        send(response, 500, { code: 'internal', message: 'Could not completely delete the staff member. Retry the delete and check the Vercel Function logs.' });
        return;
      }
      send(response, 200, { ok: true });
      return;
    }

    if (action) {
      send(response, 400, { code: 'invalid-argument', message: 'Unsupported staff account action.' });
      return;
    }

    const { username, password, name, rollNo = '', department = '', year = '' } = request.body || {};
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(username.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      typeof name !== 'string' ||
      !name.trim() ||
      ![rollNo, department, year].every((value) => typeof value === 'string')
    ) {
      send(response, 400, { code: 'invalid-argument', message: 'Enter a valid staff username, password, and name.' });
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const normalizedUsername = username.trim().toLowerCase();
    const email = `${normalizedUsername}@${projectId}.firebaseapp.com`;
    let student;
    try {
      student = await adminAuth.createUser({ email, password, displayName: name.trim() });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        send(response, 409, { code: 'already-exists', message: 'That staff username is already in use.' });
        return;
      }
      throw error;
    }

    try {
      await getFirestore(app).doc(`students/${student.uid}`).set({
        username: normalizedUsername,
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

    send(response, 201, { uid: student.uid, username: normalizedUsername });
  } catch (error) {
    if (error.code === 'server-config/missing') {
      send(response, 503, { code: error.code, message: error.message });
      return;
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      send(response, 401, { code: 'unauthenticated', message: 'Your sign-in expired. Sign in again.' });
      return;
    }
    console.error('Failed to process student request through the Vercel API:', error);
    send(response, 500, {
      code: 'internal',
      message: 'Could not add this staff member. Check the Vercel function logs for the server error.',
    });
  }
}
