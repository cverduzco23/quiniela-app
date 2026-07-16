import { describe, expect, it } from 'vitest'
import { calcularBoteDeJornada, calcularPremiosDeJornada } from './premiosTemporada.js'

describe('calcularPremiosDeJornada', () => {
  it('expone el bote total para los récords de temporada', () => {
    expect(calcularBoteDeJornada({ premioFijo: 100, cuota: 50 }, 3)).toBe(250)
  })

  it('acumula un premio fijo para el líder', () => {
    const jugadores = [{ puntos: 8 }, { puntos: 5 }]
    expect(calcularPremiosDeJornada(jugadores, { premioFijo: 500, cuota: 0 }))
      .toEqual([500, 0])
  })

  it('divide el premio entre líderes empatados', () => {
    const jugadores = [{ puntos: 8 }, { puntos: 8 }, { puntos: 5 }]
    expect(calcularPremiosDeJornada(jugadores, { premioFijo: 500, cuota: 0 }))
      .toEqual([250, 250, 0])
  })

  it('calcula el bote con la cantidad de participantes visibles', () => {
    const jugadores = [{ puntos: 8 }, { puntos: 5 }, { puntos: 2 }]
    expect(calcularPremiosDeJornada(jugadores, { premioFijo: 100, cuota: 50 }))
      .toEqual([250, 0, 0])
  })

  it('respeta la distribución de podio', () => {
    const jugadores = [{ puntos: 8 }, { puntos: 5 }, { puntos: 2 }]
    expect(calcularPremiosDeJornada(jugadores, { premioFijo: 1000, cuota: 0, modeloPremio: 'podio' }))
      .toEqual([700, 200, 100])
  })

  it('no entrega premios cuando se devuelve el bote', () => {
    const jugadores = [{ puntos: 8 }]
    expect(calcularPremiosDeJornada(jugadores, { premioFijo: 500, boteDevuelto: true }))
      .toEqual([0])
  })
})
