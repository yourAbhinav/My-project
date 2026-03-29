# Firebase + GitHub Pages Setup

This project uses Firebase Authentication and an optional advanced security monitor backend.

## 1) Create Firebase project
1. Open Firebase Console.
2. Create a project.
3. Add a Web App.
4. Copy your Firebase config values.

## 2) Enable Email/Password sign-in
1. Firebase Console -> Authentication -> Sign-in method.
2. Enable Email/Password.

## 2.1) Enable Firestore Database
1. Firebase Console -> Firestore Database.
2. Create database (start in production or test mode as you prefer).
3. This project stores login history in collection `siteLoginEvents`.

## 3) Create your user account
1. Authentication -> Users -> Add user.
2. Use your email and strong password.

## 4) Update local config file
Edit `firebase-config.js` and set:
- `apiKey`
- `authDomain`
- `projectId`
- `appId`
- `SITE_LOGIN_EMAIL` (your email)
- `ADMIN_EMAIL` (your email, or a different admin email)

## 5) Add GitHub Pages domain in Firebase
If your site is `https://username.github.io/repo/`:
1. Authentication -> Settings -> Authorized domains.
2. Add `username.github.io`.

## 6) Push to GitHub
1. Commit and push code.
2. Enable GitHub Pages for the repo.
3. Open your site URL.

## 7) (Recommended) Deploy Advanced Login Monitor backend
For full features (`unique_device_hash`, VPN detection, anomaly alerts, HttpOnly cookie):
1. Deploy `security-monitor-server` to a Node host (Render, Railway, Fly.io, VPS).
2. Set environment variables from `security-monitor-server/.env.example`.
3. In your hosted frontend, set a runtime override before loading modules:

```html
<script>
	window.__SECURITY_MONITOR_API_BASE = "https://your-monitor-api.example.com";
</script>
```

4. Add your frontend domain to `ALLOWED_ORIGINS` in backend env.
5. Keep both frontend and backend on HTTPS so secure cookies work.

## Notes
- Firebase API key in frontend is expected and normal.
- Real security is enforced by Firebase Auth backend, not by hidden JS code.
- Admin page UI is shown only for the configured `ADMIN_EMAIL` account.
- If admin history does not load, review Firestore security rules for read/write access.
