// Archivo de los detalles de un partido terminado.
//
// El problema que resuelve: ESPN solo devuelve estadísticas y eventos de un
// partido mientras está dentro de la ventana del scoreboard (un par de días).
// Pasado eso, el ranking de una quiniela vieja se queda sin nada que mostrar.
// Aquí guardamos una copia en `quinielas/{id}/detalles/{idx}` la primera vez
// que el partido aparece terminado, y el front la lee desde entonces.
//
// En el mismo documento se guarda el resumen en video de YouTube, cuando se
// encuentra: buscarlo es lo bastante caro (cuota de la API) como para hacerlo
// una sola vez por partido y no en cada visita.

import { logger } from 'firebase-functions'

// ---------------------------------------------------------------------------
// Estadísticas y eventos, tal como los arma el front desde el scoreboard
// ---------------------------------------------------------------------------

const stat = (stats, name) => stats?.find(s => s.name === name)?.displayValue ?? '-'

function ladoDeEvento(detalle, home, away) {
  const teamId = detalle.team?.id
  if (teamId && teamId === home?.team?.id) return 'home'
  if (teamId && teamId === away?.team?.id) return 'away'
  return null
}

function tipoDeEvento(detalle) {
  if (detalle.scoringPlay) return 'goal'
  if (detalle.redCard) return 'red-card'
  if (detalle.yellowCard) return 'yellow-card'
  if (/substitution/i.test(detalle.type?.text || '')) return 'substitution'
  return 'default'
}

// Devuelve null cuando el evento de ESPN no trae nada que valga la pena
// archivar (por ejemplo un partido cancelado o sin estadísticas capturadas).
export function extraerDetalles(ev, partido) {
  const comps = ev?.competitions?.[0]?.competitors ?? []
  const home = comps.find(c => c.homeAway === 'home')
  const away = comps.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const lado = (c, nombreFallback) => ({
    nombre:       c?.team?.displayName ?? nombreFallback ?? '',
    logo:         c?.team?.logo ?? '',
    posesion:     stat(c?.statistics, 'possessionPct'),
    tirosArco:    stat(c?.statistics, 'shotsOnTarget'),
    tirosTotales: stat(c?.statistics, 'totalShots'),
    corners:      stat(c?.statistics, 'wonCorners'),
    faltas:       stat(c?.statistics, 'foulsCommitted'),
  })

  const stats = { home: lado(home, partido?.local), away: lado(away, partido?.visitante) }
  const hayStats = ['posesion', 'tirosArco', 'tirosTotales', 'corners', 'faltas']
    .some(k => stats.home[k] !== '-' || stats.away[k] !== '-')

  const eventos = (ev?.competitions?.[0]?.details ?? []).map(d => ({
    tipo: tipoDeEvento(d),
    minuto: d.clock?.displayValue || '',
    lado: ladoDeEvento(d, home, away),
    jugador: d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || '',
    ownGoal: !!d.ownGoal,
    penalShootout: !!d.shootout,
    anotado: !!d.scoringPlay,
  }))

  if (!hayStats && eventos.length === 0) return null
  return { stats: hayStats ? stats : null, eventos }
}

// ---------------------------------------------------------------------------
// Resumen en video desde YouTube
// ---------------------------------------------------------------------------

// Solo canales oficiales: un resumen subido por un tercero desaparece por
// copyright a los pocos días y, peor, puede ser de otro partido.
//
// Se guardan los @handle, no los channelId. El handle es lo que se ve en la
// URL del canal y se puede verificar a simple vista; el channelId (UC…) es un
// código opaco que, si se copia mal, hace que la búsqueda no encuentre nada
// sin dar ningún error. La API los traduce por 1 unidad de cuota y el
// resultado se guarda en memoria mientras viva la instancia.
export const CANALES_OFICIALES = [
  { handle: '@TUDNMEX', nombre: 'TUDN México' },
  { handle: '@ESPNDeportes', nombre: 'ESPN Deportes' },
  { handle: '@AztecaDeportes', nombre: 'Azteca Deportes' },
  { handle: '@LigaBBVAMX', nombre: 'Liga BBVA MX' },
]

const idsResueltos = new Map()

export async function resolverCanal(handle, apiKey, fetchImpl = fetch) {
  if (idsResueltos.has(handle)) return idsResueltos.get(handle)
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'id')
  url.searchParams.set('forHandle', handle)
  try {
    const res = await fetchImpl(url.toString())
    if (!res.ok) return null
    const datos = await res.json()
    const id = datos.items?.[0]?.id ?? null
    if (id) idsResueltos.set(handle, id)
    else logger.warn(`YouTube no reconoció el canal ${handle}`)
    return id
  } catch (error) {
    logger.warn(`No se pudo resolver el canal ${handle}: ${error.message}`)
    return null
  }
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Un nombre de equipo puede venir como "Club América" y el título decir solo
// "América": nos quedamos con los tokens con peso, ignorando los genéricos.
const TOKENS_IGNORADOS = new Set([
  'fc', 'cf', 'sc', 'ac', 'cd', 'ca', 'afc', 'club', 'de', 'del', 'la', 'el',
  'los', 'las', 'futbol', 'football', 'soccer', 'united', 'deportivo', 'real',
])

