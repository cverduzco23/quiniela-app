import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";

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
export const auth = getAuth(app);

// ── Analytics ─────────────────────────────────────────────────
// Se inicializa de forma asíncrona solo si el entorno lo soporta
// (evita errores en SSR, navegadores sin cookies, etc.)
let _analytics = null;
if (typeof window !== "undefined") {
  isSupported()
    .then((ok) => { if (ok) _analytics = getAnalytics(app); })
    .catch(() => { /* analytics no disponible, seguimos sin él */ });
}

/**
 * Registra un evento en Google Analytics si está disponible.
 * Silencioso ante cualquier error — Analytics nunca debe romper el flujo de la app.
 */
export function track(eventName, params = {}) {
  try {
    if (_analytics) logEvent(_analytics, eventName, params);
  } catch { /* noop */ }
}
