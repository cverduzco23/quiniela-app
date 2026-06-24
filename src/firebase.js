import { initializeApp, deleteApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
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
// experimentalAutoDetectLongPolling: en redes móviles/proxies donde el WebSocket
// de Firestore se "cuelga" sin fallar, el SDK detecta el problema y cambia solo a
// long-polling (que sí pasa). Evita el spinner infinito de "Cargando ranking…".
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
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

/**
 * Genera una contraseña temporal legible para compartir por WhatsApp.
 * Evita caracteres ambiguos (0/O, 1/l/I) para que sea fácil de teclear.
 * Formato: "qp-XXXXXX" (8+ chars, cumple el mínimo de Firebase).
 */
export function generarPasswordTemporal() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return `qp-${s}`;
}

/**
 * Crea una cuenta de Firebase Auth SIN afectar la sesión actual del super admin.
 *
 * El truco: se levanta una instancia secundaria y aislada de Firebase solo para
 * esta operación. createUserWithEmailAndPassword inicia sesión en ESA instancia
 * (no en la principal), así que el super admin nunca pierde su sesión. Al terminar
 * se cierra la sesión secundaria y se destruye la instancia.
 *
 * @returns {Promise<string>} el UID de la cuenta recién creada.
 * @throws  reenvía el error de Firebase (ej. 'auth/email-already-in-use').
 */
export async function crearUsuarioAislado(email, password) {
  const secundaria = initializeApp(firebaseConfig, `alta-${Date.now()}`);
  try {
    const authSecundaria = getAuth(secundaria);
    const cred = await createUserWithEmailAndPassword(authSecundaria, email, password);
    const uid = cred.user.uid;
    await signOut(authSecundaria);
    return uid;
  } finally {
    await deleteApp(secundaria);
  }
}
