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
