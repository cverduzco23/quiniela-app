/**
 * Lógica de derechos (entitlements) de una cuenta de cliente.
 *
 * Fuente de verdad: el doc admins/{uid}. El super admin no pasa por aquí
 * (tiene acceso ilimitado y se maneja aparte en el panel).
 *
 * Recordatorio de seguridad: estas comprobaciones son del lado cliente (UX).
 * El gate DURO real es `activo` en las reglas de Firestore. El conteo de cuota
 * es suave por diseño — ver PLAN_ONBOARDING_CLIENTES.md §4.
 */

/** Convierte el campo temporadaHasta (Timestamp | ISO | Date) a milisegundos. */
function aMillis(valor) {
  if (!valor) return null
  if (typeof valor.toMillis === 'function') return valor.toMillis()
  if (typeof valor.seconds === 'number') return valor.seconds * 1000
  const d = new Date(valor)
  return isNaN(d.getTime()) ? null : d.getTime()
}

/** ¿Tiene un pase vigente (ej. Pase Mundial) que da quinielas ilimitadas? */
export function temporadaVigente(adminDoc) {
  const ms = aMillis(adminDoc?.temporadaHasta)
  return ms != null && Date.now() < ms
}

/** ¿El cliente puede crear una quiniela más ahora mismo? */
export function puedeCrearQuiniela(adminDoc) {
  if (!adminDoc) return false          // sin doc no hay derechos
  if (!adminDoc.activo) return false   // gate (también enforced en reglas)
  if (temporadaVigente(adminDoc)) return true
  const usadas = adminDoc.quinielasCreadas ?? 0
  const permitidas = adminDoc.quinielasPermitidas ?? 0
  return usadas < permitidas
}

/** Cuántas quinielas le quedan (Infinity si tiene pase vigente). */
export function quinielasRestantes(adminDoc) {
  if (!adminDoc) return 0
  if (temporadaVigente(adminDoc)) return Infinity
  const usadas = adminDoc.quinielasCreadas ?? 0
  const permitidas = adminDoc.quinielasPermitidas ?? 0
  return Math.max(0, permitidas - usadas)
}
