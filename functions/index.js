// Cloud Function: sincronización automática de resultados desde ESPN.
//
// Corre cada 2 minutos y hace lo mismo que hacía el botón "⚡ Sincronizar
// resultados" del panel de admin, pero para TODAS las quinielas en juego a
// la vez, sin que nadie tenga que apretar nada:
//
//   1. Busca quinielas que ya cerraron pero aún no están finalizadas.
//   2. Consulta el scoreboard de ESPN (una sola vez por liga+rango de fechas,
//      aunque muchas quinielas compartan partidos).
//   3. Guarda marcadores finales, marca cancelados, y pone finalizada:true
//      cuando todos los partidos tienen resultado.
//
// Diferencias deliberadas contra el botón manual:
//   - NO sobreescribe resultados ya guardados: si el admin corrigió un
//     marcador a mano, la sincronización lo respeta.
//   - Cuando ESPN cambió el ID de un partido y hay EXACTAMENTE un candidato
//     con los mismos equipos el mismo día, se aplica solo (antes pedía
//     confirmación al admin). Si hay 0 o >1 candidatos, no toca nada y el
//     admin puede capturar el marcador a mano.

// Toda la lógica de fechas (día local de un partido, "hoy") se piensa en
// hora de México, igual que en el navegador de los admins. En la nube el
// reloj corre en UTC, así que fijamos la zona ANTES de usar Date.
process.env.TZ = 'America/Mexico_City'

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { buscarResumenYoutube, extraerDetalles, extraerDetallesResumen } from './detalles.js'

initializeApp()
const db = getFirestore()
// Opcional: mientras no exista, el archivo de estadísticas y eventos funciona
// igual y solo se queda sin el resumen en video.
const YOUTUBE_API_KEY = defineSecret('YOUTUBE_API_KEY')
const SUPER_ADMIN_UIDS = new Set(['w6uc7cHowgM4Pmsya4bUHt1G3Pu2'])
const STREAMX_AGENDA_URL = 'https://streamx-hd.com/eventos.json'

export { crearSesionDonativo, webhookDonativos } from './stripe.js'
export { enviarAvisoAdmins } from './notifications.js'
export { moderarComentario, avisarComentarioReportado } from './chat.js'
export { actualizarTemporada, temporadaAlEliminarQuiniela, temporadaAlRenombrar } from './temporadas.js'

// Helpers copiados de src/utils (scoring.js, cierre.js, espn.js)
// Las funciones de la app viven en src/utils pero el deploy de Cloud Functions
// solo empaca esta carpeta, así que se duplican aquí. Si cambias la lógica de
// scoring o de match contra ESPN, actualiza ambos lados.

