// Normaliza un nombre: trim, espacios colapsados, cada palabra capitalizada
// con primera letra en mayúscula y el resto en minúsculas. Preserva acentos
// y capitaliza también después de guiones (ej. "García-López").
// Tope de longitud del nombre: máximo 4 palabras (2 nombres + 2 apellidos) y
// 40 caracteres. Evita que nombres muy largos descuadren el ranking, el título
// de predicciones y la imagen para compartir.
const MAX_PALABRAS = 4
const MAX_CARACTERES = 40
const EMOJI_PATTERN = String.raw`(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:[\uFE0E\uFE0F])?(?:\u200D(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:[\uFE0E\uFE0F])?)*`
const EMOJI_REGEX = new RegExp(EMOJI_PATTERN, 'gu')
const EMOJI_TEST_REGEX = new RegExp(EMOJI_PATTERN, 'u')

export function contieneEmoji(texto) {
  return EMOJI_TEST_REGEX.test(String(texto ?? ''))
}

export function quitarEmojis(texto) {
  return String(texto ?? '').replace(EMOJI_REGEX, '')
}

export function normalizarNombre(nombre) {
  if (!nombre) return ''
  const limpio = quitarEmojis(nombre)
    .trim()
    .replace(/\s+/g, ' ')
    // Quita signos de puntuación sueltos al final (puntos, comas, signos, etc.)
    .replace(/[\s.,;:!?¡¿'"´`*_/\\]+$/u, '')
    .toLocaleLowerCase('es-MX')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es-MX'))
  return limpio.split(' ').slice(0, MAX_PALABRAS).join(' ').slice(0, MAX_CARACTERES).trim()
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
