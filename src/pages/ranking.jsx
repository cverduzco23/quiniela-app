import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { cierreToDate, quinielaCerrada } from '../utils/cierre'
import { goalsToResultado, getResultado, getPickResultado, getEfectivo, calcularPuntos } from '../utils/scoring'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
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

export default function Ranking() {
  const [searchParams] = useSearchParams()
  const quinielaId = searchParams.get('q')

  const [quiniela, setQuiniela]           = useState(null)
  const [predicciones, setPredicciones]   = useState([])
  const [cargando, setCargando]           = useState(true)
  const [error, setError]                 = useState(null)
  const [liveScores, setLiveScores]       = useState({})
  const [liveActivo, setLiveActivo]       = useState(false)
  const [ultimaAct, setUltimaAct]         = useState(null)
  const [expandido, setExpandido]         = useState(new Set())
  const [actualizando, setActualizando]   = useState(false)

  const toggleExpandido = (nombre) => {
    setExpandido(prev => {
      const s = new Set(prev)
      s.has(nombre) ? s.delete(nombre) : s.add(nombre)
      return s
    })
  }

  // ── Firebase ────────────────────────────────────────────────────
  useEffect(() => {
    if (!quinielaId) { setCargando(false); setError('no-id'); return }

    const unsubQ = onSnapshot(
      doc(db, 'quinielas', quinielaId),
      snap => {
        if (!snap.exists()) { setError('not-found'); setCargando(false); return }
        setQuiniela({ id: snap.id, ...snap.data() })
        setCargando(false)
      },
      () => { setError('error'); setCargando(false) }
    )
    const unsubP = onSnapshot(
      query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId)),
      snap => setPredicciones(snap.docs.map(d => d.data())),
      () => {}
    )
    return () => { unsubQ(); unsubP() }
  }, [quinielaId])

  // ── Polling ESPN ────────────────────────────────────────────────
  const fetchLiveData = async (quinielaData) => {
    const partidos = quinielaData?.partidos ?? []
    const conEspn  = partidos.filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    const porLiga = {}
    conEspn.forEach(p => {
      if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
      porLiga[p.ligaId].push(p)
    })
    const nuevos = {}
    let hayVivos = false
    for (const [liga, ps] of Object.entries(porLiga)) {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`)
        const d = await r.json()
        const events = d.events ?? []
        ps.forEach(p => {
          const ev    = events.find(e => e.id === p.espnId)
          if (!ev) return
          const state = ev.status?.type?.state
          const comps = ev.competitions?.[0]?.competitors ?? []
          const home  = comps.find(c => c.homeAway === 'home')
          const away  = comps.find(c => c.homeAway === 'away')
          nuevos[p.espnId] = { state, clock: ev.status?.displayClock ?? '', local: home?.score ?? '', visitante: away?.score ?? '' }
          if (state === 'in') hayVivos = true
        })
      } catch { /* silencioso */ }
    }
    setLiveScores(nuevos)
    setLiveActivo(hayVivos)
    setUltimaAct(new Date())
  }

  useEffect(() => {
    if (!quiniela) return
    const conEspn = (quiniela.partidos ?? []).filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    fetchLiveData(quiniela)
    const interval = setInterval(() => fetchLiveData(quiniela), 60000)
    return () => clearInterval(interval)
  }, [quiniela?.id])

  const handleRefresh = async () => {
    if (actualizando || !quiniela) return
    setActualizando(true)
    try {
      await fetchLiveData(quiniela)
    } finally {
      setActualizando(false)
    }
  }

  // ── Render estados ────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando ranking…
    </div>
  )
  if (error || !quiniela) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>No se pudo cargar el ranking</p>
      </div>
    </div>
  )

  const partidos    = quiniela.partidos ?? []
  const resultados  = quiniela.resultados ?? {}
  const cerrada     = quinielaCerrada(quiniela)
  const terminados  = partidos.filter((_, i) => getResultado(resultados[i] ?? resultados[String(i)]) !== null).length
  const enVivo      = Object.values(liveScores).some(l => l.state === 'in')
  const hayResultados = terminados > 0 || enVivo

  const jugadores = predicciones
    .map(p => ({ nombre: p.nombre, picks: p.picks, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    .sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp · Ranking</a>
            <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }}>← Inicio</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 10, letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: enVivo ? 'var(--red-bg-strong)' : 'var(--neutral-bg)',
              border: `1px solid ${enVivo ? 'var(--red)' : 'var(--border)'}`,
            }}>
              {enVivo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FCA5A5', display: 'inline-block' }} />}
              {enVivo ? 'EN VIVO' : terminados === 0 ? 'Sin resultados aún' : `${terminados}/${partidos.length} partidos terminados`}
            </span>
            {ultimaAct && Object.keys(liveScores).length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Actualizado {ultimaAct.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={actualizando}
              aria-label="Actualizar resultados"
              style={{
                background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
                color: 'var(--text)', padding: '4px 12px', borderRadius: 'var(--radius-full)', fontSize: 11,
                fontWeight: 700, cursor: actualizando ? 'not-allowed' : 'pointer',
                opacity: actualizando ? 0.6 : 1,
              }}
            >
              {actualizando ? '…' : '↻ Actualizar'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* Reglas */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {[{ pts: '1 pt', desc: 'Resultado correcto' }, { pts: '+2 pts', desc: 'Marcador exacto' }].map(r => (
            <div key={r.desc} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', border: '1px solid var(--border)', flex: '1 1 auto' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{r.pts}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</span>
            </div>
          ))}
        </div>

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
              {enVivo && <span style={{ fontSize: 11, fontWeight: 700, color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />En vivo</span>}
            </div>
            {partidos.map((p, i) => {
              const live     = p.espnId ? liveScores?.[p.espnId] : null
              const stored   = resultados[i] ?? resultados[String(i)]
              const esVivo   = live?.state === 'in'
              const esFinish = live?.state === 'post'
              let scoreLocal = '–', scoreVisitante = '–', resDisplay = null
              if (live && (esVivo || esFinish) && live.local !== '') {
                scoreLocal = live.local; scoreVisitante = live.visitante
                resDisplay = goalsToResultado(live.local, live.visitante)
              } else if (stored) {
                scoreLocal = stored.local ?? '–'; scoreVisitante = stored.visitante ?? '–'
                resDisplay = getResultado(stored)
              }
              return (
                <div key={i} style={{ borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none', background: esVivo ? 'rgba(250, 204, 21, 0.06)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: p.hora ? '9px 16px 2px' : '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: esVivo ? '#FCA5A5' : 'var(--text-strong)', padding: '3px 8px', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', borderRadius: 'var(--radius-sm)', margin: '0 6px', minWidth: 46, textAlign: 'center', flexShrink: 0 }}>
                      {scoreLocal}–{scoreVisitante}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                      {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    </div>
                    <div style={{ marginLeft: 10, minWidth: 70, textAlign: 'right' }}>
                      {esVivo ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 'var(--radius-full)', background: 'var(--red-bg-strong)', color: '#FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />{live.clock || 'EN VIVO'}
                        </span>
                      ) : resDisplay ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, whiteSpace: 'nowrap' }}>
                          {resultLabel[resDisplay]}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)' }}>Pendiente</span>
                      )}
                      {(esFinish || stored) && !esVivo && p.espnId && (
                        <a
                          href={`https://www.espn.com/soccer/match/_/gameId/${p.espnId}`}
                          target="_blank" rel="noreferrer"
                          style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', marginTop: 4 }}
                        >
                          Ver resumen →
                        </a>
                      )}
                    </div>
                  </div>
                  {p.hora && (
                    <p style={{ fontSize: 10, color: 'var(--muted)', padding: '0 16px 8px', margin: 0 }}>
                      {formatFecha(p.hora)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Tabla ranking */}
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {enVivo && (
            <div style={{ background: 'var(--red-bg)', borderBottom: '1px solid var(--red)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>Ranking provisional — actualizando cada minuto</span>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px', padding: '10px 16px', background: 'var(--card-light)', borderBottom: '1px solid var(--border)' }}>
            {['#', 'Jugador', 'Result.', 'Exactos', 'Pts'].map((h, idx) => (
              <span key={h} style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>

          {jugadores.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Nadie ha registrado predicciones todavía.
            </div>
          ) : jugadores.map((j, i) => {
            const abierto = expandido.has(j.nombre)
            const esLider = i === 0 && hayResultados

            return (
              <div key={j.nombre} style={{ borderBottom: i < jugadores.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div
                  onClick={() => cerrada && toggleExpandido(j.nombre)}
                  style={{
                    display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px',
                    padding: '13px 16px', alignItems: 'center',
                    background: esLider ? 'linear-gradient(90deg, var(--yellow-bg), transparent 60%)' : 'transparent',
                    cursor: cerrada ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ fontSize: i < 3 ? 18 : 14, fontWeight: 700, color: i < 3 ? 'var(--yellow)' : 'var(--muted)' }}>
                    {i < 3 ? medals[i] : `${i + 1}`}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {j.nombre}
                    {cerrada && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{j.aciertos}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, textAlign: 'center', color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
                </div>

                {abierto && cerrada && (
                  <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '0 16px 12px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 0 8px' }}>
                      Predicciones de {j.nombre}
                    </p>
                    {partidos.map((partido, pi) => {
                      const pick       = j.picks?.[pi] ?? j.picks?.[String(pi)]
                      const res        = getEfectivo(partido, pi, resultados, liveScores)
                      const resR       = getResultado(res)
                      const pickR      = getPickResultado(pick)
                      const correcto   = resR && pickR && resR === pickR
                      const exacto     = correcto && typeof pick === 'object' && pick !== null &&
                                         String(res.local) === String(pick.local) &&
                                         String(res.visitante) === String(pick.visitante)
                      const pts        = !resR ? null : exacto ? 3 : correcto ? 1 : 0

                      return (
                        <div key={pi} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                          alignItems: 'center', gap: 8,
                          padding: '8px 12px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
                          background: !resR ? 'var(--card)' : exacto ? 'var(--green-bg)' : correcto ? 'var(--green-bg)' : 'var(--red-bg)',
                          border: '1px solid',
                          borderColor: !resR ? 'var(--border)' : exacto ? 'var(--green)' : correcto ? 'var(--green-dark)' : 'var(--red)',
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {partido.local} vs {partido.visitante}
                            </p>
                          </div>

                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-bg)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                            {pickDisplay(pick)}
                          </span>

                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {res ? `${res.local}–${res.visitante}` : '—'}
                          </span>

                          <span style={{
                            fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right',
                            color: pts === 3 ? 'var(--yellow)' : pts === 1 ? 'var(--green)' : pts === 0 ? 'var(--red)' : 'var(--muted)',
                          }}>
                            {pts === null ? '—' : pts === 0 ? '✗' : `+${pts}`}
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
            <div style={{ padding: '10px 16px', background: 'var(--yellow-bg)', borderTop: '1px solid var(--yellow-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--yellow-soft)' }}>🔒 Las predicciones de cada jugador se revelan al cierre de la quiniela</span>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 14, lineHeight: 1.8 }}>
          1 pt resultado correcto · +2 pts marcador exacto (máx. 3 pts por partido){'\n'}
          Empate de puntos: gana quien tenga más marcadores exactos; si persiste, más resultados correctos · {enVivo ? '🔴 Actualizando cada 60 seg' : 'Actualización en tiempo real'}
        </p>
      </div>
    </div>
  )
}
