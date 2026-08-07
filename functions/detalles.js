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

// La ficha individual (`/summary?event=`) conserva el boxscore y las jugadas
// después de que el partido desaparece del scoreboard. Su forma es distinta:
// equipos en `boxscore.teams`, jugadas en `keyEvents` y penales en `shootout`.
export function extraerDetallesResumen(summary, partido) {
  const competidores = summary?.header?.competitions?.[0]?.competitors ?? []
  const homeHeader = competidores.find(c => c.homeAway === 'home')
  const awayHeader = competidores.find(c => c.homeAway === 'away')
  const equipos = summary?.boxscore?.teams ?? []

  const encontrarEquipo = (header, fallbackIdx) => {
    const id = header?.team?.id
    return equipos.find(e => id && String(e?.team?.id) === String(id)) ?? equipos[fallbackIdx]
  }
  const home = encontrarEquipo(homeHeader, 0)
  const away = encontrarEquipo(awayHeader, 1)

  const lado = (equipo, nombreFallback) => ({
    nombre:       equipo?.team?.displayName ?? nombreFallback ?? '',
    logo:         equipo?.team?.logo ?? '',
    posesion:     stat(equipo?.statistics, 'possessionPct'),
    tirosArco:    stat(equipo?.statistics, 'shotsOnTarget'),
    tirosTotales: stat(equipo?.statistics, 'totalShots'),
    corners:      stat(equipo?.statistics, 'wonCorners'),
    faltas:       stat(equipo?.statistics, 'foulsCommitted'),
  })

  const stats = home && away
    ? { home: lado(home, partido?.local), away: lado(away, partido?.visitante) }
    : null
  const hayStats = !!stats && ['posesion', 'tirosArco', 'tirosTotales', 'corners', 'faltas']
    .some(k => stats.home[k] !== '-' || stats.away[k] !== '-')

  const homeId = homeHeader?.team?.id ?? home?.team?.id
  const awayId = awayHeader?.team?.id ?? away?.team?.id
  const tiposPermitidos = new Set(['goal', 'yellow-card', 'red-card', 'substitution'])
  const eventos = (summary?.keyEvents ?? [])
    .filter(e => e?.scoringPlay || tiposPermitidos.has(e?.type?.type))
    .map(e => {
      const tipoESPN = e?.type?.type
      const tipo = e?.scoringPlay ? 'goal'
        : tipoESPN === 'yellow-card' ? 'yellow-card'
          : tipoESPN === 'red-card' ? 'red-card'
            : tipoESPN === 'substitution' ? 'substitution' : 'default'
      const teamId = e?.team?.id
      const ladoEvento = teamId != null && String(teamId) === String(homeId) ? 'home'
        : teamId != null && String(teamId) === String(awayId) ? 'away' : null
      const atleta = e?.participants?.[0]?.athlete
      return {
        tipo,
        minuto: e?.clock?.displayValue || '',
        lado: ladoEvento,
        jugador: atleta?.shortName || atleta?.displayName || '',
        ownGoal: !!e?.ownGoal,
        penalShootout: false,
        anotado: !!e?.scoringPlay,
      }
    })

  const penales = []
  ;(summary?.shootout ?? []).forEach(equipo => {
    const id = equipo?.id
    const ladoTiro = id != null && String(id) === String(homeId) ? 'home'
      : id != null && String(id) === String(awayId) ? 'away' : null
    if (!ladoTiro) return
    ;(equipo?.shots ?? []).forEach(tiro => {
      penales.push({
        lado: ladoTiro,
        jugador: tiro?.player ?? '',
        anotado: !!tiro?.didScore,
        orden: Number(tiro?.shotNumber) || 0,
      })
    })
  })
  penales.sort((a, b) => (a.orden - b.orden) || (a.lado === 'home' ? -1 : 1))

  if (!hayStats && eventos.length === 0 && penales.length === 0) return null
  return {
    stats: hayStats ? stats : null,
    eventos,
    ...(penales.length > 0 ? { penales } : {}),
  }
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
  // Fuentes primarias del torneo y la liga. Los channelId salen enlazados
  // desde sus sitios oficiales y evitan gastar cuota resolviendo el handle.
  { channelId: 'UCcH10bZQXIfq3B1XzqPzNbQ', nombre: 'Leagues Cup' },
  { handle: '@mls', nombre: 'Major League Soccer' },
  // Clubes del partido que destapó esta carencia. Ambos publican resúmenes
  // propios y sus IDs están enlazados desde sus sitios oficiales.
  { channelId: 'UCnFoCifXR_Qp5iXhK73-kjQ', nombre: 'Minnesota United FC' },
  { channelId: 'UCBG46z8mfj69eSbzpLJIv_Q', nombre: 'FC Juárez Oficial' },
  { handle: '@TUDNMEX', nombre: 'TUDN México' },
  { handle: '@ESPNDeportes', nombre: 'ESPN Deportes' },
  { handle: '@AztecaDeportes', nombre: 'Azteca Deportes' },
  { handle: '@LigaBBVAMX', nombre: 'Liga BBVA MX' },
  { handle: '@foxdeportes', nombre: 'Fox Deportes' },
]

const idsResueltos = new Map()

export async function resolverCanal(canal, apiKey, fetchImpl = fetch) {
  if (canal?.channelId) return canal.channelId
  const handle = canal?.handle
  if (!handle) return null
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
  if (/\b(previa|preview|en vivo|reaccion|analisis|rumbo a|conferencia|entrevista|postgame|presser|press conference)\b/.test(t)) return false
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

// Resuelve la lista blanca de canales y hace UNA búsqueda global. La API no
// acepta varios channelId en una llamada; buscar cada canal por separado
// multiplicaría la cuota al ampliar fuentes. Filtrar los resultados por
// snippet.channelId conserva la garantía de usar solo publicaciones oficiales.
export async function buscarResumenYoutube(partido, apiKey, fetchImpl = fetch) {
  if (!apiKey) return null
  // Sin "resumen": los canales de EE. UU. titulan "Highlights". El filtro
  // posterior exige ambos equipos y prioriza resumen/highlights.
  const consulta = `${partido.local} ${partido.visitante}`
  const desde = new Date(partido.hora)
  if (isNaN(desde.getTime())) return null
  const publishedAfter = new Date(desde.getTime() - 3600e3).toISOString()

  const permitidos = new Map()
  for (const canal of CANALES_OFICIALES) {
    const canalId = await resolverCanal(canal, apiKey, fetchImpl)
    if (canalId) permitidos.set(canalId, canal.nombre)
  }
  if (permitidos.size === 0) return null

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '25')
  url.searchParams.set('order', 'relevance')
  url.searchParams.set('q', consulta)
  url.searchParams.set('publishedAfter', publishedAfter)
  try {
    const res = await fetchImpl(url.toString())
    if (!res.ok) {
      logger.warn(`YouTube respondió ${res.status} al buscar ${consulta}`)
      return null
    }
    const datos = await res.json()
    const oficiales = (datos.items ?? []).filter(item =>
      permitidos.has(item?.snippet?.channelId))
    const elegido = elegirResumenYoutube(oficiales, partido)
    if (!elegido?.videoId) return null
    return {
      ...elegido,
      canal: elegido.canal ||
        permitidos.get(oficiales.find(i => i?.id?.videoId === elegido.videoId)?.snippet?.channelId) ||
        'YouTube',
    }
  } catch (error) {
    logger.warn(`Búsqueda de resumen falló para ${consulta}: ${error.message}`)
    return null
  }
}
