import { describe, it, expect } from 'vitest'
import { tiempoRestante, hayPartidoEnVivo } from './cierre'

const ahora = new Date('2026-06-12T10:00:00').getTime()
const isoEn = (msDelta) => new Date(ahora + msDelta).toISOString()

describe('hayPartidoEnVivo', () => {
  const MIN = 60 * 1000
  // Quiniela con un partido que empezó hace 30 min y no tiene marcador final
  // (la heurística por horario lo consideraría en vivo).
  const base = () => ({
    partidos: [{ local: 'A', visitante: 'B', hora: isoEn(-30 * MIN) }],
    resultados: {},
  })

  it('usa el dato exacto de la Cloud Function cuando es fresco: hay en vivo', () => {
    const q = { ...base(), enVivoEspnIds: ['123'], enVivoActualizado: isoEn(-5 * MIN) }
    expect(hayPartidoEnVivo(q, ahora)).toBe(true)
  })

  it('usa el dato exacto cuando es fresco: NO hay en vivo (aunque la heurística diría que sí)', () => {
    const q = { ...base(), enVivoEspnIds: [], enVivoActualizado: isoEn(-5 * MIN) }
    expect(hayPartidoEnVivo(q, ahora)).toBe(false)
  })

  it('cae a la heurística si el dato de la función ya caducó', () => {
    // Escrito hace 40 min (> 25 min de frescura) diciendo "no hay en vivo",
    // pero el partido sigue dentro de la ventana por horario → heurística: true.
    const q = { ...base(), enVivoEspnIds: [], enVivoActualizado: isoEn(-40 * MIN) }
    expect(hayPartidoEnVivo(q, ahora)).toBe(true)
  })

  it('cae a la heurística si nunca ha corrido la función (campos ausentes)', () => {
    expect(hayPartidoEnVivo(base(), ahora)).toBe(true)
  })

  it('heurística: false antes de la hora de inicio y pasada la ventana de ~2.5h', () => {
    const antes = { partidos: [{ local: 'A', visitante: 'B', hora: isoEn(10 * MIN) }], resultados: {} }
    expect(hayPartidoEnVivo(antes, ahora)).toBe(false)
    const pasado = { partidos: [{ local: 'A', visitante: 'B', hora: isoEn(-160 * MIN) }], resultados: {} }
    expect(hayPartidoEnVivo(pasado, ahora)).toBe(false)
  })

  it('heurística: false si el partido ya tiene marcador final o está cancelado', () => {
    const conFinal = { ...base(), resultados: { 0: { local: '2', visitante: '1' } } }
    expect(hayPartidoEnVivo(conFinal, ahora)).toBe(false)
    const cancelado = { ...base(), resultados: { 0: { cancelado: true } } }
    expect(hayPartidoEnVivo(cancelado, ahora)).toBe(false)
  })

  it('ignora un enVivoActualizado con fecha futura (reloj desfasado): usa la heurística', () => {
    const q = { ...base(), enVivoEspnIds: [], enVivoActualizado: isoEn(10 * MIN) }
    expect(hayPartidoEnVivo(q, ahora)).toBe(true)
  })
})

describe('tiempoRestante', () => {
  it('devuelve null si no hay cierre', () => {
    expect(tiempoRestante(null, ahora)).toBeNull()
    expect(tiempoRestante(undefined, ahora)).toBeNull()
  })

  it('devuelve null si el cierre ya pasó', () => {
    expect(tiempoRestante(isoEn(-1000), ahora)).toBeNull()
    expect(tiempoRestante(isoEn(-60 * 60 * 1000), ahora)).toBeNull()
  })

  it('devuelve null si quedan más de 24h', () => {
    expect(tiempoRestante(isoEn(25 * 60 * 60 * 1000), ahora)).toBeNull()
    expect(tiempoRestante(isoEn(7 * 24 * 60 * 60 * 1000), ahora)).toBeNull()
  })

  it('nivel "urgente" cuando quedan entre 1h y 24h', () => {
    const r1 = tiempoRestante(isoEn(23 * 60 * 60 * 1000), ahora)
    expect(r1?.nivel).toBe('urgente')
    expect(r1?.texto).toContain('menos de 23h')

    const r2 = tiempoRestante(isoEn(2 * 60 * 60 * 1000), ahora)
    expect(r2?.nivel).toBe('urgente')
    expect(r2?.texto).toContain('menos de 2h')
  })

  it('nivel "critico" cuando queda menos de 1 hora', () => {
    const r1 = tiempoRestante(isoEn(30 * 60 * 1000), ahora) // 30 min
    expect(r1?.nivel).toBe('critico')
    expect(r1?.texto).toContain('30 min')

    const r2 = tiempoRestante(isoEn(5 * 60 * 1000), ahora) // 5 min
    expect(r2?.nivel).toBe('critico')
    expect(r2?.texto).toContain('5 min')
  })

  it('redondea minutos hacia arriba y muestra mínimo "1 min"', () => {
    // 15 segundos faltan → debería decir "1 min"
    const r = tiempoRestante(isoEn(15 * 1000), ahora)
    expect(r?.nivel).toBe('critico')
    expect(r?.texto).toContain('1 min')
  })

  it('cambia de "urgente" a "critico" al cruzar 1h', () => {
    const r1 = tiempoRestante(isoEn(60 * 60 * 1000 + 1), ahora) // justo > 1h
    expect(r1?.nivel).toBe('urgente')

    const r2 = tiempoRestante(isoEn(60 * 60 * 1000 - 1), ahora) // justo < 1h
    expect(r2?.nivel).toBe('critico')
  })
})
