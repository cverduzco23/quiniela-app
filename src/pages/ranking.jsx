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

// Devuelve el resultado efectivo: ESPN en vivo > Firebase guardado
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
          String(res.local) === String(pick.local) &&
          String(res.visitante) === String(pick.visitante)) {
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

// ─── Constantes de estilo ─────────────────────────────────────────────────────

const medals = ['🥇', '🥈', '🥉']
const resultColor = {
  home:  { bg: '#DCFCE7', color: '#15803D' },
  draw:  { bg: '#F3F4F6', color: '#4B5563' },
  away:  { bg: '#EBF3FF', color: '#1D4ED8' },
}
const resultLabel = { home: 'Local', draw: 'Empate', away: 'Visitante' }

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Ranking() {
  const [searchParams] = useSearchParams()
  const quinielaId = searchParams.get('q')

  const [quiniela, setQuiniela]         = useState(null)
  const [predicciones, setPredicciones] = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)

  // Live scores de ESPN: { [espnId]: { state, clock, local, visitante } }
  const [liveScores, setLiveScores]     = useState({})
  const [liveActivo, setLiveActivo]     = useState(false)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

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

  // ── Polling ESPN (en vivo) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!quiniela) return
    const partidos = quiniela.partidos ?? []
    const conEspn = partidos.filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    const fetchLive = async () => {
      // Agrupar por ligaId para hacer 1 request por liga
      const porLiga = {}
      conEspn.forEach(p => {
        if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
        porLiga[p.ligaId].push(p)
      })

      const nuevos = {}
      let hayVivos = false

      for (const [liga, ps] of Object.entries(porLiga)) {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`
          )
          const d = await r.json()
          const events = d.events ?? []

          ps.forEach(p => {
            const ev = events.find(e => e.id === p.espnId)
            if (!ev) return
            const state = ev.status?.type?.state
            const comps = ev.competitions?.[0]?.competitors ?? []
            const home  = comps.find(c => c.homeAway === 'home')
            const away  = comps.find(c => c.homeAway === 'away')
            nuevos[p.espnId] = {
              state,
              clock:    ev.status?.displayClock ?? '',
              local:    home?.score ?? '',
              visitante: away?.score ?? '',
            }
            if (state === 'in') hayVivos = true
          })
        } catch { /* silencioso */ }
      }

      setLiveScores(nuevos)
      setLiveActivo(hayVivos)
      setUltimaActualizacion(new Date())
    }

    fetchLive()
    const interval = setInterval(fetchLive, 60000)
    return () => clearInterval(interval)
  }, [quiniela?.id]) // solo cuando cambia la quiniela (no en cada update de Firebase)

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

  const partidos   = quiniela.partidos ?? []
  const resultados = quiniela.resultados ?? {}
  const terminados = partidos.filter((_, i) => getResultado(resultados[i] ?? resultados[String(i)]) !== null).length
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')

  const jugadores = predicciones
    .map(p => ({ nombre: p.nombre, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    .sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos)

  const hayResultados = terminados > 0 || enVivo

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(150deg, #0F2942 0%, #1B5299 100%)', color: '#fff', padding: '2rem 1.25rem 1.75rem' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8, fontWeight: 600 }}>
            🏆 Ranking
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>
            {quiniela.nombre}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 99, background: enVivo ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.15)' }}>
              {enVivo && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F87171', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />}
              {enVivo ? 'EN VIVO' : terminados === 0 ? 'Sin resultados aún' : `${terminados}/${partidos.length} partidos terminados`}
            </span>
            {ultimaActualizacion && Object.keys(liveScores).length > 0 && (
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                Actualizado {ultimaActualizacion.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* Reglas de puntos */}
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
            { val: jugadores.length,                    label: 'Participantes' },
            { val: `${terminados}/${partidos.length}`,  label: 'Partidos' },
            { val: jugadores[0]?.puntos ?? 0,           label: 'Pts líder' },
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
              {enVivo && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
                  En vivo
                </span>
              )}
            </div>

            {partidos.map((p, i) => {
              const live      = p.espnId ? liveScores?.[p.espnId] : null
              const stored    = resultados[i] ?? resultados[String(i)]
              const esVivo    = live?.state === 'in'
              const esFinish  = live?.state === 'post'

              // Score a mostrar (live > stored)
              let scoreLocal = '–', scoreVisitante = '–'
              let resDisplay = null

              if (live && (esVivo || esFinish) && live.local !== '') {
                scoreLocal     = live.local
                scoreVisitante = live.visitante
                resDisplay     = goalsToResultado(live.local, live.visitante)
              } else if (stored) {
                scoreLocal     = stored.local ?? '–'
                scoreVisitante = stored.visitante ?? '–'
                resDisplay     = getResultado(stored)
              }

              return (
                <div key={i} style={{ borderBottom: i < partidos.length - 1 ? '1px solid #F3F4F6' : 'none', background: esVivo ? '#FFFBF0' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', flex: 1 }}>{p.local}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: esVivo ? '#DC2626' : '#0F2942', padding: '3px 10px', background: esVivo ? '#FEE2E2' : '#F3F4F6', borderRadius: 6, margin: '0 8px', minWidth: 52, textAlign: 'center', transition: 'all 0.3s' }}>
                      {scoreLocal}–{scoreVisitante}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', flex: 1, textAlign: 'right' }}>{p.visitante}</span>
                    <div style={{ marginLeft: 10, minWidth: 70, textAlign: 'right' }}>
                      {esVivo ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 99, background: '#FEE2E2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
                          {live.clock || 'EN VIVO'}
                        </span>
                      ) : resDisplay ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, whiteSpace: 'nowrap' }}>
                          {esFinish && !stored ? '★ ' : ''}{resultLabel[resDisplay]}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: '#F3F4F6', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
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
              <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Ranking provisional — actualizando en vivo cada minuto</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
            {['#', 'Jugador', 'Result.', 'Exactos', 'Pts'].map((h, idx) => (
              <span key={h} style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>

          {jugadores.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              Nadie ha registrado predicciones todavía.
            </div>
          ) : jugadores.map((j, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px',
              padding: '13px 16px',
              borderBottom: i < jugadores.length - 1 ? '1px solid #F3F4F6' : 'none',
              alignItems: 'center',
              background: i === 0 && hayResultados ? 'linear-gradient(90deg, #FFFBEB, #fff)' : 'transparent',
            }}>
              <span style={{ fontSize: i < 3 ? 18 : 14, fontWeight: 600, color: i < 3 ? '#D97706' : '#9CA3AF' }}>
                {i < 3 ? medals[i] : `${i + 1}`}
              </span>
              <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 400, color: '#111827' }}>{j.nombre}</span>
              <span style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>{j.aciertos}</span>
              <span style={{ fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? '#D97706' : '#6B7280', fontWeight: j.exactos > 0 ? 700 : 400 }}>{j.exactos}</span>
              <span style={{ fontSize: 17, fontWeight: 800, textAlign: 'center', color: i === 0 && hayResultados ? '#D97706' : '#1B5299' }}>
                {j.puntos}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          1 pt resultado · 3 pts marcador exacto · {enVivo ? '🔴 Actualizando cada 60 seg' : 'Actualización en tiempo real'}
        </p>
      </div>
    </div>
  )
}
