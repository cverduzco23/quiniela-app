import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function goalsToResultado(local, visitante) {
  const l = Number(local), v = Number(visitante)
  if (isNaN(l) || isNaN(v)) return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

function getResultado(r) {
  if (!r) return null
  if (r.resultado) return r.resultado
  return goalsToResultado(r.local, r.visitante)
}

function getPickResultado(pick) {
  if (!pick) return null
  if (typeof pick === 'object') return goalsToResultado(pick.local, pick.visitante)
  return pick
}

function getEfectivo(partido, idx, resultados, liveScores) {
  const live = partido?.espnId ? liveScores?.[partido.espnId] : null
  if (live && (live.state === 'in' || live.state === 'post') &&
      live.local !== '' && live.visitante !== '') {
    return { local: live.local, visitante: live.visitante, resultado: goalsToResultado(live.local, live.visitante) }
  }
  return resultados?.[idx] ?? resultados?.[String(idx)] ?? null
}

function calcularPuntos(picks, resultados, liveScores, partidos) {
  let puntos = 0, aciertos = 0, exactos = 0
  partidos.forEach((p, i) => {
    const res  = getEfectivo(p, i, resultados, liveScores)
    const pick = picks?.[i] ?? picks?.[String(i)]
    if (!res || !pick) return
    const resR  = getResultado(res)
    const pickR = getPickResultado(pick)
    if (!resR || !pickR) return
    if (resR === pickR) {
      puntos += 1; aciertos++
      if (typeof pick === 'object' && pick !== null &&
          Number(res.local) === Number(pick.local) &&
          Number(res.visitante) === Number(pick.visitante)) {
        puntos += 2; exactos++
      }
    }
  })
  return { puntos, aciertos, exactos }
}

function formatFecha(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function pickDisplay(pick) {
  if (!pick) return '—'
  if (typeof pick === 'object') {
    const l = pick.local ?? '?', v = pick.visitante ?? '?'
    return `${l}–${v}`
  }
  return { home: 'Local', draw: 'Empate', away: 'Visitante' }[pick] ?? pick
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const medals = ['🥇', '🥈', '🥉']
const resultColor = {
  home: { bg: '#DCFCE7', color: '#15803D' },
  draw: { bg: '#F3F4F6', color: '#4B5563' },
  away: { bg: '#EBF3FF', color: '#1D4ED8' },
}
const resultLabel = { home: 'Local', draw: 'Empate', away: 'Visitante' }

// ─── Componente ───────────────────────────────────────────────────────────────

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

  // ── Firebase ────────────────────────────────────────────────────────────────
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

  // ── Polling ESPN ────────────────────────────────────────────────────────────
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

  // ── Render estados ──────────────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#6B7280', fontSize: 14 }}>
      Cargando ranking…
    </div>
  )
  if (error || !quiniela) return (
    <div style={{ textAlign: 'center', padding: '5rem 1.5rem', color: '#6B7280' }}>
      <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
      <p style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>No se pudo cargar el ranking</p>
    </div>
  )

  const partidos    = quiniela.partidos ?? []
  const resultados  = quiniela.resultados ?? {}
  const cerrada     = quiniela.cerrada || (quiniela.cierre && new Date() > new Date(quiniela.cierre))
  const terminados  = partidos.filter((_, i) => getResultado(resultados[i] ?? resultados[String(i)]) !== null).length
  const enVivo      = Object.values(liveScores).some(l => l.state === 'in')
  const hayResultados = terminados > 0 || enVivo

  const jugadores = predicciones
    .map(p => ({ nombre: p.nombre, picks: p.picks, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    .sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(150deg, #0F2942 0%, #1B5299 100%)', color: '#fff', padding: '2rem 1.25rem 1.75rem' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>⚽ QuinielApp · Ranking</a>
            <a href="/" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>← Inicio</a>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 99, background: enVivo ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.15)' }}>
              {enVivo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F87171', display: 'inline-block' }} />}
              {enVivo ? 'EN VIVO' : terminados === 0 ? 'Sin resultados aún' : `${terminados}/${partidos.length} partidos terminados`}
            </span>
            {ultimaAct && Object.keys(liveScores).length > 0 && (
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                Actualizado {ultimaAct.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {/* Botón actualizar ahora (item 9) */}
            <button
              onClick={handleRefresh}
              disabled={actualizando}
              style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: 11,
                fontWeight: 600, cursor: actualizando ? 'not-allowed' : 'pointer',
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
            <div key={r.desc} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 8, padding: '6px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', flex: '1 1 auto' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1B5299' }}>{r.pts}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{r.desc}</span>
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
            <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
              <span style={{ fontSize: 26, fontWeight: 800, display: 'block', color: '#0F2942' }}>{s.val}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Partidos */}
        {partidos.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 }}>Partidos</span>
              {enVivo && <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />En vivo</span>}
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
                <div key={i} style={{ borderBottom: i < partidos.length - 1 ? '1px solid #F3F4F6' : 'none', background: esVivo ? '#FFFBF0' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: p.hora ? '9px 16px 2px' : '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: esVivo ? '#DC2626' : '#0F2942', padding: '3px 8px', background: esVivo ? '#FEE2E2' : '#F3F4F6', borderRadius: 6, margin: '0 6px', minWidth: 46, textAlign: 'center', flexShrink: 0 }}>
                      {scoreLocal}–{scoreVisitante}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                      {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    </div>
                    <div style={{ marginLeft: 10, minWidth: 70, textAlign: 'right' }}>
                      {esVivo ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 99, background: '#FEE2E2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />{live.clock || 'EN VIVO'}
                        </span>
                      ) : resDisplay ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, whiteSpace: 'nowrap' }}>
                          {resultLabel[resDisplay]}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: '#F3F4F6', color: '#9CA3AF' }}>Pendiente</span>
                      )}
                      {(esFinish || stored) && !esVivo && p.espnId && (
                        <a
                          href={`https://www.espn.com/soccer/match/_/gameId/${p.espnId}`}
                          target="_blank" rel="noreferrer"
                          style={{ display: 'block', fontSize: 10, color: '#9CA3AF', textDecoration: 'none', marginTop: 4 }}
                        >
                          Ver resumen →
                        </a>
                      )}
                    </div>
                  </div>
                  {p.hora && (
                    <p style={{ fontSize: 10, color: '#9CA3AF', padding: '0 16px 8px', margin: 0 }}>
                      {formatFecha(p.hora)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Tabla ranking */}
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          {enVivo && (
            <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#DC2626', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Ranking provisional — actualizando cada minuto</span>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
            {['#', 'Jugador', 'Result.', 'Exactos', 'Pts'].map((h, idx) => (
              <span key={h} style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>

          {jugadores.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              Nadie ha registrado predicciones todavía.
            </div>
          ) : jugadores.map((j, i) => {
            const abierto = expandido.has(j.nombre)
            const esLider = i === 0 && hayResultados

            return (
              <div key={j.nombre} style={{ borderBottom: i < jugadores.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                {/* Fila principal */}
                <div
                  onClick={() => cerrada && toggleExpandido(j.nombre)}
                  style={{
                    display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px',
                    padding: '13px 16px', alignItems: 'center',
                    background: esLider ? 'linear-gradient(90deg, #FFFBEB, #fff)' : 'transparent',
                    cursor: cerrada ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ fontSize: i < 3 ? 18 : 14, fontWeight: 600, color: i < 3 ? '#D97706' : '#9CA3AF' }}>
                    {i < 3 ? medals[i] : `${i + 1}`}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 400, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {j.nombre}
                    {cerrada && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{abierto ? '▲' : '▼'}</span>}
                  </span>
                  <span style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>{j.aciertos}</span>
                  <span style={{ fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? '#D97706' : '#6B7280', fontWeight: j.exactos > 0 ? 700 : 400 }}>{j.exactos}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, textAlign: 'center', color: esLider ? '#D97706' : '#1B5299' }}>{j.puntos}</span>
                </div>

                {/* Picks expandidos */}
                {abierto && cerrada && (
                  <div style={{ background: '#F8FAFC', borderTop: '1px solid #F3F4F6', padding: '0 16px 12px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 0 8px' }}>
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
                          padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                          background: !resR ? '#fff' : exacto ? '#F0FDF4' : correcto ? '#F0FDF4' : '#FFF5F5',
                          border: '1px solid',
                          borderColor: !resR ? '#F3F4F6' : exacto ? '#BBF7D0' : correcto ? '#D1FAE5' : '#FECACA',
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {partido.local} vs {partido.visitante}
                            </p>
                          </div>

                          {/* Pick del jugador */}
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: '#EBF3FF', color: '#1B5299', whiteSpace: 'nowrap',
                          }}>
                            {pickDisplay(pick)}
                          </span>

                          {/* Resultado real */}
                          <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                            {res ? `${res.local}–${res.visitante}` : '—'}
                          </span>

                          {/* Puntos */}
                          <span style={{
                            fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right',
                            color: pts === 3 ? '#D97706' : pts === 1 ? '#16A34A' : pts === 0 ? '#DC2626' : '#9CA3AF',
                          }}>
                            {pts === null ? '—' : pts === 0 ? '✗' : `+${pts}`}
                          </span>
                        </div>
                      )
                    })}

                    {/* Total */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>Total</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#1B5299' }}>{j.puntos} pts</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Aviso si aún no cerró */}
          {!cerrada && jugadores.length > 0 && (
            <div style={{ padding: '10px 16px', background: '#FFFBEB', borderTop: '1px solid #FEF3C7', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#92400E' }}>🔒 Las predicciones de cada jugador se revelan al cierre de la quiniela</span>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 14, lineHeight: 1.8 }}>
          1 pt resultado correcto · +2 pts marcador exacto (máx. 3 pts por partido){'\n'}
          Empate de puntos: gana quien tenga más marcadores exactos; si persiste, más resultados correctos · {enVivo ? '🔴 Actualizando cada 60 seg' : 'Actualización en tiempo real'}
        </p>
      </div>
    </div>
  )
}
