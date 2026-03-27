import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, db, ADMIN_EMAIL } from "./firebase-config.js";

const loginCard = document.getElementById("loginCard");
const panelCard = document.getElementById("panelCard");
const adminEmail = document.getElementById("adminEmail");
const adminPass = document.getElementById("adminPass");
const loginStatus = document.getElementById("loginStatus");
const adminInfo = document.getElementById("adminInfo");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginHistoryList = document.getElementById("loginHistoryList");
let manualAdminLoginInProgress = false;

function setStatus(message, type) {
  loginStatus.textContent = message || "";
  loginStatus.classList.remove("error", "ok");
  if (type) loginStatus.classList.add(type);
}

function showPanel(isAdmin) {
  loginCard.classList.toggle("hidden", isAdmin);
  panelCard.classList.toggle("hidden", !isAdmin);
}

function validateConfig() {
  const missingEmail = !ADMIN_EMAIL || ADMIN_EMAIL.includes("replace-with-your-email");
  if (missingEmail) {
    setStatus("Configure ADMIN_EMAIL in firebase-config.js", "error");
    adminLoginBtn.disabled = true;
    return false;
  }

  return true;
}

function isAdminUser(user) {
  return Boolean(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

function formatLoginTime(data) {
  let dateObj = null;

  if (data && data.loginAt && typeof data.loginAt.toDate === "function") {
    dateObj = data.loginAt.toDate();
  } else if (data && data.localLoginAt) {
    const parsed = new Date(data.localLoginAt);
    if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
  }

  if (!dateObj) return "Unknown time";
  return dateObj.toLocaleString();
}

function renderLoginHistory(entries) {
  if (!loginHistoryList) return;

  if (!entries.length) {
    loginHistoryList.innerHTML = "<div class=\"history-item\"><span>No login history yet.</span></div>";
    return;
  }

  loginHistoryList.innerHTML = entries.map((item) => {
    const email = item.email || "Unknown user";
    const deviceName = item.deviceName || "Unknown device";
    const timezone = item.timezone || "Unknown timezone";
    const loginTime = formatLoginTime(item);
    const city = item.city || "Unknown city";
    const state = item.state || "Unknown state";
    const country = item.country || "Unknown country";

    return "<div class=\"history-item\">"
      + "<strong>" + email + "</strong>"
      + "<span>Date/Time: " + loginTime + "</span>"
      + "<span>Device: " + deviceName + "</span>"
      + "<span>Location: " + city + ", " + state + ", " + country + "</span>"
      + "<span>Timezone: " + timezone + "</span>"
      + "</div>";
  }).join("");
}

async function loadLoginHistory() {
  if (!loginHistoryList) return;

  loginHistoryList.innerHTML = "<div class=\"history-item\"><span>Loading login history...</span></div>";

  try {
    const historyQuery = query(
      collection(db, "siteLoginEvents"),
      orderBy("loginAt", "desc"),
      limit(50)
    );

    const snapshot = await getDocs(historyQuery);
    const items = snapshot.docs.map((doc) => doc.data());
    renderLoginHistory(items);
  } catch {
    loginHistoryList.innerHTML = "<div class=\"history-item\"><span>Could not load history. Check Firestore rules.</span></div>";
  }
}

adminLoginBtn.addEventListener("click", async () => {
  if (!validateConfig()) return;

  const email = adminEmail.value.trim();
  const password = adminPass.value;
  if (!email || !password) {
    setStatus("Email and password are required.", "error");
    return;
  }

  try {
    setStatus("Signing in...", "ok");
    manualAdminLoginInProgress = true;

    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!isAdminUser(credential.user)) {
      manualAdminLoginInProgress = false;
      await signOut(auth).catch(() => {});
      setStatus("This account is not allowed for admin panel.", "error");
      showPanel(false);
      return;
    }

    adminPass.value = "";
    setStatus("Admin login successful.", "ok");
    adminInfo.textContent = "Logged in as: " + credential.user.email + " (admin)";
    showPanel(true);
    await loadLoginHistory();
  } catch (err) {
    manualAdminLoginInProgress = false;
    const message = err && err.code === "auth/invalid-credential"
      ? "Invalid credentials"
      : "Login failed. Check Firebase setup.";
    setStatus(message, "error");
  }
});

adminPass.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    adminLoginBtn.click();
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch {
    // Even if sign out fails, hide panel to avoid stale admin UI.
  }

  showPanel(false);
  setStatus("Logged out.", "ok");
  adminPass.value = "";
});

onAuthStateChanged(auth, async (user) => {
  if (!validateConfig()) {
    manualAdminLoginInProgress = false;
    showPanel(false);
    return;
  }

  if (!user) {
    manualAdminLoginInProgress = false;
    showPanel(false);
    return;
  }

  if (!isAdminUser(user)) {
    manualAdminLoginInProgress = false;
    await signOut(auth).catch(() => {});
    showPanel(false);
    setStatus("This account is not allowed for admin panel.", "error");
    return;
  }

  if (!manualAdminLoginInProgress) {
    await signOut(auth).catch(() => {});
    showPanel(false);
    setStatus("Please enter admin password again.", "error");
    return;
  }

  manualAdminLoginInProgress = false;

  adminInfo.textContent = "Logged in as: " + user.email + " (admin)";
  showPanel(true);
  await loadLoginHistory();
});
