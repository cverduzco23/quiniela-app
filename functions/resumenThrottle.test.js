import { describe, it, expect } from 'vitest'
import {
  completarColaResumen,
  indicesDetallesPendientes,
  necesitaDetalles,
  necesitaResumen,
  tocaBuscarDetalles,
  tocaBuscarResumen,
} from './index.js'

// Cada búsqueda cuesta 100 unidades de la cuota diaria de YouTube (10,000 por
// defecto) y la función programada corre cada 30 minutos. Sin estas guardas, un
// solo partido sin resumen agotaría la cuota del día en unas horas.

const HORA = '2026-08-05T20:00:00Z'
const enMinutos = min => new Date(new Date(HORA).getTime() + min * 60000)

describe('tocaBuscarResumen', () => {
  it('no busca antes de 45 min tras el partido: el video aún no está subido', () => {
    expect(tocaBuscarResumen({}, HORA, enMinutos(10))).toBe(false)
    expect(tocaBuscarResumen({}, HORA, enMinutos(44))).toBe(false)
    expect(tocaBuscarResumen({}, HORA, enMinutos(46))).toBe(true)
  })

  it('deja de buscar pasadas 72 horas', () => {
    expect(tocaBuscarResumen({}, HORA, enMinutos(71 * 60))).toBe(true)
    expect(tocaBuscarResumen({}, HORA, enMinutos(73 * 60))).toBe(false)
  })

  it('respeta el tope de intentos', () => {
    expect(tocaBuscarResumen({ intentos: 1 }, HORA, enMinutos(120))).toBe(true)
    expect(tocaBuscarResumen({ intentos: 2 }, HORA, enMinutos(120))).toBe(true)
    expect(tocaBuscarResumen({ intentos: 4 }, HORA, enMinutos(120))).toBe(false)
    expect(tocaBuscarResumen({ intentos: 9 }, HORA, enMinutos(120))).toBe(false)
  })

  it('espera 3 horas entre intentos', () => {
    const ultimo = enMinutos(60).toISOString()
    expect(tocaBuscarResumen({ intentos: 1, ultimo }, HORA, enMinutos(120))).toBe(false)
    expect(tocaBuscarResumen({ intentos: 1, ultimo }, HORA, enMinutos(60 + 179))).toBe(false)
    expect(tocaBuscarResumen({ intentos: 1, ultimo }, HORA, enMinutos(60 + 181))).toBe(true)
  })

  it('no busca con una hora de partido inválida', () => {
    expect(tocaBuscarResumen({}, '', enMinutos(120))).toBe(false)
    expect(tocaBuscarResumen({}, 'mañana', enMinutos(120))).toBe(false)
  })

  it('no vuelve a buscar estados ya encontrados o agotados', () => {
    expect(tocaBuscarResumen({ encontrado: true }, HORA, enMinutos(120))).toBe(false)
    expect(tocaBuscarResumen({ agotado: true }, HORA, enMinutos(120))).toBe(false)
  })
})

describe('necesitaResumen', () => {
  const quiniela = pendiente => ({
    partidos: [{ hora: HORA }, { hora: HORA }],
    resumenPendiente: pendiente,
  })

  it('ignora quinielas sin cola de resúmenes', () => {
    expect(necesitaResumen({ partidos: [] }, enMinutos(120))).toBe(false)
    expect(necesitaResumen(quiniela({}), enMinutos(120))).toBe(false)
    expect(necesitaResumen(null, enMinutos(120))).toBe(false)
  })

  it('entra cuando al menos un partido de la cola toca', () => {
    expect(necesitaResumen(quiniela({ 0: { intentos: 2 }, 1: { intentos: 0 } }), enMinutos(120))).toBe(true)
  })

  it('no entra si todos los pendientes ya agotaron sus intentos', () => {
    expect(necesitaResumen(quiniela({ 0: { intentos: 4 }, 1: { intentos: 4 } }), enMinutos(120))).toBe(false)
  })

  it('no entra si el índice pendiente ya no existe en los partidos', () => {
    expect(necesitaResumen(quiniela({ 7: { intentos: 0 } }), enMinutos(120))).toBe(false)
  })
})

describe('completarColaResumen', () => {
  it('incorpora un partido reciente con marcador que nunca pasó por la cola', () => {
    const q = {
      partidos: [{ espnId: '401', ligaId: 'liga', hora: HORA }],
      resultados: { 0: { local: '1', visitante: '2' } },
    }
    expect(completarColaResumen(q, enMinutos(120)).resumenPendiente).toEqual({
      0: { intentos: 0, ultimo: null },
    })
  })

  it('respeta estados terminales y no incorpora partidos viejos', () => {
    const encontrado = {
      partidos: [{ espnId: '401', ligaId: 'liga', hora: HORA }],
      resultados: { 0: { local: '1', visitante: '2' } },
      resumenPendiente: { 0: { encontrado: true, videoId: 'abc' } },
    }
    expect(completarColaResumen(encontrado, enMinutos(120))).toBe(encontrado)

    const viejo = {
      partidos: [{ espnId: '401', ligaId: 'liga', hora: HORA }],
      resultados: { 0: { local: '1', visitante: '2' } },
    }
    expect(completarColaResumen(viejo, enMinutos(73 * 60))).toBe(viejo)
  })
})

describe('respaldo de detalles ESPN', () => {
  const q = (over = {}) => ({
    partidos: [{ espnId: '401', ligaId: 'liga', hora: HORA }],
    resultados: { 0: { local: '1', visitante: '1' } },
    ...over,
  })

  it('detecta partidos finalizados que no tienen archivo completo', () => {
    expect(necesitaDetalles(q(), enMinutos(120))).toBe(true)
    expect(indicesDetallesPendientes(q(), enMinutos(120))).toEqual([0])
  })

  it('omite cancelados, archivados y estados terminales', () => {
    expect(necesitaDetalles(q({ resultados: { 0: { cancelado: true } } }), enMinutos(120))).toBe(false)
    expect(necesitaDetalles(q({ detallesGuardados: [0] }), enMinutos(120))).toBe(false)
    expect(necesitaDetalles(q({ detallesPendientes: { 0: { encontrado: true } } }), enMinutos(120))).toBe(false)
    expect(necesitaDetalles(q({ detallesPendientes: { 0: { agotado: true } } }), enMinutos(120))).toBe(false)
  })

  it('espera 30 minutos entre intentos y limita la ventana', () => {
    const ultimo = enMinutos(60).toISOString()
    expect(tocaBuscarDetalles({ intentos: 1, ultimo }, HORA, enMinutos(89))).toBe(false)
    expect(tocaBuscarDetalles({ intentos: 1, ultimo }, HORA, enMinutos(91))).toBe(true)
    expect(tocaBuscarDetalles({ intentos: 8 }, HORA, enMinutos(120))).toBe(false)
    expect(tocaBuscarDetalles({}, HORA, enMinutos(15 * 24 * 60))).toBe(false)
  })
})
