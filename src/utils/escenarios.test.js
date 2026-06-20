import { describe, it, expect } from 'vitest'
import { simularUltimoPartido } from './escenarios'

// Quiniela mínima: 2 partidos, el primero ya decidido (1-0 / home),
// el segundo (idx 1) pendiente. Se simula quién gana según ese marcador.
function quinielaBase() {
  return {
    partidos: [
      { local: 'A', visitante: 'B' },          // idx 0 — decidido
      { local: 'Türkiye', visitante: 'Paraguay' }, // idx 1 — pendiente
    ],
    resultados: { 0: { local: 1, visitante: 0 } }, // home
  }
}

describe('simularUltimoPartido', () => {
  it('devuelve null si no hay exactamente un partido pendiente', () => {
    const q = { partidos: [{ local: 'A', visitante: 'B' }], resultados: {} }
    // 1 partido total, sin resultado → 1 pendiente, pero sin predicciones
    expect(simularUltimoPartido(q, [])).toBeNull()
    // 0 pendientes
    const q2 = { partidos: [{ local: 'A', visitante: 'B' }], resultados: { 0: { local: 1, visitante: 0 } } }
    expect(simularUltimoPartido(q2, [{ nombre: 'X', picks: { 0: { local: 1, visitante: 0 } } }])).toBeNull()
  })

  it('agrupa marcadores que producen el mismo ganador', () => {
    // Ambos jugadores acertaron el partido 0 (home, 1 pt cada uno) salvo exacto.
    // Juan: exacto 1-0 en idx0 (3 pts base) ; pronostica 0-0 en el pendiente.
    // Jose: resultado en idx0 (1 pt base) ; pronostica 1-0 en el pendiente.
    const preds = [
      { nombre: 'Juan', picks: { 0: { local: 1, visitante: 0 }, 1: { local: 0, visitante: 0 } } },
      { nombre: 'Jose', picks: { 0: { local: 0, visitante: 1 }, 1: { local: 1, visitante: 0 } } },
    ]
    const sim = simularUltimoPartido(quinielaBase(), preds)
    expect(sim).not.toBeNull()
    expect(sim.idx).toBe(1)

    // Base: Juan 3 pts (exacto), Jose 0 pts (falló idx0).
    // Marcador 0-0 (draw): Juan +3 (exacto) = 6 ; Jose +0 = 0 → gana Juan.
    const g00 = sim.grupos.find(g => g.escenarios.some(e => e.tipo === 'exacto' && e.local === 0 && e.visitante === 0))
    expect(g00.lideres).toEqual(['Juan'])

    // Marcador 1-0 (home exacto de Jose): Juan +0 = 3 ; Jose +3 = 3 → empate en la cima.
    const g10 = sim.grupos.find(g => g.escenarios.some(e => e.tipo === 'exacto' && e.local === 1 && e.visitante === 0))
    expect(g10.lideres.sort()).toEqual(['Jose', 'Juan'])
  })

  it('incluye los tres escenarios genéricos (home/draw/away)', () => {
    const preds = [
      { nombre: 'Juan', picks: { 0: { local: 1, visitante: 0 }, 1: { local: 2, visitante: 1 } } },
    ]
    const sim = simularUltimoPartido(quinielaBase(), preds)
    const genericos = sim.grupos.flatMap(g => g.escenarios).filter(e => e.tipo === 'generico')
    expect(genericos.map(e => e.resultado).sort()).toEqual(['away', 'draw', 'home'])
  })
})
