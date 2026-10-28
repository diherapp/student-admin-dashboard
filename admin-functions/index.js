// Deploy:  cd admin-functions && npm i firebase-admin firebase-functions && firebase deploy --only functions
// Call from your ADMIN WEBSITE (signed in as an admin user) with the Firebase JS SDK:
//   httpsCallable(functions, 'createStudent')({ username, password, name, rollNo, department, year })
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();

function requireAdmin(req) {
  if (!req.auth?.token?.admin) throw new HttpsError('permission-denied', 'Admins only');
}

exports.createStudent = onCall(async (req) => {
  requireAdmin(req);
  const { username, password, name, rollNo = '', department = '', year = '' } = req.data || {};
  if (
    typeof username !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,64}$/.test(username.trim()) ||
    typeof password !== 'string' ||
    password.length < 6 ||
    typeof name !== 'string' ||
    !name.trim() ||
    ![rollNo, department, year].every((value) => typeof value === 'string')
  ) {
    throw new HttpsError('invalid-argument', 'Enter a valid student username, password, and name.');
  }

  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) {
    throw new HttpsError('failed-precondition', 'The Firebase project ID is not configured.');
  }

  const normalizedUsername = username.trim().toLowerCase();
  const email = `${normalizedUsername}@${projectId}.firebaseapp.com`;
  let user;
  try {
    user = await getAuth().createUser({
      email,
      password,
      displayName: name.trim(),
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'That student username is already in use.');
    }
    logger.error('Failed to create student authentication account.', error);
    throw new HttpsError('internal', 'Could not create the student account.');
  }

  try {
    await getFirestore().doc(`students/${user.uid}`).set({
      username: normalizedUsername,
      name: name.trim(),
      rollNo: rollNo.trim(),
      email,
      department: department.trim(),
      year: year.trim(),
    });
  } catch (error) {
    try {
      await getAuth().deleteUser(user.uid);
    } catch (cleanupError) {
      logger.error('Failed to clean up student auth account after profile creation failed.', cleanupError);
    }
    logger.error('Failed to save student profile in Firestore.', error);
    throw new HttpsError('internal', 'Could not save the student profile. Check the function logs before retrying.');
  }

  return { uid: user.uid, email };
});

exports.resetStudentPassword = onCall(async (req) => {
  requireAdmin(req);
  await getAuth().updateUser(req.data.uid, { password: req.data.newPassword });
  return { ok: true };
});

exports.setStudentDisabled = onCall(async (req) => {
  requireAdmin(req);
  await getAuth().updateUser(req.data.uid, { disabled: !!req.data.disabled });
  return { ok: true };
});

exports.deleteStudent = onCall(async (req) => {
  requireAdmin(req);
  const { uid } = req.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid required');
  await getFirestore().recursiveDelete(getFirestore().doc(`students/${uid}`));
  await getAuth().deleteUser(uid);
  return { ok: true };
});

// One-time: promote your own admin account (run locally with service account):
//   node -e "require('firebase-admin').initializeApp();require('firebase-admin').auth().setCustomUserClaims('<ADMIN_UID>',{admin:true})"
