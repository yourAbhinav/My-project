import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyARUKbQZYDW7wAFu6ZYqdtrUTU3cVMQhtY",
  authDomain: "my-project-1d1e1.firebaseapp.com",
  projectId: "my-project-1d1e1",
  appId: "1:323525462401:web:31ee6fcce91abc8fb1c080",
};

export const SITE_LOGIN_EMAIL = "testnow683@gmail.com";
export const ADMIN_EMAIL = "abhinavkumar09870@gmail.com";
export const API_BASE = "https://my-project-641o.onrender.com";

const runtimeMonitorBase =
  typeof window !== "undefined" && typeof window.__SECURITY_MONITOR_API_BASE === "string"
    ? window.__SECURITY_MONITOR_API_BASE.trim()
    : "";

const isLocalHost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const SECURITY_MONITOR_API_BASE = runtimeMonitorBase || API_BASE || (isLocalHost ? "http://localhost:8080" : "");

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const authReady = setPersistence(auth, browserLocalPersistence).catch(() => {
  // Keep auth functional even if persistence cannot be configured in this browser mode.
});
export const db = getFirestore(app);
