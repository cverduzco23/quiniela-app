import { describe, it, expect } from 'vitest'
import { esIndexable, urlCanonica } from './seo'

describe('esIndexable', () => {
  it('indexa las páginas de producto', () => {
    expect(esIndexable('/', '')).toBe(true)
    expect(esIndexable('/donar', '')).toBe(true)
    expect(esIndexable('/privacidad', '')).toBe(true)
    expect(esIndexable('/terminos', '')).toBe(true)
  })

  it('NO indexa quinielas, rankings ni temporadas (llevan nombres de participantes)', () => {
    expect(esIndexable('/quiniela/abc123', '')).toBe(false)
    expect(esIndexable('/ranking/abc123', '')).toBe(false)
    expect(esIndexable('/temporada/abc123', '')).toBe(false)
  })

  it('NO indexa el panel de organizadores', () => {
    expect(esIndexable('/admin', '')).toBe(false)
  })

  it('cubre las formas viejas de los links ya compartidos', () => {
    // /ranking?q=<id> (link viejo, sin :id en la ruta)
    expect(esIndexable('/ranking', '?q=abc123')).toBe(false)
    // La portada con ?q=<id> en realidad muestra una quiniela
    expect(esIndexable('/', '?q=abc123')).toBe(false)
  })

  it('la portada con parámetros de campaña sí se indexa', () => {
    expect(esIndexable('/', '?utm_source=whatsapp')).toBe(true)
    // 'q' solo cuenta como parámetro propio, no dentro de otro nombre
    expect(esIndexable('/', '?faq=1')).toBe(true)
  })

  it('no se deja engañar por mayúsculas', () => {
    expect(esIndexable('/Ranking/abc', '')).toBe(false)
    expect(esIndexable('/ADMIN', '')).toBe(false)
  })
})

describe('urlCanonica', () => {
  it('arma la URL absoluta del sitio', () => {
    expect(urlCanonica('/')).toBe('https://quinielapp.fun/')
    expect(urlCanonica('/donar')).toBe('https://quinielapp.fun/donar')
  })

  it('quita la diagonal final para no duplicar la misma página', () => {
    expect(urlCanonica('/donar/')).toBe('https://quinielapp.fun/donar')
  })
})
