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
  if (!pick) return '—'
  if (typeof pick === 'object') {
    const l = pick.local ?? '?', v = pick.visitante ?? '?'
    return `${l}–${v}`
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
  if (name === 'flame') {
    return (
      <svg {...common}>
        <path d="M12 22c4 0 7-2.7 7-6.8 0-2.5-1.3-4.5-3.6-6.3.1 2.1-.7 3.4-2 4.2.2-3.1-1.2-5.8-4.1-8.1.2 3.7-1.9 5.5-3 7.5A6.5 6.5 0 0 0 5 15.3C5 19.3 8 22 12 22Z" />
        <path d="M12 18c1.4 0 2.5-1 2.5-2.4 0-1-.5-1.9-1.5-2.6-.1 1-.5 1.6-1.2 2-.1-1.4-.7-2.5-1.9-3.4.1 1.7-.8 2.5-1.3 3.4a3 3 0 0 0-.3 1.1C8.3 17.2 9.8 18 12 18Z" />
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
  if (name === 'cake') {
    return (
      <svg {...common}>
        <path d="M8 8h8" />
        <path d="M7 12h10a3 3 0 0 1 3 3v5H4v-5a3 3 0 0 1 3-3Z" />
        <path d="M4 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 1.8-.7 2.5-.6" />
        <path d="M12 3v5" />
        <path d="M12 3c1 1 .9 1.8 0 2.5-.9-.7-1-1.5 0-2.5Z" />
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
  const [visibles, setVisibles]                 = useState(PAGE_SIZE)
  const [compartiendo, setCompartiendo] = useState(false)
  const [compartiendoOraculo, setCompartiendoOraculo] = useState(false)
  const [feedbackShare, setFeedbackShare] = useState('')
  const [busqueda, setBusqueda]                 = useState('')
  const [mostrarInfoPicks, setMostrarInfoPicks] = useState(false)
  const [panelActivo, setPanelActivo]           = useState(null)

  // Detección de goles nuevos (comparando contra el polling anterior) para
  // disparar un festejo en pantalla, igual al de "picks completos".
  const prevLiveScoresRef = useRef(null)
  const golTimerRef = useRef(null)
  const [golFestejo, setGolFestejo] = useState(null) // { equipo } | null

  const toggleExpandido = (nombre) => {
    setExpandido(prev => {
      const s = new Set(prev)
      s.has(nombre) ? s.delete(nombre) : s.add(nombre)
      return s
    })
  }

  const togglePartido = (idx) => {
    setExpandidoPartido(prev => {
      const s = new Set(prev)
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return s
    })
  }

  const partidos   = useMemo(() => quiniela.partidos ?? [], [quiniela.partidos])
  const resultados = quiniela.resultados ?? {}
  const cerrada    = quinielaCerrada(quiniela)
  const finalizada = quinielaFinalizada(quiniela)
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
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
  // Cumpleañeros marcados por el admin (ids de predicción) muestran un icono.
  const cumpleaneros = quiniela?.cumpleaneros ?? []
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
  const puedeCompartir = vistaParticipantesAbierta || jugadores.length > 0
  const resumenStats = vistaParticipantesAbierta
    ? [
        { val: jugadores.length, label: 'Participantes' },
        { val: partidos.length,  label: 'Partidos' },
      ]
    : [
        { val: jugadores.length,                   label: 'Participantes' },
        { val: `${terminados}/${partidos.length}`, label: 'Partidos' },
        { val: jugadores[0]?.puntos ?? 0,          label: 'Pts líder' },
      ]

  const handleCompartirRanking = async () => {
    if (compartiendo || !puedeCompartir) return
    setPanelActivo('share')
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

  const handleCompartirOraculo = async () => {
    if (compartiendoOraculo || !simulacion) return
    setPanelActivo('share')
    setCompartiendoOraculo(true)
    setFeedbackShare('')
    try {
      const res = await compartirOraculo({ quiniela, simulacion, bote })
      if (res?.copiado) {
        setFeedbackShare('Oráculo copiado. Pégalo donde quieras.')
        setTimeout(() => setFeedbackShare(''), 4000)
      } else if (res?.descargado) {
        setFeedbackShare('Oráculo descargado. Compártelo donde quieras.')
        setTimeout(() => setFeedbackShare(''), 4000)
      }
    } catch (err) {
      console.error('Error compartiendo oráculo:', err)
      alerta('No se pudo generar el Oráculo. Intenta de nuevo.')
    } finally {
      setCompartiendoOraculo(false)
    }
  }

  return (
    <>
      <style>{`@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
        @keyframes flame{0%,100%{transform:translateX(-50%) translateY(3%) scaleY(.92) scaleX(1.03);opacity:.72}50%{transform:translateX(-50%) translateY(-6%) scaleY(1.14) scaleX(.93);opacity:1}}`}</style>

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

      {/* Reglas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--ranking-section-gap, 16px)', flexWrap: 'nowrap' }}>
        {[
          { pts: '1 pt', desc: 'resultado', icon: 'check', color: 'var(--green)' },
          { pts: '+2 pts', desc: 'exacto', icon: 'target', color: 'var(--yellow)' },
        ].map(r => (
          <div key={r.desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: 'var(--ranking-rule-padding, 6px 10px)', border: '1px solid var(--border)', flex: '1 1 auto', minWidth: 0, textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', color: r.color, flexShrink: 0 }}>
              <SvgIcon name={r.icon} size={13} />
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-rule-points-size, 13px)', fontWeight: 700, color: 'var(--text-strong)', flexShrink: 0 }}>{r.pts}</span>
            <span style={{ fontSize: 'var(--ranking-rule-desc-size, 11.5px)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc}</span>
          </div>
        ))}
      </div>

      {/* Banner de premio */}
      {conPremio && <PremioBanner quiniela={quiniela} bote={bote} ganadores={ganadores} finalizada={finalizada} hayResultados={hayResultados} abierta={vistaParticipantesAbierta} />}
      {!conPremio && <SinPremioBanner />}

      {/* Stats */}
      <div className="ranking-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${resumenStats.length},1fr)` }}>
        {resumenStats.map(s => (
          <div key={s.label} className="ranking-stat-card" style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-stat-value-size, 26px)', fontWeight: 700, display: 'block', color: 'var(--yellow)' }}>{s.val}</span>
            <span style={{ fontSize: 'var(--ranking-stat-label-size, 11px)', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--ranking-stat-label-spacing, 0.5px)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Partidos */}
      {partidos.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 'var(--ranking-section-gap, 16px)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Partidos
            </span>
            {enVivo && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--red-bg-strong)', border: '1px solid var(--red)',
                color: '#FCA5A5', animation: 'pulse-badge 1.4s ease-in-out infinite',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCA5A5', display: 'inline-block' }} />
                EN VIVO
              </span>
            )}
          </div>
          {partidos.map((p, i) => {
            const live      = p.espnId ? liveScores?.[p.espnId] : null
            const stored    = resultados[i] ?? resultados[String(i)]
            const cancelado = !!stored?.cancelado
            const esVivo    = !cancelado && live?.state === 'in'
            const esFinish  = !cancelado && live?.state === 'post'
            let scoreLocal = '–', scoreVisitante = '–', resDisplay = null
            if (!cancelado && live && (esVivo || esFinish) && live.local !== '') {
              scoreLocal = live.local; scoreVisitante = live.visitante
              resDisplay = goalsToResultado(live.local, live.visitante)
            } else if (!cancelado && stored) {
              scoreLocal = stored.local ?? '–'; scoreVisitante = stored.visitante ?? '–'
              resDisplay = getResultado(stored)
            }
            const pendiente = !cancelado && !resDisplay && !esVivo && !esFinish
            const scoreLocalDisplay = pendiente ? 'vs' : scoreLocal
            const scoreVisitanteDisplay = pendiente ? '' : scoreVisitante
            const tieneStats = !!p.espnId
            const partidoAbierto = expandidoPartido.has(i)
            const st = liveStats[p.espnId]
            const eventos = liveEventos[p.espnId] ?? []
            // Penales: los goles de la tanda llegan mezclados como "goal" en los
            // eventos normales — los filtramos. La secuencia completa de la tanda
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
            const posH = hayStats ? parseFloat(st.home.posesion) || 50 : 50
            return (
              <div
                key={i}
                onClick={tieneAlgo ? () => togglePartido(i) : undefined}
                className={`ranking-match-row${esVivo ? ' is-live' : ''}${tieneAlgo ? ' is-clickable' : ''}`}
                style={{ borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="ranking-match-body">
                  <div className="ranking-match-desktop-teams">
                    <div className="ranking-match-side is-home">
                      {p.escudoLocal && <img className="ranking-match-crest" src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      <span className="ranking-match-name">{p.local}</span>
                    </div>
                    <span
                      className={`ranking-match-score is-desktop${pendiente ? ' is-pending' : ''}`}
                      style={{ color: cancelado ? 'var(--muted)' : esVivo ? '#FCA5A5' : 'var(--text-strong)', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', textDecoration: cancelado ? 'line-through' : 'none' }}
                    >
                      {pendiente ? 'vs' : `${scoreLocal}–${scoreVisitante}`}
                    </span>
                    <div className="ranking-match-side is-away">
                      <span className="ranking-match-name">{p.visitante}</span>
                      {p.escudoVisitante && <img className="ranking-match-crest" src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                    </div>
                  </div>
                  <div className="ranking-match-mobile-teams">
                    <div className="ranking-match-team">
                      {p.escudoLocal && <img className="ranking-match-crest" src={p.escudoLocal} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      <span className="ranking-match-name">{p.local}</span>
                      <span
                        className={`ranking-match-score${pendiente ? ' is-pending is-mobile-pending' : ''}`}
                        style={{ color: cancelado ? 'var(--muted)' : esVivo ? '#FCA5A5' : 'var(--text-strong)', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', textDecoration: cancelado ? 'line-through' : 'none' }}
                      >
                        {pendiente ? 'Pendiente' : scoreLocalDisplay}
                      </span>
                    </div>
                    <div className="ranking-match-team">
                      {p.escudoVisitante && <img className="ranking-match-crest" src={p.escudoVisitante} alt="" onError={e => { e.target.style.display = 'none' }} />}
                      <span className="ranking-match-name">{p.visitante}</span>
                      <span
                        className={`ranking-match-score${scoreVisitanteDisplay === '' ? ' is-empty' : ''}`}
                        style={{ color: cancelado ? 'var(--muted)' : esVivo ? '#FCA5A5' : 'var(--text-strong)', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', textDecoration: cancelado ? 'line-through' : 'none' }}
                      >
                        {scoreVisitanteDisplay}
                      </span>
                    </div>
                  </div>
                  <div className="ranking-match-meta">
                    {p.hora && <p className="ranking-match-date">{formatFecha(p.hora)}</p>}
                    <div className="ranking-match-actions">
                    {cancelado ? (
                      <span className="ranking-match-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'var(--border-strong)' }}>Cancelado</span>
                    ) : esVivo ? (
                      <span className="ranking-match-badge" style={{ background: 'var(--red-bg-strong)', color: '#FCA5A5', borderColor: 'transparent' }}>
                        <span className="ranking-match-live-dot" />{live.penalesEnVivo ? 'Penales' : live.halftime ? 'Descanso' : live.clock || 'EN VIVO'}
                      </span>
                    ) : resDisplay ? (
                      <span className="ranking-match-badge" style={{ background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, borderColor: 'transparent' }}>
                        {resultLabel[resDisplay]}
                      </span>
                    ) : (
                      <span className="ranking-match-badge is-pending-badge" style={{ background: 'var(--neutral-bg)', color: 'var(--muted)', borderColor: 'transparent' }}>Pendiente</span>
                    )}
                    {tieneAlgo && (
                      <span className="ranking-match-toggle ranking-match-toggle-mobile">
                        <span className="ranking-match-toggle-icon" aria-hidden="true">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: partidoAbierto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </span>
                    )}
                    </div>
                  </div>
                </div>
                {(p.hora || tieneAlgo) && (
                  <div className="ranking-match-date-desktop">
                    {p.hora && <span>{formatFecha(p.hora)}</span>}
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

                {/* Panel de estadísticas */}
                {tieneAlgo && partidoAbierto && (
                  <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
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
                      <>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{st.home.posesion}%</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Posesión</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)' }}>{st.away.posesion}%</span>
                          </div>
                          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${posH}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
                            <div style={{ flex: 1, background: 'var(--yellow-soft)' }} />
                          </div>
                        </div>
                        {[
                          { label: 'Tiros al arco',  h: st.home.tirosArco,    a: st.away.tirosArco    },
                          { label: 'Tiros totales',  h: st.home.tirosTotales, a: st.away.tirosTotales },
                          { label: 'Corners',        h: st.home.corners,      a: st.away.corners      },
                          { label: 'Faltas',         h: st.home.faltas,       a: st.away.faltas       },
                        ].map(({ label, h, a }) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', width: 36, textAlign: 'right' }}>{h}</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1, textAlign: 'center' }}>{label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)', width: 36 }}>{a}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {eventosNormales.length > 0 && (
                      <div style={{ marginTop: hayStats ? 12 : 0, paddingTop: hayStats ? 10 : 0, borderTop: hayStats ? '1px solid var(--border)' : 'none' }}>
                        <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' }}>Últimos eventos</p>
                        {[...eventosNormales].reverse().map((ev, j) => {
                          const izq = ev.lado === 'home'
                          return (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', flexDirection: izq ? 'row' : 'row-reverse', gap: 6, padding: '3px 0' }}>
                              <span style={{ display: 'inline-flex', color: ev.tipo === 'red-card' ? 'var(--red)' : ev.tipo === 'yellow-card' ? 'var(--yellow)' : 'var(--green)', flexShrink: 0 }}>
                                <SvgIcon name={ev.tipo || 'dot'} size={13} />
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', minWidth: 30, textAlign: izq ? 'left' : 'right' }}>{ev.minuto}</span>
                              <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                          Tanda de penales{tienePenalScore ? ` · ${penalLocal}–${penalVisitante}` : ''}
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
                        style={{ display: 'block', fontSize: 11, color: 'var(--muted)', textDecoration: 'none', textAlign: 'center', marginTop: 10 }}
                      >
                        Ver resumen del partido →
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ¿Quién gana según el marcador del último partido? */}
      {simulacion && <EscenariosUltimoPartido sim={simulacion} conPremio={conPremio} liveScores={liveScores} />}

      {/* Tabla ranking */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {enVivo && (
          <div style={{ background: 'var(--red-bg)', borderBottom: '1px solid var(--red)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>Ranking provisional</span>
          </div>
        )}

        {/* Buscador — solo cuando hay suficientes participantes */}
        {mostrarBuscador && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--card-light)', borderBottom: '1px solid var(--border)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--ranking-grid-cols, 30px 1fr 38px 38px 46px)', padding: '10px var(--ranking-row-pad-x, 16px)', alignItems: 'center', background: 'var(--card-light)', borderBottom: '1px solid var(--border)' }}>
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
          <div style={{ padding: '10px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
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
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px',
              background: esMiFila ? 'linear-gradient(90deg, rgba(34,197,94,0.105), rgba(34,197,94,0.035) 54%, transparent 86%)' : 'transparent',
            }}>
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
        }) : shown.map((j, i) => {
          const abierto = expandido.has(j.nombre)
          const pos = j._pos
          const esLider = pos === 1 && hayResultados
          const esMiFila = !!miNombreRanking && j.nombre === miNombreRanking
          const medalColor = pos <= 3 ? medalColors[pos - 1] : null

          return (
            <div key={j.nombre} style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div
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
                  padding: '13px var(--ranking-row-pad-x, 16px)', alignItems: 'center',
                  background: esMiFila
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.105), rgba(34,197,94,0.035) 54%, transparent 86%)'
                    : esLider
                    ? 'linear-gradient(90deg, rgba(250,204,21,0.18), rgba(250,204,21,0.06) 46%, transparent 78%)'
                    : 'transparent',
                  cursor: cerrada ? 'pointer' : 'default',
                }}
              >
                {esLider && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'linear-gradient(110deg, transparent 18%, rgba(255,255,255,0.04) 36%, rgba(255,237,137,0.24) 50%, rgba(255,255,255,0.05) 64%, transparent 82%)',
                    animation: 'leader-row-shine 7.5s ease-in-out infinite',
                  }} />
                )}
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%' }}>
                  <span style={{
                    fontSize: 14, fontWeight: esLider ? 800 : 700,
                    color: medalColor || 'var(--muted)',
                    textShadow: esLider ? '0 0 10px rgba(250,204,21,0.55), 0 1px 1px rgba(0,0,0,0.3)' : 'none',
                  }}>{pos}</span>
                </span>
                <div style={{ position: 'relative', minWidth: 0 }}>
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
                      <span title={`Racha de ${j.racha.correctas} resultados correctos seguidos`} aria-label="Racha de resultados correctos" style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '8%', width: 32, height: 17, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}>
                          {[{ l: '50%', w: 20, h: 17, d: 0, t: 1.0 }, { l: '32%', w: 14, h: 13, d: .35, t: 1.3 }, { l: '68%', w: 14, h: 13, d: .55, t: 1.2 }, { l: '50%', w: 9, h: 9, d: .2, t: 1.5 }].map((f, fi) => (
                            <span key={fi} style={{
                              position: 'absolute', bottom: 0, left: f.l, width: f.w, height: f.h,
                              transform: 'translateX(-50%)', transformOrigin: 'bottom center',
                              borderRadius: '50% 50% 46% 46%', filter: 'blur(1.5px)',
                              background: 'radial-gradient(ellipse at 50% 80%, rgba(255,240,170,0.34), rgba(249,115,22,0.28) 40%, rgba(239,68,68,0.16) 66%, transparent 80%)',
                              animation: `flame ${f.t}s ease-in-out ${f.d}s infinite`,
                            }} />
                          ))}
                        </span>
                        <span style={{ position: 'relative', zIndex: 1, color: 'var(--yellow)' }}>
                          <SvgIcon name="flame" size={14} />
                        </span>
                      </span>
                    ) : null}
                    {cumpleaneros.includes(j.id) && (
                      <span title="Hoy está de cumpleaños" aria-label="Cumpleaños" style={{ display: 'inline-flex', color: 'var(--yellow)', flexShrink: 0 }}>
                        <SvgIcon name="cake" size={14} />
                      </span>
                    )}
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
                <span style={{ position: 'relative', fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-stat-cell-size, 13px)', textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                <div style={{ position: 'relative', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-points-size, 18px)', fontWeight: 700, color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
                  {premioPorNombre[j.nombre] !== undefined && (
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--green)', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatearMXN(premioPorNombre[j.nombre])}
                    </span>
                  )}
                </div>
              </div>

              {abierto && cerrada && (
                <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '0 var(--ranking-detail-pad-x, 16px) 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 0 8px' }}>
                    Predicciones de {j.nombre}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--ranking-picks-cols, 1fr 40px 46px 32px)', alignItems: 'center', gap: 'var(--ranking-picks-gap, 6px)', padding: '0 var(--ranking-pick-pad-x, 12px) 4px' }}>
                    <span />
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Pick</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Real</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Pts</span>
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
                    return (
                      <div key={pi} style={{
                        display: 'grid', gridTemplateColumns: 'var(--ranking-picks-cols, 1fr 40px 46px 32px)', alignItems: 'center', gap: 'var(--ranking-picks-gap, 6px)',
                        padding: '8px var(--ranking-pick-pad-x, 12px)', marginBottom: 4, borderRadius: 'var(--radius-sm)',
                        background: cancelado ? 'var(--card)' : !resR ? 'var(--card)' : (exacto || correcto) ? 'var(--green-bg)' : 'var(--red-bg)',
                        border: '1px solid',
                        borderColor: cancelado ? 'var(--border)' : !resR ? 'var(--border)' : exacto ? 'var(--green)' : correcto ? 'var(--green-dark)' : 'var(--red)',
                        opacity: cancelado ? 0.7 : 1,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 'var(--ranking-pick-team-size, 12px)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {partido.local} vs {partido.visitante}
                          </p>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-pick-score-size, 13px)', fontWeight: 700, padding: '2px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-bg)', color: 'var(--text)', whiteSpace: 'nowrap', justifySelf: 'end' }}>
                          {pickDisplay(pick)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-pick-score-size, 13px)', color: enVivoPartido ? '#FCA5A5' : 'var(--muted)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, justifySelf: 'end' }}>
                          {/* Punto siempre presente (oculto si no hay partido en vivo) para que el ancho de la columna no cambie entre filas */}
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, opacity: enVivoPartido ? 1 : 0, animation: enVivoPartido ? 'pulse-dot 1.2s ease-in-out infinite' : 'none' }} />
                          {cancelado ? 'Cancelado' : res ? `${res.local}–${res.visitante}` : '—'}
                        </span>
                        <span style={{ fontSize: 'var(--ranking-pick-pts-size, 12px)', fontWeight: 800, whiteSpace: 'nowrap', textAlign: 'right', color: pts === 3 ? 'var(--yellow)' : pts === 1 ? 'var(--green)' : pts === 0 ? 'var(--red)' : 'var(--muted)' }}>
                          {cancelado ? '–' : pts === null ? '—' : pts === 0 ? '✗' : `+${pts}`}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{j.puntos} pts</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

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

      <div style={{
        marginTop: 'var(--ranking-section-gap, 16px)', background: 'var(--card)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)' }}>
          {[
            {
              key: 'share',
              label: 'Compartir ranking',
              icon: 'camera',
              color: 'var(--green)',
              disabled: !puedeCompartir,
              onClick: () => setPanelActivo(p => p === 'share' ? null : 'share'),
            },
            {
              key: 'tie',
              label: 'Empates',
              icon: 'scale',
              color: 'var(--green)',
              onClick: () => setPanelActivo(p => p === 'tie' ? null : 'tie'),
            },
            {
              key: 'live',
              label: 'Tiempo real',
              icon: 'broadcast',
              color: 'var(--red)',
              onClick: () => setPanelActivo(p => p === 'live' ? null : 'live'),
            },
          ].map(item => {
            const activo = panelActivo === item.key
            const activeBg = item.key === 'live' ? 'var(--red-bg)' : 'var(--green-bg)'
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                aria-label={item.label}
                title={item.label}
                style={{
                  minWidth: 0, border: 'none', borderRadius: 0,
                  padding: '11px 8px', background: activo ? activeBg : 'var(--card)',
                  color: item.disabled ? 'var(--muted)' : activo ? item.color : 'var(--muted)',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.18s ease, color 0.18s ease',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 'var(--radius-full)',
                  background: activo ? 'rgba(255,255,255,0.06)' : 'var(--neutral-bg)',
                  border: `1px solid ${activo ? item.color : 'var(--border-strong)'}`,
                  boxShadow: activo ? 'inset 0 1px 0 rgba(255,255,255,0.07)' : 'none',
                }}>
                  <SvgIcon name={item.icon} size={15} style={{ color: item.disabled ? 'var(--muted)' : activo ? item.color : undefined }} />
                </span>
              </button>
            )
          })}
        </div>
        {panelActivo && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '11px 14px', borderTop: '1px solid var(--border)',
            background: 'var(--bg-soft)',
          }}>
            <span style={{
              display: 'inline-flex', flexShrink: 0, paddingTop: 1,
              color: panelActivo === 'live' ? 'var(--red)' : 'var(--green)',
            }}>
              <SvgIcon name={panelActivo === 'share' ? 'camera' : panelActivo === 'tie' ? 'scale' : 'broadcast'} size={14} />
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              {panelActivo === 'share' && (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {compartiendo || compartiendoOraculo
                      ? 'Generando imagen para compartir...'
                      : feedbackShare || 'Genera una imagen del ranking para compartirla con tu grupo.'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {simulacion && (
                      <button
                        type="button"
                        onClick={handleCompartirOraculo}
                        disabled={compartiendoOraculo}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '7px 10px', borderRadius: 'var(--radius-full)',
                          border: '1px solid #A855F7',
                          background: compartiendoOraculo ? 'var(--card-light)' : 'rgba(168,85,247,0.14)',
                          color: compartiendoOraculo ? 'var(--muted)' : '#C084FC',
                          fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                          cursor: compartiendoOraculo ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <SvgIcon name="sparkles" size={13} />
                        Oráculo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCompartirRanking}
                      disabled={compartiendo || !puedeCompartir}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '7px 10px', borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--green)',
                        background: compartiendo ? 'var(--card-light)' : 'rgba(34,197,94,0.12)',
                        color: compartiendo ? 'var(--muted)' : 'var(--green)',
                        fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                        cursor: compartiendo || !puedeCompartir ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <SvgIcon name="camera" size={13} />
                      Generar
                    </button>
                  </span>
                </span>
              )}
              {panelActivo === 'tie' && 'Empate en puntos: comparten posición y reparten el premio en partes iguales.'}
              {panelActivo === 'live' && 'Actualización en tiempo real: los resultados se actualizan mientras la quiniela está en juego.'}
            </span>
          </div>
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

function EscenariosUltimoPartido({ sim, conPremio, liveScores = {} }) {
  const { partido, filas, numJugadores } = sim
  const local = partido.local, visitante = partido.visitante
  const [abierto, setAbierto] = useState(false)

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
  const marcadorActual = enVivo ? `${curL}–${curV}` : ''

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
    <div className="oracle-card">
      <button
        onClick={() => setAbierto(a => !a)}
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
        <span className="oracle-toggle">
          {abierto ? 'Ocultar' : 'Ver'}
        </span>
      </button>

      {abierto && (
        <>
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
              <Fila key={i} esExacto marcador={`${f.esc.local}–${f.esc.visitante}`} fila={f}
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
        </>
      )}
    </div>
  )
}

function SinPremioBanner() {
  return (
    <div style={{
      background: 'var(--card)', border: '1px dashed var(--border-strong)',
      borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ display: 'inline-flex', color: 'var(--yellow)', flexShrink: 0 }} aria-hidden="true">
        <SvgIcon name="target" size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', letterSpacing: 0.3, marginBottom: 2 }}>
          SOLO POR DIVERSIÓN
        </p>
        <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Quiniela sin premio en dinero. Compite por la cima del ranking.
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
        background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))',
        border: '1px solid var(--green)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Premio</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.01em' }}>
            {formatearMXN(bote)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{mensaje}</p>
      </div>
    )
  }

  const titulo = finalizada ? 'Ganadores' : 'Si terminara ahora'
  return (
    <div className="ranking-prize-banner" style={{
      background: finalizada
        ? 'linear-gradient(135deg, rgba(250,204,21,0.14), rgba(250,204,21,0.04))'
        : 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
      border: `1px solid ${finalizada ? 'var(--yellow)' : 'var(--green)'}`,
      borderRadius: 'var(--radius-md)', marginBottom: 16,
    }}>
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
        <p style={{ fontSize: 'var(--ranking-prize-note-size, 11px)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          Premios provisionales. Pueden cambiar mientras la quiniela siga en juego.
        </p>
      )}
    </div>
  )
}
