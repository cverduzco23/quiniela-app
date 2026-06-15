import { Timestamp } from 'firebase/firestore'

// cierre puede venir como Timestamp (nuevo formato) o string ISO (formato viejo) o null
export function cierreToDate(cierre) {
  if (!cierre) return null
  if (typeof cierre.toDate === 'function') return cierre.toDate()
  const d = new Date(cierre)
  return isNaN(d.getTime()) ? null : d
}

// Para mostrar en <input type="datetime-local"> en formato YYYY-MM-DDTHH:mm
export function cierreToInputValue(cierre) {
  const d = cierreToDate(cierre)
  if (!d) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convierte el valor del <input type="datetime-local"> en Timestamp para guardar en Firestore
export function inputValueACierre(value) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return Timestamp.fromDate(d)
}

// ¿La quiniela ya cerró? (por flag manual, porque pasó la hora de cierre, o porque ya fue finalizada)
export function quinielaCerrada(q) {
  if (!q) return false
  if (q.cerrada || q.finalizada) return true
  const d = cierreToDate(q.cierre)
  return d ? new Date() > d : false
}

// ¿Todos los partidos tienen resultado o están cancelados?
export function resultadosCompletos(q) {
  const partidos = q?.partidos ?? []
  if (partidos.length === 0) return false
  const resultados = q?.resultados ?? {}
  return partidos.every((_, i) => {
    const r = resultados[i]
    if (!r) return false
    if (r.cancelado) return true
    return String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
  })
}

// ¿La quiniela ya terminó? (flag manual o todos los partidos con resultado/cancelado)
export function quinielaFinalizada(q) {
  if (!q) return false
  if (q.finalizada) return true
  return resultadosCompletos(q)
}

// ¿Hay algún partido jugándose en este momento? (heurística por horario, sin ESPN)
// Un partido se considera "en vivo" si ya pasó su hora de inicio, sigue dentro de
// una ventana de ~2.5h (90 min + medio tiempo + tiempo añadido + margen) y todavía
// no tiene marcador final ni está cancelado. Pensado para un indicador ligero en el
// inicio; no es exacto (no contempla retrasos), pero no requiere llamadas a la API.
export function hayPartidoEnVivo(quiniela, ahora = Date.now()) {
  const partidos = quiniela?.partidos ?? []
  const resultados = quiniela?.resultados ?? {}
  const VENTANA = 2.5 * 60 * 60 * 1000
  return partidos.some((p, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    // Ya tiene marcador final o está cancelado → no está en vivo.
    if (r?.cancelado) return false
    if (r && String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== '') return false
    if (!p?.hora) return false
    const inicio = new Date(p.hora).getTime()
    if (isNaN(inicio)) return false
    return ahora >= inicio && ahora <= inicio + VENTANA
  })
}

// Tiempo restante hasta el cierre, con nivel de urgencia para badges UI.
// Devuelve null si no aplica (sin cierre, ya pasó, falta más de 24h).
// Niveles:
//   'urgente'  → quedan entre 1h y 24h (badge amarillo, "Cierra en menos de Xh")
//   'critico'  → quedan ≤ 1h (badge rojo, "Cierra en X min")
// El caller decide qué hacer cuando devuelve null (mostrar el badge normal).
export function tiempoRestante(cierre, ahora = Date.now()) {
  const d = cierreToDate(cierre)
  if (!d) return null
  const ms = d.getTime() - ahora
  if (ms <= 0) return null
  const MIN  = 60 * 1000
  const HORA = 60 * MIN
  if (ms < HORA) {
    const mins = Math.max(1, Math.ceil(ms / MIN))
    return { nivel: 'critico', texto: `⏰ Cierra en ${mins} min`, ms }
  }
  if (ms < 24 * HORA) {
    const horas = Math.ceil(ms / HORA)
    return { nivel: 'urgente', texto: `⏳ Cierra en menos de ${horas}h`, ms }
  }
  return null
}
