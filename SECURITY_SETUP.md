# Security Setup

## Why your old password was visible
When password logic is in frontend JavaScript, anyone can inspect it in browser Developer Tools.

## What changed now
- Authentication uses Firebase Email/Password.
- Main page login uses `SITE_LOGIN_EMAIL` + entered password.
- Admin panel is restricted to `ADMIN_EMAIL` account.
- Advanced Login Monitor uses a Node backend for secure HttpOnly cookie, VPN/ASN checks, and anomaly alerts.

## Different password for login and admin
Firebase stores one password per email account. To use different passwords:
1. Create two Firebase Auth users (two different emails).
2. Set `SITE_LOGIN_EMAIL` to user 1 in [firebase-config.js](firebase-config.js).
3. Set `ADMIN_EMAIL` to user 2 in [firebase-config.js](firebase-config.js).
4. Use different passwords when creating those two users.

The project now enforces that `SITE_LOGIN_EMAIL` and `ADMIN_EMAIL` must be different.

## Setup
Follow [FIREBASE_GITHUB_SETUP.md](FIREBASE_GITHUB_SETUP.md).

## Important
- Firebase config values in frontend are normal and expected.
- Security comes from Firebase Auth backend validation.
- For full advanced monitoring online, deploy both frontend and `security-monitor-server` over HTTPS.
