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
