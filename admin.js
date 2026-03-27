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
const loginStatusInline = document.getElementById("loginStatusInline");
let manualAdminLoginInProgress = false;
let latestLoginEntries = [];
let latestFailedEntries = [];

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
    await loadFailedHistory();
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
  await loadFailedHistory();
});
