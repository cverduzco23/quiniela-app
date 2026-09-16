import { describe, it, expect } from 'vitest'
import { normalizarEquipo, mismoDiaLocal, findEventByTeamsAndDate, clasificarEstadoNoFinalESPN, marcadorDeEvento, eventoDesdeSummary } from './espn'

describe('normalizarEquipo', () => {
  it('quita acentos y baja mayúsculas', () => {
    expect(normalizarEquipo('México')).toBe('mexico')
    expect(normalizarEquipo('KYRGYZ REPUBLIC')).toBe('kyrgyz republic')
  })

  it('colapsa espacios y aplica trim', () => {
    expect(normalizarEquipo('  Real   Madrid  ')).toBe('real madrid')
  })

  it('maneja nulo/undefined sin romper', () => {
    expect(normalizarEquipo(null)).toBe('')
    expect(normalizarEquipo(undefined)).toBe('')
  })
})

describe('mismoDiaLocal', () => {
  it('match cuando el evento UTC cae el mismo día local', () => {
    // 11:30 UTC = 05:30 en México (UTC-6) → mismo día local
    // (Test depende de la TZ del runner. En CI usualmente UTC: 11:30 UTC = 03 jun.
    // En máquina con TZ MX: 05:30 = 03 jun. Ambos coinciden con "2026-06-03".)
    expect(mismoDiaLocal('2026-06-03T11:30Z', '2026-06-03T05:30')).toBe(true)
  })

  it('no match cuando el evento cae otro día', () => {
    expect(mismoDiaLocal('2026-06-04T11:30Z', '2026-06-03T05:30')).toBe(false)
  })

  it('maneja entradas faltantes o inválidas', () => {
    expect(mismoDiaLocal(null, '2026-06-03T05:30')).toBe(false)
    expect(mismoDiaLocal('2026-06-03T11:30Z', null)).toBe(false)
    expect(mismoDiaLocal('basura', '2026-06-03')).toBe(false)
  })
})

describe('findEventByTeamsAndDate', () => {
  const makeEv = (id, home, away, date) => ({
    id, date,
    competitions: [{
      competitors: [
        { homeAway: 'home', team: { displayName: home } },
        { homeAway: 'away', team: { displayName: away } },
      ],
    }],
  })

  it('match cuando ambos equipos y día coinciden', () => {
    const events = [
      makeEv('999', 'Philippines', 'Guam', '2026-06-03T11:30Z'),
      makeEv('888', 'Kenya', 'Uganda', '2026-06-03T12:00Z'),
    ]
    const ev = findEventByTeamsAndDate(events, 'Philippines', 'Guam', '2026-06-03T05:30')
    expect(ev?.id).toBe('999')
  })

  it('match con variaciones de acentos / mayúsculas', () => {
    const events = [makeEv('1', 'México', 'Estados Unidos', '2026-06-03T11:30Z')]
    expect(findEventByTeamsAndDate(events, 'mexico', 'ESTADOS UNIDOS', '2026-06-03T05:30')?.id).toBe('1')
  })

  it('NO match si solo coincide un equipo', () => {
    const events = [makeEv('1', 'Philippines', 'Vietnam', '2026-06-03T11:30Z')]
    expect(findEventByTeamsAndDate(events, 'Philippines', 'Guam', '2026-06-03T05:30')).toBeNull()
  })

  it('NO match si los equipos coinciden pero el día NO', () => {
    const events = [makeEv('1', 'Philippines', 'Guam', '2026-06-10T11:30Z')]
    expect(findEventByTeamsAndDate(events, 'Philippines', 'Guam', '2026-06-03T05:30')).toBeNull()
  })

  it('NO match si home/away están invertidos (orden importa)', () => {
    const events = [makeEv('1', 'Guam', 'Philippines', '2026-06-03T11:30Z')]
    expect(findEventByTeamsAndDate(events, 'Philippines', 'Guam', '2026-06-03T05:30')).toBeNull()
  })

  it('NO match si hay más de un candidato (ambiguo, evitamos falso positivo)', () => {
    const events = [
      makeEv('1', 'Philippines', 'Guam', '2026-06-03T11:30Z'),
      makeEv('2', 'Philippines', 'Guam', '2026-06-03T20:00Z'),
    ]
    expect(findEventByTeamsAndDate(events, 'Philippines', 'Guam', '2026-06-03T05:30')).toBeNull()
  })

  it('lista vacía o nula', () => {
    expect(findEventByTeamsAndDate([], 'A', 'B', '2026-06-03')).toBeNull()
    expect(findEventByTeamsAndDate(null, 'A', 'B', '2026-06-03')).toBeNull()
  })

  it('nombres de equipo faltantes', () => {
    const events = [makeEv('1', 'A', 'B', '2026-06-03T11:30Z')]
    expect(findEventByTeamsAndDate(events, '', 'B', '2026-06-03')).toBeNull()
    expect(findEventByTeamsAndDate(events, 'A', null, '2026-06-03')).toBeNull()
  })
})

