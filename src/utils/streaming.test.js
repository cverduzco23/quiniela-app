import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dispositivoPuedeVerStream,
  miEnvioEnQuiniela,
  normalizarStreamUrl,
  obtenerStreamOpciones,
  streamDisponibleAhora,
} from './streaming'

describe('streaming', () => {
  beforeEach(() => {
    const data = new Map()
    vi.stubGlobal('localStorage', {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
    })
  })

  it('acepta únicamente URLs HTTPS y conserva sus parámetros', () => {
    expect(normalizarStreamUrl('https://video.example/embed/123')).toBe('https://video.example/embed/123')
    expect(normalizarStreamUrl('https://streamx-hd.com/live1.php?stream=fox_deportes_usa'))
      .toBe('https://streamx-hd.com/live1.php?stream=fox_deportes_usa')
    expect(normalizarStreamUrl('http://video.example/embed/123')).toBe('')
    expect(normalizarStreamUrl('javascript:alert(1)')).toBe('')
    expect(normalizarStreamUrl('no-es-url')).toBe('')
  })

  it('exige un envío real del dispositivo y una predicción coincidente', () => {
    localStorage.setItem('quiniela-q1-enviada', JSON.stringify({ nombre: '  Ana López ' }))
    expect(miEnvioEnQuiniela('q1')).toBe('Ana López')
    expect(dispositivoPuedeVerStream('q1', [{ nombre: 'Ana López' }])).toBe(true)
    expect(dispositivoPuedeVerStream('q1', [{ nombre: 'Otra persona' }])).toBe(false)
  })

  it('acepta el nombre seleccionado si coincide con un participante', () => {
    localStorage.setItem('quiniela-q1-alias', 'Ana López')
    expect(dispositivoPuedeVerStream('q1', [{ nombre: 'Ana López' }])).toBe(true)
    expect(dispositivoPuedeVerStream('q1', [{ nombre: 'Otra persona' }])).toBe(false)
  })

  it('devuelve únicamente las señales configuradas y válidas', () => {
    expect(obtenerStreamOpciones({
      streamUrl: 'https://uno.example/embed',
      streamUrl2: '',
      streamUrl3: 'https://tres.example/embed',
    })).toEqual([
      'https://uno.example/embed',
      'https://tres.example/embed',
    ])
  })

  it('solo habilita una transmisión cuando la quiniela cerró y el partido comenzó', () => {
    const base = {
      cierre: '2026-08-05T17:00:00.000Z',
      partidos: [{ hora: '2026-08-05T18:00:00.000Z' }],
      resultados: {},
    }
    expect(streamDisponibleAhora(base, 0, Date.parse('2026-08-05T17:30:00.000Z'))).toBe(false)
    expect(streamDisponibleAhora(base, 0, Date.parse('2026-08-05T18:01:00.000Z'))).toBe(true)
  })

  it('cierra partidos terminados o cancelados', () => {
    const base = {
      cierre: '2026-08-05T17:00:00.000Z',
      partidos: [{ hora: '2026-08-05T18:00:00.000Z' }, { hora: '2026-08-05T19:00:00.000Z' }],
      resultados: { 0: { local: 2, visitante: 1 } },
    }
    const ahora = Date.parse('2026-08-05T20:00:00.000Z')
    expect(streamDisponibleAhora(base, 0, ahora)).toBe(false)
    expect(streamDisponibleAhora({ ...base, resultados: { 0: { cancelado: true } } }, 0, ahora)).toBe(false)
  })
})
