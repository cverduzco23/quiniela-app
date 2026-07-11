// Cloud Function: sincronización automática de resultados desde ESPN.
//
// Corre cada 10 minutos y hace lo mismo que hacía el botón "⚡ Sincronizar
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
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp()
const db = getFirestore()

export { crearSesionDonativo, webhookDonativos } from './stripe.js'

// ─── Helpers copiados de src/utils (scoring.js, cierre.js, espn.js) ─────────
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

// ─── Selección de quinielas a sincronizar ────────────────────────────────────

// Cuántos días después del último partido seguimos intentando sincronizar.
// Evita trabajar para siempre en quinielas abandonadas (ej. un partido que
// ESPN nunca marcó como terminado). Pasado este plazo, el admin captura a mano.
const DIAS_VENTANA = 14

function tieneMarcadorFinal(r) {
  if (!r) return false
  if (r.cancelado) return true
  return String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
}

/** ¿Esta quiniela necesita que intentemos sincronizarla en esta corrida? */
export function necesitaSync(q, ahora = new Date()) {
  // OJO: no descartamos por q.finalizada. El ranking (ranking.jsx) marca
  // finalizada:true desde el navegador cuando ve todos los partidos terminados
  // en ESPN, pero NO guarda los marcadores — si la saltáramos por ese flag,
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

// ─── Consulta a ESPN ─────────────────────────────────────────────────────────

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
    ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${inicio}-${hoy}`
    : `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard`
  if (cache.has(url)) return cache.get(url)
  const promesa = fetch(url)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ESPN ${r.status}`))))
    .then(d => d.events ?? [])
  cache.set(url, promesa)
  return promesa
}

/** Extrae el resultado final de un evento ESPN, o null si aún no termina. */
function resultadoDeEvento(ev) {
  const state = ev.status?.type?.state
  if (state !== 'post') return null
  // ESPN reporta cancelados/pospuestos/forfeits con state="post" y
  // completed=false, típicamente con score 0-0. NO se guarda como empate.
  if (ev.status?.type?.completed === false) return { cancelado: true }
  const comps = ev.competitions?.[0]?.competitors ?? []
  const home  = comps.find(c => c.homeAway === 'home')
  const away  = comps.find(c => c.homeAway === 'away')
  if (home?.score === undefined || away?.score === undefined) return null
  return { local: home.score, visitante: away.score, resultado: goalsToResultado(home.score, away.score) }
}

// ─── Sincronizar una quiniela ────────────────────────────────────────────────

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

  for (const [liga, ps] of Object.entries(porLiga)) {
    let events
    try {
      events = await fetchScoreboard(cache, liga, ps)
    } catch (err) {
      logger.warn(`ESPN falló para liga ${liga}: ${err.message}`)
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
      const res = resultadoDeEvento(ev)
      if (!res) return
      resultados[p.idx] = res
      actualizados++
    })
  }

  if (actualizados === 0 && idsCorregidos === 0) return null

  const patch = { resultados }
  if (nuevosPartidos) patch.partidos = nuevosPartidos
  if (!q.finalizada && resultadosCompletos({ partidos: nuevosPartidos ?? partidos, resultados })) {
    patch.finalizada = true
    patch.finalizadaEn = new Date().toISOString()
  }
  await db.collection('quinielas').doc(q.id).update(patch)
  return { actualizados, idsCorregidos, finalizada: !!patch.finalizada }
}

// ─── La función programada ───────────────────────────────────────────────────

export const sincronizarResultados = onSchedule({
  schedule: 'every 10 minutes',
  timeZone: 'America/Mexico_City',
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  maxInstances: 1,
  retryCount: 0,
}, async () => {
  const snap = await db.collection('quinielas').get()
  const ahora = new Date()
  const activas = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(q => necesitaSync(q, ahora))

  if (activas.length === 0) {
    logger.info(`Sin quinielas en juego (${snap.size} en total). Nada que hacer.`)
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
          (r.finalizada ? ' — FINALIZADA 🏆' : ''))
      }
    } catch (err) {
      logger.error(`Error sincronizando quiniela ${q.id}: ${err.message}`)
    }
  }
})
