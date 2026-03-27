import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, db, ADMIN_EMAIL, SITE_LOGIN_EMAIL } from "./firebase-config.js";

const loginCard = document.getElementById("loginCard");
const panelCard = document.getElementById("panelCard");
const adminEmail = document.getElementById("adminEmail");
const adminPass = document.getElementById("adminPass");
const loginStatus = document.getElementById("loginStatus");
const adminInfo = document.getElementById("adminInfo");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginHistoryList = document.getElementById("loginHistoryList");
const failedHistoryList = document.getElementById("failedHistoryList");
const tableSearch = document.getElementById("tableSearch");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const refreshDataBtn = document.getElementById("refreshDataBtn");
const refreshLogsBtn = document.getElementById("refreshLogsBtn");
const forceLogoutAllBtn = document.getElementById("forceLogoutAllBtn");
const userManagementList = document.getElementById("userManagementList");
const loginStatusInline = document.getElementById("loginStatusInline");
const navDashboardBtn = document.getElementById("navDashboardBtn");
const navUserManagementBtn = document.getElementById("navUserManagementBtn");
const navSecurityLogsBtn = document.getElementById("navSecurityLogsBtn");
const successfulLoginsCard = document.getElementById("successfulLoginsCard");
const failedLoginsCard = document.getElementById("failedLoginsCard");
const userManagementCard = document.getElementById("userManagementCard");
let manualAdminLoginInProgress = false;
let latestLoginEntries = [];
let latestFailedEntries = [];
const SESSION_CONTROL_COLLECTION = "sessionControl";
const SESSION_CONTROL_DOC = "global";
const SESSION_LOGOUT_VERSION_KEY = "securityHubLogoutVersion";
let sessionWatcherInitialized = false;

function setActiveNav(viewName) {
  const links = [
    { button: navDashboardBtn, view: "dashboard" },
    { button: navSecurityLogsBtn, view: "logs" },
    { button: navUserManagementBtn, view: "users" },
  ];

  links.forEach(({ button, view }) => {
    if (!button) return;
    button.classList.toggle("active", view === viewName);
  });
}

