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
