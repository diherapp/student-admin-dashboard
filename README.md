# Student Management Admin Website (React + Vite + Firebase)

Admin-only website: Dashboard, Students, Attendance, Tasks, Achievements.

## 1. Firebase
1. Firebase console: create a project; enable Authentication (Email/Password), Firestore, Storage.
2. Project settings > Your apps > add a **Web app**; copy the config values into `.env.local` (see `.env.example`). The Firebase API key in the web config identifies the project; protect your data with Firebase Authentication and security rules.
3. Keep the project on Spark by deploying only Firestore and Storage rules: `npx firebase-tools deploy --only firestore:rules,storage --project diher-55a48`. Cloud Functions require Blaze; they are not needed for the local Spark workflow below.
4. Create the admin login once: in `admin-functions/`, set `GOOGLE_APPLICATION_CREDENTIALS` to a private service-account JSON file, then run `node --env-file=../.env.local .\make-admin.js` (Node.js 20.6+).
5. To add students locally while staying on Spark, open a second terminal in `admin-functions/`, set `GOOGLE_APPLICATION_CREDENTIALS` to the private key, and run `node --env-file=../.env.local .\local-server.js`. Keep this service running while using the local website. Students sign in with username and password; Firebase Auth uses `<username>@<project-id>.firebaseapp.com` internally.

## 2. Run locally
Copy `.env.example` to `.env.local` and fill in the Firebase values before running the website:
`npm install && npm run dev`

## 3. Deploy on Vercel
Push to GitHub > Vercel: New Project > import (framework: Vite, no root directory needed) > add the six required `VITE_FIREBASE_*` environment variables from `.env.example`; `VITE_FIREBASE_DATABASE_URL` and `VITE_FIREBASE_MEASUREMENT_ID` are optional > Deploy. To enable Add Student for visitors, add these **server-only** Vercel environment variables under Project Settings > Environment Variables:

- `FIREBASE_PROJECT_ID`: your Firebase project ID.
- `FIREBASE_SERVICE_ACCOUNT`: the full contents of a service-account JSON key with permission to manage Firebase Authentication users and Firestore.

Do not prefix these with `VITE_`, put them in `.env.local`, commit them, or send them to anyone. Add them to Vercel's Production environment and redeploy. The `/api/students` Vercel Function verifies the signed-in Firebase admin claim before creating accounts and profiles. This avoids Firebase Cloud Functions; Vercel function usage and Firebase Spark quotas still apply. Keep the service-account key private and rotate it if it is exposed.
Then Firebase console > Authentication > Settings > Authorized domains: add your `*.vercel.app` domain.
