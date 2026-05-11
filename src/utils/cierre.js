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

// ¿La quiniela ya cerró? (por flag manual o porque pasó la hora de cierre)
export function quinielaCerrada(q) {
  if (!q) return false
  if (q.cerrada) return true
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
