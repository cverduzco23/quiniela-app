import { describe, expect, it } from 'vitest'
import { buscarEventoStreamX, fechaEventoStreamX, necesitaSyncStreams } from './index.js'

const servidor = {
  name: 'Claro Sports',
  url: 'https://streamx-hd.com/live1.php?stream=claro1',
  active: true,
}

describe('autoasignación StreamX', () => {
  it('convierte correctamente la hora de Lima a UTC', () => {
    expect(fechaEventoStreamX({
      time: '2026-08-05 18:30',
      timezone: 'America/Lima',
    })?.toISOString()).toBe('2026-08-05T23:30:00.000Z')
  })

  it('relaciona equipos con sufijos FC/CF y la misma hora real', () => {
    const partido = {
      local: 'Inter Miami CF',
      visitante: 'Atlético de San Luis',
      hora: '2026-08-05T17:30',
    }
    const encontrado = buscarEventoStreamX(partido, [{
      title: 'Inter Miami vs Atlético San Luis',
      homeTeam: 'Inter Miami',
      awayTeam: 'Atlético San Luis',
      time: '2026-08-05 18:30',
      timezone: 'America/Lima',
      servers: [servidor],
    }])
    expect(encontrado?.servidores).toEqual([{
      nombre: 'Claro Sports',
      url: 'https://streamx-hd.com/live1.php?stream=claro1',
      key: 'claro1',
    }])
    expect(encontrado?.confianza).toBeGreaterThan(0.95)
  })

  it('no decide automáticamente cuando dos eventos son igual de probables', () => {
    const partido = {
      local: 'Monterrey',
      visitante: 'Orlando City SC',
      hora: '2026-08-05T17:30',
    }
    const base = {
      homeTeam: 'Monterrey',
      awayTeam: 'Orlando City',
      time: '2026-08-05 18:30',
      timezone: 'America/Lima',
      servers: [servidor],
    }
    expect(buscarEventoStreamX(partido, [
      { ...base, title: 'Evento A' },
      { ...base, title: 'Evento B' },
    ])).toBeNull()
  })

  it('solo consulta partidos próximos que todavía no tienen señal', () => {
    const ahora = new Date('2026-08-05T20:00:00.000Z')
    const base = {
      partidos: [{ hora: '2026-08-05T17:30' }],
      resultados: {},
    }
    expect(necesitaSyncStreams(base, ahora)).toBe(true)
    expect(necesitaSyncStreams({
      ...base,
      partidos: [{ ...base.partidos[0], streamUrl: servidor.url }],
    }, ahora)).toBe(false)
    expect(necesitaSyncStreams({
      ...base,
      partidos: [{
        ...base.partidos[0],
        streamUrl: servidor.url,
        streamAuto: { proveedor: 'streamx' },
      }],
    }, ahora)).toBe(true)
  })
})
