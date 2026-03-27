import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, authReady, db, SITE_LOGIN_EMAIL, ADMIN_EMAIL } from "./firebase-config.js";

const authScreen = document.getElementById("authScreen");
const welcomeScreen = document.getElementById("welcomeScreen");
const mainContent = document.getElementById("mainContent");
const passwordInput = document.getElementById("passwordInput");
const submitBtn = document.getElementById("submitBtn");
const errorMsg = document.getElementById("errorMsg");
const continueBtn = document.getElementById("continueBtn");
let manualLoginInProgress = false;
const SESSION_CONTROL_COLLECTION = "sessionControl";
const SESSION_CONTROL_DOC = "global";
const SESSION_LOGOUT_VERSION_KEY = "securityHubLogoutVersion";
const ACTIVE_SESSIONS_COLLECTION = "activeSessions";
const SESSION_HEARTBEAT_INTERVAL_MS = 10000;
const SESSION_ID_STORAGE_KEY = "securityHubSessionId";
let sessionWatcherInitialized = false;
let activeSessionId = "";
let sessionHeartbeatTimer = null;
let sessionPresenceLocation = null;

function getStoredLogoutVersion() {
  const raw = localStorage.getItem(SESSION_LOGOUT_VERSION_KEY);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setStoredLogoutVersion(version) {
  localStorage.setItem(SESSION_LOGOUT_VERSION_KEY, String(version || 0));
}

function getOrCreateSessionId() {
  const existing = (localStorage.getItem(SESSION_ID_STORAGE_KEY) || "").trim();
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "session-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  localStorage.setItem(SESSION_ID_STORAGE_KEY, generated);
  return generated;
}

function getSessionDocRef() {
  if (!activeSessionId) return null;
  return doc(db, ACTIVE_SESSIONS_COLLECTION, activeSessionId);
}

function formatPresencePayload(user) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown timezone";
  const client = getClientDetails();
  const email = (user && user.email) || SITE_LOGIN_EMAIL || "unknown";

  return {
    sessionId: activeSessionId,
    uid: (user && user.uid) || "",
    email,
    browser: client.browser,
    device: client.device,
    deviceName: client.deviceName,
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    timezone,
    city: (sessionPresenceLocation && sessionPresenceLocation.city) || "Unknown city",
    state: (sessionPresenceLocation && sessionPresenceLocation.state) || "Unknown state",
    country: (sessionPresenceLocation && sessionPresenceLocation.country) || "Unknown country",
    ip: (sessionPresenceLocation && sessionPresenceLocation.ip) || "",
    isp: (sessionPresenceLocation && sessionPresenceLocation.isp) || "Unknown ISP",
    latitude: sessionPresenceLocation ? sessionPresenceLocation.latitude : null,
    longitude: sessionPresenceLocation ? sessionPresenceLocation.longitude : null,
    status: "online",
    page: "index",
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    lastSeenLocalAt: new Date().toISOString(),
  };
}

async function writeSessionPresence(user) {
  const ref = getSessionDocRef();
  if (!ref) return;

  await setDoc(ref, formatPresencePayload(user), { merge: true });
}

function startSessionHeartbeat(user) {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
  }

  sessionHeartbeatTimer = setInterval(() => {
    if (!auth.currentUser) return;
    writeSessionPresence(user).catch(() => {
      // Keep session alive in UI even if one heartbeat write fails.
    });
  }, SESSION_HEARTBEAT_INTERVAL_MS);
}

async function startSessionPresence(user) {
  if (!user) return;

  activeSessionId = getOrCreateSessionId();
  sessionPresenceLocation = await getApproxLocation();
  const ref = getSessionDocRef();

  if (ref) {
    await setDoc(
      ref,
      {
        sessionStartedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {
      // Keep login flow alive even if session-start write fails.
    });
  }

  await writeSessionPresence(user).catch(() => {
    // Do not block login if presence write fails once.
  });
  startSessionHeartbeat(user);
}

async function stopSessionPresence() {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }

  const ref = getSessionDocRef();
  if (!ref) {
    sessionPresenceLocation = null;
    return;
  }

  await deleteDoc(ref).catch(() => {
    // Keep sign-out flow working even if session cleanup fails.
  });

  sessionPresenceLocation = null;
}

