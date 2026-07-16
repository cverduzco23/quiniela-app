// Qué páginas puede indexar Google.
//
// Solo las páginas de producto (portada, donar, legales) son públicas para los
// buscadores. Las quinielas, rankings y temporadas quedan FUERA a propósito:
// muestran nombres reales de participantes, y son pools privados entre
// conocidos. Indexarlas dejaría esos nombres buscables en Google, que es justo
// lo que el aviso de privacidad promete que no pasa.
//
// El robots.txt bloquea el rastreo de esas rutas; esta lógica es la segunda
// capa (la etiqueta <meta name="robots">) por si alguna llega a rastrearse.

export const SITIO = 'https://quinielapp.fun'

// Rutas privadas por prefijo. `/ranking` cubre también la forma vieja
// `/ranking?q=<id>` que sigue circulando en links ya compartidos.
const PREFIJOS_PRIVADOS = ['/quiniela/', '/ranking', '/temporada/', '/admin']

/**
 * ¿Esta URL puede ser indexada por Google?
 *
 * @param {string} pathname ruta actual (ej. '/ranking/abc')
 * @param {string} search   query string con '?' (ej. '?q=abc')
 */
export function esIndexable(pathname = '/', search = '') {
  const ruta = pathname.toLowerCase()
  if (PREFIJOS_PRIVADOS.some(p => ruta === p || ruta.startsWith(p))) return false
  // La portada muestra una quiniela cuando trae ?q=<id> (links viejos): en ese
  // caso es una quiniela, no la portada, y no se indexa.
  if (ruta === '/' && /(^|&)q=/.test(search.replace(/^\?/, ''))) return false
  return true
}

/**
 * URL canónica de la página: evita que Google trate como duplicados a la misma
 * portada con distintos parámetros (utm_*, fbclid, etc.).
 */
export function urlCanonica(pathname = '/') {
  const limpia = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/'
  return `${SITIO}${limpia}`
}
