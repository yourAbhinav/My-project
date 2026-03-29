import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, authReady, db, ADMIN_EMAIL, SITE_LOGIN_EMAIL } from "./firebase-config.js";

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
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const refreshDataBtn = document.getElementById("refreshDataBtn");
const refreshLogsBtn = document.getElementById("refreshLogsBtn");
const forceLogoutAllBtn = document.getElementById("forceLogoutAllBtn");
const userManagementList = document.getElementById("userManagementList");
const loginStatusInline = document.getElementById("loginStatusInline");
const navDashboardBtn = document.getElementById("navDashboardBtn");
const navUserManagementBtn = document.getElementById("navUserManagementBtn");
const navSecurityLogsBtn = document.getElementById("navSecurityLogsBtn");
const navSettingsBtn = document.getElementById("navSettingsBtn");
const successfulLoginsCard = document.getElementById("successfulLoginsCard");
const failedLoginsCard = document.getElementById("failedLoginsCard");
const userManagementCard = document.getElementById("userManagementCard");
const settingsCard = document.getElementById("settingsCard");
const settingsDeviceList = document.getElementById("settingsDeviceList");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebarScrim = document.getElementById("sidebarScrim");
let manualAdminLoginInProgress = false;
let authenticatedAdminUid = "";
let latestLoginEntries = [];
let latestFailedEntries = [];
let latestActiveSessions = [];
const SESSION_CONTROL_COLLECTION = "sessionControl";
const SESSION_CONTROL_DOC = "global";
const SESSION_LOGOUT_VERSION_KEY = "securityHubLogoutVersion";
const ACTIVE_SESSIONS_COLLECTION = "activeSessions";
const ACTIVE_SESSION_WINDOW_MS = 30 * 1000;
let sessionWatcherInitialized = false;
let activeSessionUnsubscribe = null;
let searchRenderTimer = null;