function goalsToResultado(local, visitante) {
  const l = Number(local), v = Number(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

function cierreToDate(cierre) {
  if (!cierre) return null
  if (typeof cierre.toDate === 'function') return cierre.toDate()
  const d = new Date(cierre)
  return isNaN(d.getTime()) ? null : d
}

function resultadosCompletos(q) {
  const partidos = q?.partidos ?? []
  if (partidos.length === 0) return false
  const resultados = q?.resultados ?? {}
  return partidos.every((_, i) => {
    const r = resultados[i]
    if (!r) return false
    if (r.cancelado) return true
    return String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
  })
}

function normalizarEquipo(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function mismoDiaLocal(eventDateUTC, partidoLocalISO) {
  if (!eventDateUTC || !partidoLocalISO) return false
  const evD = new Date(eventDateUTC)
  if (isNaN(evD.getTime())) return false
  const pad = n => String(n).padStart(2, '0')
  const evDay = `${evD.getFullYear()}-${pad(evD.getMonth() + 1)}-${pad(evD.getDate())}`
  const partidoDay = String(partidoLocalISO).slice(0, 10)
  return evDay === partidoDay
}

function findEventByTeamsAndDate(events, partidoLocal, partidoVisitante, partidoHora) {
  const localN = normalizarEquipo(partidoLocal)
  const visN   = normalizarEquipo(partidoVisitante)
  if (!localN || !visN) return null
  const matches = (events ?? []).filter(ev => {
    const comps = ev?.competitions?.[0]?.competitors ?? []
    const home = comps.find(c => c.homeAway === 'home')
    const away = comps.find(c => c.homeAway === 'away')
    if (!home || !away) return false
    const homeN = normalizarEquipo(home.team?.displayName)
    const awayN = normalizarEquipo(away.team?.displayName)
    if (homeN !== localN || awayN !== visN) return false
    return mismoDiaLocal(ev.date, partidoHora)
  })
  return matches.length === 1 ? matches[0] : null
}

function clasificarEstadoNoFinalESPN(evento) {
  const tipo = evento?.status?.type
  if (tipo?.state !== 'post' || tipo?.completed !== false) return null
  const nombre = String(tipo.name ?? '').toUpperCase()
  if (nombre === 'STATUS_SUSPENDED') return 'suspendido'
  if (/(CANCEL|POSTPON|ABANDON|FORFEIT)/.test(nombre)) return 'cancelado'
  return 'pendiente'
}

// Selección de quinielas a sincronizar

// Cuántos días después del último partido seguimos intentando sincronizar.
// Evita trabajar para siempre en quinielas abandonadas (ej. un partido que
// ESPN nunca marcó como terminado). Pasado este plazo, el admin captura a mano.
const DIAS_VENTANA = 14
const MAX_INTENTOS_DETALLES = 8
const ESPERA_DETALLES_MS = 30 * 60 * 1000

function tieneMarcadorFinal(r) {
  if (!r) return false
  if (r.cancelado) return true
  return String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
}

export function tocaBuscarDetalles(pendiente, horaPartido, ahora = new Date()) {
  if (pendiente?.encontrado || pendiente?.agotado) return false
  const jugado = new Date(horaPartido).getTime()
  if (isNaN(jugado)) return false
  const edad = ahora.getTime() - jugado
  if (edad < 0 || edad > DIAS_VENTANA * 24 * 60 * 60 * 1000) return false
  const intentos = Number(pendiente?.intentos) || 0
  if (intentos >= MAX_INTENTOS_DETALLES) return false
  const ultimo = pendiente?.ultimo ? new Date(pendiente.ultimo).getTime() : 0
  if (ultimo && ahora.getTime() - ultimo < ESPERA_DETALLES_MS) return false
  return true
}

export function indicesDetallesPendientes(q, ahora = new Date()) {
  if (!q) return []
  // El primer respaldo guardaba marcador, cinco estadísticas y eventos. Esta
  // cola independiente amplía esos mismos documentos con sede, árbitro,
  // alineaciones y el boxscore completo, sin confundirlos con el archivo base.
  const archivados = new Set(
    Array.isArray(q.detallesAmpliadosGuardados) ? q.detallesAmpliadosGuardados.map(Number) : []
  )
  const estados = q.detallesAmpliadosPendientes ?? {}
  return (q.partidos ?? []).flatMap((partido, idx) => {
    if (archivados.has(idx) || !partido?.espnId || !partido?.ligaId) return []
    const resultado = q.resultados?.[idx]
    if (!tieneMarcadorFinal(resultado) || resultado?.cancelado) return []
    return tocaBuscarDetalles(estados[String(idx)], partido.hora, ahora) ? [idx] : []
  })
}

export function necesitaDetalles(q, ahora = new Date()) {
  return indicesDetallesPendientes(q, ahora).length > 0
}

/** ¿Esta quiniela necesita que intentemos sincronizarla en esta corrida? */
export function necesitaSync(q, ahora = new Date()) {
  // OJO: no descartamos por q.finalizada. El ranking (ranking.jsx) marca
  // finalizada:true desde el navegador cuando ve todos los partidos terminados
  // en ESPN, pero NO guarda los marcadores; si la saltáramos por ese flag,
  // los resultados nunca quedarían persistidos. El filtro real es "¿quedan
  // partidos ESPN sin marcador guardado?", que ya cubre ambos casos.
  if (!q) return false
  const partidos = q.partidos ?? []
  const resultados = q.resultados ?? {}
  // Partidos de ESPN que aún no tienen marcador final ni están cancelados
  const pendientes = partidos.filter((p, i) => p?.espnId && p?.ligaId && !tieneMarcadorFinal(resultados[i]))
  if (pendientes.length === 0) return false
  // ¿Ya empezó el primer partido pendiente? (antes de eso no hay nada que traer)
  const horas = pendientes.map(p => new Date(p.hora).getTime()).filter(t => !isNaN(t))
  if (horas.length === 0) return false
  if (Math.min(...horas) > ahora.getTime()) return false
  // Ventana: si el último partido de la quiniela fue hace demasiado, la soltamos
  const todas = partidos.map(p => new Date(p?.hora).getTime()).filter(t => !isNaN(t))
  const ultima = todas.length ? Math.max(...todas) : (cierreToDate(q.cierre)?.getTime() ?? 0)
  if (ahora.getTime() - ultima > DIAS_VENTANA * 24 * 60 * 60 * 1000) return false
  return true
}

// Consulta a ESPN

function fmtDia(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/**
 * Trae el scoreboard de una liga para un rango de fechas, con caché por
 * corrida (varias quinielas suelen compartir liga y fechas).
 */
async function fetchScoreboard(cache, ligaId, partidos) {
  const fechas = partidos.map(p => p.hora).filter(Boolean).sort()
  // Un día antes del primer partido, por seguridad de zonas horarias
  // (la hora guardada es local de México; ESPN indexa por fecha UTC).
  let inicio = ''
  if (fechas[0]) {
    const d = new Date(fechas[0])
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1)
      inicio = fmtDia(d)
    }
  }
  const hoy = fmtDia(new Date())
  const url = inicio
    ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${inicio}-${hoy}&limit=100`
    : `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?limit=100`
  if (cache.has(url)) return cache.get(url)
  // ESPN empezó a rechazar con 403 el User-Agent predeterminado de Node/undici
  // usado por Cloud Functions. Un agente HTTP genérico conserva el endpoint
  // JSON estable sin depender de cookies ni de una sesión de navegador.
  const promesa = fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'curl/8.7.1',
    },
  })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ESPN ${r.status}`))))
    .then(d => d.events ?? [])
  cache.set(url, promesa)
  return promesa
}

async function fetchResumenPartido(cache, partido) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${partido.ligaId}/summary?event=${partido.espnId}`
  if (cache.has(url)) return cache.get(url)
  const promesa = fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'curl/8.7.1',
    },
  })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ESPN summary ${r.status}`))))
  cache.set(url, promesa)
  return promesa
}