function tokensEquipo(nombre) {
  return normalizar(nombre).split(' ').filter(t => t.length > 2 && !TOKENS_IGNORADOS.has(t))
}

// El título debe mencionar al equipo: basta con que aparezca uno de sus tokens
// significativos ("guadalajara" o "chivas" para Chivas Guadalajara).
export function tituloMencionaEquipo(titulo, nombreEquipo, alias = []) {
  const t = normalizar(titulo)
  const candidatos = [nombreEquipo, ...(alias ?? [])].flatMap(tokensEquipo)
  if (candidatos.length === 0) return false
  return candidatos.some(token => t.includes(token))
}

// Un resumen tiene que hablar de los DOS equipos y haberse publicado cerca del
// partido. Sin las tres condiciones preferimos no mostrar nada: un video
// equivocado es peor que ningún video.
export function esResumenDelPartido(item, partido, { alias = {}, horasMargen = 72 } = {}) {
  const titulo = item?.snippet?.title ?? ''
  if (!tituloMencionaEquipo(titulo, partido.local, alias?.local)) return false
  if (!tituloMencionaEquipo(titulo, partido.visitante, alias?.visitante)) return false

  const publicado = new Date(item?.snippet?.publishedAt ?? '')
  const jugado = new Date(partido?.hora ?? '')
  if (isNaN(publicado.getTime()) || isNaN(jugado.getTime())) return false
  const horas = (publicado.getTime() - jugado.getTime()) / 36e5
  if (horas < -1 || horas > horasMargen) return false

  // Descarta previas y transmisiones: buscamos el resumen posterior.
  const t = normalizar(titulo)
  if (/\b(previa|preview|en vivo|reaccion|analisis|rumbo a|conferencia)\b/.test(t)) return false
  return true
}

export function elegirResumenYoutube(items, partido, opciones) {
  const validos = (items ?? []).filter(i => esResumenDelPartido(i, partido, opciones))
  if (validos.length === 0) return null
  // Entre varios válidos, el que se anuncia explícitamente como resumen.
  const puntaje = i => (/\bresumen|highlights\b/.test(normalizar(i.snippet?.title)) ? 1 : 0)
  const mejor = [...validos].sort((a, b) => puntaje(b) - puntaje(a))[0]
  return {
    videoId: mejor.id?.videoId ?? '',
    titulo: mejor.snippet?.title ?? '',
    canal: mejor.snippet?.channelTitle ?? '',
    publicado: mejor.snippet?.publishedAt ?? '',
  }
}

// Busca en un canal oficial a la vez. La API cobra 100 unidades por búsqueda y
// no acepta varios canales en la misma llamada, así que se recorre en orden y
// se corta en cuanto uno da resultado. En el peor caso son 4 búsquedas por
// partido, y solo se intenta un número acotado de veces (ver index.js).
export async function buscarResumenYoutube(partido, apiKey, fetchImpl = fetch) {
  if (!apiKey) return null
  const consulta = `${partido.local} ${partido.visitante} resumen`
  const desde = new Date(partido.hora)
  if (isNaN(desde.getTime())) return null
  const publishedAfter = new Date(desde.getTime() - 3600e3).toISOString()

  for (const canal of CANALES_OFICIALES) {
    const canalId = await resolverCanal(canal.handle, apiKey, fetchImpl)
    if (!canalId) continue
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '10')
    url.searchParams.set('order', 'relevance')
    url.searchParams.set('channelId', canalId)
    url.searchParams.set('q', consulta)
    url.searchParams.set('publishedAfter', publishedAfter)
    try {
      const res = await fetchImpl(url.toString())
      if (!res.ok) {
        logger.warn(`YouTube respondió ${res.status} para ${canal.nombre}`)
        // 403 casi siempre es cuota agotada: no tiene caso seguir con los demás.
        if (res.status === 403) return null
        continue
      }
      const datos = await res.json()
      const elegido = elegirResumenYoutube(datos.items, partido)
      if (elegido?.videoId) return { ...elegido, canal: elegido.canal || canal.nombre }
    } catch (error) {
      logger.warn(`Búsqueda de resumen falló en ${canal.nombre}: ${error.message}`)
    }
  }
  return null
}
