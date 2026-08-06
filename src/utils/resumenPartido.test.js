import { describe, it, expect } from 'vitest'
import { normalizarResumen, formatearDuracion } from './resumenPartido'

const clip = (over = {}) => ({
  headline: 'Un clip',
  duration: 60,
  thumbnail: 'https://cdn/x.jpg',
  links: { source: { href: 'https://cdn/a_360p30_1464k.mp4' }, web: { href: 'https://espn/x' } },
  ...over,
})

describe('normalizarResumen', () => {
  it('devuelve null cuando el partido no trae videos', () => {
    expect(normalizarResumen({})).toBeNull()
    expect(normalizarResumen({ videos: [] })).toBeNull()
  })

  it('ignora clips sin un mp4 utilizable', () => {
    expect(normalizarResumen({ videos: [clip({ links: { source: { HLS: 'https://cdn/a.m3u8' } } })] })).toBeNull()
    expect(normalizarResumen({ videos: [clip({ links: { source: { href: 'http://cdn/a.mp4' } } })] })).toBeNull()
  })

  it('prefiere la copia con menor bitrate sobre el master de emisión', () => {
    const r = normalizarResumen({
      videos: [clip({
        links: {
          source: {
            href: 'https://cdn/a_360p30_1464k.mp4',
            HD: 'https://cdn/a_720p30_2896k.mp4',
            mezzanine: 'https://cdn/a.mp4',
          },
        },
      })],
    })
    expect(r.mp4).toBe('https://cdn/a_360p30_1464k.mp4')
  })

  it('conserva el HLS cuando ESPN lo publica, y lo omite si no es https', () => {
    const con = normalizarResumen({
      videos: [clip({ links: { source: { href: 'https://cdn/a_360p30_1464k.mp4', HLS: 'https://cdn/a.m3u8' } } })],
    })
    expect(con.hls).toBe('https://cdn/a.m3u8')
    const sin = normalizarResumen({
      videos: [clip({ links: { source: { href: 'https://cdn/a_360p30_1464k.mp4', HLS: 'http://cdn/a.m3u8' } } })],
    })
    expect(sin.hls).toBe('')
  })

  it('cae al master cuando ninguna copia declara bitrate', () => {
    const r = normalizarResumen({
      videos: [clip({ links: { source: { href: 'https://cdn/master.mp4' } } })],
    })
    expect(r.mp4).toBe('https://cdn/master.mp4')
  })

  it('elige el clip marcado como resumen aunque sea más corto', () => {
    const r = normalizarResumen({
      videos: [
        clip({ headline: 'Análisis de estudio', duration: 500 }),
        clip({ headline: 'Resumen del partido', duration: 90 }),
      ],
    })
    expect(r.titulo).toBe('Resumen del partido')
  })

  it('sin marcas de resumen se queda con el clip más largo', () => {
    const r = normalizarResumen({
      videos: [
        clip({ headline: 'Jugada suelta', duration: 40 }),
        clip({ headline: 'El partido completo', duration: 500 }),
      ],
    })
    expect(r.titulo).toBe('El partido completo')
  })

  it('reconoce el highlight por el nombre del archivo', () => {
    const r = normalizarResumen({
      videos: [
        clip({ headline: 'Opinión', duration: 300 }),
        clip({
          headline: 'PSG vs Arsenal',
          duration: 120,
          links: { source: { href: 'https://cdn/Final_HL_360p30_1464k.mp4' } },
        }),
      ],
    })
    expect(r.titulo).toBe('PSG vs Arsenal')
  })
})

describe('formatearDuracion', () => {
  it('da minutos y segundos con dos dígitos', () => {
    expect(formatearDuracion(93)).toBe('1:33')
    expect(formatearDuracion(509)).toBe('8:29')
    expect(formatearDuracion(60)).toBe('1:00')
  })

  it('devuelve vacío cuando no hay duración', () => {
    expect(formatearDuracion(0)).toBe('')
    expect(formatearDuracion(null)).toBe('')
    expect(formatearDuracion('x')).toBe('')
  })
})
