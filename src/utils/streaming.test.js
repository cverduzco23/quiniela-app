import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analizarStreamXUrl,
  construirStreamXUrl,
  dispositivoPuedeVerStream,
  esIOS,
  miEnvioEnQuiniela,
  normalizarStreamUrl,
  obtenerStreamFuentes,
  obtenerStreamOpciones,
  resolverStreamFuente,
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

  it('reconoce una señal StreamX y puede alternar live1/live2 conservando la clave', () => {
    expect(analizarStreamXUrl('https://streamx-hd.com/live1.php?stream=appletv9')).toEqual({
      clave: 'appletv9',
      modo: 'live1',
      origen: 'https://streamx-hd.com',
    })
    expect(construirStreamXUrl('appletv9', 'live2'))
      .toBe('https://streamx-hd.com/live2.php?stream=appletv9')

    const fuente = obtenerStreamFuentes({
      streamUrl: 'https://streamx-hd.com/live1.php?stream=appletv9',
      streamNombre: 'Apple TV',
    })[0]
    expect(fuente.nombre).toBe('Apple TV')
    expect(resolverStreamFuente(fuente, 'live2'))
      .toBe('https://streamx-hd.com/live2.php?stream=appletv9')
  })

  it('acepta claves StreamX autoconfiguradas aun sin duplicar el enlace', () => {
    expect(obtenerStreamOpciones({
      streamKey: 'claro1',
      streamNombre: 'Claro Sports',
      streamKey2: 'fox_deportes_usa',
    }, 'live2')).toEqual([
      'https://streamx-hd.com/live2.php?stream=claro1',
      'https://streamx-hd.com/live2.php?stream=fox_deportes_usa',
    ])
  })

  it('detecta iPhone y iPadOS sin afectar otros dispositivos', () => {
    expect(esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(esIOS('Mozilla/5.0 (Linux; Android 15)')).toBe(false)
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
