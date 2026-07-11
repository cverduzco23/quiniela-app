// Analítica propia: contadores agregados en Firestore
//
// Diseño pensado para que sea BARATO y SEGURO:
//   • Un documento por DÍA  → analytics/dia_YYYYMMDD  (visitas, dispositivos, horas, envíos)
//   • Un documento por QUINIELA → analytics/q_<id>     (visitas, aperturas, en vivo)
//
// Solo guardamos CONTADORES que suman +1; nunca eventos crudos. Así el número
// de documentos crece poquísimo y cabe de sobra en la cuota gratis de Firebase.
// Cada visitante cuenta UNA sola vez por sesión (banderas en sessionStorage),
// aunque refresque la página mil veces.
//
// Lectura: solo el super admin (ver firestore.rules). Toda escritura es
// silenciosa ante errores: la analítica jamás debe romper la app del usuario.

import { db } from '../firebase'
import { doc, getDoc, setDoc, increment } from 'firebase/firestore'

// Marca una bandera de sesión; devuelve true solo la PRIMERA vez en la sesión.
function primeraVezEnSesion(clave) {
  try {
    if (sessionStorage.getItem(clave)) return false
    sessionStorage.setItem(clave, '1')
    return true
  } catch {
    return true // sin sessionStorage (modo privado, etc.): contamos igual
  }
}

// Fecha local de México en formato YYYYMMDD (en-CA da YYYY-MM-DD).
function fechaMx(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).replace(/-/g, '')
}

const idDiaHoy = () => 'dia_' + fechaMx()

// Hora local de México (0-23) como string, para la métrica de "hora pico".
function horaMx() {
  const h = new Date().toLocaleString('en-US', {
    timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false,
  })
  return String(parseInt(h, 10) % 24)
}

function clasificarDispositivo() {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase()
  const ios = /iphone|ipad|ipod/.test(ua)
  const android = /android/.test(ua)
  const movil = ios || android || /mobile/.test(ua)
  return { ios, android, movil }
}

// Ancho de pantalla: en celular lo guardamos EXACTO (los anchos reales de
// modelos distintos, como un iPhone Pro Max vs un Galaxy, sí importan para ver
// cómo se ve la web). En escritorio la ventana se redimensiona libremente,
// así que un valor exacto solo ensuciaría el conteo con cientos de valores
// casi únicos; ahí agrupamos en rangos.
function anchoPantalla() {
  try { return window.innerWidth || 0 } catch { return 0 }
}

function rangoAnchoEscritorio(w) {
  if (w < 1024) return '<1024'
  if (w < 1280) return '1024-1279'
  if (w < 1440) return '1280-1439'
  if (w < 1680) return '1440-1679'
  if (w < 1920) return '1680-1919'
  return '1920+'
}

async function escribir(idDoc, datos) {
  try {
    await setDoc(doc(db, 'analytics', idDoc), datos, { merge: true })
  } catch { /* silencioso: la analítica nunca rompe la app */ }
}

// Exclusión del propio dispositivo
// Si este navegador se marcó como "no contar" (típicamente el del admin), NINGUNA
// métrica se registra desde aquí. Así las visitas no se inflan con tus pruebas.
const FLAG_EXCLUIR     = 'qpa_no_contar'
const FLAG_DISPOSITIVO = 'qpa_dispositivo_contado'

export function estaExcluido() {
  try { return localStorage.getItem(FLAG_EXCLUIR) === '1' } catch { return false }
}

export function marcarExcluido(excluir) {
  try {
    if (excluir) localStorage.setItem(FLAG_EXCLUIR, '1')
    else localStorage.removeItem(FLAG_EXCLUIR)
  } catch { /* noop */ }
}

// Registro de eventos (desde las páginas públicas)

// Una visita a la app: cuenta visitas del día, dispositivo y hora. Una vez por sesión.
// Además cuenta el dispositivo como "único" la primera vez en la vida del navegador.
export function registrarVisita() {
  if (estaExcluido()) return
  // Dispositivo único: una sola vez por navegador (no por sesión).
  try {
    if (!localStorage.getItem(FLAG_DISPOSITIVO)) {
      localStorage.setItem(FLAG_DISPOSITIVO, '1')
      escribir('global', { dispositivos: increment(1) })
    }
  } catch { /* localStorage no disponible: omitimos el conteo único */ }
  if (!primeraVezEnSesion('an_visita')) return
  const { ios, android, movil } = clasificarDispositivo()
  const datos = {
    visitas: increment(1),
    horas: { [horaMx()]: increment(1) },
    [movil ? 'movil' : 'escritorio']: increment(1),
  }
  if (ios) datos.ios = increment(1)
  else if (android) datos.android = increment(1)
  const ancho = anchoPantalla()
  if (ancho > 0) {
    if (movil) datos.anchoMovil = { [String(ancho)]: increment(1) }
    else datos.anchoEscritorio = { [rangoAnchoEscritorio(ancho)]: increment(1) }
  }
  escribir(idDiaHoy(), datos)
}

// Visita a una quiniela concreta (para saber cuál es la más activa). Una vez por sesión.
export function registrarVisitaQuiniela(quinielaId) {
  if (estaExcluido() || !quinielaId) return
  if (!primeraVezEnSesion('an_q_' + quinielaId)) return
  escribir('q_' + quinielaId, { visitas: increment(1) })
}

// Alguien abrió las predicciones de un participante. Una vez por sesión y participante.
export function registrarApertura(quinielaId, prediccionId) {
  if (estaExcluido() || !quinielaId || !prediccionId) return
  if (!primeraVezEnSesion('an_ap_' + quinielaId + '_' + prediccionId)) return
  escribir('q_' + quinielaId, { aperturas: { [prediccionId]: increment(1) } })
}

// Un espectador viendo el ranking mientras un partido está EN VIVO.
// Una vez por sesión y por partido.
export function registrarEnVivo(quinielaId, espnId) {
  if (estaExcluido() || !quinielaId || !espnId) return
  if (!primeraVezEnSesion('an_lv_' + quinielaId + '_' + espnId)) return
  escribir('q_' + quinielaId, { enVivo: { [String(espnId)]: increment(1) } })
}

// Una predicción enviada (alimenta la conversión miran → juegan).
export function registrarEnvio() {
  if (estaExcluido()) return
  escribir(idDiaHoy(), { envios: increment(1) })
}

// Lectura (solo super admin; ver firestore.rules)

// Lee los últimos n días. Devuelve [{ id, fecha:Date, ...datos }] del más viejo al más nuevo.
export async function leerDias(n = 7) {
  const refs = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    refs.push({ d, id: 'dia_' + fechaMx(d) })
  }
  const snaps = await Promise.all(
    refs.map(r => getDoc(doc(db, 'analytics', r.id)).catch(() => null))
  )
  return refs.map((r, i) => ({
    id: r.id,
    fecha: r.d,
    ...(snaps[i]?.exists() ? snaps[i].data() : {}),
  }))
}

// Lee el documento de estadísticas de una quiniela. Devuelve {} si no hay datos.
export async function leerQuiniela(quinielaId) {
  try {
    const snap = await getDoc(doc(db, 'analytics', 'q_' + quinielaId))
    return snap.exists() ? snap.data() : {}
  } catch {
    return {}
  }
}

// Lee el documento global (dispositivos únicos acumulados). Devuelve {} si no hay datos.
export async function leerGlobal() {
  try {
    const snap = await getDoc(doc(db, 'analytics', 'global'))
    return snap.exists() ? snap.data() : {}
  } catch {
    return {}
  }
}
