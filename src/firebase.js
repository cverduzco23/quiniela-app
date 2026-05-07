import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCF6AEc1nXs_cu6rXUqoQILl-kkAg2ThBQ",
  authDomain: "quiniela-app-24896.firebaseapp.com",
  projectId: "quiniela-app-24896",
  storageBucket: "quiniela-app-24896.firebasestorage.app",
  messagingSenderId: "411488784610",
  appId: "1:411488784610:web:bc65b7f1ca87258e3a0ebb"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);