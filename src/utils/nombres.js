// Normaliza un nombre: trim, espacios colapsados, cada palabra capitalizada
// con primera letra en mayúscula y el resto en minúsculas. Preserva acentos
// y capitaliza también después de guiones (ej. "García-López").
export function normalizarNombre(nombre) {
  if (!nombre) return ''
  return String(nombre)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-MX')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es-MX'))
}
