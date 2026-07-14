import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging as getFirebaseMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";

/**
 * Firebase Admin initialisation for sending FCM push notifications.
 *
 * The service-account credentials are resolved (in order) from:
 *   1. process.env.FIREBASE_SERVICE_ACCOUNT      -> raw JSON string
 *   2. process.env.FIREBASE_SERVICE_ACCOUNT_PATH -> path to a JSON file
 *   3. ./serviceAccountKey.json (project root)   -> default file location
 *
 * If no credentials are found, push sending is disabled gracefully and the
 * rest of the app keeps working (in-app notifications only).
 */

let messaging = null;

const loadServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[firebase] FIREBASE_SERVICE_ACCOUNT is not valid JSON:", err.message);
    }
  }

  const candidatePaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.resolve(process.cwd(), "serviceAccountKey.json"),
  ].filter(Boolean);

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      }
    } catch (err) {
      console.warn(`[firebase] Failed to read service account at ${filePath}:`, err.message);
    }
  }

  return null;
};

const init = () => {
  const existingApp = getApps()[0];
  if (existingApp) {
    messaging = getFirebaseMessaging(existingApp);
    return;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn(
      "[firebase] No service-account credentials found — push notifications are disabled. " +
        "Add serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT.",
    );
    return;
  }

  try {
    const app = initializeApp({
      credential: cert(serviceAccount),
    });
    messaging = getFirebaseMessaging(app);
    console.log("[firebase] Admin initialised — push notifications enabled.");
  } catch (err) {
    console.error("[firebase] Failed to initialise Admin SDK:", err.message);
  }
};

init();

export const isPushEnabled = () => messaging !== null;
export const getMessaging = () => messaging;
