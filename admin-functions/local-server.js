const http = require('node:http');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID in the project .env.local file.');
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function respond(response, status, body, origin) {
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413, code: 'invalid-argument' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400, code: 'invalid-argument' }));
      }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    respond(response, 403, { code: 'permission-denied-api', message: 'Origin is not allowed.' });
    return;
  }
  if (request.method === 'OPTIONS') {
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Vary', 'Origin');
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/api/students') {
    respond(response, 404, { code: 'not-found', message: 'Endpoint not found.' }, origin);
    return;
  }

  try {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      respond(response, 401, { code: 'unauthenticated', message: 'Sign in as an admin first.' }, origin);
      return;
    }
    const decodedToken = await auth.verifyIdToken(token, true);
    if (decodedToken.admin !== true) {
      respond(response, 403, { code: 'permission-denied-api', message: 'Only admins can manage student records.' }, origin);
      return;
    }

    const body = await readBody(request);
    const { action, uid, newPassword } = body || {};
    if (action === 'resetStudentPassword') {
      if (typeof uid !== 'string' || !uid.trim() || uid !== uid.trim() || uid.length > 128 ||
        typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 4096) {
        respond(response, 400, { code: 'invalid-argument', message: 'Enter a student ID and a password of at least 6 characters.' }, origin);
        return;
      }
      try {
        await auth.updateUser(uid, { password: newPassword });
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          respond(response, 404, { code: 'not-found', message: 'The student account no longer exists.' }, origin);
          return;
        }
        throw error;
      }
      respond(response, 200, { ok: true }, origin);
      return;
    }

    if (action === 'deleteStudent') {
      if (typeof uid !== 'string' || !uid.trim() || uid !== uid.trim() || uid.length > 128) {
        respond(response, 400, { code: 'invalid-argument', message: 'A valid student ID is required.' }, origin);
        return;
      }
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
      }
      await db.recursiveDelete(db.doc(`students/${uid}`));
      respond(response, 200, { ok: true }, origin);
      return;
    }

    if (action) {
      respond(response, 400, { code: 'invalid-argument', message: 'Unsupported student action.' }, origin);
      return;
    }

    const { username, password, name, rollNo = '', department = '', year = '' } = body || {};
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(username.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      typeof name !== 'string' ||
      !name.trim() ||
      ![rollNo, department, year].every((value) => typeof value === 'string')
    ) {
      respond(response, 400, { code: 'invalid-argument', message: 'Enter a valid student username, password, and name.' }, origin);
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const email = `${normalizedUsername}@${projectId}.firebaseapp.com`;
    let student;
    try {
      student = await auth.createUser({ email, password, displayName: name.trim() });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        respond(response, 409, { code: 'already-exists', message: 'That student username is already in use.' }, origin);
        return;
      }
      throw error;
    }

    try {
      await db.doc(`students/${student.uid}`).set({
        username: normalizedUsername,
        name: name.trim(),
        rollNo: rollNo.trim(),
        email,
        department: department.trim(),
        year: year.trim(),
      });
    } catch (error) {
      try {
        await auth.deleteUser(student.uid);
      } catch (cleanupError) {
        console.error('Could not remove the Auth user after Firestore profile creation failed:', cleanupError);
      }
      throw error;
    }

    respond(response, 201, { uid: student.uid, username: normalizedUsername }, origin);
  } catch (error) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      respond(response, 401, { code: 'unauthenticated', message: 'Your sign-in expired. Sign in again.' }, origin);
      return;
    }
    if (error.status) {
      respond(response, error.status, { code: error.code, message: error.message }, origin);
      return;
    }
    console.error('Failed to process student request:', error);
    respond(response, 500, { code: 'internal', message: 'Could not process the student request. Check the local admin service log.' }, origin);
  }
});

server.listen(8787, '127.0.0.1', () => {
  console.log('Local Spark admin service listening at http://127.0.0.1:8787');
});