function initializeSessionLogoutWatcher() {
  const controlDocRef = doc(db, SESSION_CONTROL_COLLECTION, SESSION_CONTROL_DOC);

  onSnapshot(
    controlDocRef,
    async (snapshot) => {
      const data = snapshot.data() || {};
      const remoteVersion = Number(data.logoutVersion || 0);
      const logoutScope = (data.logoutScope || "all").toLowerCase();
      const targetEmail = String(data.targetEmail || "").trim().toLowerCase();
      const localVersion = getStoredLogoutVersion();

      if (!sessionWatcherInitialized) {
        setStoredLogoutVersion(Math.max(localVersion, remoteVersion));
        sessionWatcherInitialized = true;
        return;
      }

      if (!remoteVersion || remoteVersion <= localVersion) return;

      setStoredLogoutVersion(remoteVersion);
      if (!auth.currentUser) return;

      const currentEmail = String(auth.currentUser.email || "").trim().toLowerCase();
      const shouldLogout =
        logoutScope !== "user"
          ? true
          : Boolean(targetEmail) && currentEmail === targetEmail;

      if (!shouldLogout) return;

      manualLoginInProgress = false;
      await stopSessionPresence();
      await signOut(auth).catch(() => {});
      showAuth();
      errorMsg.textContent = "Your session was ended from another device. Please log in again.";
    },
    () => {
      // Keep auth flow active even if watcher cannot attach.
    }
  );
}

function getClientDetails() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "Unknown platform";
  let os = "Unknown OS";
  let browser = "Unknown browser";
  let device = "Desktop";

  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  if (/iPad|Tablet/i.test(ua)) device = "Tablet";
  else if (/Mobi|Android|iPhone|iPod/i.test(ua)) device = "Mobile";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return {
    browser,
    device,
    deviceName: device + " - " + os + " (" + platform + ")",
  };
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
        isp: "Unknown ISP",
        latitude: null,
        longitude: null,
      };
    }

    const data = await response.json();
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    return {
      city: data.city || "Unknown city",
      state: data.region || "Unknown state",
      country: data.country_name || "Unknown country",
      ip: data.ip || "",
      isp: data.org || data.asn_org || "Unknown ISP",
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    };
  } catch {
    return {
      city: "Unknown city",
      state: "Unknown state",
      country: "Unknown country",
      isp: "Unknown ISP",
      latitude: null,
      longitude: null,
    };
  }
}

async function recordLoginEvent(userEmail) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown timezone";
  const location = await getApproxLocation();
  const client = getClientDetails();

  const payload = {
    email: userEmail || "unknown",
    loginAt: serverTimestamp(),
    localLoginAt: new Date().toISOString(),
    device: client.device,
    browser: client.browser,
    deviceName: client.deviceName,
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    timezone,
    city: location.city,
    state: location.state,
    country: location.country,
    ip: location.ip || "",
    isp: location.isp || "Unknown ISP",
    latitude: location.latitude,
    longitude: location.longitude,
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
  const client = getClientDetails();

  const payload = {
    email: userEmail || "unknown",
    attemptedPassword: attemptedPassword || "",
    failedAt: serverTimestamp(),
    localFailedAt: new Date().toISOString(),
    device: client.device,
    browser: client.browser,
    deviceName: client.deviceName,
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    timezone,
    city: location.city,
    state: location.state,
    country: location.country,
    ip: location.ip || "",
    isp: location.isp || "Unknown ISP",
    latitude: location.latitude,
    longitude: location.longitude,
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
    await authReady;
    const credential = await signInWithEmailAndPassword(auth, SITE_LOGIN_EMAIL, enteredPassword);
    await recordLoginEvent(credential.user && credential.user.email);
    await startSessionPresence(credential.user);
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
    await stopSessionPresence();
    showAuth();
    return;
  }

  if ((user.email || "").toLowerCase() !== SITE_LOGIN_EMAIL.toLowerCase()) {
    manualLoginInProgress = false;
    await stopSessionPresence();
    showAuth();
    errorMsg.textContent = "Only authorized account can access this page.";
    return;
  }

  if (!manualLoginInProgress) {
    await stopSessionPresence();
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
initializeSessionLogoutWatcher();
