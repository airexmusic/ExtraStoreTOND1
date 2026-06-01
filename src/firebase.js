import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBs1OUDdAY9iAOJIQbFWDUaN_UbSw_HxDM",
  authDomain: "extraitemtond.firebaseapp.com",
  projectId: "extraitemtond",
  storageBucket: "extraitemtond.firebasestorage.app",
  messagingSenderId: "995070055042",
  appId: "1:995070055042:web:0b079d9a6968e70d741a9b",
  measurementId: "G-P3QJRSZN5W",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
