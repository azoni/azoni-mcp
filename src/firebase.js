import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import 'dotenv/config';

let db = null;
let fabStatsDb = null;

export function initializeFirebase() {
  if (db) return db;

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  initializeApp({
    credential: cert(serviceAccount),
  });

  db = getFirestore();
  console.log('Firebase connected');

  // Optional second Firebase project for fab-stats
  if (process.env.FABSTATS_FIREBASE_SERVICE_ACCOUNT) {
    const fabStatsSA = JSON.parse(process.env.FABSTATS_FIREBASE_SERVICE_ACCOUNT);
    const fabStatsApp = initializeApp({ credential: cert(fabStatsSA) }, 'fabstats');
    fabStatsDb = getFirestore(fabStatsApp);
    console.log('FaB Stats Firebase connected');
  }

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  return db;
}

export function getFabStatsDb() {
  if (!fabStatsDb) {
    throw new Error('FaB Stats Firebase not initialized — set FABSTATS_FIREBASE_SERVICE_ACCOUNT');
  }
  return fabStatsDb;
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}