async function respaldarDetallesFaltantes(q, cache, ahora = new Date()) {
  const indices = indicesDetallesPendientes(q, ahora)
  if (indices.length === 0) return 0

  const archivados = new Set(
    Array.isArray(q.detallesAmpliadosGuardados) ? q.detallesAmpliadosGuardados.map(Number) : []
  )
  const pendientes = { ...(q.detallesAmpliadosPendientes ?? {}) }
  let guardados = 0
  let cambio = false

  for (const idx of indices) {
    const partido = q.partidos[idx]
    try {
      const summary = await fetchResumenPartido(cache, partido)
      const detalles = extraerDetallesResumen(summary, partido)
      cambio = true
      if (detalles) {
        await db.collection('quinielas').doc(q.id).collection('detalles').doc(String(idx))
          .set({ ...detalles, guardadoEn: ahora.toISOString(), fuenteDetalles: 'espn-summary' }, { merge: true })
        archivados.add(idx)
        pendientes[String(idx)] = { encontrado: true, encontradoEn: ahora.toISOString() }
        guardados++
      } else {
        const previo = pendientes[String(idx)] ?? {}
        const intentos = (Number(previo.intentos) || 0) + 1
        pendientes[String(idx)] = {
          intentos,
          ultimo: ahora.toISOString(),
          ...(intentos >= MAX_INTENTOS_DETALLES ? { agotado: true } : {}),
        }
      }
    } catch (error) {
      cambio = true
      const previo = pendientes[String(idx)] ?? {}
      const intentos = (Number(previo.intentos) || 0) + 1
      pendientes[String(idx)] = {
        intentos,
        ultimo: ahora.toISOString(),
        ...(intentos >= MAX_INTENTOS_DETALLES ? { agotado: true } : {}),
      }
      logger.warn(`No se pudo respaldar detalle ${q.id}/${idx}: ${error.message}`)
    }
  }

  if (cambio) {
    await db.collection('quinielas').doc(q.id).update({
      detallesAmpliadosGuardados: [...archivados].sort((a, b) => a - b),
      detallesAmpliadosPendientes: pendientes,
    })
  }
  return guardados
}

/** Extrae el resultado final de un evento ESPN, o null si aún no termina. */
function resultadoDeEvento(ev) {
  const state = ev.status?.type?.state
  if (state !== 'post') return null
  // Una suspensión también llega como `post + completed=false`, pero puede
  // reanudarse y nunca debe persistirse como cancelación.
  const estadoNoFinal = clasificarEstadoNoFinalESPN(ev)
  if (estadoNoFinal === 'cancelado') return { cancelado: true }
  if (estadoNoFinal) return null
  const comps = ev.competitions?.[0]?.competitors ?? []
  const home  = comps.find(c => c.homeAway === 'home')
  const away  = comps.find(c => c.homeAway === 'away')
  if (home?.score === undefined || away?.score === undefined) return null
  return { local: home.score, visitante: away.score, resultado: goalsToResultado(home.score, away.score) }
}

// Archivo de detalles y resumen en video
//
// ESPN solo devuelve estadísticas y eventos mientras el partido está dentro de
// la ventana del scoreboard. Los guardamos en `quinielas/{id}/detalles/{idx}`
// en el mismo tick en que se persiste el marcador final, que es el último
// momento en que están disponibles.

// Cuatro intentos permiten reintentar partidos que agotaron la búsqueda antes
// de que agregáramos las fuentes oficiales de Leagues Cup, MLS y los clubes.
const MAX_INTENTOS_RESUMEN = 4
const ESPERA_PRIMER_INTENTO_MS = 45 * 60 * 1000   // el video no está al pitazo final
const ESPERA_ENTRE_INTENTOS_MS = 3 * 60 * 60 * 1000
const VENTANA_RESUMEN_MS = 72 * 60 * 60 * 1000    // pasados 3 días, se deja de buscar

export function tocaBuscarResumen(pendiente, horaPartido, ahora = new Date()) {
  if (pendiente?.encontrado || pendiente?.agotado) return false
  const jugado = new Date(horaPartido).getTime()
  if (isNaN(jugado)) return false
  const t = ahora.getTime()
  if (t - jugado < ESPERA_PRIMER_INTENTO_MS) return false
  if (t - jugado > VENTANA_RESUMEN_MS) return false
  const intentos = Number(pendiente?.intentos) || 0
  if (intentos >= MAX_INTENTOS_RESUMEN) return false
  const ultimo = pendiente?.ultimo ? new Date(pendiente.ultimo).getTime() : 0
  if (ultimo && t - ultimo < ESPERA_ENTRE_INTENTOS_MS) return false
  return true
}

