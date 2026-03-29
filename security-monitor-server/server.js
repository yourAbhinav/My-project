import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import admin from "firebase-admin";

const {
  PORT = 8080,
  FRONTEND_URL = "",
  ALLOWED_ORIGINS = "",
  DEVICE_COOKIE_SECRET = "",
  FIREBASE_PROJECT_ID = "",
  FIREBASE_CLIENT_EMAIL = "",
  FIREBASE_PRIVATE_KEY = "",
  ALERT_WEBHOOK_URL = "",
} = process.env;

if (!DEVICE_COOKIE_SECRET) {
  throw new Error("Missing DEVICE_COOKIE_SECRET in environment.");
}

if (!admin.apps.length) {
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
const app = express();
app.set("trust proxy", true);

const allowedOrigins = ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (FRONTEND_URL && !allowedOrigins.includes(FRONTEND_URL)) {
  allowedOrigins.push(FRONTEND_URL);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rawIp = forwarded || req.ip || req.socket?.remoteAddress || "";
  return String(rawIp).replace(/^::ffff:/, "");
}

function createSignedDeviceToken(uid, uniqueDeviceHash) {
  const issuedAt = Date.now();
  const payload = `${uid}:${uniqueDeviceHash}:${issuedAt}`;
  const signature = crypto
    .createHmac("sha256", DEVICE_COOKIE_SECRET)
    .update(payload)
    .digest("hex");

  return `${payload}:${signature}`;
}

function buildUniqueDeviceHash(visitorId, fingerprintData) {
  const seed = JSON.stringify({
    visitorId,
    canvas: fingerprintData?.canvasFingerprint || "",
    hardwareConcurrency: fingerprintData?.hardwareConcurrency || "",
    screenResolution: fingerprintData?.screenResolution || "",
    platform: fingerprintData?.platform || "",
  });

  return crypto.createHash("sha256").update(seed).digest("hex");
}

function looksLikeVpnOrProxy(ispProvider, asn, org) {
  const value = `${ispProvider || ""} ${asn || ""} ${org || ""}`.toLowerCase();
  return /(vpn|proxy|hosting|cloud|datacenter|data center|colo|amazon|digitalocean|ovh|m247|nord|surfshark|expressvpn)/i.test(value);
}

async function fetchNetworkIntelligence(ipAddress) {
  const fallback = {
    ip: ipAddress || "",
    city: "Unknown city",
    country: "Unknown country",
    ispProvider: "Unknown ISP",
    asn: "",
    latitude: null,
    longitude: null,
  };

  if (!ipAddress) return fallback;

  try {
    const ipapiResp = await fetch(`https://ipapi.co/${encodeURIComponent(ipAddress)}/json/`);
    if (ipapiResp.ok) {
      const data = await ipapiResp.json();
      return {
        ip: data.ip || ipAddress,
        city: data.city || fallback.city,
        country: data.country_name || fallback.country,
        ispProvider: data.org || data.asn_org || fallback.ispProvider,
        asn: data.asn || "",
        latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
        longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
      };
    }
  } catch {
    // Continue to secondary provider.
  }

  try {
    const ipinfoResp = await fetch(`https://ipinfo.io/${encodeURIComponent(ipAddress)}/json`);
    if (ipinfoResp.ok) {
      const data = await ipinfoResp.json();
      const [latRaw, lngRaw] = String(data.loc || ",").split(",");
      return {
        ip: data.ip || ipAddress,
        city: data.city || fallback.city,
        country: data.country || fallback.country,
        ispProvider: data.org || fallback.ispProvider,
        asn: data.org || "",
        latitude: Number.isFinite(Number(latRaw)) ? Number(latRaw) : null,
        longitude: Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null,
      };
    }
  } catch {
    // Fall through.
  }

  return fallback;
}

async function sendAlertIfNeeded(payload) {
  if (!ALERT_WEBHOOK_URL) {
    return;
  }

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Keep login path non-blocking even if alerting service fails.
  }
}

async function verifyFirebaseUser(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Missing Firebase ID token." });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid Firebase ID token." });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "advanced-login-monitor" });
});

