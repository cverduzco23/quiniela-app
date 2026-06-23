import { describe, it, expect } from 'vitest'
import { normalizarNombre, tieneNombreYApellido } from './nombres'

describe('normalizarNombre', () => {
  it('capitaliza cada palabra', () => {
    expect(normalizarNombre('juan perez')).toBe('Juan Perez')
  })

  it('mantiene tildes existentes', () => {
    expect(normalizarNombre('maría josé')).toBe('María José')
    expect(normalizarNombre('MALÚ SÁNCHEZ')).toBe('Malú Sánchez')
  })

  it('normaliza mayúsculas excesivas', () => {
    expect(normalizarNombre('JESUS MC')).toBe('Jesus Mc')
  })

  it('normaliza minúsculas', () => {
    expect(normalizarNombre('javier aranda')).toBe('Javier Aranda')
  })

  it('reduce espacios múltiples', () => {
    expect(normalizarNombre('  juan   carlos   ')).toBe('Juan Carlos')
  })

  it('capitaliza después de guión', () => {
    expect(normalizarNombre('garcia-lopez')).toBe('Garcia-Lopez')
    expect(normalizarNombre('GARCÍA-LÓPEZ')).toBe('García-López')
  })

  it('maneja entrada vacía', () => {
    expect(normalizarNombre('')).toBe('')
    expect(normalizarNombre(null)).toBe('')
    expect(normalizarNombre(undefined)).toBe('')
  })

  it('palabra de una letra', () => {
    expect(normalizarNombre('Omar V')).toBe('Omar V')
    expect(normalizarNombre('omar v')).toBe('Omar V')
  })

  it('quita signos de puntuación al final', () => {
    expect(normalizarNombre('Javier Aranda.')).toBe('Javier Aranda')
    expect(normalizarNombre('Roque Verduzco. ')).toBe('Roque Verduzco')
    expect(normalizarNombre('Ana López!!')).toBe('Ana López')
    expect(normalizarNombre('Juan Pérez,')).toBe('Juan Pérez')
  })

  it('preserva puntuación interna (no al final)', () => {
    expect(normalizarNombre('Carlos G. López')).toBe('Carlos G. López')
    expect(normalizarNombre('garcia-lopez.')).toBe('Garcia-Lopez')
  })

  it('limita a 4 palabras como máximo', () => {
    expect(normalizarNombre('juan carlos perez lopez garcia')).toBe('Juan Carlos Perez Lopez')
    expect(normalizarNombre('ana maria del carmen rodriguez')).toBe('Ana Maria Del Carmen')
  })

  it('respeta nombres de hasta 4 palabras sin recortar', () => {
    expect(normalizarNombre('María José García Hernández')).toBe('María José García Hernández')
  })

  it('limita a 40 caracteres como salvaguarda', () => {
    expect(normalizarNombre('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
})

describe('tieneNombreYApellido', () => {
  it('acepta nombre + apellido típicos', () => {
    expect(tieneNombreYApellido('Juan Pérez')).toBe(true)
    expect(tieneNombreYApellido('María González')).toBe(true)
    expect(tieneNombreYApellido('María José García')).toBe(true)
    expect(tieneNombreYApellido('Carlos González López')).toBe(true)
  })

  it('rechaza solo nombre', () => {
    expect(tieneNombreYApellido('Juan')).toBe(false)
    expect(tieneNombreYApellido('María')).toBe(false)
    expect(tieneNombreYApellido('Ana')).toBe(false)
  })

  it('rechaza apellido abreviado (token de 1 char)', () => {
    expect(tieneNombreYApellido('Juan P')).toBe(false)
    expect(tieneNombreYApellido('Ana K')).toBe(false)
    expect(tieneNombreYApellido('M G')).toBe(false)
  })

  it('acepta abreviatura con punto como 2 chars', () => {
    expect(tieneNombreYApellido('Carlos G. López')).toBe(true)
  })

  it('maneja espacios extras', () => {
    expect(tieneNombreYApellido('  Juan   Pérez  ')).toBe(true)
  })

  it('rechaza entrada vacía o nula', () => {
    expect(tieneNombreYApellido('')).toBe(false)
    expect(tieneNombreYApellido(null)).toBe(false)
    expect(tieneNombreYApellido(undefined)).toBe(false)
    expect(tieneNombreYApellido('   ')).toBe(false)
  })
})
