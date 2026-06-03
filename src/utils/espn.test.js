import { describe, it, expect } from 'vitest'
import { normalizarEquipo, mismoDiaLocal, findEventByTeamsAndDate } from './espn'

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
