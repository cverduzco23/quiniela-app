import { describe, it, expect } from 'vitest'
import { normalizarNombre } from './nombres'

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
})
