import { useState, useEffect, useMemo, useRef } from 'react'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from '../utils/cierre'
import { goalsToResultado, getResultado, getPickResultado, getEfectivo, calcularPuntos, calcularRacha } from '../utils/scoring'
import { tienePremio, calcularGanadores, formatearMXN, descripcionRegla } from '../utils/premios'
import { simularUltimoPartido } from '../utils/escenarios'
import { normalizarNombre } from '../utils/nombres'
import { miIdentidadEnQuiniela } from '../utils/misQuinielas'
import { registrarApertura } from '../utils/analytics'
import { compartirOraculo, compartirRanking } from '../utils/shareRanking'
import { useDialog } from './Dialogs'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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
const PAGE_SIZE = 50
// Mostrar el buscador solo cuando hay suficientes participantes para que valga la pena.
// Por debajo de este umbral, scrollear es más rápido.
const UMBRAL_BUSQUEDA = 20

function SvgIcon({ name, size = 14, style }) {
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

export function RankingTable({ quiniela, predicciones, liveScores = {}, liveStats = {}, liveEventos = {}, livePenales = {} }) {
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
  // Nombres abreviados (2 tokens, o más si hay empate) para la fila colapsada.
  const nombresCortos = abreviarNombres(jugadores.map(j => j.nombre))
  const filtroBusqueda  = busqueda.trim().toLowerCase()
  const filtrados       = filtroBusqueda
    ? jugadoresConPos.filter(j => j.nombre.toLowerCase().includes(filtroBusqueda))
    : jugadoresConPos
  const shown     = filtrados.slice(0, visibles)
  const restantes = filtrados.length - shown.length
  const mostrarBuscador = jugadores.length > UMBRAL_BUSQUEDA && !vistaParticipantesAbierta

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

      <div className="ranking-desktop-grid">
      <div className="ranking-desktop-left">
      {/* Banner de premio */}
      {mostrarGanadorFinal ? (
        <GanadorCard jugadores={jugadores} premioPorNombre={premioPorNombre} conPremio={conPremio} />
      ) : conPremio ? (
        <PremioBanner quiniela={quiniela} bote={bote} ganadores={ganadores} finalizada={finalizada} hayResultados={hayResultados} abierta={vistaParticipantesAbierta} />
      ) : finalizada ? null : (
        <SinPremioBanner />
      )}

      {/* Stats */}
      <div className="ranking-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${resumenStats.length},1fr)` }}>
        {resumenStats.map(s => (
          <div key={s.label} className="ranking-stat-card ranking-glass-card">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-stat-value-size, 26px)', fontWeight: 700, display: 'block', color: 'var(--text-strong)', lineHeight: 0.98 }}>{s.val}</span>
            <span style={{ fontSize: 'var(--ranking-stat-label-size, 11px)', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 'var(--ranking-stat-label-spacing, 0.5px)', marginTop: 8 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Partidos */}
      {partidos.length > 0 && (
        <div className="ranking-panel ranking-matches-panel">
          <div className="ranking-panel-header ranking-matches-header">
              <span className="ranking-matches-title">
                <span className="ranking-matches-title-icon" aria-hidden="true">
                <SvgIcon name="calendar" size={13} />
              </span>
              Partidos
            </span>
            <span className="ranking-matches-count">{partidos.length}</span>
          </div>
          {partidos.map((p, i) => {
            const live      = p.espnId ? liveScores?.[p.espnId] : null
            const stored    = resultados[i] ?? resultados[String(i)]
            const cancelado = !!stored?.cancelado
            const esVivo    = !cancelado && live?.state === 'in'
            const esFinish  = !cancelado && live?.state === 'post'
            let scoreLocal = '-', scoreVisitante = '-', resDisplay = null
            if (!cancelado && live && (esVivo || esFinish) && live.local !== '') {
              scoreLocal = live.local; scoreVisitante = live.visitante
              resDisplay = goalsToResultado(live.local, live.visitante)
            } else if (!cancelado && stored) {
              scoreLocal = stored.local ?? '-'; scoreVisitante = stored.visitante ?? '-'
              resDisplay = getResultado(stored)
            }
            const pendiente = !cancelado && !resDisplay && !esVivo && !esFinish
            const pendienteEnQuinielaAbierta = !cerrada && pendiente
            const tieneStats = !!p.espnId
            const partidoAbierto = expandidoPartido.has(i)
            const st = liveStats[p.espnId]
            const eventos = liveEventos[p.espnId] ?? []
            // Penales: los goles de la tanda llegan mezclados como "goal" en los
            // eventos normales: los filtramos. La secuencia completa de la tanda
            // (con anotados y fallados) viene aparte en livePenales.
            const eventosNormales = eventos.filter(e => !e.penalShootout)
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
            const tieneAlgo = hayStats || hayResumen
            const jugado = !cancelado && (esFinish || getResultado(stored) !== null)
            const matchScoreText = pendiente ? 'VS' : `${scoreLocal} - ${scoreVisitante}`
            const posH = hayStats ? parseFloat(st.home.posesion) || 50 : 50
            const badgeNode = cancelado ? (
              <span className="ranking-match-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'var(--border-strong)' }}>Cancelado</span>
            ) : esVivo ? (
              <span className="ranking-match-badge is-live-badge" style={{ background: 'var(--red-bg-strong)', color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.4)' }}>
                <span className="ranking-match-live-dot" />{live.penalesEnVivo ? 'Penales' : live.halftime ? 'Descanso' : live.clock || 'EN VIVO'}
              </span>
            ) : resDisplay ? (
              <span className="ranking-match-badge" style={{ background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, borderColor: resultBorder[resDisplay] }}>
                {resultLabel[resDisplay]}
              </span>
            ) : pendienteEnQuinielaAbierta ? (
              null
            ) : (
              <span className="ranking-match-badge is-pending-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'rgba(148,163,184,0.24)' }}>Pendiente</span>
            )
            const muestraEstadoPartido = !!badgeNode || tieneAlgo
            return (
              <div
                key={i}
                onClick={tieneAlgo ? () => togglePartido(i) : undefined}
                className={`ranking-match-row${esVivo ? ' is-live' : ''}${jugado ? ' is-played' : ''}${partidoAbierto ? ' is-open' : ''}${cancelado ? ' is-cancelled' : ''}${tieneAlgo ? ' is-clickable' : ''}`}
                style={{ borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                {/* Escritorio (≥1024px): equipos completos + fecha bajo el local */}
                <div className={`ranking-match-wide${muestraEstadoPartido ? ' has-status' : ''}`}>
                  <div className="ranking-match-wide-teams">
                    <div className="ranking-match-wide-side is-home">
                      <div className="ranking-match-wide-side-row">
                        <EscudoEquipo url={p.escudoLocal} nombre={p.local} size={22} />
                        <span className="ranking-match-wide-name">{p.local}</span>
                      </div>
                      {p.hora && <span className="ranking-match-wide-fecha">{formatFecha(p.hora)}</span>}
                    </div>
                    <span
                      className={`ranking-match-wide-score${pendiente ? ' is-pending' : ''}`}
                      style={{ color: cancelado ? 'var(--muted)' : 'var(--text-strong)', textDecoration: cancelado ? 'line-through' : 'none' }}
                    >
                      {matchScoreText}
                    </span>
                    <div className="ranking-match-wide-side is-away">
                      <div className="ranking-match-wide-side-row">
                        <span className="ranking-match-wide-name">{p.visitante}</span>
                        <EscudoEquipo url={p.escudoVisitante} nombre={p.visitante} size={22} />
                      </div>
                    </div>
                  </div>
                  {muestraEstadoPartido && (
                    <div className="ranking-match-wide-status">
                      {badgeNode}
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

                <div className="ranking-match-compact">
                  <div className="ranking-match-body">
                    <div className="ranking-match-desktop-teams">
                      <div className="ranking-match-side is-home">
                        {p.escudoLocal && <img className="ranking-match-crest" src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                        <span className="ranking-match-name">{p.local}</span>
                      </div>
                      <span
                        className={`ranking-match-score is-desktop${pendiente ? ' is-pending' : ''}`}
                        style={{ color: cancelado ? 'var(--muted)' : 'var(--text-strong)', textDecoration: cancelado ? 'line-through' : 'none' }}
                      >
                        {matchScoreText}
                      </span>
                      <div className="ranking-match-side is-away">
                        <span className="ranking-match-name">{p.visitante}</span>
                        {p.escudoVisitante && <img className="ranking-match-crest" src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      </div>
                    </div>
                  </div>
                  {muestraEstadoPartido && (
                    <div className={`ranking-match-status-row${esVivo ? ' is-live' : ''}${tieneAlgo ? ' has-toggle' : ''}`}>
                      {badgeNode}
                      {!esVivo && p.hora && <span className="ranking-match-status-date">{formatFecha(p.hora)}</span>}
                      {tieneAlgo && (
                        <span className="ranking-match-toggle ranking-match-toggle-desktop">
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
                  <div className="ranking-match-detail-panel" onClick={e => e.stopPropagation()}>
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
                    {eventosNormales.length > 0 && (
                      <div className="ranking-match-events">
                        <p className="ranking-match-events-title">Últimos eventos</p>
                        {[...eventosNormales].reverse().map((ev, j) => {
                          const izq = ev.lado === 'home'
                          return (
                            <div key={j} className={`ranking-match-event-row${izq ? ' is-home' : ' is-away'}`}>
                              <span className={`ranking-match-event-icon is-${ev.tipo || 'default'}`}>
                                <SvgIcon name={ev.tipo || 'dot'} size={13} />
                              </span>
                              <span className="ranking-match-event-minute">{ev.minuto}</span>
                              <span className="ranking-match-event-player">
                                {ev.jugador}{ev.ownGoal ? ' (a.g.)' : ''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {hayPenales && (
                      <div style={{ marginTop: (hayStats || eventosNormales.length > 0) ? 12 : 0, paddingTop: (hayStats || eventosNormales.length > 0) ? 10 : 0, borderTop: (hayStats || eventosNormales.length > 0) ? '1px solid var(--border)' : 'none' }}>
                        <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' }}>
                          Tanda de penales{tienePenalScore ? ` · ${penalLocal}-${penalVisitante}` : ''}
                        </p>
                        {penalesRondas.length > 0 ? penalesRondas.map((r, j) => {
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
                        }) : (
                          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>
                            Se definió en penales.
                          </p>
                        )}
                      </div>
                    )}
                    {hayResumen && (
                      <a
                        href={`https://www.espn.com/soccer/match/_/gameId/${p.espnId}`}
                        target="_blank" rel="noreferrer"
                        className="ranking-match-summary-link"
                      >
                        Ver resumen del partido →
                      </a>
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

      </div>

      <div className="ranking-desktop-right">
      {/* ¿Quién gana según el marcador del último partido?: en escritorio queda
          arriba de la tabla de ranking; en móvil el orden visual no cambia
          porque la columna izquierda ya terminó de renderizarse antes. */}
      {simulacion && (
        <EscenariosUltimoPartido
          sim={simulacion}
          conPremio={conPremio}
          liveScores={liveScores}
          quiniela={quiniela}
          bote={bote}
        />
      )}
      {/* Tabla ranking */}
      <div className="ranking-panel ranking-table-panel">
        {enVivo && (
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
          <div className="ranking-panel-header">
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
              Participantes
            </span>
            <button
              type="button"
              onClick={() => setMostrarInfoPicks(v => !v)}
              aria-expanded={mostrarInfoPicks}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10.5, color: mostrarInfoPicks ? 'var(--green)' : 'var(--muted)',
                fontWeight: 700, whiteSpace: 'nowrap',
                background: mostrarInfoPicks ? 'var(--green-bg)' : 'transparent',
                border: `1px solid ${mostrarInfoPicks ? 'var(--green)' : 'transparent'}`,
                borderRadius: 'var(--radius-full)', padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              <SvgIcon name="lock" size={12} />
              Picks ocultos
            </button>
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
          const esLider = pos === 1 && hayResultados
          const esMiFila = !!miNombreRanking && j.nombre === miNombreRanking
          // Una quiniela cerrada pero todavía sin actividad no tiene posiciones
          // reales: todos conservan 0 puntos, pero no declaramos un empate en 1°.
          const posicionVisible = hayResultados ? pos : '—'
          const medalColor = hayResultados && pos <= 3 ? medalColors[pos - 1] : null
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
                    En zona de premio
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

      <div className="ranking-share-action-wrap">
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
      </div>
      </div>
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

// Iniciales de un equipo para usar cuando no hay escudo: nombres compuestos
// toman la inicial de cada palabra ("South Korea" → "SK"); los simples, sus
// 3 primeras letras ("Türkiye" → "TÜR").
function inicialesEquipo(nombre) {
  const tokens = String(nombre || '').trim().split(/[\s-]+/).filter(Boolean)
  if (tokens.length > 1) return tokens.map(t => t[0]).join('').slice(0, 3).toUpperCase()
  return (tokens[0] || '').slice(0, 3).toUpperCase()
}

// Escudo del equipo, o un badge con sus iniciales si no hay imagen.
function EscudoEquipo({ url, nombre, size = 18 }) {
  const [error, setError] = useState(false)
  if (url && !error) {
    return <img src={url} alt={nombre} title={nombre} style={{ width: size, height: size, objectFit: 'contain' }} onError={() => setError(true)} />
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

  return (
    <div className="ranking-champion-card">
      <span className="ranking-champion-shine" aria-hidden="true" />
      <span className="ranking-victory-star is-one" aria-hidden="true" />
      <span className="ranking-victory-star is-two" aria-hidden="true" />
      <span className="ranking-victory-star is-three" aria-hidden="true" />
      <span className="ranking-victory-star is-four" aria-hidden="true" />
      <span className="ranking-victory-star is-five" aria-hidden="true" />
      <span className="ranking-victory-star is-six" aria-hidden="true" />
      <span className="ranking-victory-star is-seven" aria-hidden="true" />
      <span className="ranking-victory-star is-eight" aria-hidden="true" />
      <span className="ranking-victory-star is-nine" aria-hidden="true" />
      <span className="ranking-victory-star is-ten" aria-hidden="true" />
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
      <div className="ranking-champion-score" aria-label={`${puntosCampeon} puntos`}>
        <span className="ranking-champion-points">{puntosCampeon}</span>
        <span className="ranking-champion-points-label">PTS</span>
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
