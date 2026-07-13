export function esLinkInternoSeguro(value) {
  const link = String(value ?? '').trim()
  return !link || (link.startsWith('/') && !link.startsWith('//') && link.length <= 200)
}

export function adminsActivos(admins = []) {
  return admins.filter(admin => admin?.id && admin.activo === true && admin.eliminada !== true)
}

export function notificacionVigente(item, ahora = Date.now()) {
  const vence = item?.vence?.toDate?.()
  return !vence || vence.getTime() > ahora
}
