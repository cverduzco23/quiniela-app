import { describe, it, expect } from 'vitest'
import {
  buscarResumenYoutube,
  elegirResumenYoutube,
  esResumenDelPartido,
  extraerDetalles,
  extraerDetallesResumen,
  tituloMencionaEquipo,
} from './detalles.js'

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
      'Análisis del América vs Guadalajara', 'Rumbo a América vs Guadalajara',
      'Postgame Presser: América vs Guadalajara']) {
      expect(esResumenDelPartido(item(t), PARTIDO)).toBe(false)
    }
  })

  it('acepta highlights publicados por una fuente oficial en inglés', () => {
    expect(esResumenDelPartido(
      item('Club América vs. Guadalajara | Full Match Highlights'),
      PARTIDO,
    )).toBe(true)
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

describe('buscarResumenYoutube', () => {
  it('hace una sola búsqueda y descarta canales fuera de la lista oficial', async () => {
    const llamadas = []
    const fetchMock = async rawUrl => {
      const url = new URL(rawUrl)
      llamadas.push(url)
      if (url.pathname.endsWith('/channels')) {
        return { ok: true, json: async () => ({ items: [{ id: `id-${url.searchParams.get('forHandle')}` }] }) }
      }
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              ...item('Resumen | América 1-1 Guadalajara'),
              id: { videoId: 'no-oficial' },
              snippet: {
                ...item('Resumen | América 1-1 Guadalajara').snippet,
                channelId: 'canal-ajeno',
              },
            },
            {
              ...item('Club América vs. Guadalajara | Full Match Highlights'),
              id: { videoId: 'oficial' },
              snippet: {
                ...item('Club América vs. Guadalajara | Full Match Highlights').snippet,
                channelId: 'UCcH10bZQXIfq3B1XzqPzNbQ',
                channelTitle: 'Leagues Cup',
              },
            },
          ],
        }),
      }
    }

    const resumen = await buscarResumenYoutube(PARTIDO, 'api-key', fetchMock)
    const busquedas = llamadas.filter(url => url.pathname.endsWith('/search'))
    expect(busquedas).toHaveLength(1)
    expect(busquedas[0].searchParams.has('channelId')).toBe(false)
    expect(busquedas[0].searchParams.get('q')).toBe('Club América Guadalajara')
    expect(resumen.videoId).toBe('oficial')
    expect(resumen.canal).toBe('Leagues Cup')
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
        {
          type: { text: 'Substitution' }, team: { id: '1' }, clock: { displayValue: "60'" },
          athletesInvolved: [{ shortName: 'B. Rodríguez' }, { shortName: 'H. Martín' }],
        },
      ],
    }), PARTIDO)
    expect(d.eventos.map(e => [e.tipo, e.lado])).toEqual([
      ['goal', 'home'], ['yellow-card', 'away'], ['substitution', 'home'],
    ])
    expect(d.eventos[0].jugador).toBe('H. Martín')
    expect(d.eventos[2]).toMatchObject({
      jugador: 'B. Rodríguez', entra: 'B. Rodríguez', sale: 'H. Martín',
    })
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