// Quinielas que ya tenían sus marcadores guardados antes de existir la cola de
// videos nunca pasaron por `porArchivar`. Las incorporamos retroactivamente
// mientras sigan dentro de la ventana de 72 horas.
export function completarColaResumen(q, ahora = new Date()) {
  if (!q) return q
  const pendientes = { ...(q.resumenPendiente ?? {}) }
  let cambio = false
  ;(q.partidos ?? []).forEach((partido, idx) => {
    const clave = String(idx)
    if (Object.prototype.hasOwnProperty.call(pendientes, clave)) return
    if (!partido?.espnId || !partido?.ligaId) return
    const resultado = q.resultados?.[idx]
    if (!tieneMarcadorFinal(resultado) || resultado?.cancelado) return
    const jugado = new Date(partido.hora).getTime()
    if (isNaN(jugado)) return
    const edad = ahora.getTime() - jugado
    if (edad < ESPERA_PRIMER_INTENTO_MS || edad > VENTANA_RESUMEN_MS) return
    pendientes[clave] = { intentos: 0, ultimo: null }
    cambio = true
  })
  return cambio ? { ...q, resumenPendiente: pendientes } : q
}

// ¿Vale la pena visitar esta quiniela solo por el resumen? (ya no entra por
// `necesitaSync` porque todos sus marcadores están guardados)
export function necesitaResumen(q, ahora = new Date()) {
  const pendientes = q?.resumenPendiente
  if (!pendientes || typeof pendientes !== 'object') return false
  return Object.entries(pendientes).some(([idx, p]) =>
    tocaBuscarResumen(p, q.partidos?.[Number(idx)]?.hora, ahora))
}

async function buscarResumenesPendientes(q, apiKey, ahora = new Date()) {
  const pendientes = { ...(q.resumenPendiente ?? {}) }
  let encontrados = 0
  let cambio = false

  for (const [clave, estado] of Object.entries(q.resumenPendiente ?? {})) {
    const idx = Number(clave)
    const partido = q.partidos?.[idx]
    const jugado = new Date(partido?.hora ?? '').getTime()
    // Fuera de ventana o sin intentos disponibles: se conserva como agotado
    // para que el backfill retroactivo no lo vuelva a insertar en cada corrida.
    if (!partido || isNaN(jugado) ||
        ahora.getTime() - jugado > VENTANA_RESUMEN_MS ||
        (Number(estado?.intentos) || 0) >= MAX_INTENTOS_RESUMEN) {
      if (!estado?.agotado) {
        pendientes[clave] = { ...estado, agotado: true }
        cambio = true
      }
      continue
    }
    if (!tocaBuscarResumen(estado, partido.hora, ahora)) continue

    const resumen = await buscarResumenYoutube(partido, apiKey)
    cambio = true
    if (resumen?.videoId) {
      await db.collection('quinielas').doc(q.id).collection('detalles').doc(String(idx))
        .set({ resumenYoutube: resumen, resumenGuardadoEn: ahora.toISOString() }, { merge: true })
      pendientes[clave] = {
        encontrado: true,
        videoId: resumen.videoId,
        encontradoEn: ahora.toISOString(),
      }
      encontrados++
      logger.info(`Quiniela ${q.id} partido ${idx}: resumen encontrado en ${resumen.canal}.`)
    } else {
      pendientes[clave] = {
        intentos: (Number(estado?.intentos) || 0) + 1,
        ultimo: ahora.toISOString(),
      }
    }
  }

  if (cambio) await db.collection('quinielas').doc(q.id).update({ resumenPendiente: pendientes })
  return encontrados
}

// Sincronizar una quiniela

