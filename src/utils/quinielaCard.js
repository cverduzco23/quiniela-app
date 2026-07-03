import { cierreToDate, quinielaCerrada, quinielaFinalizada } from './cierre'
import { calcularPuntos, getResultado } from './scoring'
import { normalizarNombre } from './nombres'
import { haEnviadoQuiniela, miIdentidadEnQuiniela } from './misQuinielas'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatCierre(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Tiempo restante hasta el cierre, ya redondeado a la unidad más útil para el
// número grande de la banda ("2d", "5h", "20m").
function restante(d) {
  const ms = d.getTime() - Date.now()
  const MIN = 60 * 1000, HORA = 60 * MIN, DIA = 24 * HORA
  if (ms <= 0) return { valor: 0, unidad: 'm' }
  if (ms >= DIA) return { valor: Math.ceil(ms / DIA), unidad: 'd' }
  if (ms >= HORA) return { valor: Math.ceil(ms / HORA), unidad: 'h' }
  return { valor: Math.max(1, Math.ceil(ms / MIN)), unidad: 'm' }
}

// Arma los datos que necesita la tarjeta de "Tus quinielas" para uno de sus
// tres estados (abierta / jugandose / finalizada), a partir del documento de
// la quiniela, las predicciones enviadas por todos y el conteo de
// participantes. No incluye nada de liveScores (ESPN): la card del home usa
// solo lo ya guardado, la vista de ranking es la fuente en vivo definitiva.
export function datosTarjetaQuiniela(q, predicciones, participantes) {
  const partidos = q.partidos ?? []
  const resultados = q.resultados ?? {}
  const cerrada = quinielaCerrada(q)
  const finalizada = quinielaFinalizada(q)

  if (!cerrada) {
    const cierreDate = cierreToDate(q.cierre)
    return {
      estado: 'abierta',
      numPartidos: partidos.length,
      participantes,
      cierreTexto: cierreDate ? formatCierre(cierreDate) : '—',
      restante: cierreDate ? restante(cierreDate) : null,
      enviada: haEnviadoQuiniela(q.id),
    }
  }

  const terminados = partidos.filter((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (r?.cancelado) return false
    return getResultado(r) !== null
  }).length

  const miNombre = miIdentidadEnQuiniela(q.id)
  const jugadores = predicciones
    .map(p => ({ nombre: normalizarNombre(p.nombre), ...calcularPuntos(p.picks, resultados, {}, partidos) }))
    .sort((a, b) => b.puntos - a.puntos)
  const nombresDisponibles = [...new Set(jugadores.map(j => j.nombre))].sort((a, b) => a.localeCompare(b, 'es'))

  // Ranking olímpico: empates comparten posición (igual que RankingTable).
  const posiciones = []
  jugadores.forEach((j, i) => {
    if (i === 0) { posiciones.push(1); return }
    posiciones.push(jugadores[i - 1].puntos === j.puntos ? posiciones[i - 1] : i + 1)
  })

  const idx = miNombre ? jugadores.findIndex(j => j.nombre === miNombre) : -1
  const tengoPosicion = idx >= 0
  const posicion = tengoPosicion ? posiciones[idx] : null
  const misPuntos = tengoPosicion ? jugadores[idx].puntos : null
  const totalJugadores = jugadores.length

  const puntosOrdenados = [...new Set(jugadores.map(j => j.puntos))].sort((a, b) => b - a)
  const iPts = tengoPosicion ? puntosOrdenados.indexOf(misPuntos) : -1
  const diffConAnterior = iPts > 0 ? puntosOrdenados[iPts - 1] - misPuntos : 0
  const diffConSiguiente = iPts >= 0 && iPts < puntosOrdenados.length - 1 ? misPuntos - puntosOrdenados[iPts + 1] : 0

  const base = {
    numPartidos: partidos.length,
    participantes,
    partidosJugados: terminados,
    tengoPosicion,
    miNombre,
    posicion,
    misPuntos,
    totalJugadores,
    nombresDisponibles,
  }

  if (!finalizada) {
    return {
      ...base,
      estado: 'jugandose',
      subnota: tengoPosicion && posicion > 1 ? `A ${diffConAnterior} pts del ${posicion - 1}º` : null,
    }
  }

  const esGanador = tengoPosicion && posicion === 1
  return {
    ...base,
    estado: 'finalizada',
    esGanador,
    subnota: !tengoPosicion
      ? null
      : esGanador
        ? (totalJugadores > 1 ? `+${diffConSiguiente} sobre el 2º` : null)
        : `A ${diffConAnterior} pts del 1º`,
  }
}