function showDashboardView(viewName) {
  setActiveNav(viewName);

  if (successfulLoginsCard) {
    successfulLoginsCard.classList.toggle("hidden", viewName === "users");
  }

  if (failedLoginsCard) {
    failedLoginsCard.classList.toggle("hidden", viewName === "users");
  }

  if (userManagementCard) {
    userManagementCard.classList.toggle("hidden", viewName === "logs");
  }

  if (viewName === "users" && userManagementCard) {
    userManagementCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setStatus(message, type) {
  loginStatus.textContent = message || "";
  loginStatus.classList.remove("error", "ok");
  if (type) loginStatus.classList.add(type);

  if (loginStatusInline) {
    loginStatusInline.textContent = message || "";
    loginStatusInline.classList.remove("error", "ok");
    if (type) loginStatusInline.classList.add(type);
  }
}

function showPanel(isAdmin) {
  loginCard.classList.toggle("hidden", isAdmin);
  panelCard.classList.toggle("hidden", !isAdmin);
}

function validateConfig() {
  const sameAccount =
    SITE_LOGIN_EMAIL &&
    ADMIN_EMAIL &&
    SITE_LOGIN_EMAIL.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const missingEmail = !ADMIN_EMAIL || ADMIN_EMAIL.includes("replace-with-your-email");
  if (missingEmail) {
    setStatus("Configure ADMIN_EMAIL in firebase-config.js", "error");
    adminLoginBtn.disabled = true;
    return false;
  }

  if (sameAccount) {
    setStatus("Use different emails for site login and admin in firebase-config.js", "error");
    adminLoginBtn.disabled = true;
    return false;
  }

  adminLoginBtn.disabled = false;

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

function getLoginDate(data) {
  if (data && data.loginAt && typeof data.loginAt.toDate === "function") {
    return data.loginAt.toDate();
  }

  if (data && data.localLoginAt) {
    const parsed = new Date(data.localLoginAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function safeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAnonymousEmail(email) {
  return (email || "").toLowerCase() === "anonymous";
}

function getSearchText(item, timeValue) {
  const city = item.city || "";
  const state = item.state || "";
  const country = item.country || "";

  return [
    item.email,
    timeValue,
    item.deviceName,
    city,
    state,
    country,
    item.timezone,
    item.ip,
    item.attemptedPassword,
  ].join(" ").toLowerCase();
}

function applySearch(entries, timeFormatter) {
  const term = (tableSearch && tableSearch.value ? tableSearch.value : "").trim().toLowerCase();
  if (!term) return entries;

  return entries.filter((item) => {
    const timeValue = timeFormatter(item);
    return getSearchText(item, timeValue).includes(term);
  });
}

function renderLoginHistory(entries) {
  if (!loginHistoryList) return;

  const filteredEntries = applySearch(entries, formatLoginTime);

  if (!filteredEntries.length) {
    loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"6\">No login history yet.</td></tr>";
    return;
  }

  loginHistoryList.innerHTML = filteredEntries.map((item) => {
    const email = item.email || "Unknown user";
    const deviceName = item.deviceName || "Unknown device";
    const loginTime = formatLoginTime(item);
    const city = item.city || "Unknown city";
    const state = item.state || "Unknown state";
    const country = item.country || "Unknown country";
    const timezone = item.timezone || "Unknown timezone";
    const ip = item.ip || "N/A";
    const address = city + ", " + state + ", " + country;
    const emailCellClass = isAnonymousEmail(email) ? "cell-anonymous" : "";

    return "<tr>"
      + "<td class=\"" + emailCellClass + "\">" + safeText(email) + "</td>"
      + "<td>" + safeText(loginTime) + "</td>"
      + "<td>" + safeText(deviceName) + "</td>"
      + "<td>" + safeText(address) + "</td>"
      + "<td>" + safeText(timezone) + "</td>"
      + "<td>" + safeText(ip) + "</td>"
      + "</tr>";
  }).join("");
}

function formatFailedTime(data) {
  let dateObj = null;

  if (data && data.failedAt && typeof data.failedAt.toDate === "function") {
    dateObj = data.failedAt.toDate();
  } else if (data && data.localFailedAt) {
    const parsed = new Date(data.localFailedAt);
    if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
  }

  if (!dateObj) return "Unknown time";
  return dateObj.toLocaleString();
}

function getFailedDate(data) {
  if (data && data.failedAt && typeof data.failedAt.toDate === "function") {
    return data.failedAt.toDate();
  }

  if (data && data.localFailedAt) {
    const parsed = new Date(data.localFailedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getStoredLogoutVersion() {
  const raw = localStorage.getItem(SESSION_LOGOUT_VERSION_KEY);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setStoredLogoutVersion(version) {
  localStorage.setItem(SESSION_LOGOUT_VERSION_KEY, String(version || 0));
}

function deriveUserManagementRows() {
  const users = new Map();

  latestLoginEntries.forEach((item) => {
    const email = (item.email || "Unknown user").trim() || "Unknown user";
    const current = users.get(email) || {
      email,
      lastSuccess: null,
      lastFailed: null,
    };
    const date = getLoginDate(item);
    if (!current.lastSuccess || (date && date > current.lastSuccess.date)) {
      current.lastSuccess = {
        date,
        label: formatLoginTime(item),
      };
    }
    users.set(email, current);
  });

  latestFailedEntries.forEach((item) => {
    const email = (item.email || "Unknown user").trim() || "Unknown user";
    const current = users.get(email) || {
      email,
      lastSuccess: null,
      lastFailed: null,
    };
    const date = getFailedDate(item);
    if (!current.lastFailed || (date && date > current.lastFailed.date)) {
      current.lastFailed = {
        date,
        label: formatFailedTime(item),
      };
    }
    users.set(email, current);
  });

  return Array.from(users.values()).sort((a, b) => {
    const aTime = Math.max(
      a.lastSuccess && a.lastSuccess.date ? a.lastSuccess.date.getTime() : 0,
      a.lastFailed && a.lastFailed.date ? a.lastFailed.date.getTime() : 0
    );
    const bTime = Math.max(
      b.lastSuccess && b.lastSuccess.date ? b.lastSuccess.date.getTime() : 0,
      b.lastFailed && b.lastFailed.date ? b.lastFailed.date.getTime() : 0
    );
    return bTime - aTime;
  });
}

function renderUserManagement() {
  if (!userManagementList) return;

  const rows = deriveUserManagementRows();
  if (!rows.length) {
    userManagementList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"5\">No users found from current logs.</td></tr>";
    return;
  }

  const now = Date.now();
  const activeWindowMs = 24 * 60 * 60 * 1000;

  const canForceLogoutUser = (email) => {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "unknown user" || normalized === "anonymous") return false;
    if (normalized === ADMIN_EMAIL.toLowerCase()) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  };

  userManagementList.innerHTML = rows.map((row) => {
    const successLabel = row.lastSuccess ? row.lastSuccess.label : "No successful login";
    const failedLabel = row.lastFailed ? row.lastFailed.label : "No failed attempt";
    const lastSeenMs = Math.max(
      row.lastSuccess && row.lastSuccess.date ? row.lastSuccess.date.getTime() : 0,
      row.lastFailed && row.lastFailed.date ? row.lastFailed.date.getTime() : 0
    );
    const isActive = lastSeenMs > 0 && now - lastSeenMs <= activeWindowMs;
    const statusClass = isActive ? "user-chip" : "user-chip inactive";
    const statusText = isActive ? "Active (24h)" : "Inactive";
    const allowForceLogout = canForceLogoutUser(row.email);
    const actionButton = allowForceLogout
      ? "<button class=\"btn-danger js-force-user-logout\" type=\"button\" data-email=\"" + safeText(row.email) + "\">Force Logout</button>"
      : "<span class=\"user-chip inactive\">Unavailable</span>";

    return "<tr>"
      + "<td>" + safeText(row.email) + "</td>"
      + "<td>" + safeText(successLabel) + "</td>"
      + "<td>" + safeText(failedLabel) + "</td>"
      + "<td><span class=\"" + statusClass + "\">" + safeText(statusText) + "</span></td>"
      + "<td>" + actionButton + "</td>"
      + "</tr>";
  }).join("");
}

function renderFailedHistory(entries) {
  if (!failedHistoryList) return;

  const filteredEntries = applySearch(entries, formatFailedTime);

  if (!filteredEntries.length) {
    failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"7\">No wrong password attempts yet.</td></tr>";
    return;
  }

  failedHistoryList.innerHTML = filteredEntries.map((item) => {
    const email = item.email || "Unknown user";
    const deviceName = item.deviceName || "Unknown device";
    const failedTime = formatFailedTime(item);
    const city = item.city || "Unknown city";
    const state = item.state || "Unknown state";
    const country = item.country || "Unknown country";
    const timezone = item.timezone || "Unknown timezone";
    const attemptedPassword = item.attemptedPassword || "";
    const ip = item.ip || "N/A";
    const address = city + ", " + state + ", " + country;
    const emailCellClass = isAnonymousEmail(email) ? "cell-anonymous" : "";

    return "<tr>"
      + "<td class=\"" + emailCellClass + "\">" + safeText(email) + "</td>"
      + "<td>" + safeText(failedTime) + "</td>"
      + "<td>" + safeText(deviceName) + "</td>"
      + "<td>" + safeText(address) + "</td>"
      + "<td>" + safeText(timezone) + "</td>"
      + "<td>" + safeText(ip) + "</td>"
      + "<td><span class=\"cell-password\">" + safeText(attemptedPassword) + "</span></td>"
      + "</tr>";
  }).join("");
}

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  if (/[,\"\n]/.test(str)) {
    return '"' + str.replace(/\"/g, '""') + '"';
  }

  return str;
}

function buildCsvContent() {
  const successHeader = [
    "Type",
    "Email",
    "Date & Time",
    "Device/Browser",
    "Location",
    "Timezone",
    "IP Address",
    "Password Typed",
  ];

  const successRows = latestLoginEntries.map((item) => {
    const city = item.city || "Unknown city";
    const state = item.state || "Unknown state";
    const country = item.country || "Unknown country";

    return [
      "Successful Login",
      item.email || "Unknown user",
      formatLoginTime(item),
      item.deviceName || "Unknown device",
      city + ", " + state + ", " + country,
      item.timezone || "Unknown timezone",
      item.ip || "N/A",
      "",
    ];
  });

  const failedRows = latestFailedEntries.map((item) => {
    const city = item.city || "Unknown city";
    const state = item.state || "Unknown state";
    const country = item.country || "Unknown country";

    return [
      "Wrong Password Attempt",
      item.email || "Unknown user",
      formatFailedTime(item),
      item.deviceName || "Unknown device",
      city + ", " + state + ", " + country,
      item.timezone || "Unknown timezone",
      item.ip || "N/A",
      item.attemptedPassword || "",
    ];
  });

  const rows = [successHeader, ...successRows, ...failedRows];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCsvFile() {
  if (!latestLoginEntries.length && !latestFailedEntries.length) {
    setStatus("No data available to export.", "error");
    return;
  }

  const csvContent = buildCsvContent();
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = "security-logs-" + datePart + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setStatus("CSV downloaded successfully.", "ok");
}

function rerenderTables() {
  renderLoginHistory(latestLoginEntries);
  renderFailedHistory(latestFailedEntries);
  renderUserManagement();
}

async function refreshDashboardData() {
  if (refreshDataBtn) refreshDataBtn.disabled = true;
  if (refreshLogsBtn) refreshLogsBtn.disabled = true;
  if (forceLogoutAllBtn) forceLogoutAllBtn.disabled = true;

  try {
    setStatus("Refreshing data...", "ok");
    await Promise.all([loadLoginHistory(), loadFailedHistory()]);
    renderUserManagement();
    setStatus("Dashboard refreshed.", "ok");
  } finally {
    if (refreshDataBtn) refreshDataBtn.disabled = false;
    if (refreshLogsBtn) refreshLogsBtn.disabled = false;
    if (forceLogoutAllBtn) forceLogoutAllBtn.disabled = false;
  }
}

async function publishForcedLogout(reason, targetEmail) {
  const nextVersion = Date.now();
  const normalizedTarget = (targetEmail || "").trim().toLowerCase();
  const hasTarget = Boolean(normalizedTarget);

  await setDoc(
    doc(db, SESSION_CONTROL_COLLECTION, SESSION_CONTROL_DOC),
    {
      logoutVersion: nextVersion,
      logoutScope: hasTarget ? "user" : "all",
      targetEmail: hasTarget ? normalizedTarget : null,
      reason: reason || "Session ended by admin.",
      updatedBy: (auth.currentUser && auth.currentUser.email) || "unknown",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  setStoredLogoutVersion(nextVersion);
  return nextVersion;
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

      manualAdminLoginInProgress = false;
      await signOut(auth).catch(() => {});
      showPanel(false);
      adminPass.value = "";
      setStatus("You were logged out from another device.", "error");
    },
    () => {
      // Keep dashboard usable even if watcher cannot attach.
    }
  );
}

async function loadLoginHistory() {
  if (!loginHistoryList) return;

  loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"6\">Loading login history...</td></tr>";

  try {
    const historyQuery = query(
      collection(db, "siteLoginEvents"),
      orderBy("loginAt", "desc"),
      limit(50)
    );

    const snapshot = await getDocs(historyQuery);
    const items = snapshot.docs.map((doc) => doc.data());
    latestLoginEntries = items;
    renderLoginHistory(latestLoginEntries);
  } catch {
    loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"6\">Could not load history. Check Firestore rules.</td></tr>";
  }
}

async function loadFailedHistory() {
  if (!failedHistoryList) return;

  failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"7\">Loading failed attempts...</td></tr>";

  try {
    const failedQuery = query(
      collection(db, "siteFailedLoginEvents"),
      orderBy("failedAt", "desc"),
      limit(50)
    );

    const snapshot = await getDocs(failedQuery);
    const items = snapshot.docs.map((doc) => doc.data());
    latestFailedEntries = items;
    renderFailedHistory(latestFailedEntries);
  } catch {
    failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"7\">Could not load failed attempts. Check Firestore rules.</td></tr>";
  }
}

if (tableSearch) {
  tableSearch.addEventListener("input", () => {
    rerenderTables();
  });
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener("click", downloadCsvFile);
}

if (refreshDataBtn) {
  refreshDataBtn.addEventListener("click", refreshDashboardData);
}

if (refreshLogsBtn) {
  refreshLogsBtn.addEventListener("click", refreshDashboardData);
}

if (navDashboardBtn) {
  navDashboardBtn.addEventListener("click", () => {
    showDashboardView("dashboard");
  });
}

if (navSecurityLogsBtn) {
  navSecurityLogsBtn.addEventListener("click", () => {
    showDashboardView("logs");
  });
}

if (navUserManagementBtn) {
  navUserManagementBtn.addEventListener("click", () => {
    showDashboardView("users");
  });
}

if (userManagementList) {
  userManagementList.addEventListener("click", async (event) => {
    const trigger = event.target && event.target.closest
      ? event.target.closest(".js-force-user-logout")
      : null;

    if (!trigger) return;

    if (!auth.currentUser) {
      setStatus("Sign in as admin to manage user sessions.", "error");
      return;
    }

    const email = (trigger.getAttribute("data-email") || "").trim().toLowerCase();
    if (!email) {
      setStatus("Could not identify selected user.", "error");
      return;
    }

    trigger.disabled = true;
    try {
      await publishForcedLogout("Forced logout for user " + email + ".", email);
      setStatus("Logout signal sent for " + email + ".", "ok");
    } catch {
      setStatus("Could not force logout for " + email + ". Check Firestore rules.", "error");
    } finally {
      trigger.disabled = false;
    }
  });
}

if (forceLogoutAllBtn) {
  forceLogoutAllBtn.addEventListener("click", async () => {
    if (!auth.currentUser) {
      setStatus("Sign in as admin to manage sessions.", "error");
      return;
    }

    forceLogoutAllBtn.disabled = true;
    try {
      await publishForcedLogout("Forced logout triggered from user management.");
      setStatus("Forced logout signal sent to all devices.", "ok");
    } catch {
      setStatus("Could not trigger global logout. Check Firestore rules.", "error");
    } finally {
      forceLogoutAllBtn.disabled = false;
    }
  });
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
    await refreshDashboardData();
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
  let sentGlobalLogout = false;

  try {
    await publishForcedLogout("Admin logged out and ended active sessions.");
    sentGlobalLogout = true;
  } catch {
    // Fall back to local logout if shared-session signal fails.
  }

  try {
    await signOut(auth);
  } catch {
    // Even if sign out fails, hide panel to avoid stale admin UI.
  }

  showPanel(false);
  setStatus(
    sentGlobalLogout
      ? "Logged out. Other devices will be signed out too."
      : "Logged out only on this device. Could not notify other devices.",
    sentGlobalLogout ? "ok" : "error"
  );
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
  showDashboardView("dashboard");
  await refreshDashboardData();
});

showDashboardView("dashboard");
initializeSessionLogoutWatcher();
