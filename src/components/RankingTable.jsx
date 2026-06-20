import { useState, useEffect, useRef } from 'react'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from '../utils/cierre'
import { goalsToResultado, getResultado, getPickResultado, getEfectivo, calcularPuntos } from '../utils/scoring'
import { tienePremio, calcularGanadores, formatearMXN, descripcionRegla } from '../utils/premios'
import { simularUltimoPartido } from '../utils/escenarios'
import { normalizarNombre } from '../utils/nombres'
import { compartirRanking } from '../utils/shareRanking'
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

const medals = ['🥇', '🥈', '🥉']
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

export function RankingTable({ quiniela, predicciones, liveScores = {}, liveStats = {}, liveEventos = {} }) {
  const { alerta } = useDialog()
  const [expandido, setExpandido]               = useState(new Set())
  const [expandidoPartido, setExpandidoPartido] = useState(new Set())
  const [visibles, setVisibles]                 = useState(PAGE_SIZE)
  const [compartiendo, setCompartiendo] = useState(false)
  const [feedbackShare, setFeedbackShare] = useState('')
  const [busqueda, setBusqueda]                 = useState('')

  // Detección de cambios de posición para animar las filas afectadas
  const prevPosicionesRef = useRef(null)
  const [cambios, setCambios] = useState(new Map())

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

  const partidos   = quiniela.partidos ?? []
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

  const jugadores = predicciones
    .map(p => ({ nombre: normalizarNombre(p.nombre), picks: p.picks, fecha: p.fecha, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    // Orden: por puntos. Para mostrar la tabla de forma estable, dentro del mismo
    // puntaje se ordena por marcadores exactos y luego aciertos. La posición y el
    // premio dependen SOLO de los puntos (empate en puntos = misma posición y se
    // reparte). La hora de envío NO influye en nada.
    .sort((a, b) =>
      b.puntos - a.puntos ||
      b.exactos - a.exactos ||
      b.aciertos - a.aciertos
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
  const filtroBusqueda  = busqueda.trim().toLowerCase()
  const filtrados       = filtroBusqueda
    ? jugadoresConPos.filter(j => j.nombre.toLowerCase().includes(filtroBusqueda))
    : jugadoresConPos
  const shown     = filtrados.slice(0, visibles)
  const restantes = filtrados.length - shown.length
  const mostrarBuscador = jugadores.length > UMBRAL_BUSQUEDA

  // Detectar cambios de posición entre renders (típicamente al llegar nuevos scores)
  // y disparar animación de 1.8s. No animamos en el primer render.
  useEffect(() => {
    if (jugadores.length === 0) return
    const nueva = new Map()
    jugadores.forEach((j, i) => nueva.set(j.nombre, posiciones[i]))
    const prev = prevPosicionesRef.current
    prevPosicionesRef.current = nueva
    if (!prev) return // primer render: solo guardamos snapshot, no animamos
    const detectados = new Map()
    nueva.forEach((pos, nombre) => {
      const posAnt = prev.get(nombre)
      if (posAnt !== undefined && posAnt !== pos) {
        detectados.set(nombre, pos < posAnt ? 'subio' : 'bajo')
      }
    })
    if (detectados.size > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCambios(detectados)
      const t = setTimeout(() => setCambios(new Map()), 1800)
      return () => clearTimeout(t)
    }
  })

  const conPremio = tienePremio(quiniela)
  const { ganadores, premioPorNombre, bote } = calcularGanadores(jugadores, quiniela, jugadores.length)

  // Escenarios del último partido: solo tiene sentido cuando la quiniela ya
  // cerró (los picks son públicos) y queda exactamente un partido por definir.
  const simulacion = cerrada ? simularUltimoPartido(quiniela, predicciones, liveScores) : null

  return (
    <>
      <style>{`@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}`}</style>
      {/* Reglas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ pts: '1 pt', desc: 'Resultado correcto' }, { pts: '+2 pts', desc: 'Marcador exacto' }].map(r => (
          <div key={r.desc} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', border: '1px solid var(--border)', flex: '1 1 auto' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{r.pts}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</span>
          </div>
        ))}
      </div>

      {/* Banner de premio */}
      {conPremio && <PremioBanner quiniela={quiniela} bote={bote} ganadores={ganadores} finalizada={finalizada} hayResultados={hayResultados} />}
      {!conPremio && <SinPremioBanner />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { val: jugadores.length,                   label: 'Participantes' },
          { val: `${terminados}/${partidos.length}`, label: 'Partidos' },
          { val: jugadores[0]?.puntos ?? 0,          label: 'Pts líder' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '14px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, display: 'block', color: 'var(--yellow)' }}>{s.val}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Partidos */}
      {partidos.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Partidos</span>
            {enVivo && <span style={{ fontSize: 11, fontWeight: 700, color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />En vivo</span>}
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
            const tieneStats = !!p.espnId
            const partidoAbierto = expandidoPartido.has(i)
            const st = liveStats[p.espnId]
            const eventos = liveEventos[p.espnId] ?? []
            const hayStats = !!st && st.state !== 'pre'
            const hayResumen = tieneStats && (esFinish || !!stored) && !cancelado
            const tieneAlgo = hayStats || hayResumen
            const posH = hayStats ? parseFloat(st.home.posesion) || 50 : 50
            return (
              <div
                key={i}
                onClick={tieneAlgo ? () => togglePartido(i) : undefined}
                style={{ borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none', background: esVivo ? 'rgba(250,204,21,0.06)' : 'transparent', cursor: tieneAlgo ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: p.hora ? '9px 16px 2px' : '11px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                    {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: cancelado ? 'var(--muted)' : esVivo ? '#FCA5A5' : 'var(--text-strong)', padding: '3px 8px', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', borderRadius: 'var(--radius-sm)', margin: '0 6px', minWidth: 46, textAlign: 'center', flexShrink: 0, textDecoration: cancelado ? 'line-through' : 'none' }}>
                    {scoreLocal}–{scoreVisitante}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                    {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                  </div>
                  <div style={{ marginLeft: 10, minWidth: 70, textAlign: 'right' }}>
                    {cancelado ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)', border: '1px solid var(--border-strong)' }}>Cancelado</span>
                    ) : esVivo ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 'var(--radius-full)', background: 'var(--red-bg-strong)', color: '#FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />{live.halftime ? 'Descanso' : live.clock || 'EN VIVO'}
                      </span>
                    ) : resDisplay ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, whiteSpace: 'nowrap' }}>
                        {resultLabel[resDisplay]}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)' }}>Pendiente</span>
                    )}
                    {tieneAlgo && (
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                        📊 {partidoAbierto ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </div>
                {p.hora && <p style={{ fontSize: 10, color: 'var(--muted)', padding: '0 16px 8px', margin: 0 }}>{formatFecha(p.hora)}</p>}

                {/* Panel de estadísticas */}
                {tieneAlgo && partidoAbierto && (
                  <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
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
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', width: 36, textAlign: 'right' }}>{h}</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1, textAlign: 'center' }}>{label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', width: 36 }}>{a}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {eventos.length > 0 && (
                      <div style={{ marginTop: hayStats ? 12 : 0, paddingTop: hayStats ? 10 : 0, borderTop: hayStats ? '1px solid var(--border)' : 'none' }}>
                        <p style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' }}>Últimos eventos</p>
                        {[...eventos].reverse().map((ev, j) => {
                          const izq = ev.lado === 'home'
                          return (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', flexDirection: izq ? 'row' : 'row-reverse', gap: 6, padding: '3px 0' }}>
                              <span style={{ fontSize: 13 }}>{ev.emoji}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', minWidth: 30, textAlign: izq ? 'left' : 'right' }}>{ev.minuto}</span>
                              <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ev.jugador}{ev.ownGoal ? ' (a.g.)' : ''}
                              </span>
                            </div>
                          )
                        })}
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
            <span style={{ fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>Ranking provisional — actualizando cada minuto</span>
          </div>
        )}

        {/* Buscador — solo cuando hay suficientes participantes */}
        {mostrarBuscador && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
            <input
              type="text"
              placeholder={`🔍 Buscar entre ${jugadores.length} participantes…`}
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setVisibles(PAGE_SIZE) }}
              style={{ width: '100%', fontSize: 13, padding: '8px 12px' }}
              aria-label="Buscar nombre en el ranking"
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px', padding: '10px 16px', background: 'var(--card-light)', borderBottom: '1px solid var(--border)' }}>
          {['#', 'Jugador', 'Result.', 'Exactos', 'Pts'].map((h, idx) => (
            <span key={h} style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>

        {jugadores.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Nadie ha registrado predicciones todavía.
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Sin resultados para "<strong style={{ color: 'var(--text)' }}>{busqueda}</strong>". Verifica el nombre o limpia la búsqueda.
          </div>
        ) : shown.map((j, i) => {
          const abierto = expandido.has(j.nombre)
          const pos = j._pos
          const esLider = pos === 1 && hayResultados
          const medalla = pos <= 3 ? medals[pos - 1] : null
          const cambio = cambios.get(j.nombre)

          return (
            <div key={j.nombre} style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div
                onClick={() => cerrada && toggleExpandido(j.nombre)}
                style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px',
                  padding: '13px 16px', alignItems: 'center',
                  background: esLider
                    ? 'linear-gradient(90deg, var(--yellow-bg), transparent 60%)'
                    : 'transparent',
                  cursor: cerrada ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontSize: medalla ? 18 : 14, fontWeight: 700, color: medalla ? 'var(--yellow)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {medalla ?? `${pos}`}
                  {cambio === 'subio' && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 800 }} aria-label="Subió de posición">▲</span>}
                  {cambio === 'bajo'  && <span style={{ fontSize: 11, color: 'var(--red)',   fontWeight: 800 }} aria-label="Bajó de posición">▼</span>}
                </span>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ fontSize: 14, fontWeight: esLider ? 700 : 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {j.nombre}
                    {cerrada && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>}
                  </span>
                  {j.fecha && (
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Enviado: {formatFecha(j.fecha)}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{j.aciertos}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
                  {premioPorNombre[j.nombre] !== undefined && (
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--green)', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatearMXN(premioPorNombre[j.nombre])}
                    </span>
                  )}
                </div>
              </div>

              {abierto && cerrada && (
                <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '0 16px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 0 8px' }}>
                    Predicciones de {j.nombre}
                  </p>
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
                        display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 8,
                        padding: '8px 12px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
                        background: cancelado ? 'var(--card)' : !resR ? 'var(--card)' : (exacto || correcto) ? 'var(--green-bg)' : 'var(--red-bg)',
                        border: '1px solid',
                        borderColor: cancelado ? 'var(--border)' : !resR ? 'var(--border)' : exacto ? 'var(--green)' : correcto ? 'var(--green-dark)' : 'var(--red)',
                        opacity: cancelado ? 0.7 : 1,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {partido.local} vs {partido.visitante}
                          </p>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-bg)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {pickDisplay(pick)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: enVivoPartido ? '#FCA5A5' : 'var(--muted)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {enVivoPartido && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, animation: 'pulse-dot 1.2s ease-in-out infinite' }} />}
                          {cancelado ? 'Cancelado' : res ? `${res.local}–${res.visitante}` : '—'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right', color: pts === 3 ? 'var(--yellow)' : pts === 1 ? 'var(--green)' : pts === 0 ? 'var(--red)' : 'var(--muted)' }}>
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

        {!cerrada && jugadores.length > 0 && (
          <div style={{ padding: '10px 16px', background: 'var(--yellow-bg)', borderTop: '1px solid var(--yellow-soft)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--yellow-soft)' }}>🔒 Las predicciones de cada jugador se revelan al cierre de la quiniela</div>
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

      {jugadores.length > 0 && (
        <>
          <button
            onClick={async () => {
              if (compartiendo) return
              setCompartiendo(true)
              setFeedbackShare('')
              try {
                // Detectar el nombre del usuario actual (si ya envió desde este dispositivo)
                // para que la imagen incluya su fila + vecinos cuando esté fuera del Top.
                let miNombre = null
                try {
                  const raw = quiniela?.id ? localStorage.getItem(`quiniela-${quiniela.id}-enviada`) : null
                  if (raw) {
                    const data = JSON.parse(raw)
                    if (data?.nombre) miNombre = data.nombre
                  }
                } catch { /* localStorage no disponible — imagen genérica */ }
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
                  setFeedbackShare('✓ Imagen copiada — pégala donde quieras')
                  setTimeout(() => setFeedbackShare(''), 4000)
                } else if (res?.descargado) {
                  setFeedbackShare('✓ Imagen descargada — compártela donde quieras')
                  setTimeout(() => setFeedbackShare(''), 4000)
                }
              } catch (err) {
                console.error('Error compartiendo:', err)
                alerta('No se pudo generar la imagen. Intenta de nuevo.')
              } finally {
                setCompartiendo(false)
              }
            }}
            disabled={compartiendo}
            style={{
              width: '100%', marginTop: 14, padding: '13px 16px',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: compartiendo ? 'var(--card-light)' : '#25D366',
              color: compartiendo ? 'var(--muted)' : '#FFFFFF',
              fontSize: 14, fontWeight: 800, letterSpacing: 0.2,
              cursor: compartiendo ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {compartiendo ? 'Generando imagen…' : '📷 Compartir ranking como imagen'}
          </button>
          {feedbackShare && (
            <p style={{ fontSize: 12, color: 'var(--green)', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
              {feedbackShare}
            </p>
          )}
        </>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 14, lineHeight: 1.8 }}>
        1 pt resultado correcto · +2 pts marcador exacto (máx. 3 pts por partido){'\n'}
        Empate en puntos: comparten posición{conPremio ? ' y reparten el premio en partes iguales' : ''} · {enVivo ? '🔴 Actualizando cada 60 seg' : 'Actualización en tiempo real'}
      </p>
    </>
  )
}

// Acorta un nombre a sus dos primeros tokens (en una quiniela familiar el
// nombre distingue mejor que el apellido). "Juan José Verduzco" → "Juan José".
function nombreCorto(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2).join(' ')
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

  // Ancho común del chip (marcadores y genéricos) para que todo quede alineado.
  const CHIP_W = 60
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

  // Una fila compacta: marcador a la izquierda, ganador(es) a la derecha.
  // `actual` resalta la fila del marcador en vivo; `imposible` tacha la fila de
  // un marcador exacto que ya no se puede alcanzar (los goles solo suben).
  const Fila = ({ marcador, esExacto, fila, ultima, actual, imposible }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', margin: '0 -8px',
      borderBottom: ultima ? 'none' : '1px solid var(--border)',
      background: actual ? 'var(--red-bg)' : 'transparent',
      borderRadius: actual ? 'var(--radius-sm)' : 0,
      opacity: imposible ? 0.4 : 1,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: esExacto ? 0 : 3,
        fontFamily: esExacto ? 'var(--font-display)' : 'inherit',
        fontSize: esExacto ? 13 : 10.5, fontWeight: esExacto ? 800 : 700,
        color: actual ? '#FCA5A5' : imposible ? 'var(--muted)' : 'var(--text-strong)',
        background: actual ? 'var(--red-bg-strong)' : 'var(--neutral-bg)',
        border: `1px solid ${actual ? 'var(--red)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--radius-sm)', padding: '2px 3px', width: CHIP_W, flexShrink: 0,
        textDecoration: imposible ? 'line-through' : 'none', whiteSpace: 'nowrap',
      }}>{marcador}</span>
      <span style={{
        fontSize: 13, fontWeight: 700, lineHeight: 1.3, flex: 1, minWidth: 0,
        color: imposible ? 'var(--muted)' : 'var(--green)',
        textDecoration: imposible ? 'line-through' : 'none',
      }}>
        {fila.lideres.map(nombreCorto).join(', ')}
      </span>
      {actual && (
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          fontSize: 10, fontWeight: 800, color: '#FCA5A5',
          background: 'var(--red-bg-strong)', borderRadius: 'var(--radius-full)', padding: '2px 8px', whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
          {marcadorActual}
        </span>
      )}
    </div>
  )

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.04))',
      border: '1px solid var(--purple, #A855F7)', borderRadius: 'var(--radius-md)',
      padding: '12px 14px', marginBottom: 16,
      // Parpadeo morado solo cuando está colapsado (para invitar a tocarlo).
      animation: abierto ? 'none' : 'pulse-morado 1.6s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse-morado{0%,100%{box-shadow:0 0 0 0 rgba(168,85,247,0)}50%{box-shadow:0 0 0 4px rgba(168,85,247,0.28)}}`}</style>

      {/* Encabezado: toda la barra es el botón para expandir/colapsar */}
      <button
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        style={{
          width: '100%', background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">🔮</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: 0.2, flex: 1 }}>
          ¿Quién gana según el marcador?
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple, #A855F7)', whiteSpace: 'nowrap' }}>
          {abierto ? 'Ocultar ▲' : 'Ver ▼'}
        </span>
      </button>

      {abierto && (
        <>
          <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, margin: '8px 0 10px' }}>
            <strong style={{ color: 'var(--text)' }}>{local} vs {visitante}</strong> define la quiniela.
            Esto es quién se lleva el 1° lugar{conPremio ? ' y el premio' : ''} según cómo quede:
          </p>

          <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '2px 12px' }}>
            {/* Encabezado: escudos de los equipos (marcan la orientación local–visitante) y "Ganadores" */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-strong)' }}>
              <span style={{ width: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, flexShrink: 0 }}>
                <EscudoEquipo url={partido.escudoLocal} nombre={local} />
                <EscudoEquipo url={partido.escudoVisitante} nombre={visitante} />
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Ganadores
              </span>
            </div>
            {exactas.map((f, i) => (
              <Fila key={i} esExacto marcador={`${f.esc.local}–${f.esc.visitante}`} fila={f}
                ultima={i === exactas.length - 1}
                actual={enVivo && f.esc.local === curL && f.esc.visitante === curV}
                imposible={enVivo && (f.esc.local < curL || f.esc.visitante < curV)} />
            ))}
            {genericas.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0 5px' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
                  Cualquier otro marcador
                </span>
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}
            {genericas.map((f, i) => (
              <Fila key={`g${i}`} marcador={contenidoGenerico(f.esc)} fila={f}
                ultima={i === genericas.length - 1}
                actual={enVivo && !hayExactaActual && f.esc.resultado === curRes} />
            ))}
          </div>

          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
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
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">🎉</span>
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

function PremioBanner({ quiniela, bote, ganadores, finalizada, hayResultados }) {
  const medalla = (pos) => pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : ''
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
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', letterSpacing: 0.4 }}>
            💸 Bote devuelto
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

  const titulo = finalizada ? '🏆 Ganadores' : '📊 Si terminara ahora'
  return (
    <div style={{
      background: finalizada
        ? 'linear-gradient(135deg, rgba(250,204,21,0.14), rgba(250,204,21,0.04))'
        : 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
      border: `1px solid ${finalizada ? 'var(--yellow)' : 'var(--green)'}`,
      borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: finalizada ? 'var(--yellow)' : 'var(--green)', letterSpacing: 0.4 }}>
          {titulo}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          Bote: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatearMXN(bote)}</span>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {Object.entries(grupos).map(([pos, gs]) => (
          <div key={pos} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '8px 12px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{medalla(Number(pos))}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {gs.map(g => g.nombre).join(', ')}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {formatearMXN(gs[0].premio)}{gs.length > 1 ? ' c/u' : ''}
            </span>
          </div>
        ))}
      </div>
      {!finalizada && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          Premios provisionales. Pueden cambiar mientras la quiniela siga en juego.
        </p>
      )}
    </div>
  )
}