async function sincronizarQuiniela(q, cache) {
  const partidos = q.partidos ?? []
  const resultados = { ...(q.resultados ?? {}) }

  const porLiga = {}
  partidos.forEach((p, i) => {
    if (!p?.espnId || !p?.ligaId) return
    if (tieneMarcadorFinal(resultados[i])) return // respeta lo ya guardado/corregido a mano
    if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
    porLiga[p.ligaId].push({ ...p, idx: i })
  })

  let actualizados = 0
  let idsCorregidos = 0
  let nuevosPartidos = null // solo si algún espnId cambió
  // Estado EN VIVO exacto: ids de ESPN de los partidos que están en juego
  // ahora mismo. El front (hayPartidoEnVivo en src/utils/cierre.js) lo lee
  // en lugar de adivinar por horario. Si alguna liga falla no tocamos el
  // campo, para no apagar el badge por un error transitorio de ESPN.
  const enVivoIds = []
  let huboErrorESPN = false
  // Detalles a archivar en esta pasada. `detallesGuardados` evita repetir el
  // trabajo sin tener que leer la subcolección en cada tick.
  const yaArchivados = Array.isArray(q.detallesGuardados) ? q.detallesGuardados : []
  const porArchivar = []

  for (const [liga, ps] of Object.entries(porLiga)) {
    let events
    try {
      events = await fetchScoreboard(cache, liga, ps)
    } catch (err) {
      logger.warn(`ESPN falló para liga ${liga}: ${err.message}`)
      huboErrorESPN = true
      continue
    }
    ps.forEach(p => {
      let ev = events.find(e => e.id === p.espnId)
      if (!ev) {
        // El ID ya no existe en ESPN. Si hay exactamente 1 partido con los
        // mismos equipos el mismo día, lo adoptamos (match conservador).
        ev = findEventByTeamsAndDate(events, p.local, p.visitante, p.hora)
        if (!ev) return
        if (!nuevosPartidos) nuevosPartidos = partidos.map(x => ({ ...x }))
        nuevosPartidos[p.idx].espnId = ev.id
        idsCorregidos++
      }
      if (ev.status?.type?.state === 'in') enVivoIds.push(String(ev.id))
      const res = resultadoDeEvento(ev)
      if (!res) return
      resultados[p.idx] = res
      actualizados++
      // Este es el último momento en que ESPN todavía tiene las estadísticas y
      // los eventos de este partido: los archivamos ahora o se pierden.
      if (!res.cancelado && !yaArchivados.includes(p.idx)) {
        const detalles = extraerDetalles(ev, p)
        if (detalles) porArchivar.push({ idx: p.idx, detalles })
      }
    })
  }

  const prevEnVivo = (q.enVivoEspnIds ?? []).map(String)
  const enVivoCambio = !huboErrorESPN &&
    (enVivoIds.length !== prevEnVivo.length || enVivoIds.some((id, i) => id !== prevEnVivo[i]))
  // Con partidos en vivo se escribe siempre (refresca enVivoActualizado, la
  // señal de frescura del front); sin cambios ni resultados, no hay escritura.
  const escribirEnVivo = !huboErrorESPN && (enVivoIds.length > 0 || enVivoCambio)

  if (actualizados === 0 && idsCorregidos === 0 && !escribirEnVivo && porArchivar.length === 0) return null

  // Los detalles van a su propio documento antes de tocar la quiniela: si algo
  // falla aquí, `detallesGuardados` no se actualiza y el siguiente tick
  // reintenta en vez de dar por archivado algo que no se guardó.
  if (porArchivar.length > 0) {
    const ahoraIso = new Date().toISOString()
    await Promise.all(porArchivar.map(({ idx, detalles }) =>
      db.collection('quinielas').doc(q.id).collection('detalles').doc(String(idx))
        .set({ ...detalles, guardadoEn: ahoraIso }, { merge: true })))
  }

  const patch = { resultados }
  if (porArchivar.length > 0) {
    patch.detallesGuardados = [...yaArchivados, ...porArchivar.map(d => d.idx)]
    // Cola para el resumen en video: al pitazo final todavía no está subido.
    const pendientes = { ...(q.resumenPendiente ?? {}) }
    porArchivar.forEach(({ idx }) => { pendientes[String(idx)] = { intentos: 0, ultimo: null } })
    patch.resumenPendiente = pendientes
  }
  if (!huboErrorESPN) {
    patch.enVivoEspnIds = enVivoIds
    patch.enVivoActualizado = new Date().toISOString()
  }
  if (nuevosPartidos) patch.partidos = nuevosPartidos
  if (!q.finalizada && resultadosCompletos({ partidos: nuevosPartidos ?? partidos, resultados })) {
    patch.finalizada = true
    patch.finalizadaEn = new Date().toISOString()
  }
  await db.collection('quinielas').doc(q.id).update(patch)
  return {
    actualizados, idsCorregidos, enVivo: enVivoIds.length,
    finalizada: !!patch.finalizada, archivados: porArchivar.length,
  }
}

// Autoasignación de transmisiones StreamX

const TOKENS_GENERICOS_EQUIPO = new Set([
  'fc', 'cf', 'sc', 'ac', 'club', 'de', 'del', 'futbol', 'football',
  'soccer', 'united', 'cd', 'ca', 'afc',
])

function normalizarEquipoStreamBase(nombre) {
  return normalizarEquipo(nombre)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !TOKENS_GENERICOS_EQUIPO.has(token))
    .join(' ')
}

const GRUPOS_ALIAS_EQUIPO = [
  // Liga MX
  ['guadalajara', ['chivas', 'chivas guadalajara', 'deportivo guadalajara']],
  ['america', ['club america', 'cf america', 'aguilas america']],
  ['pumas unam', ['pumas', 'unam', 'universidad nacional']],
  ['tigres uanl', ['tigres', 'uanl']],
  ['monterrey', ['rayados', 'rayados monterrey']],
  ['santos laguna', ['santos', 'club santos']],
  ['tijuana', ['xolos', 'xolos tijuana']],
  ['atletico san luis', ['atletico de san luis', 'san luis']],
  ['juarez', ['fc juarez', 'bravos juarez']],
  ['queretaro', ['gallos blancos', 'gallos blancos queretaro']],
  ['leon', ['club leon', 'esmeraldas leon']],
  ['cruz azul', ['la maquina cruz azul']],

  // MLS
  ['los angeles fc', ['lafc']],
  ['los angeles galaxy', ['la galaxy', 'galaxy']],
  ['new york city', ['new york city fc', 'nycfc']],
  ['new york red bulls', ['ny red bulls', 'new york rb']],
  ['sporting kansas city', ['sporting kc']],
  ['inter miami', ['inter miami cf']],
  ['real salt lake', ['rsl']],
  ['dc united', ['d c united']],
  ['cf montreal', ['montreal', 'cf montréal']],
  ['vancouver whitecaps', ['vancouver whitecaps fc']],
  ['seattle sounders', ['seattle sounders fc']],
  ['san jose earthquakes', ['sj earthquakes']],

  // Clubes internacionales conocidos
  ['manchester united', ['man united', 'man utd', 'manutd']],
  ['manchester city', ['man city']],
  ['paris saint germain', ['psg', 'paris sg']],
  ['bayern munich', ['bayern munchen', 'fc bayern', 'bayern']],
  ['inter milan', ['internazionale', 'fc internazionale', 'inter']],
  ['borussia dortmund', ['dortmund', 'bvb']],
  ['tottenham hotspur', ['tottenham', 'spurs']],
  ['atletico madrid', ['atletico de madrid']],
  ['athletic bilbao', ['athletic club', 'athletic']],
  ['olympique marseille', ['marseille', 'om']],
  ['olympique lyonnais', ['lyon', 'ol']],
  ['rb leipzig', ['leipzig']],
  ['red bull salzburg', ['rb salzburg', 'salzburg']],
  ['sporting lisboa', ['sporting lisbon', 'sporting cp', 'sporting portugal']],
  ['benfica', ['sl benfica']],
  ['porto', ['fc porto']],
]

