import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCIGNYP8v40s5_AtNJFRaKUq1qsVAdkQlU",
  authDomain: "iba-written.firebaseapp.com",
  projectId: "iba-written",
  storageBucket: "iba-written.firebasestorage.app",
  messagingSenderId: "21122626093",
  appId: "1:21122626093:web:a5b59e1f6b2b5be8387ea4",
  measurementId: "G-YP37GC62XE"
};

export const app = initializeApp(firebaseConfig);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;