app.post("/api/security/session/start", verifyFirebaseUser, async (req, res) => {
  const { visitorId = "", fingerprint = {}, ua = {}, geo = {}, network = {} } = req.body || {};
  if (!visitorId) {
    res.status(400).json({ error: "visitorId is required." });
    return;
  }

  const firebaseUser = req.firebaseUser;
  const uid = firebaseUser.uid;
  const email = firebaseUser.email || "unknown";
  const realIp = getClientIp(req);

  const uniqueDeviceHash = buildUniqueDeviceHash(visitorId, fingerprint);
  const networkIntel = await fetchNetworkIntelligence(realIp);
  const mergedNetwork = {
    ip: networkIntel.ip || realIp,
    city: network.city || networkIntel.city,
    country: network.country || networkIntel.country,
    ispProvider: network.ispProvider || network.asnOrg || networkIntel.ispProvider,
    asn: network.asn || networkIntel.asn,
    latitude: Number.isFinite(Number(geo.latitude)) ? Number(geo.latitude) : networkIntel.latitude,
    longitude: Number.isFinite(Number(geo.longitude)) ? Number(geo.longitude) : networkIntel.longitude,
  };
  const isVpnDetected = looksLikeVpnOrProxy(
    mergedNetwork.ispProvider,
    mergedNetwork.asn,
    network.organization || mergedNetwork.ispProvider
  );

  const profileRef = db.collection("trustedDeviceProfiles").doc(`${uid}_${uniqueDeviceHash}`);
  const profileSnap = await profileRef.get();
  const profileData = profileSnap.exists ? profileSnap.data() : null;
  const seenIps = Array.isArray(profileData?.seenIps) ? profileData.seenIps : [];

  const ipSeenBefore = seenIps.includes(mergedNetwork.ip);
  const securityAnomaly = profileSnap.exists && !ipSeenBefore;

  await profileRef.set(
    {
      uid,
      email,
      visitorId,
      uniqueDeviceHash,
      exactModel: ua.exactModel || "Unknown model",
      vendor: ua.vendor || "Unknown vendor",
      model: ua.model || "Unknown model",
      osName: ua.osName || "Unknown OS",
      osVersion: ua.osVersion || "",
      browserName: ua.browserName || "Unknown browser",
      trusted: Boolean(profileData?.trusted),
      seenIps: admin.firestore.FieldValue.arrayUnion(mergedNetwork.ip || ""),
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: profileData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const loginPayload = {
    email,
    uid,
    loginAt: admin.firestore.FieldValue.serverTimestamp(),
    localLoginAt: new Date().toISOString(),
    exact_model: ua.exactModel || "Unknown model",
    unique_device_hash: uniqueDeviceHash,
    real_ip: mergedNetwork.ip || realIp,
    isp_provider: mergedNetwork.ispProvider || "Unknown ISP",
    is_vpn_detected: isVpnDetected,
    city: mergedNetwork.city || "Unknown city",
    country: mergedNetwork.country || "Unknown country",
    ip: mergedNetwork.ip || realIp,
    isp: mergedNetwork.ispProvider || "Unknown ISP",
    asn: mergedNetwork.asn || "",
    latitude: Number.isFinite(Number(mergedNetwork.latitude)) ? Number(mergedNetwork.latitude) : null,
    longitude: Number.isFinite(Number(mergedNetwork.longitude)) ? Number(mergedNetwork.longitude) : null,
    browser: ua.browserName || "Unknown browser",
    device: fingerprint.deviceType || "Unknown device",
    deviceBrand: ua.vendor || "Unknown vendor",
    deviceModel: ua.model || "Unknown model",
    osName: ua.osName || "Unknown OS",
    osVersion: ua.osVersion || "",
    security_anomaly: securityAnomaly,
    geo_source: Number.isFinite(Number(geo.latitude)) && Number.isFinite(Number(geo.longitude)) ? "gps" : "ip",
    trusted_device: Boolean(profileData?.trusted),
  };

  await db.collection("siteLoginEvents").add(loginPayload);
  await db.collection("advancedLoginEvents").add(loginPayload);

  if (securityAnomaly) {
    const alert = {
      type: "SECURITY_ANOMALY",
      uid,
      email,
      unique_device_hash: uniqueDeviceHash,
      exact_model: loginPayload.exact_model,
      real_ip: loginPayload.real_ip,
      isp_provider: loginPayload.isp_provider,
      is_vpn_detected: loginPayload.is_vpn_detected,
      city: loginPayload.city,
      country: loginPayload.country,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      localCreatedAt: new Date().toISOString(),
      reason: "New IP detected for known visitor fingerprint.",
    };

    await db.collection("securityAlerts").add(alert);
    await sendAlertIfNeeded({
      message: `Security anomaly for ${email}: IP ${loginPayload.real_ip}, device hash ${uniqueDeviceHash}`,
      alert,
    });
  }

  const signedToken = createSignedDeviceToken(uid, uniqueDeviceHash);
  res.cookie("device_session", signedToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });

  res.json({
    ok: true,
    uniqueDeviceHash,
    realIp: loginPayload.real_ip,
    ispProvider: loginPayload.isp_provider,
    isVpnDetected: isVpnDetected,
    securityAnomaly,
    trustedDevice: Boolean(profileData?.trusted),
  });
});

app.post("/api/security/device/trust", verifyFirebaseUser, async (req, res) => {
  const { uniqueDeviceHash = "", visitorId = "", fingerprint = {}, note = "Trusted from user action" } = req.body || {};
  const uid = req.firebaseUser.uid;
  const email = req.firebaseUser.email || "unknown";

  const resolvedHash = uniqueDeviceHash || (visitorId ? buildUniqueDeviceHash(visitorId, fingerprint) : "");
  if (!resolvedHash) {
    res.status(400).json({ error: "uniqueDeviceHash or visitorId is required." });
    return;
  }

  const profileRef = db.collection("trustedDeviceProfiles").doc(`${uid}_${resolvedHash}`);
  await profileRef.set(
    {
      uid,
      email,
      uniqueDeviceHash: resolvedHash,
      trusted: true,
      trustedAt: admin.firestore.FieldValue.serverTimestamp(),
      trustedNote: note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ ok: true, trusted: true, uniqueDeviceHash: resolvedHash });
});

app.listen(Number(PORT), () => {
  console.log(`Advanced Login Monitor server running on http://localhost:${PORT}`);
});