const ALIAS_EQUIPO = new Map(GRUPOS_ALIAS_EQUIPO.flatMap(([canonico, alias]) => {
  const claveCanonica = normalizarEquipoStreamBase(canonico)
  return [canonico, ...alias].map(nombre => [normalizarEquipoStreamBase(nombre), claveCanonica])
}))

function normalizarEquipoStream(nombre) {
  const base = normalizarEquipoStreamBase(nombre)
  return ALIAS_EQUIPO.get(base) ?? base
}

function tokensParaSigla(nombre) {
  return normalizarEquipo(nombre)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function siglaEquipo(nombre) {
  const tokens = tokensParaSigla(nombre)
  if (tokens.length < 2) return ''
  return tokens.map(token => {
    if (['fc', 'cf', 'sc', 'ac', 'afc'].includes(token)) return token
    return token[0]
  }).join('')
}

function esEquivalenciaPorSigla(a, b) {
  const tokensA = tokensParaSigla(a)
  const tokensB = tokensParaSigla(b)
  const compactaA = tokensA.length === 1 ? tokensA[0] : ''
  const compactaB = tokensB.length === 1 ? tokensB[0] : ''
  const siglaA = siglaEquipo(a)
  const siglaB = siglaEquipo(b)
  const siglaValida = valor => /^[a-z0-9]{3,7}$/.test(valor)
  return (siglaValida(compactaA) && compactaA === siglaB) ||
    (siglaValida(compactaB) && compactaB === siglaA)
}

function similaridadTexto(a, b) {
  const uno = normalizarEquipoStream(a)
  const dos = normalizarEquipoStream(b)
  if (!uno || !dos) return 0
  if (uno === dos) return 1
  if (esEquivalenciaPorSigla(a, b)) return 0.98
  if (uno.length >= 5 && dos.length >= 5 && (uno.includes(dos) || dos.includes(uno))) return 0.94
  const tokensA = new Set(uno.split(' '))
  const tokensB = new Set(dos.split(' '))
  let comunes = 0
  tokensA.forEach(token => {
    if (tokensB.has(token)) comunes++
  })
  return (2 * comunes) / (tokensA.size + tokensB.size)
}

function partesFechaEnZona(fecha, timeZone) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  return Object.fromEntries(partes.map(p => [p.type, p.value]))
}

export function fechaEventoStreamX(evento) {
  const raw = String(evento?.time ?? evento?.datetime ?? evento?.date ?? '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    const directa = new Date(raw)
    return isNaN(directa.getTime()) ? null : directa
  }
  const [, y, m, d, h, min, s = '0'] = match
  const objetivoUTC = Date.UTC(+y, +m - 1, +d, +h, +min, +s)
  const zona = String(evento?.timezone ?? evento?.tz ?? 'America/Lima')
  try {
    const observada = partesFechaEnZona(new Date(objetivoUTC), zona)
    const observadaUTC = Date.UTC(
      +observada.year, +observada.month - 1, +observada.day,
      +observada.hour, +observada.minute, +observada.second,
    )
    return new Date(objetivoUTC - (observadaUTC - objetivoUTC))
  } catch {
    return new Date(objetivoUTC)
  }
}

function eventosStreamX(data) {
  const eventos = []
  for (const deporte of data?.sports ?? []) {
    if (String(deporte?.id ?? '').toLowerCase() !== 'football') continue
    for (const liga of deporte?.leagues ?? []) {
      for (const evento of liga?.events ?? []) {
        eventos.push({ ...evento, league: evento.league || liga.name || '' })
      }
    }
  }
  return eventos
}

