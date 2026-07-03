import { normalizarNombre } from './nombres'

const STORAGE_KEY = 'quinielapp-mis-quinielas'
const MAX_RECIENTES = 8

export function leerMisQuinielasGuardadas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(q => q && typeof q.id === 'string')
      .map(q => ({
        id: q.id,
        codigoAcceso: typeof q.codigoAcceso === 'string' ? q.codigoAcceso : '',
        nombre: typeof q.nombre === 'string' ? q.nombre : '',
        ultimaVisita: typeof q.ultimaVisita === 'number' ? q.ultimaVisita : 0,
      }))
      .sort((a, b) => b.ultimaVisita - a.ultimaVisita)
  } catch {
    return []
  }
}

export function recordarMiQuiniela({ id, codigoAcceso = '', nombre = '' }) {
  if (!id) return
  try {
    const existentes = leerMisQuinielasGuardadas().filter(q => q.id !== id)
    const siguiente = [
      {
        id,
        codigoAcceso,
        nombre,
        ultimaVisita: Date.now(),
      },
      ...existentes,
    ].slice(0, MAX_RECIENTES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(siguiente))
    if (codigoAcceso) localStorage.setItem(`quiniela-${id}-acceso`, codigoAcceso)
  } catch {
    /* localStorage no disponible */
  }
}

// ¿Este dispositivo ya envió predicciones para esta quiniela?
export function haEnviadoQuiniela(id) {
  try {
    return !!localStorage.getItem(`quiniela-${id}-enviada`)
  } catch {
    return false
  }
}

// Identidad de este dispositivo para una quiniela: primero el envío real, y
// si no hay, el alias que el usuario se haya autoasignado (ver
// `asignarAliasQuiniela`) para poder ver su posición desde otro aparato. La
// usan tanto la tarjeta de "Tus quinielas" como el Ranking (resaltar tu fila,
// centrar tu fila al compartir la imagen) — nunca el gate de "¿ya jugaste?"
// que decide si mostrar el CTA de entrar a predicciones, ese depende solo
// del envío real.
export function miIdentidadEnQuiniela(id) {
  try {
    const raw = localStorage.getItem(`quiniela-${id}-enviada`)
    const data = raw ? JSON.parse(raw) : null
    if (data?.nombre) return normalizarNombre(data.nombre)
    const alias = localStorage.getItem(`quiniela-${id}-alias`)
    return alias ? normalizarNombre(alias) : null
  } catch {
    return null
  }
}

// Deja que el usuario, en un dispositivo donde nunca envió predicciones, se
// identifique eligiendo su nombre de la lista de participantes para ver su
// posición. Es solo una preferencia de visualización local (guardada aparte
// del envío real) y no participa en el cálculo del ranking en sí.
export function asignarAliasQuiniela(id, nombre) {
  if (!id || !nombre) return
  try {
    localStorage.setItem(`quiniela-${id}-alias`, nombre)
  } catch {
    /* localStorage no disponible */
  }
}

// Quita una quiniela de "Tus quinielas" (esta lista solamente) y cualquier
// alias autoasignado ahí. No borra el envío real de predicciones: si el
// usuario vuelve a entrar con el código, su posición real sigue intacta —
// solo quien nunca envió (y por eso dependía del alias) tendrá que elegir
// su nombre de nuevo.
export function olvidarMiQuiniela(id) {
  if (!id) return
  try {
    const restantes = leerMisQuinielasGuardadas().filter(q => q.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restantes))
    localStorage.removeItem(`quiniela-${id}-alias`)
  } catch {
    /* localStorage no disponible */
  }
}
