import { describe, it, expect } from 'vitest'
import { calcularPuntos } from './scoring'
import { simularUltimoPartido } from './escenarios'
const score = s => { const [local, visitante] = s.split('-'); return { local, visitante } }
const picks = list => Object.fromEntries(list.split(' ').map((s, i) => [i, score(s)]))
// Incidente MXJ14: solo datos deportivos necesarios para reproducir el fallo.
const predicciones = [
  { nombre: 'César', picks: picks('0-1 0-2 2-2 1-1 2-0 2-0 0-3 3-2 1-2') },
  { nombre: 'Norma', picks: picks('1-0 1-1 1-2 1-2 1-1 1-0 1-2 3-2 1-1') },
  { nombre: 'Juan', picks: picks('2-1 2-0 2-1 1-2 3-3 2-1 0-3 3-2 2-1') },
  { nombre: 'Javier', picks: picks('2-1 2-2 1-2 2-2 2-1 2-0 3-2 3-1 1-1') },
]
const partidos = Array.from({ length: 9 }, (_, i) => ({ espnId: String(i) }))
const resultados = picks('1-1 0-1 1-1 0-1 1-1 4-3 1-3 1-2 4-1')
const stale = { 3: { state: 'post', local: '1', visitante: '1' } }
describe('regresión MXJ14', () => {
  it('mantiene la clasificación correcta con o sin la consulta de ESPN', () => {
    for (const live of [{}, stale]) {
      expect(predicciones.map(p => calcularPuntos(p.picks, resultados, live, partidos).puntos)).toEqual([4, 6, 5, 1])
    }
  })
  it('reproduce las seis filas del oráculo y el ganador del 4–1', () => {
    const pendientes = { ...resultados }; delete pendientes[8]
    for (const live of [{}, stale]) {
      const sim = simularUltimoPartido({ partidos, resultados: pendientes }, predicciones, live)
      expect(sim.filas.map(f => f.lideres)).toEqual([['Norma'], ['Juan'], ['César'], ['Norma'], ['Norma'], ['Norma']])
    }
  })
})
