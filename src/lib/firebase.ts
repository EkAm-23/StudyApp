import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAzis6BSt-HJ_W_A-gScBhy1nTgOT5ZgMQ",
  authDomain: "studyapp-10c4b.firebaseapp.com",
  projectId: "studyapp-10c4b",
  storageBucket: "studyapp-10c4b.firebasestorage.app",
  messagingSenderId: "322031084691",
  appId: "1:322031084691:web:f752fa340816aeec61d966"
};
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
