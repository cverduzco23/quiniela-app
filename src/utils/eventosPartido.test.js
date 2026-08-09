import { describe, expect, it } from 'vitest'
import { combinarEventosPartido, resumirEventosRanking } from './eventosPartido'

describe('combinarEventosPartido', () => {
  it('incorpora las sustituciones de la ficha aunque el scoreboard ya tenga eventos', () => {
    const gol = { tipo: 'goal', minuto: "20'", lado: 'home', jugador: 'L. Messi' }
    const cambio = {
      tipo: 'substitution', minuto: "63'", lado: 'away', jugador: 'Pedro Pérez',
      entra: 'Pedro Pérez', sale: 'Juan López',
    }

    expect(combinarEventosPartido([gol], [gol, cambio])).toEqual([gol, cambio])
  })

  it('elimina duplicados aunque una fuente use el nombre completo', () => {
    const corto = { tipo: 'goal', minuto: "20'", lado: 'home', jugador: 'L. Messi' }
    const completo = { tipo: 'goal', minuto: "20'", lado: 'home', jugador: 'Lionel Messi' }

    expect(combinarEventosPartido([corto], [completo])).toEqual([completo])
  })

  it('ordena cronológicamente eventos procedentes de fuentes diferentes', () => {
    const cambio = { tipo: 'substitution', minuto: "70'", lado: 'away', jugador: 'Pérez' }
    const tarjeta = { tipo: 'yellow-card', minuto: "45'+2'", lado: 'home', jugador: 'López' }
    const gol = { tipo: 'goal', minuto: "12'", lado: 'home', jugador: 'García' }

    expect(combinarEventosPartido([gol, cambio], [tarjeta])).toEqual([gol, tarjeta, cambio])
  })
})

describe('resumirEventosRanking', () => {
  it('conserva goles y tarjetas, pero deja los cambios para el detalle', () => {
    const gol = { tipo: 'goal', jugador: 'García' }
    const amarilla = { tipo: 'yellow-card', jugador: 'López' }
    const roja = { tipo: 'red-card', jugador: 'Pérez' }
    const cambio = { tipo: 'substitution', entra: 'Ruiz', sale: 'Díaz' }

    expect(resumirEventosRanking([gol, cambio, amarilla, roja])).toEqual([gol, amarilla, roja])
  })
})
