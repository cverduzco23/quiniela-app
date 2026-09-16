// Utilidades para match de eventos contra la API de ESPN.
//
// Contexto: a veces ESPN reasigna el ID de un partido entre el momento en
// que lo agregamos a la quiniela y el momento en que se juega (reprograma,
// cambia de sede, consolida eventos, etc.). El ID viejo deja de existir
// en su scoreboard y nuestro sync no encuentra el partido.
//
// Fallback seguro: buscar en la respuesta de ESPN por nombres de equipos
// + mismo día. Si hay exactamente 1 candidato, lo proponemos al admin para
// que confirme antes de aplicar. Si hay 0 o >1 candidatos, no proponemos
// nada: comportamiento conservador.

/** Normaliza el nombre de un equipo para comparación: lowercase, sin acentos, sin espacios extras. */
export function normalizarEquipo(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿Las dos fechas caen el mismo día en hora LOCAL del navegador?
 * - eventDateUTC: string ISO con Z (formato API ESPN: "2026-06-03T11:30Z")
 * - partidoLocalISO: string ISO sin Z (formato que guardamos: "2026-06-03T05:30")
 *
 * Comparamos en la zona local del admin porque el partido guardado en
 * Firestore está en la hora local del navegador donde se creó.
 */
export function mismoDiaLocal(eventDateUTC, partidoLocalISO) {
  if (!eventDateUTC || !partidoLocalISO) return false
  const evD = new Date(eventDateUTC)
  if (isNaN(evD.getTime())) return false
  const pad = n => String(n).padStart(2, '0')
  const evDay = `${evD.getFullYear()}-${pad(evD.getMonth() + 1)}-${pad(evD.getDate())}`
  const partidoDay = String(partidoLocalISO).slice(0, 10)
  return evDay === partidoDay
}

/**
 * Busca en `events` un evento que coincida por nombres de equipos + día.
 * - Exige que AMBOS equipos (home + away) coincidan
 * - Exige mismo día local
 * - Si hay exactamente 1 candidato, lo devuelve
 * - Si hay 0 o >1, devuelve null (comportamiento conservador para evitar
 *   falsos positivos en torneos triangulares u otros casos raros)
 */
export function findEventByTeamsAndDate(events, partidoLocal, partidoVisitante, partidoHora) {
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

/**
 * Clasifica los estados `post` que ESPN todavía no considera completados.
 * Una suspensión conserva el partido pendiente de reanudación; únicamente
 * estados explícitos de cancelación/abandono se pueden omitir del scoring.
 */
export function clasificarEstadoNoFinalESPN(evento) {
  const tipo = evento?.status?.type
  if (tipo?.state !== 'post' || tipo?.completed !== false) return null
  const nombre = String(tipo.name ?? '').toUpperCase()
  if (nombre === 'STATUS_SUSPENDED') return 'suspendido'
  if (/(CANCEL|POSTPON|ABANDON|FORFEIT)/.test(nombre)) return 'cancelado'
  return 'pendiente'
}

/**
 * Traduce un evento de ESPN a la entrada de marcador en vivo que consume la UI.
 * Sirve igual para un evento del `scoreboard` que para uno reconstruido desde
 * la ficha individual (`summary`), porque ambos exponen la misma cabecera:
 * `status` + `competitions[0].competitors`.
 */
export function marcadorDeEvento(ev) {
  const state = ev?.status?.type?.state
  const comps = ev?.competitions?.[0]?.competitors ?? []
  const home  = comps.find(c => c.homeAway === 'home')
  const away  = comps.find(c => c.homeAway === 'away')
  const statusName = ev?.status?.type?.name ?? ''
  // `post + completed=false` no siempre significa cancelado. ESPN usa esa
  // combinación también para partidos suspendidos que reanudarán.
  const estadoNoFinal = clasificarEstadoNoFinalESPN(ev)
  if (estadoNoFinal === 'cancelado') {
    return {
      home, away, tienePenales: false,
      live: { state, cancelado: true, halftime: false, local: '', visitante: '' },
    }
  }
  // Tanda de penales: ESPN reporta el global aparte en `shootoutScore` (el
  // `score` regular se queda en el empate). Lo detectamos por el status, por el
  // detalle ("AET-pens" / "FT-Pens", que es lo que ESPN realmente manda para
  // soccer: STATUS_SHOOTOUT casi no aparece) o por el marcador de penales.
  const statusDetail = (ev?.status?.type?.shortDetail || ev?.status?.type?.detail || '')
  const enFaseDePenales = /pen/i.test(statusDetail)
  const homePen = home?.shootoutScore
  const awayPen = away?.shootoutScore
  const tienePenales = enFaseDePenales || homePen != null || awayPen != null ||
    statusName === 'STATUS_SHOOTOUT' || statusName === 'STATUS_FINAL_PEN'
  const penalesEnVivo = state === 'in' &&
    (enFaseDePenales || statusName === 'STATUS_SHOOTOUT' || homePen != null || awayPen != null)
  return {
    home, away, tienePenales,
    live: {
      state, clock: ev?.status?.displayClock ?? '', halftime: statusName === 'STATUS_HALFTIME',
      local: home?.score ?? '', visitante: away?.score ?? '',
      noFinal: estadoNoFinal !== null,
      suspendido: estadoNoFinal === 'suspendido',
      penales: tienePenales, penalesEnVivo,
      localPen: homePen ?? null, visitantePen: awayPen ?? null,
    },
  }
}

/**
 * La ficha individual (`summary?event=`) trae la misma cabecera que el
 * scoreboard, pero anidada bajo `header`. La reempacamos con la forma de evento
 * para poder leerla con `marcadorDeEvento`.
 *
 * Este endpoint es el respaldo cuando el scoreboard no devuelve el partido: se
 * pide por id exacto, así que no depende del rango de fechas ni del límite de
 * eventos de la respuesta del scoreboard.
 */
export function eventoDesdeSummary(datos) {
  const comp = datos?.header?.competitions?.[0]
  if (!comp?.status) return null
  return {
    id: String(datos?.header?.id ?? comp.id ?? ''),
    date: comp.date ?? '',
    status: comp.status,
    competitions: [{ competitors: comp.competitors ?? [], details: [] }],
  }
}

// ── Consultas al scoreboard ─────────────────────────────────────────────────
// Desde sep-2026 ESPN rechaza con 400 los rangos `dates=AAAAMMDD-AAAAMMDD`.
// Solo acepta un día (`AAAAMMDD`), un mes (`AAAAMM`) o un año. Por eso
// partimos cualquier rango en días (rangos cortos) o meses (rangos largos)
// y juntamos los eventos sin duplicados.

const pad2 = n => String(n).padStart(2, '0')

/** Claves `dates=` que cubren [desde, hasta] (fechas locales, inclusivo). */
export function clavesScoreboard(desde, hasta, maxDias = 3) {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || a > b) return []
  const dias = Math.round((b - a) / 86400000) + 1
  const claves = []
  if (dias <= maxDias) {
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      claves.push(`${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`)
    }
    return claves
  }
  // ESPN agrupa por fecha del Este de EE.UU.: un partido de noche puede caer en
  // el mes vecino, así que sumamos un día de margen en cada extremo.
  const ini = new Date(a); ini.setDate(ini.getDate() - 1)
  const fin = new Date(b); fin.setDate(fin.getDate() + 1)
  for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    claves.push(`${d.getFullYear()}${pad2(d.getMonth() + 1)}`)
  }
  return claves
}

/** Junta listas de eventos quitando duplicados por id. */
export function unirEventos(listas) {
  const vistos = new Map()
  for (const lista of listas) for (const ev of lista ?? []) {
    if (ev?.id != null && !vistos.has(String(ev.id))) vistos.set(String(ev.id), ev)
  }
  return [...vistos.values()].sort((x, y) => String(x.date ?? '').localeCompare(String(y.date ?? '')))
}

/** Trae los eventos de una liga entre dos fechas (una petición por día o mes). */
export async function fetchEventosScoreboard(ligaId, desde, hasta, { maxDias = 3, fetchImpl = fetch } = {}) {
  const claves = clavesScoreboard(desde, hasta, maxDias)
  const listas = await Promise.all(claves.map(async clave => {
    const r = await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${clave}`)
    if (!r.ok) throw new Error(`ESPN ${r.status}`)
    const data = await r.json()
    return data.events ?? []
  }))
  return unirEventos(listas)
}
