// Detección de posibles nombres duplicados en una quiniela.
//
// Diseñado para ser ESTRICTO: con 100-200 participantes en una empresa,
// es esperable tener varios "Carlos" o "María" distintos. Solo marcamos
// pares cuando hay alta probabilidad de duplicación real, no por
// coincidencia de primer nombre.
//
// Reglas (cualquiera basta para marcar):
//  1. Iguales tras normalización fuerte (acentos, mayúsculas, puntuación)
//  2. Mismo nombre + mismo primer apellido + uno tiene apellido extra
//  3. Apellido abreviado, SOLO si ambos tienen exactamente 2 tokens
//  4. Distancia Levenshtein ≤ 1 en strings de longitud ≥ 8 (typos)

/** lowercase + sin diacríticos + sin puntuación + espacios colapsados. */
function normalizarFuerte(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:_/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizar(s) {
  return s.split(' ').filter(Boolean)
}

/** Distancia de Levenshtein (clásica, O(|a|·|b|)). */
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let v0 = new Array(b.length + 1)
  let v1 = new Array(b.length + 1)
  for (let i = 0; i <= b.length; i++) v0[i] = i
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    ;[v0, v1] = [v1, v0]
  }
  return v0[b.length]
}

/**
 * ¿Dos nombres son sospechosos de ser la misma persona?
 * Devuelve true solo cuando hay alta probabilidad — no marca coincidencias
 * de primer nombre con apellidos distintos.
 */
export function nombreSimilar(a, b) {
  const na = normalizarFuerte(a)
  const nb = normalizarFuerte(b)
  if (!na || !nb || na === nb && a === b) return false // misma cadena exacta no cuenta como "similar"

  // Regla 1: iguales post-normalización fuerte (solo difieren en acentos/case/puntuación)
  if (na === nb) return true

  const ta = tokenizar(na)
  const tb = tokenizar(nb)

  // Regla 2: mismo nombre + mismo primer apellido + uno tiene tokens extra
  // Ej: "carlos gonzalez" vs "carlos gonzalez garcia"
  if (
    ta.length >= 2 && tb.length >= 2 &&
    ta[0] === tb[0] && ta[1] === tb[1] &&
    ta.length !== tb.length
  ) {
    return true
  }

  // Regla 3: apellido abreviado, SOLO cuando ambos tienen exactamente 2 tokens
  // Ej: "juan p" vs "juan perez"
  // (Evitamos falsos positivos como "maria f garcia" vs "maria fernanda lopez")
  if (ta.length === 2 && tb.length === 2 && ta[0] === tb[0]) {
    const ape1 = ta[1], ape2 = tb[1]
    const [shortA, longA] = ape1.length < ape2.length ? [ape1, ape2] : [ape2, ape1]
    if (
      shortA.length >= 1 && shortA.length < longA.length &&
      longA.startsWith(shortA) && longA.length >= 4
    ) {
      return true
    }
  }

  // Regla 4: distancia Levenshtein ≤ 1 en strings largos (typos)
  // Solo en strings ≥ 8 chars para evitar ruido con nombres cortos
  if (na.length >= 8 && nb.length >= 8) {
    if (levenshtein(na, nb) <= 1) return true
  }

  return false
}

/**
 * Dado un array de nombres, devuelve un Map<nombre, string[]> donde
 * cada entrada lista los OTROS nombres que se le parecen.
 * Si un nombre no tiene similares, la lista está vacía.
 */
export function detectarSimilares(nombres) {
  const out = new Map()
  for (const n of nombres) {
    if (!out.has(n)) out.set(n, [])
  }
  const lista = [...out.keys()]
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j]
      if (nombreSimilar(a, b)) {
        out.get(a).push(b)
        out.get(b).push(a)
      }
    }
  }
  return out
}
