import { describe, it, expect } from 'vitest'
import {
  goalsToResultado,
  getResultado,
  getPickResultado,
  getEfectivo,
  calcularPuntos,
} from './scoring'

describe('goalsToResultado', () => {
  it('devuelve home cuando local gana', () => {
    expect(goalsToResultado(2, 1)).toBe('home')
  })
  it('devuelve away cuando visitante gana', () => {
    expect(goalsToResultado(0, 3)).toBe('away')
  })
  it('devuelve draw en empate', () => {
    expect(goalsToResultado(1, 1)).toBe('draw')
  })
  it('acepta strings numéricas', () => {
    expect(goalsToResultado('2', '1')).toBe('home')
  })
  it('devuelve null con valores vacíos', () => {
    expect(goalsToResultado('', '')).toBeNull()
    expect(goalsToResultado('', 1)).toBeNull()
    expect(goalsToResultado(1, '')).toBeNull()
  })
  it('devuelve null con valores no numéricos', () => {
    expect(goalsToResultado('abc', 1)).toBeNull()
  })
})

describe('getResultado', () => {
  it('usa el campo resultado si existe', () => {
    expect(getResultado({ resultado: 'home', local: 0, visitante: 5 })).toBe('home')
  })
  it('infiere del marcador si no hay campo resultado', () => {
    expect(getResultado({ local: 0, visitante: 5 })).toBe('away')
  })
  it('devuelve null sin input', () => {
    expect(getResultado(null)).toBeNull()
    expect(getResultado(undefined)).toBeNull()
  })
})

describe('getPickResultado', () => {
  it('infiere de un objeto pick', () => {
    expect(getPickResultado({ local: 2, visitante: 0 })).toBe('home')
  })
  it('devuelve un pick legacy en formato string', () => {
    expect(getPickResultado('draw')).toBe('draw')
  })
  it('devuelve null sin pick', () => {
    expect(getPickResultado(null)).toBeNull()
  })
})

describe('getEfectivo', () => {
  const partido = { espnId: '123' }
  it('prefiere live cuando está en curso', () => {
    const live = { 123: { state: 'in', local: '1', visitante: '0' } }
    const efectivo = getEfectivo(partido, 0, {}, live)
    expect(efectivo.local).toBe('1')
    expect(efectivo.resultado).toBe('home')
  })
  it('prefiere live cuando terminó', () => {
    const live = { 123: { state: 'post', local: '2', visitante: '2' } }
    expect(getEfectivo(partido, 0, {}, live).resultado).toBe('draw')
  })
  it('cae al resultado guardado si no hay live', () => {
    const resultados = { 0: { local: 1, visitante: 1, resultado: 'draw' } }
    expect(getEfectivo(partido, 0, resultados, {})).toEqual(resultados[0])
  })
  it('soporta índice como string', () => {
    const resultados = { '0': { local: 1, visitante: 0 } }
    expect(getEfectivo(partido, 0, resultados, {})).toEqual(resultados['0'])
  })
  it('devuelve null si no hay nada', () => {
    expect(getEfectivo(partido, 0, {}, {})).toBeNull()
  })
  it('respeta cancelado aunque haya live scores', () => {
    const resultados = { 0: { cancelado: true } }
    const live = { 123: { state: 'in', local: '2', visitante: '1' } }
    expect(getEfectivo(partido, 0, resultados, live)).toEqual({ cancelado: true })
  })
})

describe('calcularPuntos', () => {
  const partidos = [
    { espnId: 'a' },
    { espnId: 'b' },
    { espnId: 'c' },
  ]

  it('da 3 pts por marcador exacto', () => {
    const picks = { 0: { local: '2', visitante: '1' } }
    const resultados = { 0: { local: '2', visitante: '1', resultado: 'home' } }
    const r = calcularPuntos(picks, resultados, {}, partidos)
    expect(r).toEqual({ puntos: 3, aciertos: 1, exactos: 1 })
  })

  it('da 1 pt por resultado correcto sin marcador exacto', () => {
    const picks = { 0: { local: '2', visitante: '1' } }
    const resultados = { 0: { local: '3', visitante: '0', resultado: 'home' } }
    const r = calcularPuntos(picks, resultados, {}, partidos)
    expect(r).toEqual({ puntos: 1, aciertos: 1, exactos: 0 })
  })

  it('da 0 pts cuando el resultado es contrario', () => {
    const picks = { 0: { local: '2', visitante: '1' } }
    const resultados = { 0: { local: '0', visitante: '3', resultado: 'away' } }
    const r = calcularPuntos(picks, resultados, {}, partidos)
    expect(r).toEqual({ puntos: 0, aciertos: 0, exactos: 0 })
  })

  it('suma puntos de varios partidos', () => {
    const picks = {
      0: { local: '2', visitante: '1' }, // exacto → +3
      1: { local: '1', visitante: '1' }, // empate correcto, no exacto → +1
      2: { local: '0', visitante: '2' }, // contrario → 0
    }
    const resultados = {
      0: { local: '2', visitante: '1' },
      1: { local: '2', visitante: '2' },
      2: { local: '1', visitante: '0' },
    }
    const r = calcularPuntos(picks, resultados, {}, partidos)
    expect(r).toEqual({ puntos: 4, aciertos: 2, exactos: 1 })
  })

  it('ignora partidos sin resultado', () => {
    const picks = { 0: { local: '2', visitante: '1' } }
    const r = calcularPuntos(picks, {}, {}, partidos)
    expect(r).toEqual({ puntos: 0, aciertos: 0, exactos: 0 })
  })

  it('ignora partidos cancelados', () => {
    const picks = { 0: { local: '2', visitante: '1' } }
    const resultados = { 0: { cancelado: true } }
    const r = calcularPuntos(picks, resultados, {}, partidos)
    expect(r).toEqual({ puntos: 0, aciertos: 0, exactos: 0 })
  })

  it('cancelado prevalece sobre live scores en curso', () => {
    const picks = { 0: { local: '1', visitante: '0' } }
    const resultados = { 0: { cancelado: true } }
    const liveScores = { a: { state: 'in', local: '1', visitante: '0' } }
    const r = calcularPuntos(picks, resultados, liveScores, partidos)
    expect(r).toEqual({ puntos: 0, aciertos: 0, exactos: 0 })
  })

  it('usa live scores cuando hay', () => {
    const picks = { 0: { local: '1', visitante: '0' } }
    const liveScores = { a: { state: 'in', local: '1', visitante: '0' } }
    const r = calcularPuntos(picks, {}, liveScores, partidos)
    expect(r).toEqual({ puntos: 3, aciertos: 1, exactos: 1 })
  })
})
