import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { horaLocalDeEspn, nuevoCierreTrasCambioHorario, partidosParaRevisarHorario } from './index.js'

const ahora = new Date('2026-09-29T18:00:00-06:00')
const cierre = iso => Timestamp.fromDate(new Date(iso))

describe('horaLocalDeEspn', () => {
  it('convierte la fecha UTC de ESPN a hora de México', () => {
    expect(horaLocalDeEspn('2026-09-30T01:00Z')).toBe('2026-09-29T19:00')
  })

  it('ignora fechas inválidas', () => {
    expect(horaLocalDeEspn('')).toBeNull()
    expect(horaLocalDeEspn('no es fecha')).toBeNull()
  })
})

describe('partidosParaRevisarHorario', () => {
  const base = { ligaId: 'fifa.friendly' }

  it('revisa los partidos ESPN próximos sin marcador', () => {
    const q = {
      partidos: [
        { ...base, espnId: '1', hora: '2026-09-29T20:30' },
        { ...base, espnId: '2', hora: '2026-09-20T20:00' }, // ya jugado hace días
        { local: 'Manual', visitante: 'X', hora: '2026-09-30T20:00' }, // sin ESPN
        { ...base, espnId: '3', hora: '2026-10-06T20:30' },
      ],
      resultados: { 3: { local: '1', visitante: '0' } },
    }
    expect(partidosParaRevisarHorario(q, ahora)).toEqual([0])
  })

  it('no revisa quinielas finalizadas', () => {
    const q = { finalizada: true, partidos: [{ ...base, espnId: '1', hora: '2026-09-29T20:30' }] }
    expect(partidosParaRevisarHorario(q, ahora)).toEqual([])
  })
})

describe('nuevoCierreTrasCambioHorario', () => {
  const viejos = [{ hora: '2026-09-29T20:30' }, { hora: '2026-10-03T20:00' }]
  const adelantados = [{ hora: '2026-09-29T19:00' }, { hora: '2026-10-03T20:00' }]
  const atrasados = [{ hora: '2026-09-29T21:30' }, { hora: '2026-10-03T20:00' }]

  it('adelanta el cierre si quedó después del nuevo arranque', () => {
    const q = { partidos: viejos, cierre: cierre('2026-09-29T20:25:00-06:00') }
    expect(nuevoCierreTrasCambioHorario(q, adelantados, ahora)?.toISOString())
      .toBe(new Date('2026-09-29T18:55:00-06:00').toISOString())
  })

  it('sigue al primer partido si el cierre era "5 min antes" y se atrasó', () => {
    const q = { partidos: viejos, cierre: cierre('2026-09-29T20:25:00-06:00') }
    expect(nuevoCierreTrasCambioHorario(q, atrasados, ahora)?.toISOString())
      .toBe(new Date('2026-09-29T21:25:00-06:00').toISOString())
  })

  it('respeta un cierre elegido a mano que sigue siendo válido', () => {
    const q = { partidos: viejos, cierre: cierre('2026-09-29T12:00:00-06:00') }
    expect(nuevoCierreTrasCambioHorario(q, atrasados, ahora)).toBeNull()
  })

  it('no reabre una quiniela cuyo cierre ya pasó', () => {
    const q = { partidos: viejos, cierre: cierre('2026-09-29T20:25:00-06:00') }
    const tarde = new Date('2026-09-29T20:40:00-06:00')
    expect(nuevoCierreTrasCambioHorario(q, atrasados, tarde)).toBeNull()
  })

  it('no toca quinielas cerradas a mano', () => {
    const q = { cerrada: true, partidos: viejos, cierre: cierre('2026-09-29T20:25:00-06:00') }
    expect(nuevoCierreTrasCambioHorario(q, adelantados, ahora)).toBeNull()
  })
})
