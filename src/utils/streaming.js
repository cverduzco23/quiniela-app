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

export function obtenerStreamOpciones(partido) {
  return [partido?.streamUrl, partido?.streamUrl2, partido?.streamUrl3]
    .map(normalizarStreamUrl)
    .filter(Boolean)
}

export function streamDisponibleAhora(
  quiniela,
  partidoIdx,
  ahora = Date.now(),
  produccion = import.meta.env.PROD,
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

  // En desarrollo permitimos conservar transmisiones ya terminadas para
  // probarlas; el build de producción las cierra al guardarse el resultado.
  if (produccion && (quinielaFinalizada(quiniela) || getResultado(resultado) !== null)) {
    return false
  }

  return true
}
