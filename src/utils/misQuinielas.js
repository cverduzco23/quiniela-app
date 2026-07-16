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
// centrar tu fila al compartir la imagen); nunca el gate de "¿ya jugaste?"
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

function elegirNombreMasUsado(ids) {
  const conteo = new Map()
  ids.forEach(id => {
    try {
      const raw = localStorage.getItem(`quiniela-${id}-enviada`)
      const data = raw ? JSON.parse(raw) : null
      const nombre = normalizarNombre(data?.nombre)
      if (!nombre) return
      const fecha = new Date(data?.fecha ?? 0).getTime() || 0
      const clave = nombre.toLocaleLowerCase('es-MX')
      const previo = conteo.get(clave) ?? { nombre, usos: 0, ultimaFecha: 0 }
      previo.usos++
      previo.ultimaFecha = Math.max(previo.ultimaFecha, fecha)
      conteo.set(clave, previo)
    } catch { /* envío local corrupto, ignorar */ }
  })
  return [...conteo.values()]
    .sort((a, b) => b.usos - a.usos || b.ultimaFecha - a.ultimaFecha)[0]?.nombre ?? null
}

// Nombre sugerido para una nueva quiniela. Primero considera envíos reales de
// otras jornadas de la misma temporada. Si el dispositivo aún no participó en
// ella, usa el nombre más frecuente y reciente entre sus quinielas guardadas.
// No usa alias: solo identidades que realmente enviaron predicciones.
export function nombrePreferidoEnDispositivo(quinielaIdsTemporada = []) {
  try {
    const idsTemporada = [...new Set(quinielaIdsTemporada.filter(Boolean))]
    const deTemporada = elegirNombreMasUsado(idsTemporada)
    if (deTemporada) return deTemporada
    const idsConEnvio = []
    if (typeof localStorage.key === 'function') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        const match = key?.match(/^quiniela-(.+)-enviada$/)
        if (match?.[1]) idsConEnvio.push(match[1])
      }
    }
    const idsRecientes = leerMisQuinielasGuardadas().map(q => q.id)
    return elegirNombreMasUsado([...new Set([...idsConEnvio, ...idsRecientes])])
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
// usuario vuelve a entrar con el código, su posición real sigue intacta.
// Solo quien nunca envió (y por eso dependía del alias) tendrá que elegir
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
