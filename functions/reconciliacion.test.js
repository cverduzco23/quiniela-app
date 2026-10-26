import { describe, it, expect } from 'vitest'
import { normalizarMarcador, marcadorFinalSummary, decidirReconciliacion, indicesParaReconciliar, cambiosResultados } from './reconciliacion.js'
const anterior = { local: '1', visitante: '1', resultado: 'draw', fuente: 'espn' }
const oficial = { local: '0', visitante: '1', resultado: 'away' }
const ahora = Date.parse('2026-10-26T20:00:00Z')
const pendiente = { espnId: '401876925', anterior, propuesto: oficial, primeraVez: '2026-10-26T19:30:00Z' }
describe('reconciliación de finales', () => {
  it('MXJ14: requiere dos observaciones separadas para corregir 1–1 a 0–1', () => {
    expect(decidirReconciliacion(anterior, oficial, null, ahora)).toBe('confirmar')
    expect(decidirReconciliacion(anterior, oficial, pendiente, ahora)).toBe('corregir')
    expect(decidirReconciliacion(anterior, oficial, { ...pendiente, primeraVez: new Date(ahora).toISOString() }, ahora)).toBe('confirmar')
  })
  it('reinicia la confirmación si cambia ESPN o el resultado guardado', () => {
    expect(decidirReconciliacion(anterior, { local: '0', visitante: '2' }, pendiente, ahora)).toBe('confirmar')
    expect(decidirReconciliacion({ ...anterior, local: '2' }, oficial, pendiente, ahora)).toBe('confirmar')
  })
  it('no sobreescribe ajustes manuales ni resultados de origen desconocido', () => {
    expect(decidirReconciliacion({ ...anterior, fuente: 'manual' }, oficial, pendiente, ahora)).toBe('ignorar')
    expect(decidirReconciliacion({ ...anterior, fuente: undefined }, oficial, pendiente, ahora)).toBe('revisar')
  })
  it('ignora respuestas incompletas, suspensiones y otro ID', () => {
    const d = { header: { id: '1', competitions: [{ status: { type: { state: 'post', completed: true, name: 'STATUS_FULL_TIME' } }, competitors: [{ homeAway: 'home', score: '0' }, { homeAway: 'away', score: '1' }] }] } }
    expect(marcadorFinalSummary(d, '1')).toEqual(oficial)
    expect(marcadorFinalSummary(d, '2')).toBeNull()
    d.header.competitions[0].status.type.completed = false
    expect(marcadorFinalSummary(d, '1')).toBeNull()
    for (const v of [null, '', 'abc', -1, 1.5]) expect(normalizarMarcador({ local: v, visitante: 1 })).toBeNull()
  })
  it('revisa quinielas finalizadas, pero no resultados manuales ni partidos antiguos', () => {
    const p = { espnId: '1', ligaId: 'mex.1', hora: '2026-10-25T01:00:00Z' }
    const q = { finalizada: true, partidos: [p, p, { ...p, hora: '2026-10-01' }], resultados: { 0: anterior, 1: { ...anterior, fuente: 'manual' }, 2: anterior } }
    expect(indicesParaReconciliar(q, ahora)).toEqual([0])
  })
  it('audita altas, correcciones y borrados, pero no cambios solo de metadatos', () => {
    expect(cambiosResultados({ 0: anterior }, { 0: { ...anterior, verificadoEn: 'hoy' } })).toEqual([])
    expect(cambiosResultados({ 0: anterior }, { 0: oficial })).toEqual([{ indice: '0', anterior, nuevo: oficial }])
    expect(cambiosResultados({}, { 0: oficial })[0].anterior).toBeNull()
    expect(cambiosResultados({ 0: oficial }, {})[0].nuevo).toBeNull()
  })
})
