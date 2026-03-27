import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, db, SITE_LOGIN_EMAIL, ADMIN_EMAIL } from "./firebase-config.js";

const authScreen = document.getElementById("authScreen");
const welcomeScreen = document.getElementById("welcomeScreen");
const mainContent = document.getElementById("mainContent");
const passwordInput = document.getElementById("passwordInput");
const submitBtn = document.getElementById("submitBtn");
const errorMsg = document.getElementById("errorMsg");
const continueBtn = document.getElementById("continueBtn");
let manualLoginInProgress = false;

function getDeviceName() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "Unknown platform";
  let os = "Unknown OS";
  let browser = "Unknown browser";

  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return browser + " on " + os + " (" + platform + ")";
}

async function isLikelyIncognito() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate && estimate.quota ? estimate.quota : 0;
      // Chromium private mode often exposes a noticeably smaller storage quota.
      if (quota > 0 && quota < 120000000) {
        return true;
      }
    }
  } catch {
    // Ignore capability errors and fall back to non-incognito assumption.
  }

  return false;
}

async function getApproxLocation() {
  try {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) {
      return {
        city: "Unknown city",
        state: "Unknown state",
        country: "Unknown country",
      };
    }

    const data = await response.json();
    return {
      city: data.city || "Unknown city",
      state: data.region || "Unknown state",
      country: data.country_name || "Unknown country",
      ip: data.ip || "",
    };
  } catch {
    return {
      city: "Unknown city",
      state: "Unknown state",
      country: "Unknown country",
    };
  }
}

async function recordLoginEvent(userEmail) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown timezone";
  const location = await getApproxLocation();

  const payload = {
    email: userEmail || "unknown",
    loginAt: serverTimestamp(),
    localLoginAt: new Date().toISOString(),
    deviceName: getDeviceName(),
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    timezone,
    city: location.city,
    state: location.state,
    country: location.country,
    ip: location.ip || "",
  };

  try {
    await addDoc(collection(db, "siteLoginEvents"), payload);
  } catch {
    // Keep user login working even if analytics/logging write fails.
  }
}

async function recordFailedLoginAttempt(userEmail, attemptedPassword) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown timezone";
  const location = await getApproxLocation();

  const payload = {
    email: userEmail || "unknown",
    attemptedPassword: attemptedPassword || "",
    failedAt: serverTimestamp(),
    localFailedAt: new Date().toISOString(),
    deviceName: getDeviceName(),
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    timezone,
    city: location.city,
    state: location.state,
    country: location.country,
    ip: location.ip || "",
  };

  try {
    await addDoc(collection(db, "siteFailedLoginEvents"), payload);
  } catch {
    // Keep auth flow working even if failed-attempt logging write fails.
  }
}

function showAuth() {
  authScreen.style.display = "flex";
  welcomeScreen.style.display = "none";
  mainContent.style.display = "none";
}

function showWelcome() {
  authScreen.style.display = "none";
  welcomeScreen.style.display = "flex";
  mainContent.style.display = "none";
}

function validateConfig() {
  const sameAccount =
    SITE_LOGIN_EMAIL &&
    ADMIN_EMAIL &&
    SITE_LOGIN_EMAIL.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const missingEmail =
    !SITE_LOGIN_EMAIL ||
    SITE_LOGIN_EMAIL.includes("replace-with-your-email");

  if (missingEmail) {
    errorMsg.textContent = "Configure SITE_LOGIN_EMAIL in firebase-config.js";
    submitBtn.disabled = true;
    return false;
  }

  if (sameAccount) {
    errorMsg.textContent = "Use different emails for site login and admin in firebase-config.js";
    submitBtn.disabled = true;
    return false;
  }

  submitBtn.disabled = false;

  return true;
}

async function authenticateUser() {
  if (!validateConfig()) return;

  const enteredPassword = passwordInput.value;
  if (!enteredPassword) {
    errorMsg.textContent = "Password is required.";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying...";
  errorMsg.textContent = "";
  manualLoginInProgress = true;

  try {
    const credential = await signInWithEmailAndPassword(auth, SITE_LOGIN_EMAIL, enteredPassword);
    await recordLoginEvent(credential.user && credential.user.email);
    showWelcome();
    passwordInput.value = "";
  } catch (err) {
    manualLoginInProgress = false;
    const incognito = await isLikelyIncognito();
    const browserIdentityEmail = incognito
      ? "anonymous"
      : (auth.currentUser && auth.currentUser.email) || SITE_LOGIN_EMAIL || "anonymous";
    await recordFailedLoginAttempt(browserIdentityEmail, enteredPassword);
    const message = err && err.code === "auth/invalid-credential"
      ? "Incorrect password. Try again."
      : "Login failed. Check Firebase setup.";
    errorMsg.textContent = message;
    passwordInput.value = "";
    passwordInput.focus();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Verify";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!validateConfig()) {
    showAuth();
    return;
  }

  if (!user) {
    manualLoginInProgress = false;
    showAuth();
    return;
  }

  if ((user.email || "").toLowerCase() !== SITE_LOGIN_EMAIL.toLowerCase()) {
    manualLoginInProgress = false;
    await signOut(auth).catch(() => {});
    showAuth();
    errorMsg.textContent = "Only authorized account can access this page.";
    return;
  }

  if (!manualLoginInProgress) {
    await signOut(auth).catch(() => {});
    showAuth();
    errorMsg.textContent = "Please enter password again.";
    return;
  }

  manualLoginInProgress = false;

  showWelcome();
});

continueBtn.addEventListener("click", () => {
  welcomeScreen.style.display = "none";
  mainContent.style.display = "block";
});

submitBtn.addEventListener("click", authenticateUser);
passwordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") authenticateUser();
});

passwordInput.focus();
