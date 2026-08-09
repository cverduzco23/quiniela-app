function textoClave(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function apellidoClave(nombre) {
  const partes = textoClave(nombre).split(/\s+/).filter(Boolean)
  return partes.at(-1) ?? ''
}

function identidadEvento(evento, incluirTipo = true) {
  const jugador = evento?.tipo === 'substitution'
    ? `${apellidoClave(evento.entra || evento.jugador)}>${apellidoClave(evento.sale)}`
    : apellidoClave(evento?.jugador)
  return [
    incluirTipo ? evento?.tipo || 'default' : '',
    textoClave(evento?.minuto),
    evento?.lado || '',
    jugador,
  ].join('|')
}

function mismaSustitucion(a, b) {
  if (a?.tipo !== 'substitution' || b?.tipo !== 'substitution') return false

  const entraA = apellidoClave(a.entra || a.jugador)
  const entraB = apellidoClave(b.entra || b.jugador)
  if (!entraA || entraA !== entraB) return false
  if (textoClave(a.minuto) !== textoClave(b.minuto) || (a.lado || '') !== (b.lado || '')) return false

  const saleA = apellidoClave(a.sale)
  const saleB = apellidoClave(b.sale)
  return !saleA || !saleB || saleA === saleB
}

function sonElMismoEvento(a, b) {
  if (identidadEvento(a) === identidadEvento(b)) return true
  if (mismaSustitucion(a, b)) return true
  const algunoSinClasificar = !a?.tipo || a.tipo === 'default' || !b?.tipo || b.tipo === 'default'
  return algunoSinClasificar && identidadEvento(a, false) === identidadEvento(b, false)
}

function riquezaEvento(evento) {
  return ['tipo', 'minuto', 'lado', 'jugador', 'entra', 'sale']
    .reduce((total, campo) => total + String(evento?.[campo] ?? '').length, 0)
}

function ordenMinuto(minuto) {
  const texto = String(minuto ?? '')
  const partes = texto.match(/(\d+)(?:[^+\d]*\+\s*(\d+))?/)
  if (!partes) return Number.POSITIVE_INFINITY
  return Number(partes[1]) * 100 + Number(partes[2] ?? 0)
}

// El scoreboard, la ficha completa y el archivo histórico de ESPN no siempre
// contienen las mismas jugadas. Unimos los tres para que una fuente parcial no
// oculte sustituciones u otros eventos disponibles en las demás.
export function combinarEventosPartido(...fuentes) {
  const combinados = []

  fuentes.flat().filter(Boolean).forEach(evento => {
    const existente = combinados.findIndex(actual => sonElMismoEvento(actual.evento, evento))
    if (existente < 0) {
      combinados.push({ evento, orden: combinados.length })
      return
    }
    if (riquezaEvento(evento) > riquezaEvento(combinados[existente].evento)) {
      combinados[existente].evento = evento
    }
  })

  return combinados
    .sort((a, b) => ordenMinuto(a.evento?.minuto) - ordenMinuto(b.evento?.minuto) || a.orden - b.orden)
    .map(({ evento }) => evento)
}

const TIPOS_EVENTO_CLAVE = new Set(['goal', 'yellow-card', 'red-card'])

// El acordeón del ranking móvil funciona como vistazo rápido. Las sustituciones
// y jugadas secundarias quedan para la transmisión o la ficha de resumen.
export function resumirEventosRanking(eventos = []) {
  return eventos.filter(evento => TIPOS_EVENTO_CLAVE.has(evento?.tipo))
}