describe('extraerDetallesResumen', () => {
  const titulares = prefijo => Array.from({ length: 11 }, (_, i) => ({
    starter: true,
    jersey: String(i + 1),
    athlete: { displayName: `${prefijo} ${i + 1}`, shortName: `${prefijo[0]}. ${i + 1}` },
    position: { abbreviation: i === 0 ? 'A' : 'DEF' },
  }))
  const summary = {
    header: {
      competitions: [{
        competitors: [
          { homeAway: 'home', team: { id: '1' } },
          { homeAway: 'away', team: { id: '2' } },
        ],
      }],
    },
    boxscore: {
      teams: [
        {
          team: { id: '1', displayName: 'América', logo: 'h.png' },
          statistics: [
            { name: 'possessionPct', displayValue: '44.2' },
            { name: 'shotsOnTarget', displayValue: '5' },
            { name: 'saves', displayValue: '3' },
            { name: 'accuratePasses', displayValue: '360' },
            { name: 'totalPasses', displayValue: '400' },
          ],
        },
        {
          team: { id: '2', displayName: 'Guadalajara', logo: 'a.png' },
          statistics: [{ name: 'possessionPct', displayValue: '55.8' }],
        },
      ],
    },
    keyEvents: [
      { type: { type: 'kickoff' }, clock: { displayValue: '' } },
      {
        type: { type: 'yellow-card' },
        clock: { displayValue: "13'" },
        team: { id: '2' },
        participants: [{ athlete: { displayName: 'F. González' } }],
      },
      {
        type: { type: 'goal' },
        scoringPlay: true,
        clock: { displayValue: "38'" },
        team: { id: '1' },
        participants: [{ athlete: { displayName: 'D. Bouanga' } }],
      },
      {
        type: { type: 'substitution' },
        clock: { displayValue: "71'" },
        team: { id: '2' },
        participants: [
          { athlete: { displayName: 'B. Gutiérrez' } },
          { athlete: { displayName: 'R. Alvarado' } },
        ],
      },
    ],
    shootout: [
      { id: '2', shots: [{ player: 'Visitante 1', shotNumber: 1, didScore: false }] },
      { id: '1', shots: [{ player: 'Local 1', shotNumber: 1, didScore: true }] },
    ],
    gameInfo: {
      venue: { fullName: 'Estadio Azteca', address: { city: 'Ciudad de México' } },
      officials: [{ displayName: 'Árbitro Ejemplo', position: { name: 'Referee', id: '1' } }],
    },
    rosters: [
      {
        homeAway: 'home',
        team: { displayName: 'América' },
        formation: '4-2-3-1',
        roster: titulares('Local'),
      },
      {
        homeAway: 'away',
        team: { displayName: 'Guadalajara' },
        formation: '4-3-3',
        roster: titulares('Visita'),
      },
    ],
  }

  it('extrae boxscore ampliado, contexto, alineaciones y conserva la tanda', () => {
    const detalles = extraerDetallesResumen(summary, PARTIDO)
    expect(detalles.stats.home.posesion).toBe('44.2')
    expect(detalles.stats.away.posesion).toBe('55.8')
    expect(detalles.stats.home.atajadas).toBe('3')
    expect(detalles.stats.home.pasesAcertados).toBe('360')
    expect(detalles.contexto).toEqual({
      estadio: 'Estadio Azteca',
      ciudad: 'Ciudad de México',
      arbitro: 'Árbitro Ejemplo',
    })
    expect(detalles.alineaciones.home.formacion).toBe('4-2-3-1')
    expect(detalles.alineaciones.home.titulares).toHaveLength(11)
    expect(detalles.eventos.map(e => [e.tipo, e.lado, e.jugador])).toEqual([
      ['yellow-card', 'away', 'F. González'],
      ['goal', 'home', 'D. Bouanga'],
      ['substitution', 'away', 'B. Gutiérrez'],
    ])
    expect(detalles.eventos[2]).toMatchObject({
      entra: 'B. Gutiérrez', sale: 'R. Alvarado',
    })
    expect(detalles.penales).toEqual([
      { lado: 'home', jugador: 'Local 1', anotado: true, orden: 1 },
      { lado: 'away', jugador: 'Visitante 1', anotado: false, orden: 1 },
    ])
  })

  it('devuelve null cuando la ficha no trae información útil', () => {
    expect(extraerDetallesResumen({}, PARTIDO)).toBeNull()
  })

  it('omite alineaciones incompletas sin dejar una sección vacía', () => {
    const detalles = extraerDetallesResumen({
      ...summary,
      rosters: [{ ...summary.rosters[0], roster: titulares('Local').slice(0, 10) }],
    }, PARTIDO)
    expect(detalles.alineaciones).toBeUndefined()
    expect(detalles.contexto.estadio).toBe('Estadio Azteca')
  })
})
