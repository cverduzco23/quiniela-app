import { beforeEach, describe, expect, it, vi } from 'vitest'
import { datosTarjetaQuiniela } from './quinielaCard'

function crearLocalStorageMock() {
  const store = new Map()
  return {
    getItem: vi.fn(key => store.has(key) ? store.get(key) : null),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn(key => store.delete(key)),
    clear: vi.fn(() => store.clear()),
  }
}

const partidos = [
  { espnId: 'p0', hora: '2026-07-01T18:00:00.000Z' },
  { espnId: 'p1', hora: '2026-07-01T20:00:00.000Z' },
  { espnId: 'p2', hora: '2026-07-02T18:00:00.000Z' },
  { espnId: 'p3', hora: '2026-07-02T20:00:00.000Z' },
]

const resultadosFinales = {
  0: { local: '1', visitante: '0' },
  1: { local: '2', visitante: '1' },
  2: { local: '0', visitante: '0' },
  3: { local: '0', visitante: '2' },
}

function q(overrides = {}) {
  return {
    id: 'q1',
    nombre: 'Mundial 2026 - Cuartos de Final',
    cerrada: true,
    finalizada: true,
    partidos,
    resultados: resultadosFinales,
    ...overrides,
  }
}

function setMiNombre(nombre) {
  localStorage.setItem('quiniela-q1-enviada', JSON.stringify({ nombre }))
}

describe('datosTarjetaQuiniela', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', crearLocalStorageMock())
  })

  it('en finalizada calcula la distancia contra el 1er lugar, no contra el grupo anterior', () => {
    setMiNombre('César Verduzco')
    const predicciones = [
      {
        nombre: 'Norma Verduzco',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '2', visitante: '1' },
          2: { local: '1', visitante: '0' },
          3: { local: '0', visitante: '0' },
        },
      },
      {
        nombre: 'Malú Sánchez',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '3', visitante: '0' },
          2: { local: '1', visitante: '0' },
          3: { local: '1', visitante: '2' },
        },
      },
      {
        nombre: 'Javier Aranda',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '3', visitante: '0' },
          2: { local: '1', visitante: '0' },
          3: { local: '1', visitante: '2' },
        },
      },
      {
        nombre: 'Lidia Verduzco',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '3', visitante: '0' },
          2: { local: '1', visitante: '0' },
          3: { local: '1', visitante: '2' },
        },
      },
      {
        nombre: 'Arely Aranda',
        picks: {
          0: { local: '0', visitante: '1' },
          1: { local: '1', visitante: '0' },
          2: { local: '0', visitante: '0' },
          3: { local: '1', visitante: '2' },
        },
      },
      {
        nombre: 'César Verduzco',
        picks: {
          0: { local: '2', visitante: '0' },
          1: { local: '0', visitante: '1' },
          2: { local: '1', visitante: '0' },
          3: { local: '1', visitante: '2' },
        },
      },
    ]

    const d = datosTarjetaQuiniela(q(), predicciones, predicciones.length)

    expect(d.estado).toBe('finalizada')
    expect(d.posicion).toBe(6)
    expect(d.misPuntos).toBe(2)
    expect(d.subnota).toBe('A 4 pts del 1º')
  })

  it('en juego usa la posición real del grupo de puntos anterior', () => {
    setMiNombre('César Verduzco')
    const predicciones = [
      {
        nombre: 'Norma Verduzco',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '2', visitante: '1' },
        },
      },
      {
        nombre: 'Malú Sánchez',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '0', visitante: '1' },
        },
      },
      {
        nombre: 'Javier Aranda',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '0', visitante: '1' },
        },
      },
      {
        nombre: 'César Verduzco',
        picks: {
          0: { local: '2', visitante: '0' },
          1: { local: '0', visitante: '1' },
        },
      },
    ]

    const d = datosTarjetaQuiniela(
      q({
        finalizada: false,
        resultados: {
          0: resultadosFinales[0],
          1: resultadosFinales[1],
        },
      }),
      predicciones,
      predicciones.length,
    )

    expect(d.estado).toBe('jugandose')
    expect(d.posicion).toBe(4)
    expect(d.misPuntos).toBe(1)
    expect(d.subnota).toBe('A 2 pts del 2º')
  })

  it('en juego mantiene la posición neutral mientras ningún partido ha comenzado', () => {
    setMiNombre('César Verduzco')
    const predicciones = [
      { nombre: 'Norma Verduzco', picks: {} },
      { nombre: 'César Verduzco', picks: {} },
    ]

    const d = datosTarjetaQuiniela(
      q({
        finalizada: false,
        resultados: {},
        enVivoActualizado: new Date().toISOString(),
        enVivoEspnIds: [],
      }),
      predicciones,
      predicciones.length,
    )

    expect(d.estado).toBe('jugandose')
    expect(d.rankingIniciado).toBe(false)
    expect(d.posicion).toBe(1)
    expect(d.misPuntos).toBe(0)
  })

  it('para ganadores empatados compara contra la siguiente posición real', () => {
    setMiNombre('Ana López')
    const predicciones = [
      {
        nombre: 'Ana López',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '2', visitante: '1' },
        },
      },
      {
        nombre: 'Beto Ruiz',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '2', visitante: '1' },
        },
      },
      {
        nombre: 'Carlos Díaz',
        picks: {
          0: { local: '1', visitante: '0' },
          1: { local: '0', visitante: '1' },
        },
      },
    ]

    const d = datosTarjetaQuiniela(
      q({
        partidos: partidos.slice(0, 2),
        resultados: {
          0: resultadosFinales[0],
          1: resultadosFinales[1],
        },
      }),
      predicciones,
      predicciones.length,
    )

    expect(d.estado).toBe('finalizada')
    expect(d.posicion).toBe(1)
    expect(d.misPuntos).toBe(6)
    expect(d.subnota).toBe('+3 pts sobre el 3º')
  })
})
