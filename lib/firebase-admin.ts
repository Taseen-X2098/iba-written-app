import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let initializationAttempted = false;
let messaging: Messaging | null = null;

/**
 * Firebase is optional in development and in deployments where browser push
 * is disabled. Initialize it lazily so an absent credential cannot break an
 * unrelated mutation such as publishing exam results.
 */
export function getAdminMessaging() {
  if (initializationAttempted) return messaging;
  initializationAttempted = true;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase push skipped: server credentials are not configured.");
    return null;
  }

  try {
    const app = getApps()[0] ?? initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }

  return messaging;
}
