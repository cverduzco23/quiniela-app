import { describe, expect, it } from 'vitest'
import { adminsActivos, esLinkInternoSeguro, notificacionVigente } from './notificaciones'

describe('notificaciones', () => {
  it('acepta solo enlaces internos relativos a la app', () => {
    expect(esLinkInternoSeguro('')).toBe(true)
    expect(esLinkInternoSeguro('/admin')).toBe(true)
    expect(esLinkInternoSeguro('/ranking/abc?from=admin')).toBe(true)
    expect(esLinkInternoSeguro('//sitio-falso.com')).toBe(false)
    expect(esLinkInternoSeguro('https://sitio-falso.com')).toBe(false)
  })

  it('incluye solo admins activos que no eliminaron su cuenta', () => {
    const admins = [
      { id: 'a', activo: true },
      { id: 'b', activo: false },
      { id: 'c', activo: true, eliminada: true },
      { activo: true },
    ]
    expect(adminsActivos(admins).map(admin => admin.id)).toEqual(['a'])
  })

  it('oculta avisos vencidos y conserva los vigentes o permanentes', () => {
    const fecha = ms => ({ toDate: () => new Date(ms) })
    expect(notificacionVigente({}, 1_000)).toBe(true)
    expect(notificacionVigente({ vence: fecha(1_001) }, 1_000)).toBe(true)
    expect(notificacionVigente({ vence: fecha(999) }, 1_000)).toBe(false)
  })
})
