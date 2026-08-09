import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from '../utils/cierre'
import { goalsToResultado, getResultado, getPickResultado, getEfectivo, calcularPuntos, calcularRacha } from '../utils/scoring'
import { tienePremio, calcularGanadores, formatearMXN, descripcionRegla } from '../utils/premios'
import { simularUltimoPartido } from '../utils/escenarios'
import { normalizarNombre } from '../utils/nombres'
import { miIdentidadEnQuiniela } from '../utils/misQuinielas'
import { dispositivoPuedeVerStream, obtenerStreamFuentes, streamDisponibleAhora } from '../utils/streaming'
import { useEscritorio } from '../hooks/useEscritorio'
import { useResumenPartido } from '../hooks/useResumenPartido'
import { useFichaPartido } from '../hooks/useFichaPartido'
import { useDetallePartido } from '../hooks/useDetallePartido'
import { ResumenPartido, ResumenYoutube } from './ResumenPartido'
import { ReaccionesPartido } from './ReaccionesPartido'
import { ComentariosQuiniela } from './ComentariosQuiniela'
import { CuentaRegresiva } from './CuentaRegresiva'
import { RankingLivePlayer } from './RankingLivePlayer'
import { registrarApertura } from '../utils/analytics'
import { compartirOraculo, compartirRanking } from '../utils/shareRanking'
import { combinarEventosPartido, resumirEventosRanking } from '../utils/eventosPartido'
import { useDialog } from './Dialogs'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatFechaDestacada(value) {
  const texto = formatFecha(value)
  const ultimaComa = texto.lastIndexOf(',')
  return ultimaComa >= 0 ? `${texto.slice(0, ultimaComa)} ·${texto.slice(ultimaComa + 1)}` : texto
}

function textoAntesDelPartido(value, ahora = Date.now()) {
  const fecha = cierreToDate(value)
  if (!fecha) return 'Horario por confirmar'
  const minutos = Math.ceil((fecha.getTime() - ahora) / 60000)
  if (minutos <= 0) return 'El partido está por comenzar'
  const dias = Math.floor(minutos / (24 * 60))
  const horas = Math.floor((minutos % (24 * 60)) / 60)
  const mins = minutos % 60
  if (dias > 0) return `Comienza en ${dias} d${horas > 0 ? ` ${horas} h` : ''}`
  if (horas > 0) return `Comienza en ${horas} h${mins > 0 ? ` ${mins} min` : ''}`
  return `Comienza en ${mins} min`
}

function valorEstadisticaDisponible(valor) {
  return valor !== null && valor !== undefined && String(valor).trim() !== '' && String(valor) !== '-'
}

function precisionPases(acertados, totales) {
  const buenos = Number(acertados)
  const total = Number(totales)
  return Number.isFinite(buenos) && Number.isFinite(total) && total > 0
    ? `${Math.round((buenos / total) * 100)}%`
    : '-'
}

function TarjetasValor({ amarillas, rojas }) {
  return (
    <span
      className="rk-live-card-counts"
      aria-label={`${amarillas} tarjetas amarillas y ${rojas} tarjetas rojas`}
    >
      <span><i className="is-yellow" aria-hidden="true" />{amarillas}</span>
      <span><i className="is-red" aria-hidden="true" />{rojas}</span>
    </span>
  )
}

function pickDisplay(pick) {
  if (!pick) return '-'
  if (typeof pick === 'object') {
    const l = pick.local ?? '?', v = pick.visitante ?? '?'
    return `${l}-${v}`
  }
  return { home: 'Local', draw: 'Empate', away: 'Visitante' }[pick] ?? pick
}

// Colores del podio (oro / plata / bronce) para el número de posición
const medalColors = ['var(--yellow)', '#B8BCC4', '#C17F45']
// Relleno metálico (oro/plata/bronce) un poco apagado y su texto, para los badges del podio
const medalBadgeBg = [
  'radial-gradient(circle at 34% 28%, #FFF6BA 0%, #F6D978 24%, #C9941F 58%, #7D5407 100%)',
  'radial-gradient(circle at 34% 28%, #F8FAFC 0%, #D9DEE7 26%, #9CA3AF 62%, #59616D 100%)',
  'radial-gradient(circle at 34% 28%, #FFE0B2 0%, #D99A5B 28%, #A85F25 64%, #5F3517 100%)',
]
const medalBadgeText = ['#3F2D00', '#29313D', '#2F1809']
const resultColor = {
  home: { bg: 'var(--green-bg)',   color: 'var(--green)' },
  draw: { bg: 'var(--neutral-bg)', color: 'var(--muted)' },
  away: { bg: 'var(--yellow-bg)',  color: 'var(--yellow)' },
}
const resultBorder = {
  home: 'rgba(34,197,94,0.4)',
  draw: 'rgba(148,163,184,0.24)',
  away: 'rgba(250,204,21,0.4)',
}
const resultLabel = { home: 'Local', draw: 'Empate', away: 'Visitante' }
// Estado de un partido a partir de lo guardado por el organizador y de lo que
// reporta ESPN en vivo. Lo comparten el panel "Partidos" (móvil), el carrusel
// y la columna del partido (escritorio) para que los tres digan lo mismo.
function calcularEstadoPartido(partido, idx, resultados, liveScores) {
  const live      = partido.espnId ? liveScores?.[partido.espnId] : null
  const stored    = resultados[idx] ?? resultados[String(idx)]
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
  return {
    live, stored, cancelado, noFinal, suspendido, esVivo, esFinish,
    scoreLocal, scoreVisitante, resDisplay, marcadorNoFinalVisible, pendiente, jugado,
    marcadorVisible: !!resDisplay || marcadorNoFinalVisible,
  }
}