describe('clasificarEstadoNoFinalESPN', () => {
  const evento = (name, state = 'post', completed = false) => ({
    status: { type: { name, state, completed } },
  })

  it('distingue una suspensión de una cancelación', () => {
    expect(clasificarEstadoNoFinalESPN(evento('STATUS_SUSPENDED'))).toBe('suspendido')
  })

  it.each([
    'STATUS_CANCELED',
    'STATUS_CANCELLED',
    'STATUS_POSTPONED',
    'STATUS_ABANDONED',
    'STATUS_FORFEIT',
  ])('clasifica %s como cancelado', name => {
    expect(clasificarEstadoNoFinalESPN(evento(name))).toBe('cancelado')
  })

  it('mantiene como pendiente un estado post no reconocido', () => {
    expect(clasificarEstadoNoFinalESPN(evento('STATUS_DELAYED'))).toBe('pendiente')
  })

  it('no clasifica partidos en vivo ni finales reales', () => {
    expect(clasificarEstadoNoFinalESPN(evento('STATUS_IN_PROGRESS', 'in', false))).toBeNull()
    expect(clasificarEstadoNoFinalESPN(evento('STATUS_FULL_TIME', 'post', true))).toBeNull()
  })
})

// Forma real de la respuesta de `summary?event=`: la cabecera trae el mismo
// estado y marcador que el scoreboard, solo que anidada bajo `header`.
const summaryEnVivo = {
  header: {
    id: '742331',
    competitions: [{
      id: '742331',
      date: '2026-09-16T01:00Z',
      status: {
        displayClock: "69'",
        type: { state: 'in', name: 'STATUS_IN_PROGRESS', completed: false, shortDetail: "69'" },
      },
      competitors: [
        { homeAway: 'home', score: '0', team: { id: '223', displayName: 'Puebla' } },
        { homeAway: 'away', score: '0', team: { id: '221', displayName: 'Toluca' } },
      ],
    }],
  },
}

describe('eventoDesdeSummary', () => {
  it('reempaca la ficha individual con la forma de evento del scoreboard', () => {
    const ev = eventoDesdeSummary(summaryEnVivo)
    expect(ev.id).toBe('742331')
    expect(ev.status.type.state).toBe('in')
    expect(ev.competitions[0].competitors).toHaveLength(2)
  })

  it('devuelve null si la respuesta no trae cabecera utilizable', () => {
    expect(eventoDesdeSummary(null)).toBe(null)
    expect(eventoDesdeSummary({})).toBe(null)
    expect(eventoDesdeSummary({ header: { competitions: [{}] } })).toBe(null)
  })
})

describe('marcadorDeEvento', () => {
  it('lee un 0-0 en vivo desde la ficha individual', () => {
    const { live } = marcadorDeEvento(eventoDesdeSummary(summaryEnVivo))
    expect(live.state).toBe('in')
    expect(live.local).toBe('0')
    expect(live.visitante).toBe('0')
    expect(live.clock).toBe("69'")
    expect(live.cancelado).toBeUndefined()
    expect(live.noFinal).toBe(false)
  })

  it('lee lo mismo desde un evento del scoreboard', () => {
    const ev = {
      id: '742331',
      status: { displayClock: "45'", type: { state: 'in', name: 'STATUS_HALFTIME', completed: false } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '1', team: { id: '223' } },
        { homeAway: 'away', score: '2', team: { id: '221' } },
      ] }],
    }
    const { live } = marcadorDeEvento(ev)
    expect(live.halftime).toBe(true)
    expect(live.local).toBe('1')
    expect(live.visitante).toBe('2')
  })

  it('marca cancelado sin inventar marcador', () => {
    const ev = {
      status: { type: { state: 'post', name: 'STATUS_POSTPONED', completed: false } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '0', team: {} },
        { homeAway: 'away', score: '0', team: {} },
      ] }],
    }
    const { live } = marcadorDeEvento(ev)
    expect(live.cancelado).toBe(true)
    expect(live.local).toBe('')
  })

  it('distingue un suspendido de un cancelado', () => {
    const ev = {
      status: { type: { state: 'post', name: 'STATUS_SUSPENDED', completed: false } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '1', team: {} },
        { homeAway: 'away', score: '0', team: {} },
      ] }],
    }
    const { live } = marcadorDeEvento(ev)
    expect(live.cancelado).toBeUndefined()
    expect(live.noFinal).toBe(true)
    expect(live.suspendido).toBe(true)
    expect(live.local).toBe('1')
  })

  it('detecta la tanda de penales por el detalle del status', () => {
    const ev = {
      status: { displayClock: "120'", type: { state: 'in', name: 'STATUS_IN_PROGRESS', completed: false, shortDetail: 'AET-pens' } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '1', shootoutScore: 3, team: {} },
        { homeAway: 'away', score: '1', shootoutScore: 2, team: {} },
      ] }],
    }
    const { tienePenales, live } = marcadorDeEvento(ev)
    expect(tienePenales).toBe(true)
    expect(live.penalesEnVivo).toBe(true)
    expect(live.localPen).toBe(3)
    expect(live.visitantePen).toBe(2)
  })
})
