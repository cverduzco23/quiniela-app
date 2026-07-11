/**
 * Validación de contraseña compartida: la usan el cambio inicial obligatorio
 * (CambioPassword) y la sección "Mi cuenta".
 *
 * Política "equilibrada" (decidida con el usuario): se OBLIGA longitud mínima +
 * al menos una letra y un número. Mayúsculas y símbolos NO se obligan (fricción
 * innecesaria para usuarios no técnicos), solo suman a la fuerza sugerida.
 */
export function evaluarPassword(pwd) {
  const p = pwd ?? ''
  const tieneLetra   = /[a-zA-Z]/.test(p)
  const tieneNumero  = /[0-9]/.test(p)
  const tieneSimbolo = /[^a-zA-Z0-9]/.test(p)
  const tieneMayus   = /[A-Z]/.test(p)

  // Regla obligatoria.
  let error = ''
  if (p.length < 8)      error = 'La contraseña debe tener al menos 8 caracteres.'
  else if (!tieneLetra)  error = 'Incluye al menos una letra.'
  else if (!tieneNumero) error = 'Incluye al menos un número.'
  const ok = error === ''

  // Puntaje de fuerza (0-4), solo informativo/sugerencia.
  let score = 0
  if (p.length >= 8)  score++
  if (p.length >= 12) score++
  if (tieneSimbolo)   score++
  if (tieneMayus)     score++

  let nivel = 'débil'
  if (ok && score >= 4) nivel = 'fuerte'
  else if (ok && score >= 2) nivel = 'media'

  return { ok, error, score, nivel }
}
