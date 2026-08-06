import { normalizarNombre } from './nombres'
import { miIdentidadEnQuiniela } from './misQuinielas'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from './cierre'
import { getResultado } from './scoring'

export function normalizarStreamUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

const STREAMX_PATH_RE = /^\/live([12])\.php$/i

export function analizarStreamXUrl(value) {
  const normalizada = normalizarStreamUrl(value)
  if (!normalizada) return null
  try {
    const url = new URL(normalizada)
    const match = url.pathname.match(STREAMX_PATH_RE)
    const clave = String(url.searchParams.get('stream') ?? '').trim()
    if (!match || !clave || !/^[a-z0-9_-]{1,80}$/i.test(clave)) return null
    return {
      clave,
      modo: match[1] === '2' ? 'live2' : 'live1',
      origen: url.origin,
    }
  } catch {
    return null
  }
}

export function construirStreamXUrl(clave, modo = 'live1', origen = 'https://streamx-hd.com') {
  const limpia = String(clave ?? '').trim()
  if (!/^[a-z0-9_-]{1,80}$/i.test(limpia)) return ''
  try {
    const base = new URL(origen)
    if (base.protocol !== 'https:') return ''
    const archivo = modo === 'live2' ? 'live2.php' : 'live1.php'
    return `${base.origin}/${archivo}?stream=${encodeURIComponent(limpia)}`
  } catch {
    return ''
  }
}

export function obtenerStreamFuentes(partido) {
  const campos = [
    ['streamUrl', 'streamKey', 'streamNombre'],
    ['streamUrl2', 'streamKey2', 'streamNombre2'],
    ['streamUrl3', 'streamKey3', 'streamNombre3'],
  ]

  return campos.flatMap(([campoUrl, campoKey, campoNombre], idx) => {
    const url = normalizarStreamUrl(partido?.[campoUrl])
    const detectada = analizarStreamXUrl(url)
    const claveGuardada = String(partido?.[campoKey] ?? '').trim()
    const clave = /^[a-z0-9_-]{1,80}$/i.test(claveGuardada)
      ? claveGuardada
      : detectada?.clave
    const origen = detectada?.origen ?? 'https://streamx-hd.com'
    const directa = url || (clave ? construirStreamXUrl(clave, 'live1', origen) : '')
    if (!directa) return []
    return [{
      url: directa,
      clave: clave || null,
      origen,
      esStreamX: Boolean(clave),
      nombre: String(partido?.[campoNombre] ?? '').trim() || `Opción ${idx + 1}`,
    }]
  })
}

export function resolverStreamFuente(fuente, modo = 'live1') {
  if (!fuente) return ''
  if (fuente.esStreamX && fuente.clave) {
    return construirStreamXUrl(fuente.clave, modo, fuente.origen)
  }
  return normalizarStreamUrl(fuente.url)
}

export function esIOS(userAgent = globalThis.navigator?.userAgent ?? '') {
  return /iPad|iPhone|iPod/i.test(String(userAgent)) ||
    (/Macintosh/i.test(String(userAgent)) && Number(globalThis.navigator?.maxTouchPoints ?? 0) > 1)
}

// A diferencia de miIdentidadEnQuiniela, este gate no acepta alias elegidos
// desde otro dispositivo: exige el comprobante local que se guarda al enviar.
export function miEnvioEnQuiniela(id) {
  if (!id) return null
  try {
    const raw = localStorage.getItem(`quiniela-${id}-enviada`)
    const data = raw ? JSON.parse(raw) : null
    const nombre = normalizarNombre(data?.nombre)
    return nombre || null
  } catch {
    return null
  }
}

export function dispositivoPuedeVerStream(quinielaId, predicciones = []) {
  // Acepta tanto el envío real de este dispositivo como el nombre que el
  // participante seleccionó para identificarse en "Tus quinielas".
  const nombre = miIdentidadEnQuiniela(quinielaId)
  if (!nombre) return false
  return predicciones.some(p => normalizarNombre(p?.nombre) === nombre)
}

export function obtenerStreamOpciones(partido, modo = 'live1') {
  return obtenerStreamFuentes(partido).map(fuente => resolverStreamFuente(fuente, modo))
}

export function streamDisponibleAhora(
  quiniela,
  partidoIdx,
  ahora = Date.now(),
) {
  const idx = Number(partidoIdx)
  if (!quiniela || !Number.isInteger(idx) || idx < 0) return false
  if (!quinielaCerrada(quiniela)) return false

  const partido = quiniela.partidos?.[idx]
  const inicio = cierreToDate(partido?.hora)?.getTime()
  if (!partido || !Number.isFinite(inicio) || ahora < inicio) return false

  const resultados = quiniela.resultados ?? {}
  const resultado = resultados[idx] ?? resultados[String(idx)]
  if (resultado?.cancelado) return false

  if (quinielaFinalizada(quiniela) || getResultado(resultado) !== null) {
    return false
  }

  return true
}
