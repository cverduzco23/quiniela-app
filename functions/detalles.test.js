import { describe, it, expect } from 'vitest'
import { elegirResumenYoutube, esResumenDelPartido, extraerDetalles, tituloMencionaEquipo } from './detalles.js'

const PARTIDO = { local: 'Club América', visitante: 'Guadalajara', hora: '2026-08-05T20:30:00Z' }
const item = (titulo, publishedAt = '2026-08-05T23:00:00Z') => ({
  id: { videoId: 'abc123' },
  snippet: { title: titulo, publishedAt, channelTitle: 'TUDN' },
})

describe('tituloMencionaEquipo', () => {
  it('reconoce el equipo aunque el título use el nombre corto', () => {
    expect(tituloMencionaEquipo('América 1-1 Chivas', 'Club América')).toBe(true)
  })

  it('ignora acentos y mayúsculas', () => {
    expect(tituloMencionaEquipo('AMERICA VS GUADALAJARA', 'Club América')).toBe(true)
  })

  it('acepta un alias cuando el nombre oficial no aparece', () => {
    expect(tituloMencionaEquipo('Chivas golea', 'Guadalajara')).toBe(false)
    expect(tituloMencionaEquipo('Chivas golea', 'Guadalajara', ['Chivas'])).toBe(true)
  })

  it('no se deja llevar por palabras genéricas', () => {
    expect(tituloMencionaEquipo('Real Club de Futbol', 'Club Deportivo Real')).toBe(false)
  })
})

describe('esResumenDelPartido', () => {
  it('acepta un resumen que nombra a los dos equipos y salió después', () => {
    expect(esResumenDelPartido(item('Resumen | América 1-1 Guadalajara'), PARTIDO)).toBe(true)
  })

  it('rechaza si falta uno de los equipos', () => {
    expect(esResumenDelPartido(item('Resumen | América 1-1 Toluca'), PARTIDO)).toBe(false)
  })

  it('rechaza lo publicado antes del partido', () => {
    expect(esResumenDelPartido(item('América vs Guadalajara', '2026-08-04T10:00:00Z'), PARTIDO)).toBe(false)
  })

  it('rechaza lo publicado mucho después (otra jornada)', () => {
    expect(esResumenDelPartido(item('América vs Guadalajara', '2026-08-20T10:00:00Z'), PARTIDO)).toBe(false)
  })

  it('rechaza previas, análisis y transmisiones', () => {
    for (const t of ['Previa: América vs Guadalajara', 'América vs Guadalajara EN VIVO',
      'Análisis del América vs Guadalajara', 'Rumbo a América vs Guadalajara']) {
      expect(esResumenDelPartido(item(t), PARTIDO)).toBe(false)
    }
  })

  it('rechaza cuando el partido no trae hora válida', () => {
    expect(esResumenDelPartido(item('Resumen América Guadalajara'), { ...PARTIDO, hora: '' })).toBe(false)
  })
})

describe('elegirResumenYoutube', () => {
  it('no devuelve nada si ningún candidato pasa los filtros', () => {
    expect(elegirResumenYoutube([item('Previa América vs Guadalajara')], PARTIDO)).toBeNull()
    expect(elegirResumenYoutube([], PARTIDO)).toBeNull()
    expect(elegirResumenYoutube(null, PARTIDO)).toBeNull()
  })

  it('prefiere el que se anuncia como resumen', () => {
    const elegido = elegirResumenYoutube([
      item('América y Guadalajara repartieron puntos'),
      item('Resumen: América 1-1 Guadalajara'),
    ], PARTIDO)
    expect(elegido.titulo).toBe('Resumen: América 1-1 Guadalajara')
  })
})

describe('extraerDetalles', () => {
  const evento = (over = {}) => ({
    competitions: [{
      competitors: [
        {
          homeAway: 'home',
          team: { id: '1', displayName: 'América', logo: 'h.png' },
          statistics: [{ name: 'possessionPct', displayValue: '55' }, { name: 'wonCorners', displayValue: '4' }],
        },
        { homeAway: 'away', team: { id: '2', displayName: 'Guadalajara', logo: 'a.png' }, statistics: [] },
      ],
      ...over,
    }],
  })

  it('devuelve null cuando no hay ni estadísticas ni eventos', () => {
    const vacio = {
      competitions: [{
        competitors: [
          { homeAway: 'home', team: { id: '1' }, statistics: [] },
          { homeAway: 'away', team: { id: '2' }, statistics: [] },
        ],
      }],
    }
    expect(extraerDetalles(vacio, PARTIDO)).toBeNull()
    expect(extraerDetalles({}, PARTIDO)).toBeNull()
  })

  it("rescata las estadísticas disponibles y marca con guion las que faltan", () => {
    const d = extraerDetalles(evento(), PARTIDO)
    expect(d.stats.home.posesion).toBe('55')
    expect(d.stats.home.corners).toBe('4')
    expect(d.stats.home.tirosArco).toBe('-')
    expect(d.stats.away.posesion).toBe('-')
  })

  it('clasifica los eventos y les asigna el lado correcto', () => {
    const d = extraerDetalles(evento({
      details: [
        { scoringPlay: true, team: { id: '1' }, clock: { displayValue: "12'" }, athletesInvolved: [{ shortName: 'H. Martín' }] },
        { yellowCard: true, team: { id: '2' }, clock: { displayValue: "40'" }, athletesInvolved: [{ shortName: 'E. Beltrán' }] },
        { type: { text: 'Substitution' }, team: { id: '1' }, clock: { displayValue: "60'" }, athletesInvolved: [] },
      ],
    }), PARTIDO)
    expect(d.eventos.map(e => [e.tipo, e.lado])).toEqual([
      ['goal', 'home'], ['yellow-card', 'away'], ['substitution', 'home'],
    ])
    expect(d.eventos[0].jugador).toBe('H. Martín')
  })

  it('conserva los eventos aunque no haya estadísticas', () => {
    const sinStats = {
      competitions: [{
        competitors: [
          { homeAway: 'home', team: { id: '1' }, statistics: [] },
          { homeAway: 'away', team: { id: '2' }, statistics: [] },
        ],
        details: [{ scoringPlay: true, team: { id: '1' }, clock: { displayValue: "5'" }, athletesInvolved: [] }],
      }],
    }
    const d = extraerDetalles(sinStats, PARTIDO)
    expect(d.stats).toBeNull()
    expect(d.eventos).toHaveLength(1)
  })
})
