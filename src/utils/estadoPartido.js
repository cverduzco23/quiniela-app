import { cierreToDate, VENTANA_EN_VIVO } from './cierre'
import { goalsToResultado, getResultado } from './scoring'

// Estado de un partido a partir de lo guardado por el organizador y de lo que
// reporta ESPN en vivo. Lo comparten el panel "Partidos" (móvil), el carrusel
// y la columna del partido (escritorio) para que los tres digan lo mismo.
//
// Cuando ESPN no nos da nada del partido (se capturó a mano y no tiene espnId,
// ESPN reasignó el id, o el scoreboard no le respondió a ESTE navegador) el
// marcador en vivo nunca llega y el partido se quedaba en "Pendiente" aunque la
// pelota ya estuviera rodando. Para esos casos hay dos respaldos, en orden:
//
//   1. `enVivoIds`: los ids que la Cloud Function vio en juego (se pasa ya
//      filtrado por frescura con `idsEnVivoFrescos`). Es ESPN de verdad, solo
//      que relevado por el servidor, así que aguanta que el partido se alargue.
//   2. El horario de inicio, que es lo único que siempre tenemos. Misma ventana
//      que usa `hayPartidoEnVivo` para el badge del home.
//
// Ninguno de los dos inventa marcador: solo cambian "Pendiente" por "En juego".
export function calcularEstadoPartido(partido, idx, resultados, liveScores, ahora = Date.now(), enVivoIds = null) {
  const live      = partido?.espnId ? liveScores?.[partido.espnId] : null
  const stored    = resultados?.[idx] ?? resultados?.[String(idx)]
  const cancelado = !!stored?.cancelado || !!live?.cancelado
  const noFinal   = !cancelado && !!live?.noFinal
  const suspendido = noFinal && !!live?.suspendido
  const esVivo    = !cancelado && live?.state === 'in'
  const esFinish  = !cancelado && !noFinal && live?.state === 'post'
  let scoreLocal = '-', scoreVisitante = '-', resDisplay = null
  if (!cancelado && live && (esVivo || esFinish) && live.local !== '') {
    scoreLocal = live.local; scoreVisitante = live.visitante
    resDisplay = goalsToResultado(live.local, live.visitante)
  } else if (noFinal && live?.local !== '' && live?.visitante !== '') {
    scoreLocal = live.local; scoreVisitante = live.visitante
  } else if (!cancelado && stored) {
    scoreLocal = stored.local ?? '-'; scoreVisitante = stored.visitante ?? '-'
    resDisplay = getResultado(stored)
  }
  const marcadorNoFinalVisible = noFinal && scoreLocal !== '-' && scoreVisitante !== '-'
  const pendiente = !cancelado && !resDisplay && !esVivo && !esFinish && !noFinal
  const jugado    = !cancelado && (esFinish || getResultado(stored) !== null)

  // Los respaldos solo entran si ESPN no reportó NADA de este partido a este
  // navegador. Si ESPN dice "pre" es porque todavía no arranca (un retraso de
  // cancha, por ejemplo) y le creemos a ESPN antes que al calendario.
  const sinDatoPropio = pendiente && !live
  const idEspn = partido?.espnId != null ? String(partido.espnId) : null
  const enVivoServidor = sinDatoPropio && !!idEspn &&
    Array.isArray(enVivoIds) && enVivoIds.includes(idEspn)
  const inicio = cierreToDate(partido?.hora)?.getTime()
  const arranco = sinDatoPropio && Number.isFinite(inicio) && ahora >= inicio
  const enJuegoSinMarcador = enVivoServidor || (arranco && ahora < inicio + VENTANA_EN_VIVO)
  const esperandoResultado = arranco && !enJuegoSinMarcador
  const porComenzar = pendiente && !arranco && !enVivoServidor

  return {
    live, stored, cancelado, noFinal, suspendido, esVivo, esFinish,
    scoreLocal, scoreVisitante, resDisplay, marcadorNoFinalVisible, pendiente, jugado,
    enJuegoSinMarcador, esperandoResultado, porComenzar,
    enCurso: esVivo || enJuegoSinMarcador,
    marcadorVisible: !!resDisplay || marcadorNoFinalVisible,
  }
}
