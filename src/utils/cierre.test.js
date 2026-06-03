import { describe, it, expect } from 'vitest'
import { tiempoRestante } from './cierre'

const ahora = new Date('2026-06-12T10:00:00').getTime()
const isoEn = (msDelta) => new Date(ahora + msDelta).toISOString()

describe('tiempoRestante', () => {
  it('devuelve null si no hay cierre', () => {
    expect(tiempoRestante(null, ahora)).toBeNull()
    expect(tiempoRestante(undefined, ahora)).toBeNull()
  })

  it('devuelve null si el cierre ya pasó', () => {
    expect(tiempoRestante(isoEn(-1000), ahora)).toBeNull()
    expect(tiempoRestante(isoEn(-60 * 60 * 1000), ahora)).toBeNull()
  })

  it('devuelve null si quedan más de 24h', () => {
    expect(tiempoRestante(isoEn(25 * 60 * 60 * 1000), ahora)).toBeNull()
    expect(tiempoRestante(isoEn(7 * 24 * 60 * 60 * 1000), ahora)).toBeNull()
  })

  it('nivel "urgente" cuando quedan entre 1h y 24h', () => {
    const r1 = tiempoRestante(isoEn(23 * 60 * 60 * 1000), ahora)
    expect(r1?.nivel).toBe('urgente')
    expect(r1?.texto).toContain('menos de 23h')

    const r2 = tiempoRestante(isoEn(2 * 60 * 60 * 1000), ahora)
    expect(r2?.nivel).toBe('urgente')
    expect(r2?.texto).toContain('menos de 2h')
  })

  it('nivel "critico" cuando queda menos de 1 hora', () => {
    const r1 = tiempoRestante(isoEn(30 * 60 * 1000), ahora) // 30 min
    expect(r1?.nivel).toBe('critico')
    expect(r1?.texto).toContain('30 min')

    const r2 = tiempoRestante(isoEn(5 * 60 * 1000), ahora) // 5 min
    expect(r2?.nivel).toBe('critico')
    expect(r2?.texto).toContain('5 min')
  })

  it('redondea minutos hacia arriba y muestra mínimo "1 min"', () => {
    // 15 segundos faltan → debería decir "1 min"
    const r = tiempoRestante(isoEn(15 * 1000), ahora)
    expect(r?.nivel).toBe('critico')
    expect(r?.texto).toContain('1 min')
  })

  it('cambia de "urgente" a "critico" al cruzar 1h', () => {
    const r1 = tiempoRestante(isoEn(60 * 60 * 1000 + 1), ahora) // justo > 1h
    expect(r1?.nivel).toBe('urgente')

    const r2 = tiempoRestante(isoEn(60 * 60 * 1000 - 1), ahora) // justo < 1h
    expect(r2?.nivel).toBe('critico')
  })
})
