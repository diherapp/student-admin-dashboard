// Creates (or finds) the admin user and gives it the `admin` claim.
// Usage (from admin-functions/, after `npm i`):
//   Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path.
//   ADMIN_USERNAME=admin FIREBASE_PROJECT_ID=your-project-id ADMIN_PASSWORD='choose-a-strong-password' node make-admin.js
const admin = require('firebase-admin');
admin.initializeApp();
const { ADMIN_EMAIL, ADMIN_USERNAME, FIREBASE_PROJECT_ID, ADMIN_PASSWORD: password } = process.env;
const email = ADMIN_EMAIL || (
  ADMIN_USERNAME && FIREBASE_PROJECT_ID
    ? `${ADMIN_USERNAME.toLowerCase()}@${FIREBASE_PROJECT_ID}.firebaseapp.com`
    : ''
);
if (!email || !password || password.length < 8) {
  console.error('Set ADMIN_EMAIL (or ADMIN_USERNAME and FIREBASE_PROJECT_ID) and ADMIN_PASSWORD (8+ chars).');
  process.exit(1);
}
(async () => {
  const auth = admin.auth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password });
  }
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  console.log('Admin ready for username:', ADMIN_USERNAME || email, user.uid);
})().catch((error) => {
  console.error('Failed to create admin account:', error);
  process.exitCode = 1;
});