function isMobileViewport() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function setMobileSidebarOpen(isOpen) {
  if (!panelCard) return;

  panelCard.classList.toggle("sidebar-open", Boolean(isOpen));

  if (mobileMenuBtn) {
    mobileMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  document.body.classList.toggle("no-scroll-mobile", Boolean(isOpen) && isMobileViewport());
}

function setActiveNav(viewName) {
  const links = [
    { button: navDashboardBtn, view: "dashboard" },
    { button: navSecurityLogsBtn, view: "logs" },
    { button: navUserManagementBtn, view: "users" },
    { button: navSettingsBtn, view: "settings" },
  ];

  links.forEach(({ button, view }) => {
    if (!button) return;
    button.classList.toggle("active", view === viewName);
  });
}

function showDashboardView(viewName) {
  setActiveNav(viewName);

  if (isMobileViewport()) {
    setMobileSidebarOpen(false);
  }

  const showLogs = viewName === "dashboard" || viewName === "logs";
  const showUsers = viewName === "dashboard" || viewName === "users";
  const showSettings = viewName === "settings";

  if (successfulLoginsCard) {
    successfulLoginsCard.classList.toggle("hidden", !showLogs);
  }

  if (failedLoginsCard) {
    failedLoginsCard.classList.toggle("hidden", !showLogs);
  }

  if (userManagementCard) {
    userManagementCard.classList.toggle("hidden", !showUsers);
  }

  if (settingsCard) {
    settingsCard.classList.toggle("hidden", !showSettings);
  }

  if (viewName === "users" && userManagementCard) {
    userManagementCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (viewName === "settings" && settingsCard) {
    settingsCard.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (!isAdmin) {
    setMobileSidebarOpen(false);
  }
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

function detectBrowserFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Unknown browser";
}

function getDeviceLabel(item) {
  return item.device || item.deviceName || "Unknown device";
}

function getBrowserLabel(item) {
  return item.browser || detectBrowserFromUserAgent(item.userAgent);
}

function getBrandLabel(item) {
  return item.deviceBrand || "Unknown brand";
}

function getModelLabel(item) {
  return item.deviceModel || "Unknown model";
}

function getIpLabel(item) {
  return item.real_ip || item.ip || "N/A";
}

function getIspLabel(item) {
  return item.isp_provider || item.isp || "Unknown ISP";
}

function getUniqueDeviceHash(item) {
  return item.unique_device_hash || "N/A";
}

function getBooleanLikeValue(rawValue) {
  if (typeof rawValue === "boolean") return rawValue;
  const normalized = String(rawValue || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getVpnStatusLabel(item) {
  return getBooleanLikeValue(item.is_vpn_detected) ? "Yes" : "No";
}

function getAnomalyStatusLabel(item) {
  return getBooleanLikeValue(item.security_anomaly) ? "Anomaly" : "Normal";
}

function formatCoordinate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Unknown";
  return parsed.toFixed(5);
}

function getSearchText(item, timeValue) {
  const city = item.city || "";
  const state = item.state || "";
  const country = item.country || "";

  return [
    item.email,
    timeValue,
    getDeviceLabel(item),
    getBrandLabel(item),
    getModelLabel(item),
    getBrowserLabel(item),
    city,
    state,
    country,
    getIspLabel(item),
    item.latitude,
    item.longitude,
    item.timezone,
    getIpLabel(item),
    getUniqueDeviceHash(item),
    getVpnStatusLabel(item),
    getAnomalyStatusLabel(item),
    item.exact_model,
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
    loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"14\">No login history yet.</td></tr>";
    return;
  }

  loginHistoryList.innerHTML = filteredEntries.map((item) => {
    const email = item.email || "Unknown user";
    const loginTime = formatLoginTime(item);
    const device = getDeviceLabel(item);
    const brand = getBrandLabel(item);
    const model = getModelLabel(item);
    const browser = getBrowserLabel(item);
    const city = item.city || "Unknown city";
    const isp = getIspLabel(item);
    const latitude = formatCoordinate(item.latitude);
    const longitude = formatCoordinate(item.longitude);
    const ip = getIpLabel(item);
    const uniqueDeviceHash = getUniqueDeviceHash(item);
    const vpnDetected = getVpnStatusLabel(item);
    const anomalyStatus = getAnomalyStatusLabel(item);
    const emailCellClass = isAnonymousEmail(email) ? "cell-anonymous" : "";

    return "<tr>"
      + "<td class=\"" + emailCellClass + "\">" + safeText(email) + "</td>"
      + "<td>" + safeText(loginTime) + "</td>"
      + "<td>" + safeText(ip) + "</td>"
      + "<td>" + safeText(city) + "</td>"
      + "<td>" + safeText(isp) + "</td>"
      + "<td>" + safeText(device) + "</td>"
        + "<td>" + safeText(brand) + "</td>"
        + "<td>" + safeText(model) + "</td>"
      + "<td>" + safeText(browser) + "</td>"
      + "<td>" + safeText(uniqueDeviceHash) + "</td>"
      + "<td>" + safeText(vpnDetected) + "</td>"
      + "<td>" + safeText(anomalyStatus) + "</td>"
      + "<td>" + safeText(latitude) + "</td>"
      + "<td>" + safeText(longitude) + "</td>"
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

function getSessionDate(data) {
  if (data && data.lastSeenAt && typeof data.lastSeenAt.toDate === "function") {
    return data.lastSeenAt.toDate();
  }

  if (data && data.lastSeenLocalAt) {
    const parsed = new Date(data.lastSeenLocalAt);
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

function isSessionOnline(item) {
  const status = String(item && item.status ? item.status : "online").toLowerCase();
  if (status !== "online") return false;

  const seenDate = getSessionDate(item);
  if (!seenDate) return false;

  return Date.now() - seenDate.getTime() <= ACTIVE_SESSION_WINDOW_MS;
}

function formatSessionSeen(item) {
  const seenDate = getSessionDate(item);
  return seenDate ? seenDate.toLocaleString() : "Unknown time";
}

function normalizeUserEmail(email) {
  const trimmed = String(email || "").trim();
  return trimmed || "Unknown user";
}

function subscribeActiveSessions() {
  if (activeSessionUnsubscribe) return;

  activeSessionUnsubscribe = onSnapshot(
    collection(db, ACTIVE_SESSIONS_COLLECTION),
    (snapshot) => {
      latestActiveSessions = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data() || {};
        return {
          id: snapshotDoc.id,
          ...data,
        };
      });
      renderUserManagement();
      renderDeviceSecuritySettings();
    },
    () => {
      latestActiveSessions = [];
      renderUserManagement();
      renderDeviceSecuritySettings();
      setStatus("Could not load live session data. Check Firestore rules.", "error");
    }
  );
}

function unsubscribeActiveSessions() {
  if (!activeSessionUnsubscribe) return;
  activeSessionUnsubscribe();
  activeSessionUnsubscribe = null;
  latestActiveSessions = [];
}

function deriveUserManagementRows() {
  const users = new Map();

  latestLoginEntries.forEach((item) => {
    const email = normalizeUserEmail(item.email);
    const current = users.get(email) || {
      email,
      lastSuccess: null,
      lastFailed: null,
      activeSessions: [],
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
    const email = normalizeUserEmail(item.email);
    const current = users.get(email) || {
      email,
      lastSuccess: null,
      lastFailed: null,
      activeSessions: [],
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

  latestActiveSessions.forEach((item) => {
    const email = normalizeUserEmail(item.email);
    const current = users.get(email) || {
      email,
      lastSuccess: null,
      lastFailed: null,
      activeSessions: [],
    };

    if (isSessionOnline(item)) {
      current.activeSessions.push(item);
    }

    users.set(email, current);
  });

  return Array.from(users.values()).sort((a, b) => {
    const aTime = Math.max(
      a.lastSuccess && a.lastSuccess.date ? a.lastSuccess.date.getTime() : 0,
      a.lastFailed && a.lastFailed.date ? a.lastFailed.date.getTime() : 0,
      ...a.activeSessions.map((session) => {
        const sessionDate = getSessionDate(session);
        return sessionDate ? sessionDate.getTime() : 0;
      })
    );
    const bTime = Math.max(
      b.lastSuccess && b.lastSuccess.date ? b.lastSuccess.date.getTime() : 0,
      b.lastFailed && b.lastFailed.date ? b.lastFailed.date.getTime() : 0,
      ...b.activeSessions.map((session) => {
        const sessionDate = getSessionDate(session);
        return sessionDate ? sessionDate.getTime() : 0;
      })
    );
    return bTime - aTime;
  });
}

function renderUserManagement() {
  if (!userManagementList) return;

  const rows = deriveUserManagementRows();
  if (!rows.length) {
    userManagementList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"6\">No users found from current logs and active sessions.</td></tr>";
    return;
  }

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
    const activeCount = row.activeSessions.length;
    const statusClass = activeCount > 0 ? "user-chip" : "user-chip inactive";
    const statusText = activeCount > 0 ? "Live" : "Offline";
    const deviceDetails = activeCount > 0
      ? row.activeSessions.map((session) => {
        const details = [
          getDeviceLabel(session),
          getBrandLabel(session),
          getModelLabel(session),
          getBrowserLabel(session),
          session.city || "Unknown city",
          session.ip ? "IP " + session.ip : "IP N/A",
          "Seen " + formatSessionSeen(session),
        ];

        return "<div>" + safeText(details.join(" | ")) + "</div>";
      }).join("")
      : "<span class=\"user-chip inactive\">No active devices</span>";
    const allowForceLogout = canForceLogoutUser(row.email);
    const actionButton = allowForceLogout
      ? "<button class=\"btn-danger js-force-user-logout\" type=\"button\" data-email=\"" + safeText(row.email) + "\">Force Logout</button>"
      : "<span class=\"user-chip inactive\">Unavailable</span>";

    return "<tr>"
      + "<td>" + safeText(row.email) + "</td>"
      + "<td><span class=\"" + statusClass + "\">" + safeText(String(activeCount)) + " device(s)</span></td>"
      + "<td>" + deviceDetails + "</td>"
      + "<td>" + safeText(successLabel) + "</td>"
      + "<td>" + safeText(failedLabel) + "</td>"
      + "<td><span class=\"" + statusClass + "\">" + safeText(statusText) + "</span><br>" + actionButton + "</td>"
      + "</tr>";
  }).join("");
}

function renderFailedHistory(entries) {
  if (!failedHistoryList) return;

  const filteredEntries = applySearch(entries, formatFailedTime);

  if (!filteredEntries.length) {
    failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"15\">No wrong password attempts yet.</td></tr>";
    return;
  }

  failedHistoryList.innerHTML = filteredEntries.map((item) => {
    const email = item.email || "Unknown user";
    const failedTime = formatFailedTime(item);
    const device = getDeviceLabel(item);
    const brand = getBrandLabel(item);
    const model = getModelLabel(item);
    const browser = getBrowserLabel(item);
    const city = item.city || "Unknown city";
    const isp = getIspLabel(item);
    const latitude = formatCoordinate(item.latitude);
    const longitude = formatCoordinate(item.longitude);
    const attemptedPassword = item.attemptedPassword || "";
    const ip = getIpLabel(item);
    const uniqueDeviceHash = getUniqueDeviceHash(item);
    const vpnDetected = getVpnStatusLabel(item);
    const anomalyStatus = getAnomalyStatusLabel(item);
    const emailCellClass = isAnonymousEmail(email) ? "cell-anonymous" : "";

    return "<tr>"
      + "<td class=\"" + emailCellClass + "\">" + safeText(email) + "</td>"
      + "<td>" + safeText(failedTime) + "</td>"
      + "<td>" + safeText(ip) + "</td>"
      + "<td>" + safeText(city) + "</td>"
      + "<td>" + safeText(isp) + "</td>"
      + "<td>" + safeText(device) + "</td>"
      + "<td>" + safeText(brand) + "</td>"
      + "<td>" + safeText(model) + "</td>"
      + "<td>" + safeText(browser) + "</td>"
      + "<td>" + safeText(uniqueDeviceHash) + "</td>"
      + "<td>" + safeText(vpnDetected) + "</td>"
      + "<td>" + safeText(anomalyStatus) + "</td>"
      + "<td>" + safeText(latitude) + "</td>"
      + "<td>" + safeText(longitude) + "</td>"
      + "<td><span class=\"cell-password\">" + safeText(attemptedPassword) + "</span></td>"
      + "</tr>";
  }).join("");
}

function renderDeviceSecuritySettings() {
  if (!settingsDeviceList) return;

  const rows = latestActiveSessions
    .slice()
    .sort((a, b) => {
      const aTime = getSessionDate(a);
      const bTime = getSessionDate(b);
      return (bTime ? bTime.getTime() : 0) - (aTime ? aTime.getTime() : 0);
    });

  if (!rows.length) {
    settingsDeviceList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"8\">No active devices found.</td></tr>";
    return;
  }

  settingsDeviceList.innerHTML = rows.map((item) => {
    const email = normalizeUserEmail(item.email);
    const sessionId = item.sessionId || item.id || "";
    const status = isSessionOnline(item) ? "Live" : "Offline";
    const location = [item.city || "Unknown city", item.country || "Unknown country"].join(", ");
    const seenAt = formatSessionSeen(item);
    const ip = item.ip || "N/A";

    return "<tr>"
      + "<td>" + safeText(email) + "</td>"
      + "<td>" + safeText(getDeviceLabel(item)) + "</td>"
      + "<td>" + safeText(getBrandLabel(item)) + "</td>"
      + "<td>" + safeText(getModelLabel(item)) + "</td>"
      + "<td>" + safeText(getBrowserLabel(item)) + "</td>"
      + "<td>" + safeText(location) + "</td>"
      + "<td>" + safeText(status + " | " + seenAt + " | IP " + ip) + "</td>"
      + "<td><button class=\"btn-danger js-secure-remove-device\" type=\"button\" data-session-id=\"" + safeText(sessionId) + "\" data-email=\"" + safeText(email) + "\">Remove Device Data</button></td>"
      + "</tr>";
  }).join("");
}

function buildExportRows() {
  const headers = [
    "Type",
    "Email",
    "Login Time",
    "IP",
    "City",
    "ISP",
    "Device",
    "Brand",
    "Model",
    "Browser",
    "Unique Device Hash",
    "VPN Detected",
    "Anomaly Status",
    "Latitude",
    "Longitude",
    "Password Typed",
  ];

  const successRows = latestLoginEntries.map((item) => [
    "Successful Login",
    item.email || "Unknown user",
    formatLoginTime(item),
    item.ip || "N/A",
    item.city || "Unknown city",
    getIspLabel(item),
    getDeviceLabel(item),
    getBrandLabel(item),
    getModelLabel(item),
    getBrowserLabel(item),
    getUniqueDeviceHash(item),
    getVpnStatusLabel(item),
    getAnomalyStatusLabel(item),
    formatCoordinate(item.latitude),
    formatCoordinate(item.longitude),
    "",
  ]);

  const failedRows = latestFailedEntries.map((item) => [
    "Wrong Password Attempt",
    item.email || "Unknown user",
    formatFailedTime(item),
    item.ip || "N/A",
    item.city || "Unknown city",
    getIspLabel(item),
    getDeviceLabel(item),
    getBrandLabel(item),
    getModelLabel(item),
    getBrowserLabel(item),
    getUniqueDeviceHash(item),
    getVpnStatusLabel(item),
    getAnomalyStatusLabel(item),
    formatCoordinate(item.latitude),
    formatCoordinate(item.longitude),
    item.attemptedPassword || "",
  ]);

  return {
    headers,
    rows: [...successRows, ...failedRows],
  };
}

function downloadPdfFile() {
  if (!latestLoginEntries.length && !latestFailedEntries.length) {
    setStatus("No data available to export.", "error");
    return;
  }

  const jspdfNamespace = window.jspdf;
  if (!jspdfNamespace || !jspdfNamespace.jsPDF) {
    setStatus("PDF library is not loaded. Reload the page and try again.", "error");
    return;
  }

  const { headers, rows } = buildExportRows();
  const doc = new jspdfNamespace.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const datePart = new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toLocaleString();

  doc.setFontSize(14);
  doc.text("Security Login Logs", 40, 34);
  doc.setFontSize(10);
  doc.text("Generated: " + generatedAt, 40, 52);

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 64,
    margin: { left: 20, right: 20 },
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [10, 14, 39] },
    tableWidth: "auto",
  });

  doc.save("security-logs-" + datePart + ".pdf");
  setStatus("PDF downloaded successfully.", "ok");
}

function rerenderTables() {
  renderLoginHistory(latestLoginEntries);
  renderFailedHistory(latestFailedEntries);
  renderUserManagement();
  renderDeviceSecuritySettings();
}

async function refreshDashboardData() {
  if (refreshDataBtn) refreshDataBtn.disabled = true;
  if (refreshLogsBtn) refreshLogsBtn.disabled = true;
  if (forceLogoutAllBtn) forceLogoutAllBtn.disabled = true;

  try {
    setStatus("Refreshing data...", "ok");
    subscribeActiveSessions();
    await Promise.all([loadLoginHistory(), loadFailedHistory()]);
    renderUserManagement();
    setStatus("Dashboard refreshed.", "ok");
  } finally {
    if (refreshDataBtn) refreshDataBtn.disabled = false;
    if (refreshLogsBtn) refreshLogsBtn.disabled = false;
    if (forceLogoutAllBtn) forceLogoutAllBtn.disabled = false;
  }
}

async function publishForcedLogout(reason, targetEmail, options = {}) {
  const nextVersion = Date.now();
  const normalizedTarget = (targetEmail || "").trim().toLowerCase();
  const hasTarget = Boolean(normalizedTarget);
  const logoutScope = options.scope || (hasTarget ? "user" : "all");
  const targetSessionId = (options.sessionId || "").trim();
  const action = options.action || "logout";

  await setDoc(
    doc(db, SESSION_CONTROL_COLLECTION, SESSION_CONTROL_DOC),
    {
      logoutVersion: nextVersion,
      logoutScope,
      action,
      targetEmail: hasTarget ? normalizedTarget : null,
      targetSessionId: targetSessionId || null,
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
        logoutScope === "session"
          ? false
          : logoutScope !== "user"
          ? true
          : Boolean(targetEmail) && currentEmail === targetEmail;

      if (!shouldLogout) return;

      manualAdminLoginInProgress = false;
      authenticatedAdminUid = "";
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

  loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"11\">Loading login history...</td></tr>";

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
    loginHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"11\">Could not load history. Check Firestore rules.</td></tr>";
  }
}

async function loadFailedHistory() {
  if (!failedHistoryList) return;

  failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"12\">Loading failed attempts...</td></tr>";

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
    failedHistoryList.innerHTML = "<tr class=\"empty-row\"><td colspan=\"12\">Could not load failed attempts. Check Firestore rules.</td></tr>";
  }
}

if (tableSearch) {
  tableSearch.addEventListener("input", () => {
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
    }

    searchRenderTimer = window.setTimeout(() => {
      rerenderTables();
    }, 120);
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", downloadPdfFile);
}

if (refreshDataBtn) {
  refreshDataBtn.addEventListener("click", refreshDashboardData);
}

if (refreshLogsBtn) {
  refreshLogsBtn.addEventListener("click", refreshDashboardData);
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    const isOpen = panelCard && panelCard.classList.contains("sidebar-open");
    setMobileSidebarOpen(!isOpen);
  });
}

if (sidebarScrim) {
  sidebarScrim.addEventListener("click", () => {
    setMobileSidebarOpen(false);
  });
}

window.addEventListener("resize", () => {
  if (!isMobileViewport()) {
    setMobileSidebarOpen(false);
  }
});

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

if (navSettingsBtn) {
  navSettingsBtn.addEventListener("click", () => {
    showDashboardView("settings");
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

if (settingsDeviceList) {
  settingsDeviceList.addEventListener("click", async (event) => {
    const trigger = event.target && event.target.closest
      ? event.target.closest(".js-secure-remove-device")
      : null;

    if (!trigger) return;

    if (!auth.currentUser) {
      setStatus("Sign in as admin to manage sessions.", "error");
      return;
    }

    const sessionId = (trigger.getAttribute("data-session-id") || "").trim();
    const email = (trigger.getAttribute("data-email") || "").trim().toLowerCase();

    if (!sessionId) {
      setStatus("Could not identify selected device session.", "error");
      return;
    }

    trigger.disabled = true;
    try {
      await publishForcedLogout(
        "Device data removed by admin for session " + sessionId + ".",
        email,
        {
          scope: "session",
          sessionId,
          action: "wipe-session-data",
        }
      );

      await deleteDoc(doc(db, ACTIVE_SESSIONS_COLLECTION, sessionId)).catch(() => {});
      setStatus("Removed device data and forced logout for selected device.", "ok");
    } catch {
      setStatus("Could not remove selected device data. Check Firestore rules.", "error");
    } finally {
      trigger.disabled = false;
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

    await authReady;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!isAdminUser(credential.user)) {
      manualAdminLoginInProgress = false;
      authenticatedAdminUid = "";
      await signOut(auth).catch(() => {});
      setStatus("This account is not allowed for admin panel.", "error");
      showPanel(false);
      return;
    }

    authenticatedAdminUid = credential.user && credential.user.uid ? credential.user.uid : "";

    adminPass.value = "";
    setStatus("Admin login successful. Loading dashboard...", "ok");
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

  authenticatedAdminUid = "";
  unsubscribeActiveSessions();
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
    authenticatedAdminUid = "";
    unsubscribeActiveSessions();
    showPanel(false);
    return;
  }

  if (!user) {
    manualAdminLoginInProgress = false;
    authenticatedAdminUid = "";
    unsubscribeActiveSessions();
    showPanel(false);
    return;
  }

  if (!isAdminUser(user)) {
    manualAdminLoginInProgress = false;
    authenticatedAdminUid = "";
    unsubscribeActiveSessions();
    await signOut(auth).catch(() => {});
    showPanel(false);
    setStatus("This account is not allowed for admin panel.", "error");
    return;
  }

  if (!authenticatedAdminUid) {
    authenticatedAdminUid = user.uid || "";
  }

  if (authenticatedAdminUid && user.uid && authenticatedAdminUid !== user.uid) {
    manualAdminLoginInProgress = false;
    authenticatedAdminUid = "";
    unsubscribeActiveSessions();
    await signOut(auth).catch(() => {});
    showPanel(false);
    setStatus("Session mismatch detected. Please sign in again.", "error");
    return;
  }

  manualAdminLoginInProgress = false;

  adminInfo.textContent = "Logged in as: " + user.email + " (admin)";
  showPanel(true);
  subscribeActiveSessions();
  showDashboardView("dashboard");
  await refreshDashboardData();
});

showDashboardView("dashboard");
initializeSessionLogoutWatcher();
