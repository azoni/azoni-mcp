import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';

let db = null;

export function initializeFirebase() {
  if (db) return db;

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  initializeApp({
    credential: cert(serviceAccount),
  });

  db = getFirestore();
  console.log('Firebase connected');
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  return db;
}