# Security Setup

## Why your old password was visible
When password logic is in frontend JavaScript, anyone can inspect it in browser Developer Tools.

## What changed now
- Authentication uses Firebase Email/Password.
- Main page login uses `SITE_LOGIN_EMAIL` + entered password.
- Admin panel is restricted to `ADMIN_EMAIL` account.
- Works on static hosting like GitHub Pages (no always-on server required).

## Setup
Follow [FIREBASE_GITHUB_SETUP.md](FIREBASE_GITHUB_SETUP.md).

## Important
- Firebase config values in frontend are normal and expected.
- Security comes from Firebase Auth backend validation.
