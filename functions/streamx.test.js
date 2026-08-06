import { describe, expect, it } from 'vitest'
import { buscarEventoStreamX, fechaEventoStreamX, necesitaSyncStreams } from './index.js'

const servidor = {
  name: 'Claro Sports',
  url: 'https://streamx-hd.com/live1.php?stream=claro1',
  active: true,
}

function buscarPorNombre(nombreQuiniela, nombreStream) {
  return buscarEventoStreamX({
    local: nombreQuiniela,
    visitante: 'Equipo Rival FC',
    hora: '2026-08-05T17:30',
  }, [{
    title: `${nombreStream} vs Equipo Rival`,
    homeTeam: nombreStream,
    awayTeam: 'Equipo Rival',
    time: '2026-08-05 18:30',
    timezone: 'America/Lima',
    servers: [servidor],
  }])
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

  it('reconoce LAFC como Los Angeles FC en el partido real de StreamX', () => {
    const encontrado = buscarEventoStreamX({
      local: 'LAFC',
      visitante: 'Guadalajara',
      hora: '2026-08-05T20:30',
    }, [{
      title: 'Los Angeles FC vs Guadalajara',
      homeTeam: 'Los Angeles FC',
      awayTeam: 'Guadalajara',
      time: '2026-08-05 21:30',
      timezone: 'America/Lima',
      servers: [
        { ...servidor, name: 'Apple TV Español', url: 'https://streamx-hd.com/live1.php?stream=appletv11' },
        { ...servidor, name: 'Apple TV English', url: 'https://streamx-hd.com/live1.php?stream=appletv12' },
      ],
    }])
    expect(encontrado?.confianza).toBeGreaterThan(0.97)
    expect(encontrado?.servidores.map(item => item.key)).toEqual(['appletv11', 'appletv12'])
  })

  it.each([
    ['Chivas', 'Guadalajara'],
    ['Pumas', 'Pumas UNAM'],
    ['Tigres', 'Tigres UANL'],
    ['Rayados', 'Monterrey'],
    ['Xolos', 'Tijuana'],
    ['San Luis', 'Atlético de San Luis'],
  ])('reconoce el alias de Liga MX %s ↔ %s', (quiniela, stream) => {
    expect(buscarPorNombre(quiniela, stream)?.confianza).toBeGreaterThan(0.97)
  })

  it.each([
    ['NYCFC', 'New York City FC'],
    ['LA Galaxy', 'Los Angeles Galaxy'],
    ['Sporting KC', 'Sporting Kansas City'],
    ['RSL', 'Real Salt Lake'],
    ['NY Red Bulls', 'New York Red Bulls'],
    ['Montreal', 'CF Montréal'],
  ])('reconoce el alias de MLS %s ↔ %s', (quiniela, stream) => {
    expect(buscarPorNombre(quiniela, stream)?.confianza).toBeGreaterThan(0.97)
  })

  it.each([
    ['PSG', 'Paris Saint-Germain'],
    ['Man Utd', 'Manchester United'],
    ['Man City', 'Manchester City'],
    ['Bayern München', 'Bayern Munich'],
    ['Internazionale', 'Inter Milan'],
    ['BVB', 'Borussia Dortmund'],
    ['Spurs', 'Tottenham Hotspur'],
    ['Sporting CP', 'Sporting Lisboa'],
  ])('reconoce el alias internacional %s ↔ %s', (quiniela, stream) => {
    expect(buscarPorNombre(quiniela, stream)?.confianza).toBeGreaterThan(0.97)
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
