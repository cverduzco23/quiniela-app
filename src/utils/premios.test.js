import { describe, it, expect } from 'vitest'
import {
  TIPO_PREMIO, MODELO_PREMIO,
  tienePremio, calcularBote, calcularGanadores, formatearMXN,
} from './premios'

describe('tienePremio', () => {
  it('false sin quiniela', () => {
    expect(tienePremio(null)).toBe(false)
    expect(tienePremio(undefined)).toBe(false)
  })
  it('false con tipo sinPremio', () => {
    expect(tienePremio({ tipoPremio: TIPO_PREMIO.SIN_PREMIO })).toBe(false)
  })
  it('false sin tipoPremio definido (compatibilidad con quinielas viejas)', () => {
    expect(tienePremio({ nombre: 'Vieja' })).toBe(false)
  })
  it('true con premio fijo', () => {
    expect(tienePremio({ tipoPremio: TIPO_PREMIO.FIJO, premioFijo: 100 })).toBe(true)
  })
  it('true con bote por cuota', () => {
    expect(tienePremio({ tipoPremio: TIPO_PREMIO.BOTE, cuota: 50 })).toBe(true)
  })
})

describe('calcularBote', () => {
  it('0 sin quiniela', () => {
    expect(calcularBote(null, 5)).toBe(0)
  })
  it('0 si sin premio', () => {
    expect(calcularBote({ tipoPremio: TIPO_PREMIO.SIN_PREMIO }, 5)).toBe(0)
  })
  it('premio fijo independiente del conteo', () => {
    expect(calcularBote({ tipoPremio: TIPO_PREMIO.FIJO, premioFijo: 100 }, 0)).toBe(100)
    expect(calcularBote({ tipoPremio: TIPO_PREMIO.FIJO, premioFijo: 100 }, 10)).toBe(100)
  })
  it('bote = cuota × participantes', () => {
    expect(calcularBote({ tipoPremio: TIPO_PREMIO.BOTE, cuota: 50 }, 3)).toBe(150)
    expect(calcularBote({ tipoPremio: TIPO_PREMIO.BOTE, cuota: 50 }, 0)).toBe(0)
  })
})

describe('calcularGanadores - ganador único', () => {
  const quiniela = { tipoPremio: TIPO_PREMIO.FIJO, premioFijo: 100, modeloPremio: MODELO_PREMIO.GANADOR_UNICO }

  it('un solo ganador se lleva todo', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 5 },
      { nombre: 'Beto', puntos: 3 },
    ]
    const { ganadores, premioPorNombre, bote } = calcularGanadores(jugadores, quiniela, 2)
    expect(bote).toBe(100)
    expect(ganadores).toHaveLength(1)
    expect(ganadores[0]).toMatchObject({ nombre: 'Ana', premio: 100, posicion: 1 })
    expect(premioPorNombre).toEqual({ Ana: 100 })
  })

  it('empates en 1° reparten el bote', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 5 },
      { nombre: 'Beto', puntos: 5 },
      { nombre: 'Carlos', puntos: 3 },
    ]
    const { ganadores, premioPorNombre } = calcularGanadores(jugadores, quiniela, 3)
    expect(ganadores).toHaveLength(2)
    expect(premioPorNombre).toEqual({ Ana: 50, Beto: 50 })
  })

  it('nadie acertó: sin ganadores', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 0 },
      { nombre: 'Beto', puntos: 0 },
    ]
    const { ganadores, premioPorNombre } = calcularGanadores(jugadores, quiniela, 2)
    expect(ganadores).toHaveLength(0)
    expect(premioPorNombre).toEqual({})
  })

  it('bote devuelto: sin ganadores aunque haya puntos', () => {
    const jugadores = [{ nombre: 'Ana', puntos: 5 }]
    const q = { ...quiniela, boteDevuelto: true }
    const { ganadores, premioPorNombre } = calcularGanadores(jugadores, q, 1)
    expect(ganadores).toHaveLength(0)
    expect(premioPorNombre).toEqual({})
  })
})

describe('calcularGanadores - podio 70/20/10', () => {
  const quiniela = { tipoPremio: TIPO_PREMIO.FIJO, premioFijo: 1000, modeloPremio: MODELO_PREMIO.PODIO }

  it('reparte 70/20/10 a 1°/2°/3°', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 10 },
      { nombre: 'Beto', puntos: 7 },
      { nombre: 'Carlos', puntos: 5 },
      { nombre: 'Diana', puntos: 2 },
    ]
    const { premioPorNombre } = calcularGanadores(jugadores, quiniela, 4)
    expect(premioPorNombre).toEqual({ Ana: 700, Beto: 200, Carlos: 100 })
  })

  it('empates en cada nivel comparten ese porcentaje', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 10 },
      { nombre: 'Beto', puntos: 7 },
      { nombre: 'Carlos', puntos: 7 },
      { nombre: 'Diana', puntos: 5 },
    ]
    const { premioPorNombre } = calcularGanadores(jugadores, quiniela, 4)
    expect(premioPorNombre.Ana).toBe(700)
    expect(premioPorNombre.Beto).toBe(100)
    expect(premioPorNombre.Carlos).toBe(100)
    expect(premioPorNombre.Diana).toBe(100)
  })
})

describe('calcularGanadores - bote por cuota', () => {
  const quiniela = { tipoPremio: TIPO_PREMIO.BOTE, cuota: 50, modeloPremio: MODELO_PREMIO.GANADOR_UNICO }

  it('bote crece con participantes', () => {
    const jugadores = [
      { nombre: 'Ana', puntos: 5 },
      { nombre: 'Beto', puntos: 3 },
    ]
    const { ganadores, bote } = calcularGanadores(jugadores, quiniela, 2)
    expect(bote).toBe(100)
    expect(ganadores[0].premio).toBe(100)
  })

  it('sin participantes, bote 0, sin ganadores', () => {
    const { ganadores, bote } = calcularGanadores([], quiniela, 0)
    expect(bote).toBe(0)
    expect(ganadores).toHaveLength(0)
  })
})

describe('formatearMXN', () => {
  it('formato con símbolo de pesos', () => {
    expect(formatearMXN(100)).toMatch(/100/)
    expect(formatearMXN(100)).toMatch(/\$/)
  })
  it('valores inválidos no rompen', () => {
    expect(formatearMXN(null)).toBe('$0')
    expect(formatearMXN(NaN)).toBe('$0')
  })
})
