import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

import { env } from "./env.js";

const serverRoot = fileURLToPath(new URL("../../", import.meta.url));

let firebaseAuthInstance = null;

export const isFirebaseConfigured = Boolean(
  env.FIREBASE_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT_PATH,
);

export async function getFirebaseAuth() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase Authentication is not configured.");
  }

  if (firebaseAuthInstance) {
    return firebaseAuthInstance;
  }

  const serviceAccountPath = resolve(
    serverRoot,
    env.FIREBASE_SERVICE_ACCOUNT_PATH,
  );

  const serviceAccountContent = await readFile(
    serviceAccountPath,
    "utf8",
  );

  const serviceAccount = JSON.parse(serviceAccountContent);

  if (serviceAccount.project_id !== env.FIREBASE_PROJECT_ID) {
    throw new Error(
      "Firebase service-account project ID does not match FIREBASE_PROJECT_ID.",
    );
  }

  const existingApp = getApps().find(
    (app) => app.name === "linkforge",
  );

  const firebaseApp =
    existingApp ??
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId: env.FIREBASE_PROJECT_ID,
      },
      "linkforge",
    );

  firebaseAuthInstance = getAuth(firebaseApp);

  return firebaseAuthInstance;
}