function servidoresActivosStreamX(evento) {
  return (evento?.servers ?? [])
    .filter(server => server?.active !== false)
    .map(server => {
      const raw = String(server?.url ?? '').trim()
      try {
        const url = new URL(raw)
        if (url.protocol !== 'https:') return null
        const path = url.pathname.match(/^\/live[12]\.php$/i)
        const key = path ? String(url.searchParams.get('stream') ?? '').trim() : ''
        return {
          nombre: String(server?.name ?? '').trim(),
          url: url.href,
          key: /^[a-z0-9_-]{1,80}$/i.test(key) ? key : '',
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function candidatoStreamX(partido, evento) {
  const horaPartido = new Date(partido?.hora)
  const horaEvento = fechaEventoStreamX(evento)
  if (isNaN(horaPartido.getTime()) || !horaEvento) return null
  const diferenciaMin = Math.abs(horaPartido.getTime() - horaEvento.getTime()) / 60000
  if (diferenciaMin > 180) return null

  const directoLocal = similaridadTexto(partido.local, evento.homeTeam)
  const directoVisita = similaridadTexto(partido.visitante, evento.awayTeam)
  const invertidoLocal = similaridadTexto(partido.local, evento.awayTeam)
  const invertidoVisita = similaridadTexto(partido.visitante, evento.homeTeam)
  const directo = (directoLocal + directoVisita) / 2
  const invertido = ((invertidoLocal + invertidoVisita) / 2) - 0.02
  const nombres = Math.max(directo, invertido)
  const minimoEquipo = directo >= invertido
    ? Math.min(directoLocal, directoVisita)
    : Math.min(invertidoLocal, invertidoVisita)
  if (minimoEquipo < 0.86) return null

  const tiempo = diferenciaMin <= 45 ? 1 : diferenciaMin <= 90 ? 0.96 : 0.88
  const confianza = nombres * 0.9 + tiempo * 0.1
  const servidores = servidoresActivosStreamX(evento)
  if (confianza < 0.91 || servidores.length === 0) return null
  return { evento, servidores, confianza, diferenciaMin }
}

export function buscarEventoStreamX(partido, eventos) {
  const candidatos = eventos
    .map(evento => candidatoStreamX(partido, evento))
    .filter(Boolean)
    .sort((a, b) => b.confianza - a.confianza || a.diferenciaMin - b.diferenciaMin)
  if (candidatos.length === 0) return null
  if (candidatos[1] && candidatos[0].confianza - candidatos[1].confianza < 0.04) return null
  return candidatos[0]
}

function tieneStreamConfigurado(partido) {
  return ['streamUrl', 'streamUrl2', 'streamUrl3', 'streamKey', 'streamKey2', 'streamKey3']
    .some(campo => String(partido?.[campo] ?? '').trim())
}

function esStreamAutoconfigurado(partido) {
  return partido?.streamAuto?.proveedor === 'streamx'
}

function partidoBuscaStream(partido, resultado, ahora = new Date()) {
  if (!partido || tieneMarcadorFinal(resultado)) return false
  if (tieneStreamConfigurado(partido) && !esStreamAutoconfigurado(partido)) return false
  const inicio = new Date(partido.hora).getTime()
  if (!Number.isFinite(inicio)) return false
  const diferencia = inicio - ahora.getTime()
  return diferencia <= 24 * 60 * 60 * 1000 && diferencia >= -4 * 60 * 60 * 1000
}

export function necesitaSyncStreams(q, ahora = new Date()) {
  if (!q || q.finalizada) return false
  const resultados = q.resultados ?? {}
  return (q.partidos ?? []).some((partido, idx) => partidoBuscaStream(partido, resultados[idx], ahora))
}

async function obtenerAgendaStreamX() {
  const response = await fetch(STREAMX_AGENDA_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  })
  if (!response.ok) throw new Error(`StreamX ${response.status}`)
  return eventosStreamX(await response.json())
}

async function sincronizarStreamsQuiniela(q, eventos, { forzar = false } = {}) {
  const ahora = new Date()
  const resultados = q.resultados ?? {}
  const partidos = (q.partidos ?? []).map(p => ({ ...p }))
  let asignados = 0
  const detalles = []

  partidos.forEach((partido, idx) => {
    if (tieneMarcadorFinal(resultados[idx])) return
    if (tieneStreamConfigurado(partido) && !esStreamAutoconfigurado(partido)) return
    if (!forzar && !partidoBuscaStream(partido, resultados[idx], ahora)) return
    const candidato = buscarEventoStreamX(partido, eventos)
    if (!candidato) return

    const camposComparados = [
      'streamUrl', 'streamUrl2', 'streamUrl3',
      'streamKey', 'streamKey2', 'streamKey3',
      'streamNombre', 'streamNombre2', 'streamNombre3',
    ]
    const antes = JSON.stringify(camposComparados.map(campo => partido[campo] ?? ''))
    camposComparados.forEach(campo => { delete partido[campo] })
    candidato.servidores.forEach((server, serverIdx) => {
      const sufijo = serverIdx === 0 ? '' : String(serverIdx + 1)
      partido[`streamUrl${sufijo}`] = server.url
      partido[`streamNombre${sufijo}`] = server.nombre || `Opción ${serverIdx + 1}`
      if (server.key) partido[`streamKey${sufijo}`] = server.key
    })
    const despues = JSON.stringify(camposComparados.map(campo => partido[campo] ?? ''))
    if (antes === despues) return
    partido.streamAuto = {
      proveedor: 'streamx',
      evento: String(candidato.evento.title ?? '').slice(0, 160),
      confianza: Number(candidato.confianza.toFixed(3)),
      actualizado: new Date().toISOString(),
    }
    asignados++
    detalles.push({
      idx,
      partido: `${partido.local} vs ${partido.visitante}`,
      evento: String(candidato.evento.title ?? ''),
      opciones: candidato.servidores.length,
      confianza: Number(candidato.confianza.toFixed(3)),
    })
  })

  if (asignados > 0) {
    await db.collection('quinielas').doc(q.id).update({ partidos })
  }
  return { asignados, detalles, partidos }
}

export const buscarTransmisionesStreamX = onCall({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 30,
}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  const quinielaId = String(request.data?.quinielaId ?? '').trim()
  if (!quinielaId) throw new HttpsError('invalid-argument', 'Falta la quiniela.')
  const ref = db.collection('quinielas').doc(quinielaId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No encontramos la quiniela.')
  const q = { id: snap.id, ...snap.data() }
  if (q.ownerUid !== request.auth.uid && !SUPER_ADMIN_UIDS.has(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'No puedes editar esta quiniela.')
  }
  try {
    const eventos = await obtenerAgendaStreamX()
    const resultado = await sincronizarStreamsQuiniela(q, eventos, { forzar: true })
    return {
      asignados: resultado.asignados,
      detalles: resultado.detalles,
      partidos: resultado.partidos,
    }
  } catch (error) {
    logger.warn(`No se pudo consultar StreamX manualmente: ${error.message}`)
    throw new HttpsError('unavailable', 'La agenda de transmisiones no está disponible en este momento.')
  }
})

// La función programada

export const sincronizarResultados = onSchedule({
  schedule: 'every 2 minutes',
  timeZone: 'America/Mexico_City',
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  maxInstances: 1,
  retryCount: 0,
}, async () => {
  const snap = await db.collection('quinielas').get()
  const ahora = new Date()
  const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  const buscandoStream = todas.filter(q => necesitaSyncStreams(q, ahora))
  if (buscandoStream.length > 0) {
    try {
      const eventos = await obtenerAgendaStreamX()
      for (const q of buscandoStream) {
        try {
          const resultado = await sincronizarStreamsQuiniela(q, eventos)
          if (resultado.asignados > 0) {
            q.partidos = resultado.partidos
            logger.info(`Quiniela ${q.id}: ${resultado.asignados} transmisión(es) StreamX asignada(s).`)
          }
        } catch (error) {
          logger.warn(`No se pudieron asignar streams a ${q.id}: ${error.message}`)
        }
      }
    } catch (error) {
      logger.warn(`Agenda StreamX no disponible: ${error.message}`)
    }
  }

  const activas = todas.filter(q => necesitaSync(q, ahora))
  const conDetallesPendientes = todas.filter(q => necesitaDetalles(q, ahora))
  if (conDetallesPendientes.length > 0) {
    const cacheResumen = new Map()
    let respaldados = 0
    for (const q of conDetallesPendientes) {
      try {
        respaldados += await respaldarDetallesFaltantes(q, cacheResumen, ahora)
      } catch (error) {
        logger.warn(`No se pudieron completar detalles de ${q.id}: ${error.message}`)
      }
    }
    logger.info(`${respaldados} detalle(s) histórico(s) respaldado(s) desde ESPN summary.`)
  }

  if (activas.length === 0) {
    logger.info(`Sin marcadores pendientes (${snap.size} quinielas en total).`)
    return
  }

  logger.info(`${activas.length} quiniela(s) en juego de ${snap.size} totales.`)
  const cache = new Map() // scoreboard por liga+fechas, compartido entre quinielas

  for (const q of activas) {
    try {
      const r = await sincronizarQuiniela(q, cache)
      if (r) {
        logger.info(`Quiniela ${q.id} ("${q.nombre ?? ''}"): ${r.actualizados} resultado(s) guardado(s)` +
          (r.idsCorregidos ? `, ${r.idsCorregidos} ID(s) de ESPN corregido(s)` : '') +
          (r.enVivo ? `, ${r.enVivo} partido(s) EN VIVO` : '') +
          (r.archivados ? `, ${r.archivados} detalle(s) archivado(s)` : '') +
          (r.finalizada ? ' (FINALIZADA 🏆)' : ''))
      }
    } catch (err) {
      logger.error(`Error sincronizando quiniela ${q.id}: ${err.message}`)
    }
  }
})

// Resúmenes en video, aparte de la sincronización de resultados
//
// Va en su propia función a propósito. `sincronizarResultados` es la que
// sostiene los marcadores de toda la app y no debe depender de un secreto
// opcional: si YOUTUBE_API_KEY faltara o se borrara, esa función ni siquiera
// se podría desplegar. Aquí el peor caso es quedarse sin resumen en video.
//
// Cada 30 min basta: el throttle de `tocaBuscarResumen` ya limita a 4 intentos
// por partido, el primero 45 min después del pitazo final.

export const buscarResumenesEnVideo = onSchedule({
  schedule: 'every 30 minutes',
  timeZone: 'America/Mexico_City',
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  maxInstances: 1,
  retryCount: 0,
  secrets: [YOUTUBE_API_KEY],
}, async () => {
  const clave = YOUTUBE_API_KEY.value()
  if (!clave) {
    logger.info('Sin YOUTUBE_API_KEY: no se buscan resúmenes en video.')
    return
  }
  const ahora = new Date()
  const snap = await db.collection('quinielas').get()
  const pendientes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(q => completarColaResumen(q, ahora))
    .filter(q => necesitaResumen(q, ahora))

  if (pendientes.length === 0) {
    logger.info('Sin resúmenes en video pendientes.')
    return
  }

  let total = 0
  for (const q of pendientes) {
    try {
      total += await buscarResumenesPendientes(q, clave, ahora)
    } catch (error) {
      logger.warn(`No se pudieron buscar resúmenes de ${q.id}: ${error.message}`)
    }
  }
  logger.info(`${pendientes.length} quiniela(s) revisada(s), ${total} resumen(es) encontrado(s).`)
})
