// Filtro de lenguaje para los comentarios de quiniela. No pretende ser
// infalible (eso llegará con moderación server-side y cuentas), solo bajar
// drásticamente groserías y expresiones que no queremos en un chat familiar
// o de empresa. La Cloud Function de moderación usa esta misma lista
// (functions/chat.js): si cambias algo aquí, actualiza ambos lados.

const TERMINOS_VETADOS = [
  // Español (MX)
  'pendejo', 'pendeja', 'pendejada', 'puto', 'puta', 'puto el', 'hijo de puta',
  'hija de puta', 'chinga tu', 'chingada madre', 'chingas a tu', 'vete a la verga',
  'verga', 'mamaverga', 'culero', 'culera', 'mierda', 'pinche', 'cabron', 'cabrona',
  'joto', 'maricon', 'marica', 'zorra', 'perra', 'malparido', 'pito', 'polla',
  'gilipollas', 'idiota', 'imbecil', 'estupido', 'estupida', 'naco de mierda',
  'mamon', 'mamona', 'ojete', 'cagada', 'chingadera', 'putiza', 'a la verga',
  // Slurs y violencia
  'nazi', 'matate', 'suicidate', 'te voy a matar', 'los voy a matar',
  // Inglés básico
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'motherfucker', 'nigger',
  'faggot', 'cunt', 'whore',
]

// Normaliza texto para que el filtro no se evada con acentos, mayúsculas,
// números por letras (l33t) o caracteres repetidos: "P3ndéjoooo" -> "pendejo".
export function normalizarTextoModeracion(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// true si el texto contiene lenguaje vetado. Compara contra el texto
// normalizado con separadores de palabra para no castigar falsos positivos
// tipo "computadora" (contiene "puta" pero no como palabra).
export function contieneLenguajeVetado(texto) {
  const normalizado = ` ${normalizarTextoModeracion(texto)} `
  if (!normalizado.trim()) return false
  return TERMINOS_VETADOS.some(term => normalizado.includes(` ${term} `) || normalizado.includes(` ${term}s `))
}
