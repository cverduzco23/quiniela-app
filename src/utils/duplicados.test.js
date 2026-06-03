import { describe, it, expect } from 'vitest'
import { nombreSimilar, detectarSimilares } from './duplicados'

describe('nombreSimilar — debe MARCAR', () => {
  it('diferencias solo de acentos', () => {
    expect(nombreSimilar('Juan Pérez', 'Juan Perez')).toBe(true)
  })

  it('diferencias solo de mayúsculas/espacios/puntuación', () => {
    expect(nombreSimilar('Juan Perez', 'JUAN  PEREZ')).toBe(true)
    expect(nombreSimilar('Juan Pérez', 'Juan. Perez')).toBe(true)
  })

  it('mismo nombre + mismo primer apellido, uno con apellido extra', () => {
    expect(nombreSimilar('Carlos González', 'Carlos González García')).toBe(true)
    expect(nombreSimilar('María Hernández López', 'María Hernández')).toBe(true)
  })

  it('apellido abreviado (ambos con 2 tokens)', () => {
    expect(nombreSimilar('Juan P', 'Juan Pérez')).toBe(true)
    expect(nombreSimilar('Juan Pe', 'Juan Pérez')).toBe(true)
    expect(nombreSimilar('María G', 'María García')).toBe(true)
  })

  it('typo: distancia 1 en strings largos', () => {
    expect(nombreSimilar('Carls Lopez', 'Carlos Lopez')).toBe(true)
    expect(nombreSimilar('Ricaardo Mtz', 'Ricardo Mtz')).toBe(true)
  })
})

describe('nombreSimilar — NO debe marcar', () => {
  it('cadena exactamente igual no se considera similar', () => {
    expect(nombreSimilar('Juan Pérez', 'Juan Pérez')).toBe(false)
  })

  it('mismo primer nombre, apellidos diferentes (distintos legítimos)', () => {
    expect(nombreSimilar('Carlos González', 'Carlos Pérez')).toBe(false)
    expect(nombreSimilar('María Hernández', 'María López')).toBe(false)
    expect(nombreSimilar('Juan Pérez', 'Juan García')).toBe(false)
  })

  it('nombre solo vs nombre completo (ambiguo, evitamos falso positivo)', () => {
    expect(nombreSimilar('Juan', 'Juan Pérez')).toBe(false)
    expect(nombreSimilar('María', 'María García')).toBe(false)
  })

  it('apellido abreviado pero >2 tokens en uno (ambiguo)', () => {
    // No marcamos porque "María F García" podría ser una persona distinta
    // de "María Fernanda López"
    expect(nombreSimilar('María F García', 'María Fernanda López')).toBe(false)
  })

  it('nombres distintos con typo grande (>1)', () => {
    expect(nombreSimilar('María Fernández', 'María Fernanda')).toBe(false)
  })

  it('nombres cortos similares no se marcan (riesgo de ruido)', () => {
    expect(nombreSimilar('Ana', 'Ano')).toBe(false)
  })

  it('hermanos: apellidos iguales, nombre distinto', () => {
    // Pedro y Juan Pérez García son legítimamente distintos
    expect(nombreSimilar('Pedro Pérez García', 'Juan Pérez García')).toBe(false)
  })

  it('nombre vacío o nulo', () => {
    expect(nombreSimilar('', 'Juan Pérez')).toBe(false)
    expect(nombreSimilar(null, 'Juan Pérez')).toBe(false)
    expect(nombreSimilar(undefined, undefined)).toBe(false)
  })
})

describe('detectarSimilares', () => {
  it('agrupa cada nombre con sus similares', () => {
    const map = detectarSimilares([
      'Juan Pérez',
      'Juan Perez',          // similar a #1 (acentos)
      'Carlos González',
      'Carlos González García', // similar a #3 (apellido extra)
      'María López',
      'Pedro Hernández',
    ])
    expect(map.get('Juan Pérez')).toEqual(['Juan Perez'])
    expect(map.get('Juan Perez')).toEqual(['Juan Pérez'])
    expect(map.get('Carlos González')).toEqual(['Carlos González García'])
    expect(map.get('Carlos González García')).toEqual(['Carlos González'])
    expect(map.get('María López')).toEqual([])
    expect(map.get('Pedro Hernández')).toEqual([])
  })

  it('en una lista grande con varios "Carlos" legítimos NO genera ruido', () => {
    const map = detectarSimilares([
      'Carlos González',
      'Carlos Pérez',
      'Carlos Hernández',
      'Carlos Ramírez',
      'Carlos Martínez',
    ])
    // Ninguno debería marcar similares
    for (const [, similares] of map) {
      expect(similares).toEqual([])
    }
  })
})
