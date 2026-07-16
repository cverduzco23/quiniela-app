import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nombrePreferidoEnDispositivo } from './misQuinielas'

function crearLocalStorage() {
  const datos = new Map()
  return {
    get length() { return datos.size },
    key: i => [...datos.keys()][i] ?? null,
    getItem: key => datos.get(key) ?? null,
    setItem: (key, value) => datos.set(key, String(value)),
    removeItem: key => datos.delete(key),
    clear: () => datos.clear(),
  }
}

function guardarEnvio(id, nombre, fecha) {
  localStorage.setItem(`quiniela-${id}-enviada`, JSON.stringify({ nombre, fecha }))
}

describe('nombrePreferidoEnDispositivo', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', crearLocalStorage())
  })

  it('prioriza el nombre usado en la misma temporada', () => {
    guardarEnvio('jornada-1', 'Juan José Verduzco', '2026-06-01T12:00:00Z')
    guardarEnvio('otra-1', 'César Verduzco', '2026-07-01T12:00:00Z')

    expect(nombrePreferidoEnDispositivo(['jornada-1', 'jornada-2']))
      .toBe('Juan José Verduzco')
  })

  it('usa el nombre más frecuente entre los envíos del dispositivo', () => {
    guardarEnvio('q1', 'Lidia Verduzco', '2026-05-01T12:00:00Z')
    guardarEnvio('q2', 'lidia verduzco', '2026-05-02T12:00:00Z')
    guardarEnvio('q3', 'Arely Aranda', '2026-07-01T12:00:00Z')

    expect(nombrePreferidoEnDispositivo()).toBe('Lidia Verduzco')
  })

  it('desempata por el envío más reciente', () => {
    guardarEnvio('q1', 'Lidia Verduzco', '2026-05-01T12:00:00Z')
    guardarEnvio('q2', 'Arely Aranda', '2026-07-01T12:00:00Z')

    expect(nombrePreferidoEnDispositivo()).toBe('Arely Aranda')
  })

  it('no confunde un alias visual con una identidad enviada', () => {
    localStorage.setItem('quiniela-q1-alias', 'Persona Distinta')
    expect(nombrePreferidoEnDispositivo()).toBeNull()
  })
})
