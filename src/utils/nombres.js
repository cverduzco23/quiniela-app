// Normaliza un nombre: trim, espacios colapsados, cada palabra capitalizada
// con primera letra en mayúscula y el resto en minúsculas. Preserva acentos
// y capitaliza también después de guiones (ej. "García-López").
export function normalizarNombre(nombre) {
  if (!nombre) return ''
  return String(nombre)
    .trim()
    .replace(/\s+/g, ' ')
    // Quita signos de puntuación sueltos al final (puntos, comas, signos, etc.)
    .replace(/[\s.,;:!?¡¿'"´`*_/\\]+$/u, '')
    .toLocaleLowerCase('es-MX')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es-MX'))
}

/**
 * Valida que el nombre tenga al menos 2 tokens (nombre + apellido) con
 * al menos 2 caracteres cada uno (ignorando puntos). Útil cuando una
 * quiniela requiere "nombre completo" para reducir ambigüedad entre
 * participantes (ej. en una empresa con 150+ personas).
 *
 * Acepta:  "Juan Pérez", "María José García", "Carlos G. López"
 * Rechaza: "Juan", "Juan P", "Ana", "M G"
 */
export function tieneNombreYApellido(nombre) {
  if (!nombre) return false
  const tokens = String(nombre)
    .trim()
    .split(/\s+/)
    .filter(t => t.replace(/[.,]/g, '').length >= 2)
  return tokens.length >= 2
}