// Badge de estado del partido (Local / Empate / Visitante / En vivo / Pendiente…).
// `ocultarPendiente` es para la quiniela todavía abierta, donde marcar
// "Pendiente" en todos los partidos no aporta nada.
function badgePartido(e, ocultarPendiente = false) {
  if (e.cancelado) return <span className="ranking-match-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'var(--border-strong)' }}>Cancelado</span>
  if (e.suspendido) return <span className="ranking-match-badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#FBBF24', borderColor: 'rgba(245,158,11,0.38)' }}>Suspendido</span>
  if (e.noFinal) return <span className="ranking-match-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'var(--border-strong)' }}>En revisión</span>
  if (e.esVivo) return (
    <span className="ranking-match-badge is-live-badge" style={{ background: 'var(--red-bg-strong)', color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.4)' }}>
      <span className="ranking-match-live-dot" />{e.live.penalesEnVivo ? 'Penales' : e.live.halftime ? 'Descanso' : e.live.clock || 'En vivo'}
    </span>
  )
  if (e.resDisplay) return (
    <span className="ranking-match-badge" style={{ background: resultColor[e.resDisplay].bg, color: resultColor[e.resDisplay].color, borderColor: resultBorder[e.resDisplay] }}>
      {resultLabel[e.resDisplay]}
    </span>
  )
  if (ocultarPendiente) return null
  return <span className="ranking-match-badge is-pending-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'rgba(148,163,184,0.24)' }}>Pendiente</span>
}

const PAGE_SIZE = 50
// Mostrar el buscador solo cuando hay suficientes participantes para que valga la pena.
// Por debajo de este umbral, scrollear es más rápido.
const UMBRAL_BUSQUEDA = 20

export function SvgIcon({ name, size = 14, style }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0, ...style },
    'aria-hidden': 'true',
  }
  if (name === 'info') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    )
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    )
  }
  if (name === 'goal') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" />
        <path d="M12 7V3" />
        <path d="m16 10 4-1.5" />
        <path d="m14.5 15 2.5 3.5" />
        <path d="m9.5 15-2.5 3.5" />
        <path d="M8 10 4 8.5" />
      </svg>
    )
  }
  if (name === 'yellow-card' || name === 'red-card') {
    return (
      <svg {...common} fill="currentColor" stroke="none">
        <rect x="7" y="3" width="10" height="18" rx="1.8" />
      </svg>
    )
  }
  if (name === 'substitution') {
    return (
      <svg {...common}>
        <path d="M7 7h10" />
        <path d="m14 4 3 3-3 3" />
        <path d="M17 17H7" />
        <path d="m10 14-3 3 3 3" />
      </svg>
    )
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m20 6-11 11-5-5" />
      </svg>
    )
  }
  if (name === 'x') {
    return (
      <svg {...common}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    )
  }
  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="2.5" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 9h18" />
        <path d="M8 13h.01" />
        <path d="M12 13h.01" />
        <path d="M16 13h.01" />
        <path d="M8 17h.01" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (name === 'trophy') {
    return (
      <svg {...common}>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3" />
        <path d="M17 6h3v1a3 3 0 0 1-3 3" />
      </svg>
    )
  }
  if (name === 'crown') {
    return (
      <svg {...common}>
        <path d="m3 8 4 3 5-7 5 7 4-3-2 11H5L3 8Z" />
        <path d="M5 19h14" />
      </svg>
    )
  }
  if (name === 'camera') {
    return (
      <svg {...common}>
        <path d="M14.5 5 13 3H9L7.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    )
  }
  if (name === 'share') {
    return (
      <svg {...common}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </svg>
    )
  }
  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a3 3 0 0 1 0 5.74" />
      </svg>
    )
  }
  if (name === 'sparkles') {
    return (
      <svg {...common}>
        <path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2L12 3Z" />
        <path d="M19 3v4" />
        <path d="M21 5h-4" />
        <path d="M5 17v3" />
        <path d="M6.5 18.5h-3" />
      </svg>
    )
  }
  if (name === 'money') {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 9v.01" />
        <path d="M18 15v.01" />
      </svg>
    )
  }
  if (name === 'scale') {
    return (
      <svg {...common}>
        <path d="M12 3v18" />
        <path d="M5 6h14" />
        <path d="M6 6 3 13h6L6 6Z" />
        <path d="m18 6-3 7h6l-3-7Z" />
        <path d="M8 21h8" />
      </svg>
    )
  }
  if (name === 'broadcast') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2" />
        <path d="M8.5 15.5a5 5 0 0 1 0-7" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M5.6 18.4a9 9 0 0 1 0-12.8" />
        <path d="M18.4 5.6a9 9 0 0 1 0 12.8" />
      </svg>
    )
  }
  if (name === 'refresh') {
    return (
      <svg {...common}>
        <path d="M20 11a8 8 0 1 0 2 5.5" />
        <path d="M20 4v7h-7" />
      </svg>
    )
  }
  if (name === 'maximize') {
    return (
      <svg {...common}>
        <path d="M8 3H3v5" />
        <path d="m3 3 6 6" />
        <path d="M16 3h5v5" />
        <path d="m21 3-6 6" />
        <path d="M8 21H3v-5" />
        <path d="m3 21 6-6" />
        <path d="M16 21h5v-5" />
        <path d="m21 21-6-6" />
      </svg>
    )
  }
  if (name === 'handshake') {
    return (
      <svg {...common}>
        <path d="m8 12 2-2 3.5 3.5a2.1 2.1 0 0 0 3 0l.5-.5-4.2-4.2a3 3 0 0 0-4.2 0L7 10.4" />
        <path d="m14 17-2 2a2 2 0 0 1-2.8 0L4 13.8" />
        <path d="m17 13 3-3" />
        <path d="m3 11 4-4" />
        <path d="m15 19 4-4" />
      </svg>
    )
  }
  if (name === 'lock') {
    return (
      <svg {...common}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    )
  }
  if (name === 'dot') {
    return (
      <svg {...common} fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function RankingTable({ quiniela, predicciones, liveScores = {}, liveStats = {}, liveEventos = {}, livePenales = {}, reacciones = {}, modoStream = false }) {
  const { alerta } = useDialog()
  const [expandido, setExpandido]               = useState(new Set())
  const [expandidoPartido, setExpandidoPartido] = useState(new Set())
  // Una vez que un panel se abrió al menos una vez lo dejamos montado (aunque
  // esté cerrado) para poder animar su cierre con una transición en vez de
  // desmontarlo de golpe. Evita montar todos los paneles desde el inicio.
  const [montado, setMontado]                   = useState(new Set())
  const [montadoPartido, setMontadoPartido]     = useState(new Set())
  const [visibles, setVisibles]                 = useState(PAGE_SIZE)
  const [compartiendo, setCompartiendo] = useState(false)
  const [feedbackShare, setFeedbackShare] = useState('')
  const [busqueda, setBusqueda]                 = useState('')
  const [mostrarInfoPicks, setMostrarInfoPicks] = useState(false)
  const [mostrarTodosPartidos, setMostrarTodosPartidos] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())
  // Layout de escritorio (≥1024px): carrusel de partidos arriba y columna del
  // partido a la derecha. El marcado nuevo no se monta en móvil ni en el
  // ranking embebido de /stream, así que esas vistas quedan igual que antes.
  const esEscritorio = useEscritorio()
  const layoutEscritorio = esEscritorio && !modoStream
  const [partidoSeleccionado, setPartidoSeleccionado] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => setAhora(Date.now()), 30 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Detección de goles nuevos (comparando contra el polling anterior) para
  // disparar un festejo en pantalla, igual al de "picks completos".
  const prevLiveScoresRef = useRef(null)
  const golTimerRef = useRef(null)
  const [golFestejo, setGolFestejo] = useState(null) // { equipo } | null

  // Al primer clic, el panel todavía no existe en el DOM: si lo montamos y lo
  // marcamos "abierto" en el mismo instante, el navegador nunca pinta el
  // estado cerrado y la apertura se ve de golpe en vez de animada. Por eso la
  // primera vez lo montamos cerrado y esperamos dos frames (para que el
  // navegador lo pinte) antes de abrirlo; los toggles siguientes, con el
  // panel ya montado, solo alternan el estado y la transición ya sale suave.
  const toggleExpandido = (nombre) => {
    if (!montado.has(nombre)) {
      setMontado(prev => new Set(prev).add(nombre))
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setExpandido(prev => new Set(prev).add(nombre))
      }))
      return
    }
    setExpandido(prev => {
      const s = new Set(prev)
      s.has(nombre) ? s.delete(nombre) : s.add(nombre)
      return s
    })
  }

  const togglePartido = (idx) => {
    if (!montadoPartido.has(idx)) {
      setMontadoPartido(prev => new Set(prev).add(idx))
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setExpandidoPartido(prev => new Set(prev).add(idx))
      }))
      return
    }
    setExpandidoPartido(prev => {
      const s = new Set(prev)
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return s
    })
  }

  const partidos   = useMemo(() => quiniela.partidos ?? [], [quiniela.partidos])
  const resultados = quiniela.resultados ?? {}
  const cerrada    = quinielaCerrada(quiniela)
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
  const finalizada = quinielaFinalizada(quiniela) || (partidos.length > 0 && !enVivo && partidos.every((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    return r?.cancelado || getResultado(r) !== null
  }))
  const terminados = partidos.filter((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (r?.cancelado) return false
    return getResultado(r) !== null
  }).length
  const hayResultados = terminados > 0 || enVivo
  const vistaParticipantesAbierta = !cerrada && !hayResultados
  const miNombreRanking = quiniela?.id ? miIdentidadEnQuiniela(quiniela.id) : null
  // El modo destacado es para el cierre real de la quiniela, no simplemente
  // para los partidos con la última hora del calendario. Un partido deja de
  // estar pendiente cuando fue cancelado o ya tiene resultado, ya sea guardado
  // por el organizador o recibido en vivo desde ESPN.
  const partidosRestantesIdx = partidos.reduce((idxs, partido, idx) => {
    const stored = resultados[idx] ?? resultados[String(idx)]
    const live = partido.espnId ? liveScores?.[partido.espnId] : null
    const terminado = stored?.cancelado || live?.cancelado || getResultado(stored) !== null ||
      (live?.state === 'post' && !live?.noFinal)
    if (!terminado) idxs.push(idx)
    return idxs
  }, [])
  const dosRestantesSimultaneos = partidosRestantesIdx.length === 2 && (() => {
    const [primeroIdx, segundoIdx] = partidosRestantesIdx
    const primeraHora = cierreToDate(partidos[primeroIdx]?.hora)?.getTime()
    const segundaHora = cierreToDate(partidos[segundoIdx]?.hora)?.getTime()
    return primeraHora != null && primeraHora === segundaHora
  })()
  const quinielaEnJuego = cerrada && !finalizada && partidos.length > 0
  const finalesDestacables = quinielaEnJuego && (
    partidosRestantesIdx.length === 1 || dosRestantesSimultaneos
  )
  const puedeEnfocarUltimo = finalesDestacables && partidos.length > partidosRestantesIdx.length
  const enfoqueUltimoPartido = finalesDestacables && (!puedeEnfocarUltimo || !mostrarTodosPartidos)
  const finalesSimultaneas = enfoqueUltimoPartido && dosRestantesSimultaneos

  const jugadores = predicciones
    .map(p => ({
      id: p.id, nombre: normalizarNombre(p.nombre), picks: p.picks, fecha: p.fecha,
      ...calcularPuntos(p.picks, resultados, liveScores, partidos),
      racha: calcularRacha(p.picks, resultados, liveScores, partidos),
    }))
    // Orden: por puntos. Para mostrar la tabla de forma estable, dentro del mismo
    // puntaje se ordena por marcadores exactos, luego aciertos, y como último
    // criterio por quién envió primero. La posición y el premio dependen SOLO
    // de los puntos (empate en puntos = misma posición y se reparte); el resto
    // de criterios solo afecta el orden visual dentro del empate.
    .sort((a, b) =>
      b.puntos - a.puntos ||
      b.exactos - a.exactos ||
      b.aciertos - a.aciertos ||
      (cierreToDate(a.fecha)?.getTime() ?? Infinity) - (cierreToDate(b.fecha)?.getTime() ?? Infinity)
    )

  // Ranking olímpico: jugadores con los mismos puntos comparten posición
  const posiciones = []
  jugadores.forEach((j, i) => {
    if (i === 0) { posiciones.push(1); return }
    const prev = jugadores[i - 1]
    posiciones.push(prev.puntos === j.puntos ? posiciones[i - 1] : i + 1)
  })

  // Atamos la posición al jugador para que el filtro preserve la posición real
  const jugadoresConPos = jugadores.map((j, i) => ({ ...j, _pos: posiciones[i] }))
  // Mientras nadie tenga puntos (todos en cero) no hay posiciones reales: se
  // muestra una línea en vez de "1°" y no se declara líder ni medallas.
  const rankingConPuntos = hayResultados && jugadores.length > 0 && jugadores[0].puntos > 0
  // Nombres abreviados (2 tokens, o más si hay empate) para la fila colapsada.
  const nombresCortos = abreviarNombres(jugadores.map(j => j.nombre))
  const filtroBusqueda  = busqueda.trim().toLowerCase()
  const filtrados       = filtroBusqueda
    ? jugadoresConPos.filter(j => j.nombre.toLowerCase().includes(filtroBusqueda))
    : jugadoresConPos
  const shown     = filtrados.slice(0, visibles)
  const restantes = filtrados.length - shown.length
  const mostrarBuscador = jugadores.length > UMBRAL_BUSQUEDA && !vistaParticipantesAbierta

  // Badges de jornada (solo quinielas finalizadas, calculadas al vuelo):
  // 🎯 Francotirador = más marcadores exactos (mínimo 2).
  // 📈 Remontada = quien más posiciones escaló con el último partido jugado
  // (se recalcula la tabla sin ese partido y se compara; cuenta desde 2+).
  const badgesPorNombre = (() => {
    if (!finalizada || jugadores.length < 3) return {}
    const out = {}
    const maxExactos = Math.max(...jugadores.map(j => j.exactos), 0)
    if (maxExactos >= 2) {
      jugadores.forEach(j => {
        if (j.exactos === maxExactos) (out[j.nombre] ||= []).push('francotirador')
      })
    }
    const jugados = partidos
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => {
        const r = resultados[i] ?? resultados[String(i)]
        return !r?.cancelado && getResultado(r) !== null
      })
    if (jugados.length >= 2) {
      const ultimo = jugados.reduce((a, b) => {
        const ta = cierreToDate(a.p.hora)?.getTime() ?? a.i
        const tb = cierreToDate(b.p.hora)?.getTime() ?? b.i
        return tb >= ta ? b : a
      })
      const resAntes = {}
      Object.entries(resultados).forEach(([k, v]) => {
        if (Number(k) !== ultimo.i) resAntes[k] = v
      })
      const liveAntes = { ...liveScores }
      if (ultimo.p.espnId) delete liveAntes[ultimo.p.espnId]
      const antes = jugadores
        .map(j => ({ nombre: j.nombre, puntos: calcularPuntos(j.picks, resAntes, liveAntes, partidos).puntos }))
        .sort((a, b) => b.puntos - a.puntos)
      const posAntes = {}
      antes.forEach((j, i) => {
        posAntes[j.nombre] = i === 0 ? 1 : (antes[i - 1].puntos === j.puntos ? posAntes[antes[i - 1].nombre] : i + 1)
      })
      let mejorDelta = 0
      jugadoresConPos.forEach(j => {
        const delta = (posAntes[j.nombre] ?? j._pos) - j._pos
        if (delta > mejorDelta) mejorDelta = delta
      })
      if (mejorDelta >= 2) {
        jugadoresConPos.forEach(j => {
          const delta = (posAntes[j.nombre] ?? j._pos) - j._pos
          if (delta === mejorDelta) (out[j.nombre] ||= []).push('remontada')
        })
      }
    }
    return out
  })()

  // Podio del primer lugar (solo escritorio, vía CSS): reconoce al líder (o al
  // ganador si ya terminó) arriba de la tabla y oculta su fila para no
  // duplicarlo. Con búsqueda activa el podio se retira y la fila reaparece,
  // para que buscar al líder por nombre siga funcionando.
  const lideres = hayResultados && (jugadores[0]?.puntos ?? 0) > 0
    ? jugadoresConPos.filter(j => j._pos === 1)
    : []
  const mostrarPodio = lideres.length > 0 && !filtroBusqueda

  // Detectar goles nuevos entre un polling y el siguiente, para festejar en
  // pantalla. Solo cuenta mientras el partido está en vivo (evita festejar
  // datos viejos al cargar o cuando ya terminó).
  useEffect(() => {
    if (liveScores === prevLiveScoresRef.current) return
    const prev = prevLiveScoresRef.current
    prevLiveScoresRef.current = liveScores
    if (!prev) return // primer render: solo guardamos snapshot, no festejamos
    for (const partido of partidos) {
      if (!partido.espnId) continue
      const antes = prev[partido.espnId]
      const ahora = liveScores[partido.espnId]
      if (!antes || !ahora || ahora.state !== 'in') continue
      const golesAntes = (Number(antes.local) || 0) + (Number(antes.visitante) || 0)
      const golesAhora = (Number(ahora.local) || 0) + (Number(ahora.visitante) || 0)
      if (golesAhora > golesAntes) {
        const equipo = Number(ahora.local) > Number(antes.local) ? partido.local : partido.visitante
        setGolFestejo({ equipo })
        // Reiniciamos el temporizador en un ref para que el siguiente polling
        // (que vuelve a correr este efecto) no cancele el ocultamiento del
        // festejo. Antes se devolvía un cleanup y el re-render lo borraba.
        if (golTimerRef.current) clearTimeout(golTimerRef.current)
        golTimerRef.current = setTimeout(() => setGolFestejo(null), 1800)
        return
      }
    }
  }, [liveScores, partidos])

  // Al desmontar, cancelamos cualquier temporizador de festejo pendiente.
  useEffect(() => () => { if (golTimerRef.current) clearTimeout(golTimerRef.current) }, [])

  const conPremio = tienePremio(quiniela)
  const { ganadores, premioPorNombre, bote } = calcularGanadores(jugadores, quiniela, jugadores.length)
  const premioZonaMonto = Number(ganadores[0]?.premio) || 0
  const premioZonaMismoMonto = ganadores.length > 0 && ganadores.every(g => Math.abs((Number(g.premio) || 0) - premioZonaMonto) < 0.01)
  const premioZonaLabel = ganadores.length > 0
    ? premioZonaMismoMonto
      ? `${formatearMXN(premioZonaMonto)}${ganadores.length > 1 ? ' c/u' : ''}`
      : 'Premios activos'
    : ''
  const puedeCompartir = vistaParticipantesAbierta || jugadores.length > 0
  const mostrarGanadorFinal = finalizada && jugadores.length > 0 && (!conPremio || (hayResultados && jugadores[0]?.puntos > 0))
  const compartirLabel = vistaParticipantesAbierta
    ? 'Invitar amigos'
    : finalizada
      ? 'Compartir resultados'
      : 'Compartir mi posición'
  const compartirIcon = vistaParticipantesAbierta ? 'users' : 'share'
  const resumenStats = vistaParticipantesAbierta
    ? [
        { val: jugadores.length, label: 'Participantes' },
        { val: partidos.length,  label: 'Partidos' },
      ]
    : [
        { val: jugadores.length,                   label: 'Participantes' },
        { val: `${terminados}/${partidos.length}`, label: 'Partidos' },
      ]

  const handleCompartirRanking = async () => {
    if (compartiendo || !puedeCompartir) return
    setCompartiendo(true)
    setFeedbackShare('')
    try {
      // Detectar la identidad del usuario en este dispositivo (envío real o
      // alias autoasignado) para que la imagen incluya su fila + vecinos
      // cuando esté fuera del Top.
      const miNombre = quiniela?.id ? miIdentidadEnQuiniela(quiniela.id) : null
      const res = await compartirRanking({
        quiniela,
        jugadores,
        premioPorNombre,
        bote,
        finalizada,
        enVivo,
        terminados,
        totalPartidos: partidos.length,
        conPremio,
        miNombre,
      })
      if (res?.copiado) {
        setFeedbackShare('Imagen copiada. Pégala donde quieras.')
        setTimeout(() => setFeedbackShare(''), 4000)
      } else if (res?.descargado) {
        setFeedbackShare('Imagen descargada. Compártela donde quieras.')
        setTimeout(() => setFeedbackShare(''), 4000)
      }
    } catch (err) {
      console.error('Error compartiendo:', err)
      alerta('No se pudo generar la imagen. Intenta de nuevo.')
    } finally {
      setCompartiendo(false)
    }
  }

  // Escenarios del último partido: solo tiene sentido cuando la quiniela ya
  // cerró (los picks son públicos) y queda exactamente un partido por definir.
  const simulacion = cerrada ? simularUltimoPartido(quiniela, predicciones, liveScores) : null

  // --- Escritorio: qué partido se ve en la columna derecha -------------------
  // Por defecto el que esté en vivo; si no hay ninguno, el siguiente por
  // jugarse; y si ya se jugaron todos, el último. El usuario puede cambiarlo
  // haciendo clic en cualquier tarjeta del carrusel.
  const estadosPartidos = partidos.map((p, i) => calcularEstadoPartido(p, i, resultados, liveScores))
  const partidoDestacadoIdx = (() => {
    if (partidos.length === 0) return null
    const vivo = estadosPartidos.findIndex(e => e.esVivo)
    if (vivo !== -1) return vivo
    const porJugar = partidos
      .map((p, i) => ({ i, t: cierreToDate(p.hora)?.getTime() ?? Infinity }))
      .filter(({ i }) => !estadosPartidos[i].jugado && !estadosPartidos[i].cancelado)
      .sort((a, b) => a.t - b.t)
    if (porJugar.length > 0) return porJugar[0].i
    return partidos
      .map((p, i) => ({ i, t: cierreToDate(p.hora)?.getTime() ?? -Infinity }))
      .sort((a, b) => b.t - a.t)[0].i
  })()
  const idxColumna = partidoSeleccionado != null && partidos[partidoSeleccionado]
    ? partidoSeleccionado
    : partidoDestacadoIdx
  // Picks propios: los usa el carrusel ("Tu pronóstico") y la columna del
  // partido. Es la predicción de este dispositivo, así que se puede mostrar
  // aunque la quiniela siga abierta y el resto de los picks estén ocultos.
  const misPicks = miNombreRanking
    ? jugadores.find(j => j.nombre === miNombreRanking)?.picks ?? null
    : null
  const puedeVerStream = layoutEscritorio && dispositivoPuedeVerStream(quiniela?.id, predicciones)

  const tarjetaGanador = !modoStream && mostrarGanadorFinal ? (
    <div className="ranking-champion-slot">
      <GanadorCard jugadores={jugadores} premioPorNombre={premioPorNombre} conPremio={conPremio} />
    </div>
  ) : null

  return (
    <>
      <style>{`@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
        @keyframes flame-pulse{0%,100%{transform:scale(0.97)}50%{transform:scale(1.04)}}
        @keyframes flame-glow{0%,100%{transform:scale(0.95);opacity:.42}50%{transform:scale(1.05);opacity:.56}}`}</style>

      {golFestejo && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '2px solid var(--yellow)', borderRadius: 'var(--radius-md)',
            padding: '14px 22px', boxShadow: 'var(--shadow-green)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--yellow)',
            animation: 'pop 0.5s ease-out',
            display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
          }}>
            <SvgIcon name="goal" size={19} />
            Gol de {golFestejo.equipo}
          </div>
          {Array.from({ length: 18 }).map((_, k) => {
            const left = (k * 5.7) % 100
            const delay = (k % 7) * 0.08
            const size = 14 + (k % 4) * 4
            return (
              <span key={k} style={{
                position: 'absolute', top: '-24px', left: `${left}%`, fontSize: size,
                animation: `confetti 1.5s ease-in ${delay}s forwards`,
              }}>
                <SvgIcon name="goal" size={size} />
              </span>
            )
          })}
        </div>
      )}

      {/* Ganador final: en escritorio encabeza la pantalla a todo el ancho,
          arriba del carrusel; en móvil sigue siendo lo primero de la columna. */}
      {layoutEscritorio && tarjetaGanador}

      {/* Escritorio: carrusel de partidos bajo el header. Sustituye al panel
          "Partidos" (que en escritorio no se monta) y elige qué partido se ve
          en la columna de la derecha. */}
      {layoutEscritorio && partidos.length > 0 && (
        <CarruselPartidos
          partidos={partidos}
          estados={estadosPartidos}
          cerrada={cerrada}
          misPicks={misPicks}
          seleccionado={idxColumna}
          onSeleccionar={setPartidoSeleccionado}
        />
      )}

      <div className={`ranking-desktop-grid${modoStream ? ' is-stream-embed' : ' rk-body'}`}>
      <div className="rk-body-table">
      {!layoutEscritorio && tarjetaGanador}
      <div className="ranking-desktop-left">
      {layoutEscritorio && !modoStream && (
        <div className="rk-participants-heading">
          <h2>Participantes</h2>
          <small>
            {jugadores.length} en total{finalizada ? ' · clasificación final' : enVivo ? '' : vistaParticipantesAbierta ? ' · registrados' : ' · clasificación actual'}
          </small>
        </div>
      )}
      {/* Banner de premio */}
      {!mostrarGanadorFinal && (conPremio ? (
        <PremioBanner quiniela={quiniela} bote={bote} ganadores={ganadores} finalizada={finalizada} hayResultados={hayResultados} abierta={vistaParticipantesAbierta} />
      ) : finalizada ? null : (
        <SinPremioBanner />
      ))}

      {/* En móvil, el Oráculo continúa inmediatamente después de
          "Si terminara ahora". En escritorio conserva su lugar sobre la tabla. */}
      {!modoStream && simulacion && (
        <div className="oracle-mobile-slot">
          <EscenariosUltimoPartido
            sim={simulacion}
            conPremio={conPremio}
            liveScores={liveScores}
            quiniela={quiniela}
            bote={bote}
          />
        </div>
      )}

      {/* Resumen (participantes / partidos): en escritorio el carrusel ya
          lleva la cuenta de partidos, así que estas tarjetas no se montan. */}
      {!modoStream && !layoutEscritorio && <div className="ranking-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${resumenStats.length},1fr)` }}>
        {resumenStats.map(s => (
          <div key={s.label} className="ranking-stat-card ranking-glass-card">
            <span className={`ranking-stat-watermark is-${s.label === 'Participantes' ? 'participants' : 'matches'}`} aria-hidden="true">
              {s.label === 'Participantes' ? '👤' : '⚽'}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-stat-value-size, 26px)', fontWeight: 700, display: 'block', color: 'var(--text-strong)', lineHeight: 0.98 }}>{s.val}</span>
            <span style={{ fontSize: 'var(--ranking-stat-label-size, 11px)', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--ranking-stat-label-spacing, 0.5px)', marginTop: 8 }}>{s.label}</span>
          </div>
        ))}
      </div>}

      {/* Partidos: en escritorio lo sustituyen el carrusel y la columna del
          partido, así que solo se monta abajo de 1024px. */}
      {!modoStream && !layoutEscritorio && partidos.length > 0 && (
        <div className={`ranking-panel ranking-matches-panel${enfoqueUltimoPartido ? ' is-last-match-focus' : ''}${finalesSimultaneas ? ' has-simultaneous-finals' : ''}`}>
          <div className="ranking-panel-header ranking-matches-header">
              <span className="ranking-matches-title">
                <span className="ranking-matches-title-icon" aria-hidden="true">
                  📅
                </span>
                {enfoqueUltimoPartido ? (finalesSimultaneas ? 'Últimos partidos' : 'Último partido') : 'Partidos'}
              </span>
            <span className="ranking-matches-header-actions">
              {!enfoqueUltimoPartido && !puedeEnfocarUltimo && <span className="ranking-matches-count">{partidos.length}</span>}
              {puedeEnfocarUltimo && (
                <button
                  type="button"
                  className="ranking-matches-view-toggle"
                  onClick={() => setMostrarTodosPartidos(v => !v)}
                  aria-label={enfoqueUltimoPartido ? 'Ver todos los partidos' : 'Ver último partido'}
                >
                  <span className="is-long">{enfoqueUltimoPartido ? 'Ver todos' : 'Ver último partido'}</span>
                  <span className="is-short">{enfoqueUltimoPartido ? 'Ver todos' : 'Ver último'}</span>
                </button>
              )}
            </span>
          </div>
          {partidos.map((p, i) => {
            if (enfoqueUltimoPartido && !partidosRestantesIdx.includes(i)) return null
            const estado = calcularEstadoPartido(p, i, resultados, liveScores)
            const {
              live, stored, cancelado, esVivo, esFinish,
              scoreLocal, scoreVisitante, resDisplay, marcadorNoFinalVisible, pendiente,
            } = estado
            const pendienteEnQuinielaAbierta = !cerrada && pendiente
            const tieneStats = !!p.espnId
            const horaInicio = cierreToDate(p.hora)?.getTime()
            const partidoAbierto = expandidoPartido.has(i)
            const st = liveStats[p.espnId]
            const eventos = liveEventos[p.espnId] ?? []
            // Penales: los goles de la tanda llegan mezclados como "goal" en los
            // eventos normales: los filtramos. La secuencia completa de la tanda
            // (con anotados y fallados) viene aparte en livePenales.
            const eventosNormales = eventos.filter(e => !e.penalShootout)
            const eventosResumen = resumirEventosRanking(eventosNormales)
            const penalesTanda    = livePenales[p.espnId] ?? []
            // Agrupamos los penales por ronda (mismo turno = misma línea): local
            // a la izquierda, visitante a la derecha. El orden es de arriba hacia
            // abajo (ronda 1 primero).
            const penalesRondas   = (() => {
              const porRonda = {}
              penalesTanda.forEach(k => { (porRonda[k.orden] ||= {})[k.lado] = k })
              return Object.keys(porRonda)
                .map(Number).sort((a, b) => a - b)
                .map(n => ({ orden: n, home: porRonda[n].home, away: porRonda[n].away }))
            })()
            const penalLocal      = live?.localPen
            const penalVisitante  = live?.visitantePen
            const tienePenalScore = !cancelado && penalLocal != null && penalVisitante != null
            const hayPenales      = !cancelado && (!!live?.penales || penalesTanda.length > 0)
            const hayStats = !!st && st.state !== 'pre'
            const hayResumen = tieneStats && (esFinish || !!stored) && !cancelado
            const hayDetallesVisibles = hayStats || eventosResumen.length > 0 || hayPenales
            const tienePrevio = pendiente && !!p.hora
            const tieneAlgo = hayDetallesVisibles || hayResumen || tienePrevio
            const jugado = estado.jugado
            const mostrarStream = quinielaEnJuego && !cancelado && !jugado &&
              Number.isFinite(horaInicio) && ahora >= horaInicio
            const mostrarReacciones = cerrada && !cancelado && jugado
            const matchScoreText = (resDisplay || marcadorNoFinalVisible) ? `${scoreLocal} - ${scoreVisitante}` : 'VS'
            const posH = hayStats ? parseFloat(st.home.posesion) || 50 : 50
            const badgeNode = badgePartido(estado, pendienteEnQuinielaAbierta)
            const muestraEstadoPartido = !!badgeNode || tieneAlgo
            return (
              <div
                key={i}
                onClick={tieneAlgo ? () => togglePartido(i) : undefined}
                className={`ranking-match-row${enfoqueUltimoPartido ? ' is-featured' : ''}${finalesSimultaneas ? ' is-featured-pair' : ''}${esVivo ? ' is-live' : ''}${jugado ? ' is-played' : ''}${partidoAbierto ? ' is-open' : ''}${cancelado ? ' is-cancelled' : ''}${tieneAlgo ? ' is-clickable' : ''}`}
                style={{ borderBottom: !enfoqueUltimoPartido && i < partidos.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                {(p.escudoLocal || p.escudoVisitante) && (
                  <div className="ranking-match-team-blobs" aria-hidden="true">
                    {p.escudoLocal && <img className="is-home" src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                    {p.escudoVisitante && <img className="is-away" src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                  </div>
                )}
                {/* Escritorio (≥1024px): equipos completos + fecha bajo el local */}
                <div className={`ranking-match-wide${muestraEstadoPartido ? ' has-status' : ''}`}>
                  <div className="ranking-match-wide-teams">
                    <div className="ranking-match-wide-side is-home">
                      <div className="ranking-match-wide-side-row">
                        <EscudoEquipo url={p.escudoLocal} nombre={p.local} size={enfoqueUltimoPartido ? 30 : 22} />
                        <span className="ranking-match-wide-name">{p.local}</span>
                      </div>
                      {p.hora && !enfoqueUltimoPartido && <span className="ranking-match-wide-fecha">{formatFecha(p.hora)}</span>}
                    </div>
                    <div className="ranking-match-score-stack">
                      {enfoqueUltimoPartido && badgeNode && <span className="ranking-featured-match-status">{badgeNode}</span>}
                      <span
                        className={`ranking-match-wide-score${pendiente ? ' is-pending' : ''}`}
                        style={{ color: cancelado ? 'var(--muted)' : 'var(--text-strong)', textDecoration: cancelado ? 'line-through' : 'none' }}
                      >
                        {matchScoreText}
                      </span>
                    </div>
                    <div className="ranking-match-wide-side is-away">
                      <div className="ranking-match-wide-side-row">
                        <span className="ranking-match-wide-name">{p.visitante}</span>
                        <EscudoEquipo url={p.escudoVisitante} nombre={p.visitante} size={enfoqueUltimoPartido ? 30 : 22} />
                      </div>
                    </div>
                  </div>
                  {enfoqueUltimoPartido && p.hora && <span className="ranking-featured-match-date is-wide">{formatFechaDestacada(p.hora)}</span>}
                  {muestraEstadoPartido && (
                    <div className="ranking-match-wide-status">
                      {!enfoqueUltimoPartido && badgeNode}
                      {tieneAlgo && (
                        <span className="ranking-match-toggle ranking-match-toggle-wide">
                          <span className="ranking-match-toggle-icon" aria-hidden="true">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ transform: partidoAbierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className={`ranking-match-compact${(muestraEstadoPartido || p.hora) ? ' has-meta' : ''}`}>
                  {(muestraEstadoPartido || p.hora) && (
                    <div className={`ranking-match-status-row${esVivo ? ' is-live' : ''}${tieneAlgo ? ' has-toggle' : ''}`}>
                      {p.hora && !enfoqueUltimoPartido && <span className="ranking-match-status-date">{formatFecha(p.hora)}</span>}
                      {!enfoqueUltimoPartido && badgeNode}
                      {tieneAlgo && (
                        <span className="ranking-match-toggle ranking-match-toggle-status">
                          <span className="ranking-match-toggle-icon" aria-hidden="true">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ transform: partidoAbierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="ranking-match-body">
                    <div className="ranking-match-desktop-teams">
                      <div className="ranking-match-side is-home">
                        {p.escudoLocal && <img className="ranking-match-crest" src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                        <span className="ranking-match-name">{p.local}</span>
                      </div>
                      <div className="ranking-match-score-stack">
                        {enfoqueUltimoPartido && badgeNode && <span className="ranking-featured-match-status">{badgeNode}</span>}
                        <span
                          className={`ranking-match-score is-desktop${pendiente ? ' is-pending' : ''}`}
                          style={{ color: cancelado ? 'var(--muted)' : 'var(--text-strong)', textDecoration: cancelado ? 'line-through' : 'none' }}
                        >
                          {matchScoreText}
                        </span>
                      </div>
                      <div className="ranking-match-side is-away">
                        <span className="ranking-match-name">{p.visitante}</span>
                        {p.escudoVisitante && <img className="ranking-match-crest" src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      </div>
                    </div>
                    {enfoqueUltimoPartido && p.hora && <span className="ranking-featured-match-date">{formatFechaDestacada(p.hora)}</span>}
                  </div>
                </div>

                <div className="ranking-match-actions-row">
                  {mostrarStream && (
                    <a
                      href={`/stream/${quiniela.id}/${i}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ranking-stream-button"
                      onClick={e => e.stopPropagation()}
                    >
                      <SvgIcon name="broadcast" size={14} />
                      Ver en vivo
                    </a>
                  )}
                  {mostrarReacciones && (
                    <ReaccionesPartido
                      quinielaId={quiniela.id}
                      partidoIdx={i}
                      conteos={reacciones[String(i)]}
                    />
                  )}
                  {!layoutEscritorio && pendiente && (
                    <EstadioPartidoPendiente partido={p} />
                  )}
                  {!mostrarStream && !mostrarReacciones && (layoutEscritorio || !pendiente) && <span className="ranking-stream-placeholder" aria-hidden="true" />}
                  {tieneAlgo && (
                    <span className="ranking-match-toggle ranking-match-toggle-actions">
                      <span className="ranking-match-toggle-icon" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ transform: partidoAbierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </span>
                  )}
                </div>

                {/* Panel de estadísticas */}
                {tieneAlgo && montadoPartido.has(i) && (
                  <div
                    aria-hidden={!partidoAbierto}
                    style={{
                      display: 'grid',
                      gridTemplateRows: partidoAbierto ? '1fr' : '0fr',
                      opacity: partidoAbierto ? 1 : 0,
                      transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease',
                    }}
                  >
                  <div style={{ overflow: 'hidden' }}>
                  <div className="ranking-match-detail-panel">
                    {enfoqueUltimoPartido && (
                      <div className="ranking-featured-detail-heading">
                        <span className="ranking-featured-detail-title">
                          <span aria-hidden="true">📊</span>
                          Detalles del partido
                        </span>
                        {esVivo && (
                          <span className="ranking-featured-detail-live">
                            <span className="ranking-match-live-dot" />
                            En vivo
                          </span>
                        )}
                      </div>
                    )}
                    <div className="ranking-match-detail-teams" aria-hidden="true">
                      <div className="ranking-match-detail-team is-home">
                        {p.escudoLocal && <img src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                        <span>{p.local}</span>
                      </div>
                      <span className="ranking-match-detail-vs">vs</span>
                      <div className="ranking-match-detail-team is-away">
                        <span>{p.visitante}</span>
                        {p.escudoVisitante && <img src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      </div>
                    </div>
                    {tienePrevio && !hayDetallesVisibles && (
                      <div className="ranking-match-preview">
                        <span className="ranking-match-preview-icon" aria-hidden="true">
                          <SvgIcon name="calendar" size={17} />
                        </span>
                        <div>
                          <span className="ranking-match-preview-kicker">Próximamente</span>
                          <strong>{textoAntesDelPartido(p.hora, ahora)}</strong>
                          <p>
                            El marcador y las estadísticas aparecerán aquí cuando comience el partido.
                            {(p.streamUrl || p.streamUrl2 || p.streamUrl3) &&
                              ' La transmisión se habilitará desde la hora de inicio.'}
                          </p>
                        </div>
                      </div>
                    )}
                    {hayStats && (
                      <div className="ranking-match-stats">
                        <div className="ranking-match-possession">
                          <div className="ranking-match-stat-line is-possession">
                            <span className="ranking-match-stat-value is-home">{st.home.posesion}%</span>
                            <span className="ranking-match-stat-label">Posesión</span>
                            <span className="ranking-match-stat-value is-away">{st.away.posesion}%</span>
                          </div>
                          <div className="ranking-match-possession-bar">
                            <span style={{ width: `${posH}%` }} />
                          </div>
                        </div>
                        {[
                          { label: 'Tiros al arco',  h: st.home.tirosArco,    a: st.away.tirosArco    },
                          { label: 'Tiros totales',  h: st.home.tirosTotales, a: st.away.tirosTotales },
                          { label: 'Corners',        h: st.home.corners,      a: st.away.corners      },
                          { label: 'Faltas',         h: st.home.faltas,       a: st.away.faltas       },
                        ].map(({ label, h, a }) => (
                          <div key={label} className="ranking-match-stat-line">
                            <span className="ranking-match-stat-value is-home">{h}</span>
                            <span className="ranking-match-stat-label">{label}</span>
                            <span className="ranking-match-stat-value is-away">{a}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {eventosResumen.length > 0 && (
                      <div className="ranking-match-events">
                        <p className="ranking-match-events-title">Últimos eventos</p>
                        {[...eventosResumen].reverse().map((ev, j) => {
                          const izq = ev.lado === 'home'
                          return (
                            <div key={j} className={`ranking-match-event-row${izq ? ' is-home' : ' is-away'}`}>
                              <span className={`ranking-match-event-icon is-${ev.tipo || 'default'}`}>
                                <SvgIcon name={ev.tipo || 'dot'} size={13} />
                              </span>
                              <span className="ranking-match-event-minute">{ev.minuto}</span>
                              <span className="ranking-match-event-player">
                                {textoJugadorEvento(ev)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {hayPenales && (
                      <div
                        className="ranking-match-shootout"
                        style={{
                          marginTop: (hayStats || eventosResumen.length > 0) ? 12 : 0,
                          paddingTop: (hayStats || eventosResumen.length > 0) ? 10 : 0,
                          borderTop: (hayStats || eventosResumen.length > 0) ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' }}>
                          Tanda de penales{tienePenalScore ? ` · ${penalLocal}-${penalVisitante}` : ''}
                        </p>
                        {penalesRondas.map((r, j) => {
                          const tiro = (k, alinear) => (
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: alinear, gap: 5 }}>
                              {k ? (
                                <>
                                  {alinear === 'flex-end' && (
                                    <span style={{ fontSize: 12, color: k.anotado ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.jugador}</span>
                                  )}
                                  <span style={{ display: 'inline-flex', color: k.anotado ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} aria-label={k.anotado ? 'Anotó' : 'Falló'}>
                                    <SvgIcon name={k.anotado ? 'check' : 'x'} size={14} />
                                  </span>
                                  {alinear !== 'flex-end' && (
                                    <span style={{ fontSize: 12, color: k.anotado ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.jugador}</span>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )
                          return (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                              {tiro(r.home, 'flex-start')}
                              {tiro(r.away, 'flex-end')}
                            </div>
                          )
                        })}
                        {!live?.penalesEnVivo && (esFinish || jugado) && (
                          <p className="ranking-match-shootout-final">
                            Se definió en penales.
                          </p>
                        )}
                      </div>
                    )}
                    {jugado && !cancelado && (
                      <DetalleArchivadoMovil
                        quinielaId={quiniela.id}
                        idx={i}
                        partido={p}
                        mostrarStats={!hayStats}
                        mostrarEventos={eventosResumen.length === 0}
                        mostrarPenales={!hayPenales}
                      />
                    )}
                    {hayResumen && (
                      <Link
                        to={`/ranking/${quiniela.id}/partido/${i}`}
                        className="ranking-match-summary-link"
                        onClick={e => e.stopPropagation()}
                      >
                        Ver resumen del partido →
                      </Link>
                    )}
                  </div>
                  </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Comentarios de la quiniela: en móvil quedan entre Partidos y la tabla;
          en escritorio se montan al pie de la columna del ranking (más abajo). */}
      {!modoStream && !layoutEscritorio && <ComentariosQuiniela quiniela={quiniela} />}

      </div>

      <div className={`ranking-desktop-right${mostrarPodio ? ' has-podium' : ''}`}>
      {/* ¿Quién gana según el marcador del último partido?: en escritorio queda
          arriba de la tabla de ranking; en móvil el orden visual no cambia
          porque la columna izquierda ya terminó de renderizarse antes. */}
      {!modoStream && simulacion && (
        <div className="oracle-desktop-slot">
          <EscenariosUltimoPartido
            sim={simulacion}
            conPremio={conPremio}
            liveScores={liveScores}
            quiniela={quiniela}
            bote={bote}
          />
        </div>
      )}
      {!modoStream && mostrarPodio && (
        <PodioPrimerLugar
          lideres={lideres}
          finalizada={finalizada}
          premioPorNombre={premioPorNombre}
          conPremio={conPremio}
        />
      )}
      {/* Tabla ranking */}
      <div className="ranking-panel ranking-table-panel">
        {enVivo && !modoStream && (
          <div className="ranking-live-strip">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>Ranking provisional</span>
          </div>
        )}

        {/* Buscador: solo cuando hay suficientes participantes */}
        {mostrarBuscador && (
          <div className="ranking-search-bar">
            <input
              type="text"
              placeholder={`Buscar entre ${jugadores.length} participantes...`}
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setVisibles(PAGE_SIZE) }}
              style={{ width: '100%', fontSize: 13, padding: '8px 12px' }}
              aria-label="Buscar nombre en el ranking"
            />
          </div>
        )}

        {vistaParticipantesAbierta ? (
          <div className="ranking-panel-header ranking-participants-header">
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
              Participantes
            </span>
            <span className="ranking-participants-actions">
              <button
                type="button"
                onClick={() => setMostrarInfoPicks(v => !v)}
                aria-expanded={mostrarInfoPicks}
                className={`ranking-picks-info${mostrarInfoPicks ? ' is-active' : ''}`}
              >
                <SvgIcon name="lock" size={12} />
                Picks ocultos
              </button>
              <button
                type="button"
                className="ranking-participants-invite"
                onClick={handleCompartirRanking}
                disabled={compartiendo || !puedeCompartir}
                aria-label={compartirLabel}
              >
                <SvgIcon name="users" size={13} />
                {compartiendo ? 'Generando...' : 'Invitar'}
              </button>
            </span>
          </div>
        ) : (
          <div className="ranking-table-head" style={{ display: 'grid', gridTemplateColumns: 'var(--ranking-grid-cols, 30px 1fr 38px 38px 46px)' }}>
            {[
              { key: '#', label: '#' },
              { key: 'Jugador', label: 'Jugador' },
              { key: 'Aciertos', icon: 'check', title: 'Aciertos', color: 'var(--green)' },
              { key: 'Exactos', icon: 'target', title: 'Marcadores exactos', color: 'var(--yellow)' },
              { key: 'Pts', label: 'Pts' },
            ].map((h, idx) => (
              <span key={h.key} title={h.title} style={{ fontSize: h.icon ? 12 : 10, color: h.color || 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left', whiteSpace: 'nowrap', display: h.icon ? 'flex' : 'inline', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {h.icon ? <SvgIcon name={h.icon} size={13} /> : h.label}
              </span>
            ))}
          </div>
        )}

        {vistaParticipantesAbierta && mostrarInfoPicks && (
          <div className="ranking-table-note">
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Las predicciones se revelan cuando cierre la quiniela. Mientras tanto, solo puedes ver quién ya está dentro.
            </p>
          </div>
        )}

        {jugadores.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Nadie ha registrado predicciones todavía.
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Sin resultados para "<strong style={{ color: 'var(--text)' }}>{busqueda}</strong>". Verifica el nombre o limpia la búsqueda.
          </div>
        ) : vistaParticipantesAbierta ? shown.map((j, i) => {
          const esMiFila = !!miNombreRanking && j.nombre === miNombreRanking
          return (
          <div key={j.nombre} style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className={`ranking-participant-row${esMiFila ? ' is-you' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                <span aria-hidden="true" style={{
                  width: 29, height: 29, borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
                  color: 'var(--green-light)', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2,
                }}>
                  {inicialesPersona(j.nombre)}
                </span>
                <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: esMiFila ? 650 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{j.nombre}</span>
                  {esMiFila && (
                    <span style={{
                      flexShrink: 0, border: '1px solid rgba(34,197,94,0.42)', background: 'rgba(34,197,94,0.11)',
                      color: 'var(--green)', borderRadius: 999, padding: '1px 6px 2px',
                      fontSize: 10, fontWeight: 900, lineHeight: 1.2, letterSpacing: 0,
                    }}>
                      Tú
                    </span>
                  )}
                </span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <SvgIcon name="check" size={12} />
                Dentro
              </span>
            </div>
          </div>
          )
        }) : (() => {
          const zonaPremioIdxs = shown.reduce((acc, p, idx) => {
            if (hayResultados && premioPorNombre[p.nombre] !== undefined) acc.push(idx)
            return acc
          }, [])
          const zonaPremioInicioIdx = zonaPremioIdxs.length ? zonaPremioIdxs[0] : -1
          const zonaPremioFinIdx = zonaPremioIdxs.length ? zonaPremioIdxs[zonaPremioIdxs.length - 1] : -1

          const renderRow = (j, i) => {
          const abierto = expandido.has(j.nombre)
          const pos = j._pos
          const esLider = pos === 1 && rankingConPuntos
          const esMiFila = !!miNombreRanking && j.nombre === miNombreRanking
          // Una quiniela sin puntos todavía (todos en cero) no tiene posiciones
          // reales: mostramos una línea en vez de declarar un empate en 1°.
          const posicionVisible = rankingConPuntos ? pos : '-'
          const medalColor = rankingConPuntos && pos <= 3 ? medalColors[pos - 1] : null
          const tienePremioFila = hayResultados && premioPorNombre[j.nombre] !== undefined
          const esInicioZonaPremio = tienePremioFila && !shown.slice(0, i).some(p => premioPorNombre[p.nombre] !== undefined)
          const nombreDetalle = String(j.nombre || '').trim().split(/\s+/)[0] || nombreCorto(j.nombre)

          return (
            <div
              key={j.nombre}
              className={`ranking-player-shell${esLider ? ' is-leader' : ''}${tienePremioFila ? ' has-prize' : ''}`}
              style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              {esInicioZonaPremio && (
                <div className="ranking-prize-zone-row">
                  <span className="ranking-prize-zone-title">
                    <SvgIcon name="trophy" size={12} />
                    {finalizada
                      ? (zonaPremioIdxs.length > 1 ? 'Ganadores' : 'Ganador')
                      : 'En zona de premio'}
                  </span>
                  {premioZonaLabel && <span className="ranking-prize-zone-amount">{premioZonaLabel}</span>}
                </div>
              )}
              <div
                className={`ranking-player-row${esLider ? ' is-leader' : ''}${esMiFila ? ' is-you' : ''}${tienePremioFila ? ' has-prize' : ''}`}
                onClick={() => {
                  if (!cerrada) return
                  // Analítica: registrar que abrieron las predicciones de este
                  // participante (solo al abrir, una vez por sesión y participante).
                  if (!abierto) registrarApertura(quiniela?.id, j.id)
                  toggleExpandido(j.nombre)
                }}
                style={{
                  position: 'relative', overflow: 'hidden',
                  display: 'grid', gridTemplateColumns: 'var(--ranking-grid-cols, 30px 1fr 38px 38px 46px)',
                  padding: 'var(--ranking-row-pad-y, 15px) var(--ranking-row-pad-x, 16px)', alignItems: 'center',
                  cursor: cerrada ? 'pointer' : 'default',
                }}
              >
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%' }}>
                  <span style={{
                    fontSize: 14, fontWeight: esLider ? 800 : 700,
                    color: medalColor || 'var(--muted)',
                    textShadow: esLider ? '0 0 10px rgba(250,204,21,0.55), 0 1px 1px rgba(0,0,0,0.3)' : 'none',
                  }}>{posicionVisible}</span>
                </span>
                <div style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="ranking-player-avatar" aria-hidden="true">{inicialesPersona(j.nombre)}</span>
                  <span style={{ fontSize: 'var(--ranking-name-size, 13px)', fontWeight: esLider || esMiFila ? 700 : 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{nombresCortos.get(j.nombre) || nombreCorto(j.nombre)}</span>
                    {esMiFila && (
                      <span style={{
                        flexShrink: 0, border: '1px solid rgba(34,197,94,0.42)', background: 'rgba(34,197,94,0.11)',
                        color: 'var(--green)', borderRadius: 999, padding: '1px 6px 2px',
                        fontSize: 10, fontWeight: 900, lineHeight: 1.2, letterSpacing: 0,
                      }}>
                        Tú
                      </span>
                    )}
                    {j.racha.exactas >= 3 ? (
                      <span title={`Racha de ${j.racha.exactas} marcadores exactos seguidos`} aria-label="Racha de marcadores exactos" style={{ display: 'inline-flex', color: 'var(--yellow)', flexShrink: 0 }}>
                        <SvgIcon name="target" size={14} />
                      </span>
                    ) : j.racha.correctas >= 3 ? (
                      <span title={`Racha de ${j.racha.correctas} resultados correctos seguidos`} aria-label={`Racha de ${j.racha.correctas} resultados correctos seguidos`} style={{ display: 'inline-flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                        <span aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
                          <span style={{
                            position: 'absolute', width: 20, height: 20, borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(255,200,90,0.75) 0%, rgba(249,115,22,0.4) 45%, transparent 72%)',
                            filter: 'blur(2px)',
                            animation: 'flame-glow 2.2s ease-in-out infinite',
                          }} />
                          <span style={{ position: 'relative', fontSize: 13, lineHeight: 1, display: 'inline-block', animation: 'flame-pulse 2.2s ease-in-out infinite' }}>
                            🔥
                          </span>
                        </span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: 'var(--yellow)', marginLeft: 1 }}>{j.racha.correctas}</span>
                      </span>
                    ) : null}
                    {(badgesPorNombre[j.nombre] ?? []).map(b => (
                      <span
                        key={b}
                        className="ranking-jornada-badge"
                        title={b === 'remontada' ? 'Remontada de la jornada: quien más posiciones escaló al final' : 'Francotirador: más marcadores exactos de la jornada'}
                      >
                        <span aria-hidden="true">{b === 'remontada' ? '\u{1F4C8}' : '\u{1F3AF}'}</span>
                        <span className="ranking-jornada-badge-label">{b === 'remontada' ? 'Remontada' : 'Francotirador'}</span>
                      </span>
                    ))}
                    {cerrada && (
                      <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    )}
                  </span>
                </div>
                <span style={{ position: 'relative', fontSize: 'var(--ranking-stat-cell-size, 13px)', color: 'var(--muted)', textAlign: 'center' }}>{j.aciertos}</span>
                <span style={{ position: 'relative', fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-exact-size, 13px)', textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                <div style={{ position: 'relative', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-points-size, 18px)', fontWeight: 700, color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
                </div>
              </div>

              {cerrada && montado.has(j.nombre) && (
                <div
                  className="ranking-player-detail-wrap"
                  aria-hidden={!abierto}
                  style={{
                    display: 'grid',
                    gridTemplateRows: abierto ? '1fr' : '0fr',
                    opacity: abierto ? 1 : 0,
                    transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease',
                  }}
                >
                <div style={{ overflow: 'hidden' }}>
                <div className="ranking-player-detail-panel">
                  <div className="ranking-picks-grid ranking-picks-head">
                    <span className="ranking-picks-title">Predicciones de {nombreDetalle}</span>
                    <span className="ranking-picks-col">Pick</span>
                    <span className="ranking-picks-col">Real</span>
                    <span className="ranking-picks-col">Pts</span>
                  </div>
                  {partidos.map((partido, pi) => {
                    const pick      = j.picks?.[pi] ?? j.picks?.[String(pi)]
                    const res       = getEfectivo(partido, pi, resultados, liveScores)
                    const cancelado = !!res?.cancelado
                    const resR      = cancelado ? null : getResultado(res)
                    const pickR     = getPickResultado(pick)
                    const correcto  = !cancelado && resR && pickR && resR === pickR
                    const exacto    = correcto && typeof pick === 'object' && pick !== null &&
                                      String(res.local) === String(pick.local) &&
                                      String(res.visitante) === String(pick.visitante)
                    const pts       = cancelado ? null : !resR ? null : exacto ? 3 : correcto ? 1 : 0
                    // Punto rojo parpadeante junto al marcador mientras ESE partido está en vivo.
                    const enVivoPartido = !cancelado && partido.espnId && liveScores?.[partido.espnId]?.state === 'in'
                    const estadoPick = cancelado
                      ? 'is-null'
                      : !resR
                        ? 'is-pending'
                        : exacto
                          ? 'is-exact'
                          : correcto
                            ? 'is-correct'
                            : 'is-wrong'
                    return (
                      <div key={pi} className={`ranking-picks-grid ranking-pick-row ${estadoPick}`}>
                        <span className="ranking-pick-match">
                          {partido.local} vs {partido.visitante}
                        </span>
                        <span className="ranking-pick-score">
                          {pickDisplay(pick)}
                        </span>
                        <span className={`ranking-pick-real${enVivoPartido ? ' is-live' : ''}${correcto || exacto ? ' is-correct' : ''}${pts === 0 ? ' is-wrong' : ''}${cancelado ? ' is-null' : ''}`}>
                          {/* Punto siempre presente (oculto si no hay partido en vivo) para que el ancho de la columna no cambie entre filas */}
                          <span className="ranking-pick-live-dot" style={{ opacity: enVivoPartido ? 1 : 0, animation: enVivoPartido ? 'pulse-dot 1.2s ease-in-out infinite' : 'none' }} />
                          {cancelado ? 'Nulo' : res ? `${res.local}-${res.visitante}` : '-'}
                        </span>
                        <span className={`ranking-pick-points${pts === 3 ? ' is-exact' : ''}${pts === 1 ? ' is-correct' : ''}${pts === 0 ? ' is-wrong' : ''}`}>
                          {cancelado ? '-' : pts === null ? '-' : pts === 0 ? '0' : `+${pts}`}
                        </span>
                      </div>
                    )
                  })}
                  <div className="ranking-picks-total">
                    <span>Total</span>
                    <strong>{j.puntos} {j.puntos === 1 ? 'pt' : 'pts'}</strong>
                  </div>
                </div>
                </div>
                </div>
              )}
            </div>
          )
          }

          if (zonaPremioInicioIdx === -1) return shown.map(renderRow)

          return [
            ...shown.slice(0, zonaPremioInicioIdx).map(renderRow),
            <div key="zona-premio-shine-wrap" className="ranking-prize-zone-shine-wrap">
              {shown.slice(zonaPremioInicioIdx, zonaPremioFinIdx + 1).map((j, i) => renderRow(j, zonaPremioInicioIdx + i))}
            </div>,
            ...shown.slice(zonaPremioFinIdx + 1).map((j, i) => renderRow(j, zonaPremioFinIdx + 1 + i)),
          ]
        })()}

        {!cerrada && !vistaParticipantesAbierta && jugadores.length > 0 && (
          <div style={{ padding: '10px 16px', background: 'var(--yellow-bg)', borderTop: '1px solid var(--yellow-soft)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--yellow-soft)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <SvgIcon name="lock" size={13} />
              Las predicciones de cada jugador se revelan al cierre de la quiniela
            </div>
            {quiniela.cierre && (
              <div style={{ fontSize: 12, color: 'var(--yellow-soft)', fontWeight: 700, marginTop: 4 }}>
                {formatFecha(quiniela.cierre)}
              </div>
            )}
          </div>
        )}

        {restantes > 0 && (
          <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setVisibles(v => v + PAGE_SIZE)}
              style={{ background: 'var(--card-light)', border: '1px solid var(--border-strong)', color: 'var(--muted)', padding: '8px 20px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Ver más ({restantes} restante{restantes !== 1 ? 's' : ''})
            </button>
          </div>
        )}
      </div>

      {!modoStream && !vistaParticipantesAbierta && <div className="ranking-share-action-wrap">
        <button
          type="button"
          className="ranking-share-action"
          onClick={handleCompartirRanking}
          disabled={compartiendo || !puedeCompartir}
          aria-label={compartirLabel}
        >
          <span className="ranking-share-action-icon" aria-hidden="true">
            <SvgIcon name={compartirIcon} size={13} />
          </span>
          <span>{compartiendo ? 'Generando...' : compartirLabel}</span>
        </button>
        {(compartiendo || feedbackShare) && (
          <p className="ranking-share-status" role="status">
            {compartiendo ? 'Generando imagen para compartir...' : feedbackShare}
          </p>
        )}
      </div>}
      {!modoStream && vistaParticipantesAbierta && (compartiendo || feedbackShare) && (
        <p className="ranking-share-status" role="status">
          {compartiendo ? 'Generando imagen para compartir...' : feedbackShare}
        </p>
      )}
      {/* En escritorio los comentarios cierran la columna del ranking y se
          muestran abiertos: ya no hay que desplegar el acordeón. */}
      {!modoStream && layoutEscritorio && <ComentariosQuiniela quiniela={quiniela} abiertoPorDefecto />}
      </div>
      </div>

      {layoutEscritorio && idxColumna != null && partidos[idxColumna] && (
        <ColumnaPartido
          quiniela={quiniela}
          idx={idxColumna}
          partido={partidos[idxColumna]}
          estado={estadosPartidos[idxColumna]}
          st={liveStats[partidos[idxColumna]?.espnId]}
          eventos={liveEventos[partidos[idxColumna]?.espnId] ?? []}
          penales={livePenales[partidos[idxColumna]?.espnId] ?? []}
          miPick={misPicks?.[idxColumna] ?? misPicks?.[String(idxColumna)]}
          puedeVerStream={puedeVerStream}
          ahora={ahora}
        />
      )}
      </div>
    </>
  )
}

// Acorta un nombre a sus dos primeros tokens (en una quiniela familiar el
// nombre distingue mejor que el apellido). "Juan José Verduzco" → "Juan José".
function nombreCorto(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2).join(' ')
}

function inicialesPersona(nombre) {
  const tokens = String(nombre || '').trim().split(/[\s-]+/).filter(Boolean)
  if (tokens.length === 0) return '?'
  const base = tokens.length > 1 ? [tokens[0], tokens[tokens.length - 1]] : [tokens[0]]
  return base.map(t => t[0]).join('').slice(0, 2).toLocaleUpperCase('es-MX')
}

// Abrevia cada nombre a 2 tokens, pero si dos jugadores quedarían con el mismo
// nombre corto, les agrega tokens (3°, 4°…) hasta distinguirlos. Devuelve un
// Map de nombre completo → nombre a mostrar en la fila colapsada.
function abreviarNombres(nombres) {
  const partes = nombres.map(n => ({ full: n, toks: String(n || '').trim().split(/\s+/).filter(Boolean) }))
  const corto = (toks, k) => toks.slice(0, k).join(' ')
  const map = new Map()
  for (const p of partes) {
    let k = 2
    while (k < 6 && partes.some(o => o.full !== p.full &&
      corto(o.toks, k).toLowerCase() === corto(p.toks, k).toLowerCase())) {
      k++
    }
    map.set(p.full, corto(p.toks, k))
  }
  return map
}

// Marcador de un pick con espacios ("2 - 1"), o su etiqueta si el pick es
// solo ganador/empate.
function pickTexto(pick) {
  if (!pick) return ''
  if (typeof pick === 'object') return `${pick.local ?? '?'} - ${pick.visitante ?? '?'}`
  return { home: 'Local', draw: 'Empate', away: 'Visitante' }[pick] ?? String(pick)
}

function textoJugadorEvento(evento) {
  if (evento?.tipo !== 'substitution') {
    return `${evento?.jugador ?? ''}${evento?.ownGoal ? ' (a.g.)' : ''}`
  }
  const entra = evento.entra || evento.jugador || ''
  return evento.sale ? `↑ ${entra} · ↓ ${evento.sale}` : entra
}

const ETIQUETA_EVENTO = {
  goal: 'Gol',
  'yellow-card': 'Tarjeta amarilla',
  'red-card': 'Tarjeta roja',
  substitution: 'Cambio',
}

// ---------------------------------------------------------------------------
// Escritorio: carrusel de partidos bajo el header
// ---------------------------------------------------------------------------
// Franja horizontal de tarjetas, una por partido. Se mueve solo con las flechas
// (sin barra de desplazamiento) y al hacer clic en una tarjeta ese partido pasa
// a la columna de la derecha.
function CarruselPartidos({ partidos, estados, cerrada, misPicks, seleccionado, onSeleccionar }) {
  const trackRef = useRef(null)
  const [extremos, setExtremos] = useState({ inicio: true, fin: false })

  // Las flechas se apagan en los extremos para no ofrecer un movimiento que no
  // va a pasar. 500px ≈ dos tarjetas.
  const revisarExtremos = () => {
    const el = trackRef.current
    if (!el) return
    setExtremos({
      inicio: el.scrollLeft <= 1,
      fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }
  useEffect(() => {
    revisarExtremos()
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', revisarExtremos, { passive: true })
    return () => el.removeEventListener('scroll', revisarExtremos)
  }, [partidos.length])

  const desplazar = (dir) => trackRef.current?.scrollBy({ left: dir * 500, behavior: 'smooth' })

  // El partido que se está viendo a la derecha se centra en la franja: si no,
  // en una quiniela de 12 partidos la tarjeta marcada queda fuera de pantalla
  // y no se entiende de dónde sale la columna.
  const primerCentrado = useRef(true)
  useEffect(() => {
    const centrar = () => {
      const track = trackRef.current
      const tarjeta = track?.children?.[seleccionado]
      if (!track || !tarjeta) return
      const destino = tarjeta.offsetLeft - (track.clientWidth - tarjeta.clientWidth) / 2
      // `instant` es a propósito: el track lleva `scroll-behavior: smooth` en
      // CSS y una animación en el primer render se cancela con el siguiente
      // repintado, dejando la franja de vuelta en el primer partido.
      track.scrollTo({
        left: Math.max(0, destino),
        behavior: primerCentrado.current ? 'instant' : 'smooth',
      })
    }
    if (!primerCentrado.current) { centrar(); return }
    // La primera vez esperamos a que los escudos carguen: con
    // `scroll-snap-type: mandatory` el navegador reajusta la posición cuando
    // el contenido cambia de tamaño.
    const frame = requestAnimationFrame(centrar)
    const timer = setTimeout(() => { centrar(); primerCentrado.current = false }, 350)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [seleccionado])

  const jugados = estados.filter(e => e.jugado).length
  const enVivo  = estados.filter(e => e.esVivo).length
  const resumen = [
    `${partidos.length} en total`,
    `${jugados} jugado${jugados === 1 ? '' : 's'}`,
    enVivo > 0 ? `${enVivo} en vivo` : null,
  ].filter(Boolean).join(' · ')

  return (
    <section className="rk-carousel" aria-label="Partidos de la quiniela">
      <div className="rk-carousel-head">
        <span className="rk-carousel-title">
          <h2>Partidos</h2>
          <small>{resumen}</small>
        </span>
        <span className="rk-carousel-nav">
          <button
            type="button"
            className="rk-carousel-arrow"
            onClick={() => desplazar(-1)}
            disabled={extremos.inicio}
            aria-label="Ver partidos anteriores"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="rk-carousel-arrow"
            onClick={() => desplazar(1)}
            disabled={extremos.fin}
            aria-label="Ver más partidos"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </span>
      </div>
      <div className="rk-carousel-track" ref={trackRef}>
        {partidos.map((p, i) => {
          const e = estados[i]
          const pick = misPicks?.[i] ?? misPicks?.[String(i)]
          return (
            <button
              key={i}
              type="button"
              className={`rk-match-card${e.esVivo ? ' is-live' : ''}${seleccionado === i ? ' is-selected' : ''}`}
              onClick={() => onSeleccionar(i)}
              aria-pressed={seleccionado === i}
            >
              <span className="rk-match-card-top">
                <span className="rk-match-card-date">{p.hora ? formatFechaDestacada(p.hora) : 'Horario por confirmar'}</span>
                {badgePartido(e, !cerrada && e.pendiente)}
              </span>
              <span className="rk-match-card-teams">
                <span className="rk-match-card-side">
                  <span className="rk-match-card-crest">
                    <EscudoEquipo url={p.escudoLocal} nombre={p.local} plano />
                  </span>
                  <span className="rk-match-card-team">{p.local}</span>
                </span>
                {e.marcadorVisible ? (
                  <span className="rk-match-card-score">{e.scoreLocal} - {e.scoreVisitante}</span>
                ) : (
                  <span className="rk-match-card-vs">VS</span>
                )}
                <span className="rk-match-card-side">
                  <span className="rk-match-card-crest">
                    <EscudoEquipo url={p.escudoVisitante} nombre={p.visitante} plano />
                  </span>
                  <span className="rk-match-card-team">{p.visitante}</span>
                </span>
              </span>
              <span className="rk-match-card-foot">
                <span className="rk-match-card-mine">
                  {pick ? <>Tu pronóstico <strong>{pickTexto(pick)}</strong></> : 'Sin pronóstico'}
                </span>
                {e.esVivo && (
                  <span className="rk-match-card-cta">
                    <SvgIcon name="broadcast" size={12} />
                    Ver en vivo
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Escritorio: columna del partido (transmisión, marcador, estadísticas, eventos)
// ---------------------------------------------------------------------------
export function ColumnaPartido({
  quiniela, idx, partido, estado, st, eventos, penales,
  miPick, puedeVerStream, ahora,
}) {
  // Quien monta este componente ya garantizó que el partido existe: no hay
  // salida temprana porque abajo se usan hooks.
  const p = partido
  const e = estado

  const hayFuentes = obtenerStreamFuentes(p).length > 0
  const mostrarPlayer = puedeVerStream && hayFuentes && streamDisponibleAhora(quiniela, idx, ahora)

  // ESPN solo devuelve estadísticas y eventos mientras el partido sigue en la
  // ventana del scoreboard (un par de días). Pasado eso los leemos del archivo
  // que dejó la Cloud Function al terminar el partido, para que una quiniela
  // vieja no se quede en blanco.
  const statsEnVivo = !!st && st.state !== 'pre'
  // En un partido terminado también necesitamos el documento archivado para
  // leer el respaldo de YouTube, aunque ESPN todavía conserve estadísticas.
  const necesitaDetalle = e.jugado && !e.cancelado
  const { detalle } = useDetallePartido(quiniela?.id, idx, necesitaDetalle)
  const fichaEnVivo = useFichaPartido(
    p,
    !!p.espnId && !e.cancelado,
    !e.jugado
  )
  const stats = statsEnVivo ? st : (detalle?.stats ? { state: 'post', ...detalle.stats } : null)
  const hayStats = !!stats
  const posH = hayStats ? parseFloat(stats.home.posesion) || 50 : 50
  const contexto = detalle?.contexto ?? fichaEnVivo?.contexto ?? null
  const alineaciones = detalle?.alineaciones ?? fichaEnVivo?.alineaciones ?? null
  const contextoItems = [
    contexto?.estadio && contexto?.ciudad
      ? `${contexto.estadio} · ${contexto.ciudad}`
      : contexto?.estadio || contexto?.ciudad,
    contexto?.arbitro ? `Árbitro: ${contexto.arbitro}` : '',
  ].filter(Boolean)
  const estadisticasPrincipales = hayStats ? [
    { label: 'Tiros al arco', h: stats.home.tirosArco, a: stats.away.tirosArco },
    { label: 'Tiros totales', h: stats.home.tirosTotales, a: stats.away.tirosTotales },
    { label: 'Corners', h: stats.home.corners, a: stats.away.corners },
    { label: 'Faltas', h: stats.home.faltas, a: stats.away.faltas },
  ].filter(f => valorEstadisticaDisponible(f.h) && valorEstadisticaDisponible(f.a)) : []
  const estadisticasExtra = hayStats ? [
    { label: 'Atajadas', h: stats.home.atajadas, a: stats.away.atajadas },
    { label: 'Fueras de juego', h: stats.home.fuerasJuego, a: stats.away.fuerasJuego },
    {
      label: 'Precisión de pases',
      h: precisionPases(stats.home.pasesAcertados, stats.home.pasesTotales),
      a: precisionPases(stats.away.pasesAcertados, stats.away.pasesTotales),
    },
    {
      label: 'Tarjetas',
      h: <TarjetasValor amarillas={stats.home.amarillas} rojas={stats.home.rojas} />,
      a: <TarjetasValor amarillas={stats.away.amarillas} rojas={stats.away.rojas} />,
      disponible: valorEstadisticaDisponible(stats.home.amarillas) &&
        valorEstadisticaDisponible(stats.away.amarillas) &&
        valorEstadisticaDisponible(stats.home.rojas) &&
        valorEstadisticaDisponible(stats.away.rojas),
    },
    { label: 'Entradas', h: stats.home.entradas, a: stats.away.entradas },
    { label: 'Intercepciones', h: stats.home.intercepciones, a: stats.away.intercepciones },
    { label: 'Despejes', h: stats.home.despejes, a: stats.away.despejes },
  ].filter(f => f.disponible ?? (
    valorEstadisticaDisponible(f.h) && valorEstadisticaDisponible(f.a)
  )) : []
  const eventosFuente = combinarEventosPartido(
    eventos,
    fichaEnVivo?.eventos ?? [],
    detalle?.eventos ?? []
  )
  const eventosNormales = eventosFuente.filter(ev => !ev.penalShootout)
  const penalesFuente = penales.length > 0 ? penales : (detalle?.penales ?? [])
  const penalesRondas = (() => {
    const porRonda = {}
    penalesFuente.forEach(k => { (porRonda[k.orden] ||= {})[k.lado] = k })
    return Object.keys(porRonda).map(Number).sort((a, b) => a - b)
      .map(n => ({ orden: n, home: porRonda[n].home, away: porRonda[n].away }))
  })()
  // Un partido terminado no necesita un bloque que diga que terminó: el
  // marcador ya lo cuenta. El resto de los casos (por comenzar, sin señal,
  // sin permiso) sí necesitan explicar por qué no hay video.
  const mostrarStandby = !mostrarPlayer && !e.jugado
  // Todo partido terminado reserva este espacio arriba del marcador. Primero
  // se intenta el clip de ESPN; si no hay, se usa el respaldo de YouTube y,
  // como último recurso, una portada del partido que conserva el marco 16/9.
  const mostrarResumen = e.jugado && !e.cancelado
  const { cargando: buscandoResumen, resumen } = useResumenPartido(p, mostrarResumen)
  const youtube = detalle?.resumenYoutube
  const claveResumen = `${p.ligaId ?? ''}:${p.espnId ?? ''}`
  const [resumenFallido, setResumenFallido] = useState('')
  const [masStatsAbiertas, setMasStatsAbiertas] = useState(false)
  const [alineacionesAbiertas, setAlineacionesAbiertas] = useState(false)
  const hayVideoResumen = mostrarResumen && !!resumen?.mp4 && resumenFallido !== claveResumen
  const hayVideoYoutube = mostrarResumen && !hayVideoResumen && !buscandoResumen && !!youtube?.videoId
  const hayAlgunVideo = hayVideoResumen || hayVideoYoutube

  // Etiqueta del minuto/estado a la derecha del panel de marcador.
  const etiquetaMomento = e.esVivo
    ? (e.live.penalesEnVivo ? 'Penales' : e.live.halftime ? 'Descanso' : e.live.clock || 'En vivo')
    : e.cancelado ? 'Cancelado'
    : e.jugado ? 'Final'
    : 'Por jugarse'

  // Tu pronóstico contra lo que va pasando en la cancha.
  const notaPick = (() => {
    if (!miPick || !e.marcadorVisible || e.cancelado) return ''
    const resR = goalsToResultado(e.scoreLocal, e.scoreVisitante)
    const pickR = getPickResultado(miPick)
    if (!resR || !pickR) return ''
    const exacto = typeof miPick === 'object' && miPick !== null &&
      String(e.scoreLocal) === String(miPick.local) &&
      String(e.scoreVisitante) === String(miPick.visitante)
    if (exacto) return e.jugado ? 'Marcador exacto · +3' : 'Vas con el marcador exacto'
    if (resR === pickR) return e.jugado ? 'Resultado correcto · +1' : 'Vas ganando este'
    return e.jugado ? 'Sin puntos' : 'Vas perdiendo este'
  })()
  const pickAcertado = /exacto|correcto|ganando/i.test(notaPick)

  return (
    <section className="rk-body-live ranking-live-column" aria-label={`Detalle de ${p.local} vs ${p.visitante}`}>
      <div className="rk-live-head">
        <span className="rk-live-head-copy">
          <h2>{p.local} vs {p.visitante}</h2>
          {p.hora && <p>{formatFechaDestacada(p.hora)}</p>}
          {contextoItems.length > 0 && (
            <span className="rk-live-context">
              {contextoItems.map(item => <span key={item}>{item}</span>)}
            </span>
          )}
        </span>
        {e.esVivo && (
          <span className="rk-live-head-tag">
            <span className="rk-dot" aria-hidden="true" />
            EN VIVO
          </span>
        )}
      </div>

      {mostrarPlayer && (
        <RankingLivePlayer key={idx} quinielaId={quiniela.id} partidoIdx={idx} partido={p} />
      )}
      {hayVideoResumen && (
        <ResumenPartido
          key={claveResumen}
          partido={p}
          resumen={resumen}
          onError={() => setResumenFallido(claveResumen)}
        />
      )}
      {hayVideoYoutube && <ResumenYoutube partido={p} video={youtube} />}
      {mostrarResumen && !hayAlgunVideo && (
        <PortadaResumenPartido
          partido={p}
          estado={e}
          buscando={buscandoResumen}
        />
      )}
      {mostrarStandby && (
        <ColumnaPartidoSinVideo
          partido={p}
          estado={e}
          puedeVerStream={puedeVerStream}
          hayFuentes={hayFuentes}
          ahora={ahora}
        />
      )}

      <div className="rk-live-details">
        <div className="rk-live-panel">
          <div className="rk-live-panel-head">
            <span>Marcador y estadísticas</span>
            <span className={e.esVivo ? 'is-live' : ''}>{etiquetaMomento}</span>
          </div>
          <div className="rk-live-panel-body">
            <div className="rk-live-scoreboard-stats">
              <div>
                <div className="rk-live-scoreboard">
                  <span className="rk-live-scoreboard-side">
                    <span className="rk-live-scoreboard-crest">
                      <EscudoEquipo url={p.escudoLocal} nombre={p.local} plano />
                    </span>
                    <span className="rk-live-scoreboard-team">{p.local}</span>
                  </span>
                  <span className="rk-live-scoreboard-score">
                    <strong>{e.marcadorVisible ? `${e.scoreLocal} - ${e.scoreVisitante}` : 'VS'}</strong>
                    {e.esVivo && <span>{etiquetaMomento}</span>}
                  </span>
                  <span className="rk-live-scoreboard-side">
                    <span className="rk-live-scoreboard-crest">
                      <EscudoEquipo url={p.escudoVisitante} nombre={p.visitante} plano />
                    </span>
                    <span className="rk-live-scoreboard-team">{p.visitante}</span>
                  </span>
                </div>
                {miPick && (
                  <div className={`rk-live-mine${pickAcertado ? ' is-correct' : ''}`}>
                    <span className="rk-live-mine-label">Tu pronóstico</span>
                    <span className="rk-live-mine-value">{pickTexto(miPick)}</span>
                    {notaPick && <span className="rk-live-mine-note">{notaPick}</span>}
                  </div>
                )}
              </div>
              {hayStats ? (
                <div className="ranking-live-stats">
                  {valorEstadisticaDisponible(stats.home.posesion) &&
                    valorEstadisticaDisponible(stats.away.posesion) && (
                    <>
                      <div className="ranking-match-stat-line is-possession">
                        <span className="ranking-match-stat-value is-home">{stats.home.posesion}%</span>
                        <span className="ranking-match-stat-label">Posesión</span>
                        <span className="ranking-match-stat-value is-away">{stats.away.posesion}%</span>
                      </div>
                      <div className="ranking-match-possession-bar">
                        <span style={{ width: `${posH}%` }} />
                      </div>
                    </>
                  )}
                  {estadisticasPrincipales.map(({ label, h, a }) => (
                    <div key={label} className="ranking-match-stat-line">
                      <span className="ranking-match-stat-value is-home">{h}</span>
                      <span className="ranking-match-stat-label">{label}</span>
                      <span className="ranking-match-stat-value is-away">{a}</span>
                    </div>
                  ))}
                  {estadisticasExtra.length > 0 && (
                    <div className={`rk-live-more-stats${masStatsAbiertas ? ' is-open' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setMasStatsAbiertas(v => !v)}
                        aria-expanded={masStatsAbiertas}
                      >
                        Más estadísticas
                      </button>
                      <div className="rk-live-more-stats-collapse" aria-hidden={!masStatsAbiertas}>
                        <div>
                          {estadisticasExtra.map(({ label, h, a }) => (
                            <div key={label} className="ranking-match-stat-line">
                              <span className="ranking-match-stat-value is-home">{h}</span>
                              <span className="ranking-match-stat-label">{label}</span>
                              <span className="ranking-match-stat-value is-away">{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : e.jugado ? null : (
                <p className="rk-live-stats-empty">
                  Las estadísticas aparecerán cuando arranque; las alineaciones,
                  en cuanto sean publicadas.
                </p>
              )}
            </div>
          </div>
        </div>

        {alineaciones?.home?.titulares?.length >= 11 &&
          alineaciones?.away?.titulares?.length >= 11 && (
          <div className={`rk-live-panel rk-live-lineups${alineacionesAbiertas ? ' is-open' : ''}`}>
            <button
              type="button"
              className="rk-live-panel-head"
              onClick={() => setAlineacionesAbiertas(v => !v)}
              aria-expanded={alineacionesAbiertas}
            >
              <span>Alineaciones</span>
              <span className="rk-live-panel-chevron" aria-hidden="true" />
            </button>
            <div className="rk-live-lineups-collapse" aria-hidden={!alineacionesAbiertas}>
              <div>
                <div className="rk-live-panel-body">
                  <div className="rk-live-lineups-grid">
                    {[
                      { lado: 'home', nombre: p.local },
                      { lado: 'away', nombre: p.visitante },
                    ].map(({ lado, nombre }) => {
                      const equipo = alineaciones[lado]
                      return (
                        <section key={lado} className="rk-live-lineup-team">
                          <header>
                            <strong>{nombre}</strong>
                            {equipo.formacion && <span>{equipo.formacion}</span>}
                          </header>
                          <ol>
                            {equipo.titulares.map((jugador, j) => (
                              <li key={`${jugador.nombre}-${j}`}>
                                <span>{jugador.dorsal || ''}</span>
                                <strong>{jugador.corto || jugador.nombre}</strong>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(eventosNormales.length > 0 || penalesRondas.length > 0) && (
          <div className="rk-live-panel">
            <div className="rk-live-panel-head">
              <span>Eventos del partido</span>
            </div>
            <div className="rk-live-panel-body">
              <div className="rk-live-events">
                {[...eventosNormales].reverse().map((ev, j) => (
                  <div key={j} className="rk-live-event">
                    <span className="rk-live-event-min">{ev.minuto}</span>
                    <span className={`rk-live-event-icon ranking-match-event-icon is-${ev.tipo || 'default'}`}>
                      <SvgIcon name={ev.tipo || 'dot'} size={14} />
                    </span>
                    <span className="rk-live-event-copy">
                      <strong className={ev.tipo === 'substitution' ? 'is-sub-in' : ''}>
                        {ev.tipo === 'substitution'
                          ? `Entra · ${ev.entra || ev.jugador || 'Sin identificar'}`
                          : ev.jugador}
                      </strong>
                      <span className={ev.tipo === 'substitution' ? 'is-sub-out' : ''}>
                        {ev.tipo === 'substitution'
                          ? (ev.sale ? `Sale · ${ev.sale}` : 'Cambio')
                          : `${ETIQUETA_EVENTO[ev.tipo] ?? 'Jugada'}${ev.ownGoal ? ' en propia puerta' : ''}`}
                      </span>
                      {ev.lado && (
                        <span className="rk-live-event-team">
                          <EscudoEquipo
                            url={ev.lado === 'home' ? p.escudoLocal : p.escudoVisitante}
                            nombre={ev.lado === 'home' ? p.local : p.visitante}
                            plano
                          />
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {penalesRondas.length > 0 && (
                <div className="rk-live-shootout">
                  <p>Tanda de penales{e.live?.localPen != null && e.live?.visitantePen != null ? ` · ${e.live.localPen}-${e.live.visitantePen}` : ''}</p>
                  {penalesRondas.map((r, j) => (
                    <div key={j} className="rk-live-shootout-row">
                      <span className="is-home">
                        {r.home && (
                          <>
                            <span style={{ display: 'inline-flex', color: r.home.anotado ? 'var(--green)' : 'var(--red)' }}>
                              <SvgIcon name={r.home.anotado ? 'check' : 'x'} size={13} />
                            </span>
                            {r.home.jugador}
                          </>
                        )}
                      </span>
                      <span className="is-away">
                        {r.away && (
                          <>
                            {r.away.jugador}
                            <span style={{ display: 'inline-flex', color: r.away.anotado ? 'var(--green)' : 'var(--red)' }}>
                              <SvgIcon name={r.away.anotado ? 'check' : 'x'} size={13} />
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Mantiene una cabecera visual estable cuando ninguna fuente publicó video.
// Usa únicamente datos que ya pertenecen al partido, por lo que nunca puede
// enseñar una foto ajena o equivocada.
function PortadaResumenPartido({ partido, estado, buscando }) {
  const marcador = estado.marcadorVisible
    ? `${estado.scoreLocal} - ${estado.scoreVisitante}`
    : 'VS'

  return (
    <figure className="rk-live-recap rk-live-recap--cover">
      <div className="ranking-live-player rk-live-recap-cover">
        <span className="rk-live-recap-cover-label">
          {buscando ? 'Buscando resumen…' : 'Partido finalizado'}
        </span>
        <div className="rk-live-recap-cover-match">
          <span className="rk-live-recap-cover-team">
            <span className="rk-live-recap-cover-crest">
              <EscudoEquipo url={partido.escudoLocal} nombre={partido.local} plano />
            </span>
            <strong>{partido.local}</strong>
          </span>
          <span className="rk-live-recap-cover-score">{marcador}</span>
          <span className="rk-live-recap-cover-team">
            <span className="rk-live-recap-cover-crest">
              <EscudoEquipo url={partido.escudoVisitante} nombre={partido.visitante} plano />
            </span>
            <strong>{partido.visitante}</strong>
          </span>
        </div>
        {!buscando && partido.espnId && (
          <a
            href={`https://www.espn.com/soccer/match/_/gameId/${partido.espnId}`}
            target="_blank"
            rel="noreferrer"
            className="rk-live-recap-cover-link"
          >
            Ver ficha del partido en ESPN →
          </a>
        )}
      </div>
      <figcaption className="rk-live-recap-pie">
        <span className="rk-live-recap-kicker">
          {buscando ? 'Consultando ESPN y YouTube' : 'Resumen no disponible'}
        </span>
        <span className="rk-live-recap-titulo">
          {buscando
            ? 'En cuanto encontremos un video oficial aparecerá en este espacio.'
            : 'No encontramos un video oficial para este partido.'}
        </span>
      </figcaption>
    </figure>
  )
}

// Qué se ve en lugar del reproductor cuando no hay transmisión que mostrar:
// antes del partido, sin señal configurada, sin permiso o ya terminado.
function ColumnaPartidoSinVideo({ partido, estado, puedeVerStream, hayFuentes, ahora }) {
  const e = estado
  const horaInicio = cierreToDate(partido.hora)?.getTime()
  const porComenzar = e.pendiente && Number.isFinite(horaInicio) && ahora < horaInicio

  let icono, titulo, texto
  if (e.cancelado) {
    icono = 'x'
    titulo = 'Partido cancelado'
    texto = 'Este partido no cuenta para el ranking.'
  } else if (porComenzar) {
    icono = 'calendar'
    titulo = textoAntesDelPartido(partido.hora, ahora)
    texto = 'Aquí verás el marcador, las estadísticas y la transmisión en cuanto arranque.'
  } else if (e.jugado) {
    icono = 'check'
    titulo = 'Partido terminado'
    texto = 'El marcador y las estadísticas quedan abajo.'
  } else if (!hayFuentes) {
    icono = 'broadcast'
    titulo = 'Sin transmisión'
    texto = 'Este partido no tiene una señal configurada.'
  } else if (!puedeVerStream) {
    icono = 'lock'
    titulo = 'Transmisión para participantes'
    texto = 'Se puede ver desde el dispositivo con el que registraste tu predicción.'
  } else {
    icono = 'broadcast'
    titulo = 'Transmisión no disponible'
    texto = 'La señal se habilita desde la hora de inicio y se cierra al guardar el resultado.'
  }

  return (
    <div className="rk-live-standby">
      <span className="rk-live-standby-icon" aria-hidden="true">
        <SvgIcon name={icono} size={19} />
      </span>
      <strong>{titulo}</strong>
      <p>{texto}</p>
      {porComenzar && (
        <CuentaRegresiva cierre={partido.hora} umbralHoras={24 * 365} prefijo="Comienza en" variante="pill" />
      )}
    </div>
  )
}

// Iniciales de un equipo para usar cuando no hay escudo: nombres compuestos
// toman la inicial de cada palabra ("South Korea" → "SK"); los simples, sus
// 3 primeras letras ("Türkiye" → "TÜR").
function inicialesEquipo(nombre) {
  const tokens = String(nombre || '').trim().split(/[\s-]+/).filter(Boolean)
  if (tokens.length > 1) return tokens.map(t => t[0]).join('').slice(0, 3).toUpperCase()
  return (tokens[0] || '').slice(0, 3).toUpperCase()
}

// En la lista móvil, los partidos que todavía no comienzan muestran su sede
// debajo del VS. La ficha se consulta bajo demanda y comparte el caché de ESPN
// con la columna de escritorio y la pantalla de resumen.
function EstadioPartidoPendiente({ partido }) {
  const ficha = useFichaPartido(
    partido,
    (!partido?.estadio || !partido?.ciudad) && !!partido?.espnId && !!partido?.ligaId,
    false
  )
  const estadio = partido?.estadio || ficha?.contexto?.estadio
  const ciudad = partido?.ciudad || ficha?.contexto?.ciudad
  const ubicacion = [estadio, ciudad].filter(Boolean).join(' · ')
  if (!ubicacion) return null

  return (
    <span className="ranking-match-stadium" title={ubicacion}>
      {ubicacion}
    </span>
  )
}

// Respaldo permanente para el acordeón móvil. ESPN deja de incluir partidos
// viejos en el scoreboard después de unos días; al abrirlos recuperamos el
// documento archivado al finalizar el encuentro y conservamos el botón de
// resumen como la última acción del panel.
function DetalleArchivadoMovil({
  quinielaId,
  idx,
  partido,
  mostrarStats,
  mostrarEventos,
  mostrarPenales,
}) {
  const { detalle } = useDetallePartido(
    quinielaId,
    idx,
    mostrarStats || mostrarEventos || mostrarPenales
  )
  const ficha = useFichaPartido(partido, mostrarEventos && !!partido?.espnId, false)
  const stats = mostrarStats ? detalle?.stats : null
  const eventos = mostrarEventos
    ? resumirEventosRanking(
      (ficha?.eventos?.length ? ficha.eventos : (detalle?.eventos ?? []))
        .filter(ev => !ev.penalShootout)
    )
    : []
  const penales = mostrarPenales ? (detalle?.penales ?? []) : []
  const posH = stats ? parseFloat(stats.home?.posesion) || 50 : 50
  const penalesRondas = (() => {
    const porRonda = {}
    penales.forEach(k => { (porRonda[k.orden] ||= {})[k.lado] = k })
    return Object.keys(porRonda)
      .map(Number)
      .sort((a, b) => a - b)
      .map(n => ({ orden: n, home: porRonda[n].home, away: porRonda[n].away }))
  })()

  if (!stats && eventos.length === 0 && penalesRondas.length === 0) return null

  return (
    <>
      {stats && (
        <div className="ranking-match-stats">
          {valorEstadisticaDisponible(stats.home?.posesion) &&
            valorEstadisticaDisponible(stats.away?.posesion) && (
              <div className="ranking-match-possession">
                <div className="ranking-match-stat-line is-possession">
                  <span className="ranking-match-stat-value is-home">{stats.home.posesion}%</span>
                  <span className="ranking-match-stat-label">Posesión</span>
                  <span className="ranking-match-stat-value is-away">{stats.away.posesion}%</span>
                </div>
                <div className="ranking-match-possession-bar">
                  <span style={{ width: `${posH}%` }} />
                </div>
              </div>
            )}
          {[
            { label: 'Tiros al arco', h: stats.home?.tirosArco, a: stats.away?.tirosArco },
            { label: 'Tiros totales', h: stats.home?.tirosTotales, a: stats.away?.tirosTotales },
            { label: 'Corners', h: stats.home?.corners, a: stats.away?.corners },
            { label: 'Faltas', h: stats.home?.faltas, a: stats.away?.faltas },
          ].filter(({ h, a }) =>
            valorEstadisticaDisponible(h) && valorEstadisticaDisponible(a)
          ).map(({ label, h, a }) => (
            <div key={label} className="ranking-match-stat-line">
              <span className="ranking-match-stat-value is-home">{h}</span>
              <span className="ranking-match-stat-label">{label}</span>
              <span className="ranking-match-stat-value is-away">{a}</span>
            </div>
          ))}
        </div>
      )}

      {eventos.length > 0 && (
        <div className="ranking-match-events">
          <p className="ranking-match-events-title">Últimos eventos</p>
          {[...eventos].reverse().map((ev, j) => {
            const izq = ev.lado === 'home'
            return (
              <div key={j} className={`ranking-match-event-row${izq ? ' is-home' : ' is-away'}`}>
                <span className={`ranking-match-event-icon is-${ev.tipo || 'default'}`}>
                  <SvgIcon name={ev.tipo || 'dot'} size={13} />
                </span>
                <span className="ranking-match-event-minute">{ev.minuto}</span>
                <span className="ranking-match-event-player">
                  {textoJugadorEvento(ev)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {penalesRondas.length > 0 && (
        <div
          className="ranking-match-shootout"
          style={{
            marginTop: (stats || eventos.length > 0) ? 12 : 0,
            paddingTop: (stats || eventos.length > 0) ? 10 : 0,
            borderTop: (stats || eventos.length > 0) ? '1px solid var(--border)' : 'none',
          }}
        >
          <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' }}>
            Tanda de penales
          </p>
          {penalesRondas.map((r, j) => (
            <div key={j} className="ranking-match-shootout-row">
              <TiroPenalMovil tiro={r.home} lado="home" />
              <TiroPenalMovil tiro={r.away} lado="away" />
            </div>
          ))}
          <p className="ranking-match-shootout-final">Se definió en penales.</p>
        </div>
      )}
    </>
  )
}

function TiroPenalMovil({ tiro, lado }) {
  return (
    <span className={lado === 'away' ? 'is-away' : undefined}>
      {tiro && (
        <>
          {lado === 'home' && (
            <span style={{ display: 'inline-flex', color: tiro.anotado ? 'var(--green)' : 'var(--red)' }}>
              <SvgIcon name={tiro.anotado ? 'check' : 'x'} size={13} />
            </span>
          )}
          <span>{tiro.jugador}</span>
          {lado === 'away' && (
            <span style={{ display: 'inline-flex', color: tiro.anotado ? 'var(--green)' : 'var(--red)' }}>
              <SvgIcon name={tiro.anotado ? 'check' : 'x'} size={13} />
            </span>
          )}
        </>
      )}
    </span>
  )
}

// Escudo del equipo, o un badge con sus iniciales si no hay imagen.
// `plano` es la variante de escritorio (carrusel y marcador del partido): el
// logo va suelto sobre el fondo, sin círculo ni borde, y llena el contenedor
// que le da el tamaño desde CSS.
function EscudoEquipo({ url, nombre, size = 18, plano = false }) {
  const [error, setError] = useState(false)
  if (url && !error) {
    if (plano) {
      return <img className="rk-crest-img" src={url} alt={nombre} title={nombre} onError={() => setError(true)} />
    }
    return <img src={url} alt={nombre} title={nombre} style={{ width: size, height: size, objectFit: 'contain' }} onError={() => setError(true)} />
  }
  if (plano) {
    return <span className="rk-crest-fallback" title={nombre}>{inicialesEquipo(nombre)}</span>
  }
  return (
    <span title={nombre} style={{
      fontSize: size < 16 ? 8 : 9, fontWeight: 800, color: 'var(--muted)', letterSpacing: 0.3,
      background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-sm)', padding: '1px 3px', lineHeight: 1.2,
    }}>{inicialesEquipo(nombre)}</span>
  )
}

function EscenariosUltimoPartido({ sim, conPremio, liveScores = {}, quiniela, bote }) {
  const { alerta } = useDialog()
  const { partido, filas, numJugadores } = sim
  const local = partido.local, visitante = partido.visitante
  const [abierto, setAbierto] = useState(false)
  // Una vez montado el panel lo dejamos en el DOM (aunque esté cerrado) para
  // poder animar el cierre con una transición en vez de desaparecer de golpe.
  const [montado, setMontado] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const [feedback, setFeedback] = useState('')

  // Mismo respiro de dos frames que el resto de los paneles del ranking: sin
  // esto, la primera apertura (montar + abrir a la vez) se ve de golpe en vez
  // de animada, porque el navegador nunca pinta el estado cerrado antes.
  const toggleAbierto = () => {
    if (!montado) {
      setMontado(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAbierto(true)))
      return
    }
    setAbierto(a => !a)
  }

  // Compartir el oráculo es una acción propia de esta tarjeta, independiente
  // del botón principal de compartir ranking.
  const handleCompartir = async () => {
    if (compartiendo) return
    setCompartiendo(true)
    setFeedback('')
    try {
      const res = await compartirOraculo({ quiniela, simulacion: sim, bote, liveScores, conPremio })
      if (res?.copiado) {
        setFeedback('Imagen copiada. Pégala donde quieras.')
        setTimeout(() => setFeedback(''), 4000)
      } else if (res?.descargado) {
        setFeedback('Imagen descargada. Compártela donde quieras.')
        setTimeout(() => setFeedback(''), 4000)
      }
    } catch (err) {
      console.error('Error compartiendo oráculo:', err)
      alerta('No se pudo generar la imagen. Intenta de nuevo.')
    } finally {
      setCompartiendo(false)
    }
  }

  const exactas   = filas.filter(f => f.esc.tipo === 'exacto')
  const genericas = filas.filter(f => f.esc.tipo === 'generico')

  // Contenido del chip genérico: "Gana" + escudo del equipo, o "Empate".
  const contenidoGenerico = (esc) =>
    esc.resultado === 'draw'
      ? 'Empate'
      : (<>Gana <EscudoEquipo url={esc.resultado === 'home' ? partido.escudoLocal : partido.escudoVisitante} nombre={esc.resultado === 'home' ? local : visitante} size={13} /></>)

  // Marcador actual si el partido está EN VIVO: marca qué fila va ganando ahora.
  // Si el marcador en curso coincide con un exacto pronosticado, resaltamos ese;
  // si no, resaltamos la fila genérica (Gana local / Empate / Gana visitante).
  const live = partido.espnId ? liveScores?.[partido.espnId] : null
  const enVivo = live?.state === 'in' && live.local !== '' && live.visitante !== '' &&
    live.local != null && live.visitante != null
  const curL = enVivo ? Number(live.local) : null
  const curV = enVivo ? Number(live.visitante) : null
  const curRes = enVivo ? goalsToResultado(curL, curV) : null
  const hayExactaActual = enVivo && exactas.some(f => f.esc.local === curL && f.esc.visitante === curV)
  const marcadorActual = enVivo ? `${curL}-${curV}` : ''

  const Fila = ({ marcador, esExacto, fila, ultima, actual, imposible }) => (
    <div className={`oracle-row${actual ? ' is-current' : ''}${imposible ? ' is-impossible' : ''}${ultima ? ' is-last' : ''}`}>
      <span className={`oracle-score${esExacto ? ' is-exact' : ' is-generic'}`}>{marcador}</span>
      <span className="oracle-winners">
        {fila.lideres.map(nombreCorto).join(', ')}
      </span>
      {actual && (
        <span className="oracle-live-pill">
          <span className="oracle-live-dot" />
          {marcadorActual}
        </span>
      )}
    </div>
  )

  return (
    <div className={`oracle-card${abierto ? ' is-open' : ' is-collapsed'}`}>
      <div className="oracle-header-row">
        <button
          onClick={toggleAbierto}
          aria-expanded={abierto}
          className="oracle-header"
        >
          <span className="oracle-icon" aria-hidden="true">
            <SvgIcon name="sparkles" size={18} />
          </span>
          <span className="oracle-heading">
            <span className="oracle-kicker">Oráculo del último partido</span>
            <span className="oracle-title">¿Quién gana según el marcador?</span>
          </span>
          <span className="oracle-toggle" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          onClick={handleCompartir}
          disabled={compartiendo}
          aria-label="Compartir oráculo"
          title="Compartir oráculo"
          className="oracle-share-btn"
        >
          <SvgIcon name="share" size={14} />
        </button>
      </div>
      {(compartiendo || feedback) && (
        <p className="oracle-share-status" role="status">
          {compartiendo ? 'Generando imagen del oráculo...' : feedback}
        </p>
      )}

      {montado && (
        <div
          aria-hidden={!abierto}
          style={{
            display: 'grid',
            gridTemplateRows: abierto ? '1fr' : '0fr',
            opacity: abierto ? 1 : 0,
            transition: 'grid-template-rows 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease',
          }}
        >
        <div style={{ overflow: 'hidden' }}>
          <p className="oracle-copy">
            <strong>{local} vs {visitante}</strong> define quién queda en 1° lugar{conPremio ? ' y se lleva el premio' : ''}.
          </p>

          <div className="oracle-table">
            <div className="oracle-table-head">
              <span className="oracle-teams">
                <EscudoEquipo url={partido.escudoLocal} nombre={local} />
                <EscudoEquipo url={partido.escudoVisitante} nombre={visitante} />
              </span>
              <span>Ganadores posibles</span>
            </div>
            {exactas.map((f, i) => (
              <Fila key={i} esExacto marcador={`${f.esc.local}-${f.esc.visitante}`} fila={f}
                ultima={i === exactas.length - 1}
                actual={enVivo && f.esc.local === curL && f.esc.visitante === curV}
                imposible={enVivo && (f.esc.local < curL || f.esc.visitante < curV)} />
            ))}
            {genericas.length > 0 && (
              <div className="oracle-divider">
                <span>Cualquier otro marcador</span>
              </div>
            )}
            {genericas.map((f, i) => (
              <Fila key={`g${i}`} marcador={contenidoGenerico(f.esc)} fila={f}
                ultima={i === genericas.length - 1}
                actual={enVivo && !hayExactaActual && f.esc.resultado === curRes} />
            ))}
          </div>

          <p className="oracle-note">
            Con los {numJugadores} participantes. En empate de puntos, comparten el 1° lugar.
          </p>
        </div>
        </div>
      )}
    </div>
  )
}

function GanadorCard({ jugadores, premioPorNombre = {}, conPremio }) {
  const puntosCampeon = jugadores[0]?.puntos ?? 0
  const ganadores = jugadores.filter(j => j.puntos === puntosCampeon)
  const principal = ganadores[0] ?? jugadores[0]
  if (!principal) return null

  const premio = Number(premioPorNombre[principal.nombre]) || 0
  const empate = ganadores.length > 1
  const nombres = ganadores.map(j => nombreCorto(j.nombre))
  const aciertosTxt = `${principal.aciertos} acierto${principal.aciertos === 1 ? '' : 's'}`
  const exactosTxt = `${principal.exactos} exacto${principal.exactos === 1 ? '' : 's'}`
  const premioTxt = conPremio && premio > 0 ? `gana ${formatearMXN(premio)}${empate ? ' c/u' : ''}` : '1° lugar'
  const detalle = empate
    ? `Empate${conPremio && premio > 0 ? ` · ${premioTxt}` : ''}`
    : `${aciertosTxt} · ${exactosTxt} · ${premioTxt}`
  const metricas = empate
    ? [
        { valor: ganadores.length, etiqueta: 'Ganadores' },
        conPremio && premio > 0
          ? { valor: formatearMXN(premio), etiqueta: 'Cada uno' }
          : { valor: '1°', etiqueta: 'Compartido' },
        { valor: 'Empate', etiqueta: 'En puntos', texto: true },
      ]
    : [
        { valor: principal.aciertos, etiqueta: 'Aciertos' },
        { valor: principal.exactos, etiqueta: 'Exactos' },
        conPremio && premio > 0
          ? { valor: formatearMXN(premio), etiqueta: 'Premio' }
          : { valor: '1°', etiqueta: 'Lugar' },
      ]

  return (
    <div className={`ranking-champion-card${empate ? ' is-tie' : ''}`}>
      <span className="ranking-champion-shine" aria-hidden="true" />
      <span className="ranking-victory-star is-one" aria-hidden="true" />
      <span className="ranking-victory-star is-three" aria-hidden="true" />
      <span className="ranking-victory-star is-five" aria-hidden="true" />
      <span className="ranking-victory-star is-eight" aria-hidden="true" />
      <div className="ranking-champion-identity">
        <span className="ranking-champion-medallion" aria-hidden="true">
          {empate ? <SvgIcon name="trophy" size={25} /> : inicialesPersona(principal.nombre)}
        </span>
        <div className="ranking-champion-main">
          <p className="ranking-champion-kicker">
            <SvgIcon name="trophy" size={14} />
            {empate ? 'GANADORES' : 'GANADOR'}
          </p>
          <div className={`ranking-champion-names${empate ? ' is-stacked' : ''}`}>
            {nombres.map((nombre, idx) => (
              <p key={`${nombre}-${idx}`} className="ranking-champion-name">{nombre}</p>
            ))}
          </div>
          <p className="ranking-champion-detail">
            {detalle}
          </p>
        </div>
      </div>
      <div className="ranking-champion-metrics" aria-label={detalle}>
        {metricas.map(({ valor, etiqueta, texto }) => (
          <div key={etiqueta} className="ranking-champion-metric">
            <strong className={texto ? 'is-text' : ''}>{valor}</strong>
            <span>{etiqueta}</span>
          </div>
        ))}
      </div>
      <div className="ranking-champion-score" aria-label={`${puntosCampeon} puntos`}>
        <span className="ranking-champion-points">{puntosCampeon}</span>
        <span className="ranking-champion-points-label">PTS</span>
      </div>
    </div>
  )
}

// Podio del primer lugar (solo escritorio: en móvil queda display:none).
// Reconoce al líder mientras se juega y al ganador cuando finaliza; su fila
// se oculta en la tabla para que el podio sea su lugar en el ranking.
function PodioPrimerLugar({ lideres, finalizada, premioPorNombre, conPremio }) {
  const principal = lideres[0]
  const empate = lideres.length > 1
  const premio = Number(premioPorNombre[principal.nombre]) || 0
  const premioTxt = conPremio && premio > 0
    ? `${finalizada ? 'gana' : 'va por'} ${formatearMXN(premio)}${empate ? ' c/u' : ''}`
    : null
  const detalle = empate
    ? `Empate en puntos${premioTxt ? ` · ${premioTxt}` : ''}`
    : [
        `${principal.aciertos} acierto${principal.aciertos === 1 ? '' : 's'}`,
        `${principal.exactos} exacto${principal.exactos === 1 ? '' : 's'}`,
        ...(premioTxt ? [premioTxt] : []),
      ].join(' · ')
  return (
    <div className={`ranking-podium${finalizada ? ' is-final' : ' is-live'}`}>
      <span className="ranking-podium-shine" aria-hidden="true" />
      <div className="ranking-podium-avatar" aria-hidden="true">
        {empate ? <SvgIcon name="trophy" size={22} /> : inicialesPersona(principal.nombre)}
        <span className="ranking-podium-crown">
          <SvgIcon name="crown" size={14} />
        </span>
      </div>
      <div className="ranking-podium-copy">
        <p className="ranking-podium-kicker">
          {finalizada ? (empate ? 'Ganadores' : 'Ganador') : (empate ? 'Líderes' : 'Líder')}
        </p>
        <div className={`ranking-podium-names${empate ? ' is-stacked' : ''}`}>
          {lideres.map((j, idx) => (
            <p key={`${j.nombre}-${idx}`} className="ranking-podium-name">{nombreCorto(j.nombre)}</p>
          ))}
        </div>
        <p className="ranking-podium-detail">{detalle}</p>
      </div>
      <div className="ranking-podium-score" aria-label={`${principal.puntos} puntos`}>
        <span className="ranking-podium-points">{principal.puntos}</span>
        <span className="ranking-podium-points-label">PTS</span>
      </div>
    </div>
  )
}

function SinPremioBanner() {
  return (
    <div className="ranking-fun-card">
      <span className="ranking-fun-shine" aria-hidden="true" />
      <span className="ranking-fun-spark is-one" aria-hidden="true" />
      <span className="ranking-fun-spark is-two" aria-hidden="true" />
      <span className="ranking-fun-icon" aria-hidden="true">
        <SvgIcon name="sparkles" size={22} />
      </span>
      <div className="ranking-fun-copy">
        <p className="ranking-fun-title">SOLO POR DIVERSIÓN</p>
        <p className="ranking-fun-text">
          Sin premio en dinero: juega por orgullo, rachas y el derecho a presumir el primer lugar.
        </p>
      </div>
    </div>
  )
}

function PremioBanner({ quiniela, bote, ganadores, finalizada, hayResultados, abierta = false }) {
  const grupos = ganadores.reduce((acc, g) => {
    (acc[g.posicion] ??= []).push(g)
    return acc
  }, {})

  if (quiniela.boteDevuelto) {
    return (
      <div style={{
        background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', letterSpacing: 0.4 }}>
            <SvgIcon name="money" size={14} />
            Bote devuelto
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {formatearMXN(bote)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          El organizador decidió devolver el bote a los participantes. No se reparten premios.
        </p>
      </div>
    )
  }

  if (abierta) {
    return (
      <div className="ranking-open-prize-banner" style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(110deg, rgba(250,204,21,0.15), rgba(30,41,59,0.92) 32%, rgba(15,23,42,0.96) 100%)',
        border: '1px solid rgba(250,204,21,0.66)', borderRadius: 'var(--radius-md)',
        padding: 'var(--ranking-open-prize-padding, 10px 14px)', marginBottom: 'var(--ranking-section-gap, 16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        <span className="ranking-open-prize-shine" aria-hidden="true" />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', color: 'var(--yellow)', flexShrink: 0 }}>
            <SvgIcon name="trophy" size={27} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 'var(--ranking-open-prize-label-size, 9.5px)', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, lineHeight: 1 }}>
              Bote en juego
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-open-prize-amount-size, 26px)', fontWeight: 800, color: 'var(--yellow)', lineHeight: 1.05, letterSpacing: 0 }}>
              {formatearMXN(bote)}
            </p>
          </div>
        </div>
        <span style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5,
          color: 'var(--yellow)', fontSize: 'var(--ranking-open-prize-side-size, 11px)', fontWeight: 800, whiteSpace: 'nowrap',
        }}>
          <SvgIcon name="crown" size={13} />
          Gana el 1°
        </span>
      </div>
    )
  }

  if (!hayResultados || ganadores.length === 0) {
    const mensaje = !hayResultados
      ? descripcionRegla(quiniela)
      : finalizada
        ? 'Sin ganadores: nadie acertó ningún partido.'
        : 'Aún no hay puntos para definir ganadores.'
    return (
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(120deg, rgba(250,204,21,0.12), rgba(30,41,59,0.92) 42%, rgba(15,23,42,0.96) 100%)',
        border: '1px solid rgba(250,204,21,0.45)', borderRadius: 'var(--radius-md)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32), 0 0 0 3px rgba(250,204,21,0.05)',
        padding: '14px 16px', marginBottom: 16,
      }}>
        <span className="ranking-open-prize-shine" aria-hidden="true" />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              <span style={{ display: 'inline-flex', color: 'var(--yellow)' }}><SvgIcon name="trophy" size={13} /></span>
              Premio
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--yellow)', letterSpacing: '-0.01em' }}>
              {formatearMXN(bote)}
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>{mensaje}</p>
        </div>
      </div>
    )
  }

  if (!finalizada && Object.keys(grupos).length === 1 && grupos['1']?.length > 0) {
    return <LiderAhoraCard bote={bote} ganadores={grupos['1']} />
  }

  const titulo = finalizada ? 'Ganadores' : 'Si terminara ahora'
  return (
    <div className={`ranking-prize-banner${finalizada ? ' is-final' : ' is-live'}`} style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: 'var(--radius-md)', marginBottom: 16,
    }}>
      {!finalizada && (
        <>
          <span className="ranking-prize-live-shine" aria-hidden="true" />
          <span className="ranking-prize-live-orb" aria-hidden="true" />
        </>
      )}
      <div className="ranking-prize-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--ranking-prize-title-size, 12px)', fontWeight: 800, color: finalizada ? 'var(--yellow)' : 'var(--green)', letterSpacing: 0.4 }}>
          {finalizada ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
              <path d="M7 6H4v1a3 3 0 0 0 3 3" />
              <path d="M17 6h3v1a3 3 0 0 1-3 3" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          )}
          {titulo}
        </span>
        <span style={{ fontSize: 'var(--ranking-prize-bote-size, 11px)', color: 'var(--muted)', fontWeight: 600 }}>
          Bote: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatearMXN(bote)}</span>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {Object.entries(grupos).map(([pos, gs]) => (
          <div key={pos} className="ranking-prize-row" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            background: 'var(--card)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ position: 'relative', overflow: 'hidden', width: 17, height: 17, borderRadius: '50%', background: medalBadgeBg[Number(pos) - 1] || 'var(--card-light)', color: medalBadgeText[Number(pos) - 1] || 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.22)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -1px 2px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.18)' }}>
                {Number(pos) <= 3 && (
                  <span aria-hidden="true" style={{ position: 'absolute', inset: '-20% -40%', background: 'linear-gradient(118deg, transparent 34%, rgba(255,255,255,0.16) 44%, rgba(255,255,255,0.58) 50%, rgba(255,255,255,0.18) 57%, transparent 68%)', animation: `medal-shine 8.5s ease-in-out ${Number(pos) * 0.7}s infinite` }} />
                )}
                <span style={{ position: 'relative' }}>{pos}</span>
              </span>
              <span style={{ fontSize: 'var(--ranking-prize-name-size, 13px)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {gs.map(g => nombreCorto(g.nombre)).join(', ')}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-prize-amount-size, 14px)', fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {formatearMXN(gs[0].premio)}{gs.length > 1 ? ' c/u' : ''}
            </span>
          </div>
        ))}
      </div>
      {!finalizada && (
        <p className="ranking-prize-note" style={{ fontSize: 'var(--ranking-prize-note-size, 11px)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          Premios provisionales. Pueden cambiar mientras la quiniela siga en juego.
        </p>
      )}
    </div>
  )
}

const AVATAR_COLORS = ['#22C55E', '#818CF8', '#FB923C', '#38BDF8']

function LiderAhoraCard({ bote, ganadores }) {
  const count = ganadores.length

  return (
    <div className="ranking-live-card">
      <span className="ranking-live-card-shine" aria-hidden="true" />
      <div className="ranking-live-card-header">
        <span className="ranking-live-card-kicker">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          Si terminara ahora
        </span>
        {count === 2 && (
          <span className="ranking-live-card-tie-badge">Empatados en 1.º</span>
        )}
        {count >= 3 && (
          <div className="ranking-live-card-avatars">
            {ganadores.slice(0, 4).map((g, idx) => (
              <span
                key={g.nombre}
                className="ranking-live-card-avatar"
                style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], zIndex: 10 - idx }}
              >
                {inicialesPersona(g.nombre)}
              </span>
            ))}
            {count > 4 && (
              <span className="ranking-live-card-avatar is-more" style={{ zIndex: 5 }}>
                +{count - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {count === 1 ? (
        <div className="ranking-live-card-solo">
          <span className="ranking-live-card-pos">1</span>
          <div className="ranking-live-card-solo-text">
            <p className="ranking-live-card-solo-label">En 1.er lugar</p>
            <p className="ranking-live-card-solo-name">{nombreCorto(ganadores[0].nombre)}</p>
          </div>
          <span className="ranking-live-card-amount">{formatearMXN(ganadores[0].premio)}</span>
        </div>
      ) : count === 2 ? (
        <div className="ranking-live-card-rows">
          {ganadores.map(g => (
            <div key={g.nombre} className="ranking-live-card-row">
              <span className="ranking-live-card-pos">1</span>
              <span className="ranking-live-card-row-name">{nombreCorto(g.nombre)}</span>
              <span className="ranking-live-card-amount">{formatearMXN(g.premio)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="ranking-live-card-many">
          <p className="ranking-live-card-many-amount">
            {formatearMXN(ganadores[0].premio)} <span>para cada líder</span>
          </p>
          <p className="ranking-live-card-many-sub">
            <strong>{count} líderes</strong> empatados en 1.er lugar
          </p>
        </div>
      )}

      <div className="ranking-live-card-footer">
        <span className="ranking-live-card-bote">Bote <strong>{formatearMXN(bote)}</strong></span>
        <span className="ranking-live-card-footer-note">
          {count === 1 ? 'Se lo lleva quien termine 1.º' : `Se reparte entre ${count}`}
        </span>
      </div>
    </div>
  )
}
