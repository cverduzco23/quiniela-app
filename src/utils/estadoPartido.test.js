import { describe, it, expect } from 'vitest'
import { calcularEstadoPartido } from './estadoPartido'
import { VENTANA_EN_VIVO } from './cierre'

const INICIO = new Date('2026-09-15T19:00:00').getTime()
const partidoConEspn  = { local: 'Puebla', visitante: 'Toluca', hora: '2026-09-15T19:00', espnId: '123', ligaId: 'mex.1' }
const partidoManual   = { local: 'Puebla', visitante: 'Toluca', hora: '2026-09-15T19:00' }

describe('calcularEstadoPartido con datos de ESPN', () => {
  it('marca en vivo cuando ESPN reporta state=in', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, { 123: { state: 'in', local: '0', visitante: '0' } }, INICIO + 60000)
    expect(e.esVivo).toBe(true)
    expect(e.enCurso).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.scoreLocal).toBe('0')
  })

  it('respeta un "pre" de ESPN aunque ya pasó la hora de inicio (retrasos)', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, { 123: { state: 'pre', local: '', visitante: '' } }, INICIO + 30 * 60000)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.esperandoResultado).toBe(false)
    expect(e.pendiente).toBe(true)
  })

  it('un partido terminado no se considera en curso', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, { 123: { state: 'post', local: '2', visitante: '1' } }, INICIO + 3 * 60 * 60000)
    expect(e.jugado).toBe(true)
    expect(e.enCurso).toBe(false)
    expect(e.esperandoResultado).toBe(false)
  })
})

describe('calcularEstadoPartido sin datos de ESPN', () => {
  it('sigue pendiente antes de la hora de inicio', () => {
    const e = calcularEstadoPartido(partidoManual, 0, {}, {}, INICIO - 60000)
    expect(e.porComenzar).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.enCurso).toBe(false)
  })

  it('se considera en juego una vez que pasó la hora de inicio', () => {
    const e = calcularEstadoPartido(partidoManual, 0, {}, {}, INICIO + 77 * 60000)
    expect(e.enJuegoSinMarcador).toBe(true)
    expect(e.enCurso).toBe(true)
    expect(e.porComenzar).toBe(false)
    expect(e.esperandoResultado).toBe(false)
    // Sin marcador conocido no inventamos uno.
    expect(e.marcadorVisible).toBe(false)
  })

  it('pasa a esperar resultado cuando se acaba la ventana del partido', () => {
    const e = calcularEstadoPartido(partidoManual, 0, {}, {}, INICIO + VENTANA_EN_VIVO + 60000)
    expect(e.esperandoResultado).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.enCurso).toBe(false)
  })

  it('el marcador del organizador gana sobre la heurística de horario', () => {
    const e = calcularEstadoPartido(partidoManual, 0, { 0: { local: '1', visitante: '1' } }, {}, INICIO + 60 * 60000)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.jugado).toBe(true)
    expect(e.resDisplay).toBe('draw')
  })

  it('un partido cancelado nunca aparece en juego', () => {
    const e = calcularEstadoPartido(partidoManual, 0, { 0: { cancelado: true } }, {}, INICIO + 60 * 60000)
    expect(e.cancelado).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.esperandoResultado).toBe(false)
  })

  it('sin hora de inicio no aplica la heurística', () => {
    const e = calcularEstadoPartido({ local: 'A', visitante: 'B' }, 0, {}, {}, INICIO)
    expect(e.pendiente).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.esperandoResultado).toBe(false)
    expect(e.porComenzar).toBe(true)
  })

  it('un espnId sin entrada en liveScores también cae a la heurística', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, {}, INICIO + 10 * 60000)
    expect(e.enJuegoSinMarcador).toBe(true)
  })
})

describe('calcularEstadoPartido con el respaldo del servidor', () => {
  const ids = ['123']

  it('marca en juego el partido que la Cloud Function vio en vivo', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, {}, INICIO + 30 * 60000, ids)
    expect(e.enJuegoSinMarcador).toBe(true)
    expect(e.enCurso).toBe(true)
    expect(e.marcadorVisible).toBe(false)
  })

  it('aguanta que el partido se alargue más allá de la ventana por horario', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, {}, INICIO + VENTANA_EN_VIVO + 10 * 60000, ids)
    expect(e.enJuegoSinMarcador).toBe(true)
    expect(e.esperandoResultado).toBe(false)
  })

  it('un partido fuera de la lista del servidor no se da por comenzado antes de su hora', () => {
    const otro = { ...partidoConEspn, espnId: '999' }
    const e = calcularEstadoPartido(otro, 0, {}, {}, INICIO - 60000, ids)
    expect(e.enJuegoSinMarcador).toBe(false)
    expect(e.porComenzar).toBe(true)
  })

  it('el dato propio de ESPN le gana al del servidor', () => {
    const e = calcularEstadoPartido(partidoConEspn, 0, {}, { 123: { state: 'post', local: '2', visitante: '0' } }, INICIO + 3 * 60 * 60000, ids)
    expect(e.jugado).toBe(true)
    expect(e.enJuegoSinMarcador).toBe(false)
  })
})
