import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where, updateDoc } from 'firebase/firestore'
import { db, track } from '../firebase'
import { getResultado } from '../utils/scoring'
import { findEventByTeamsAndDate } from '../utils/espn'
import { tienePremio } from '../utils/premios'
import { quinielaCerrada, cierreToDate, tiempoRestante } from '../utils/cierre'
import { RankingTable } from '../components/RankingTable'
import { Footer } from '../components/Footer'

export default function Ranking() {
  const [searchParams] = useSearchParams()
  const { id: idDeRuta } = useParams()
  // Acepta /ranking/<id> (ruta nueva) y /ranking?q=<id> (links viejos ya compartidos).
  const quinielaId = idDeRuta || searchParams.get('q')

  const [quiniela, setQuiniela]         = useState(null)
  const [predicciones, setPredicciones] = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)
  const [liveScores, setLiveScores]     = useState({})
  const [liveStats, setLiveStats]       = useState({})
  const [ultimaAct, setUltimaAct]       = useState(null)
  const [actualizando, setActualizando] = useState(false)

  // ── Firebase ────────────────────────────────────────────────────
  useEffect(() => {
    if (!quinielaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCargando(false); setError('no-id'); return
    }

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
    const getStat = (stats, name) => stats?.find(s => s.name === name)?.displayValue ?? '—'
    const nuevos = {}
    const nuevosStats = {}
    const idsCorregidos = []
    for (const [liga, ps] of Object.entries(porLiga)) {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`)
        const d = await r.json()
        const events = d.events ?? []
        ps.forEach(p => {
          let ev = events.find(e => e.id === p.espnId)
          if (!ev) {
            // ESPN reasignó el ID del evento (reprogramación, cambio de sede, etc.).
            // Buscamos por nombres de equipos + mismo día; si hay un único candidato
            // lo usamos para el marcador en vivo y corregimos el espnId guardado.
            ev = findEventByTeamsAndDate(events, p.local, p.visitante, p.hora)
            if (!ev) return
            idsCorregidos.push({ idx: partidos.indexOf(p), nuevoId: ev.id })
          }
          const state = ev.status?.type?.state
          const completed = ev.status?.type?.completed
          const comps = ev.competitions?.[0]?.competitors ?? []
          const home  = comps.find(c => c.homeAway === 'home')
          const away  = comps.find(c => c.homeAway === 'away')
          const statusName = ev.status?.type?.name ?? ''
          const esHalftime = statusName === 'STATUS_HALFTIME'
          // ESPN reporta cancelados/pospuestos/forfeits con state="post" pero completed=false.
          // No los tratamos como resultado válido — marcamos cancelado para que el scoring los skip.
          const esCancelado = state === 'post' && completed === false
          if (esCancelado) {
            nuevos[p.espnId] = { state, cancelado: true, halftime: false, local: '', visitante: '' }
            return
          }
          nuevos[p.espnId] = { state, clock: ev.status?.displayClock ?? '', halftime: esHalftime, local: home?.score ?? '', visitante: away?.score ?? '' }
          nuevosStats[p.espnId] = {
            state,
            home: {
              nombre:       home?.team?.displayName ?? p.local,
              logo:         home?.team?.logo ?? '',
              posesion:     getStat(home?.statistics, 'possessionPct'),
              tirosArco:    getStat(home?.statistics, 'shotsOnTarget'),
              tirosTotales: getStat(home?.statistics, 'totalShots'),
              corners:      getStat(home?.statistics, 'wonCorners'),
              faltas:       getStat(home?.statistics, 'foulsCommitted'),
            },
            away: {
              nombre:       away?.team?.displayName ?? p.visitante,
              logo:         away?.team?.logo ?? '',
              posesion:     getStat(away?.statistics, 'possessionPct'),
              tirosArco:    getStat(away?.statistics, 'shotsOnTarget'),
              tirosTotales: getStat(away?.statistics, 'totalShots'),
              corners:      getStat(away?.statistics, 'wonCorners'),
              faltas:       getStat(away?.statistics, 'foulsCommitted'),
            },
          }
        })
      } catch { /* silencioso */ }
    }
    setLiveScores(prev => ({ ...prev, ...nuevos }))
    setLiveStats(prev => ({ ...prev, ...nuevosStats }))
    setUltimaAct(new Date())

    if (idsCorregidos.length > 0) {
      try {
        const nuevosPartidos = partidos.map((p, i) => {
          const fix = idsCorregidos.find(c => c.idx === i)
          return fix ? { ...p, espnId: fix.nuevoId } : p
        })
        await updateDoc(doc(db, 'quinielas', quinielaData.id), { partidos: nuevosPartidos })
      } catch { /* silencioso */ }
    }

    if (
      conEspn.length > 0 &&
      !quinielaData.finalizada &&
      conEspn.every(p => nuevos[p.espnId]?.state === 'post')
    ) {
      try { await updateDoc(doc(db, 'quinielas', quinielaData.id), { finalizada: true }) }
      catch { /* silencioso */ }
    }
  }

  useEffect(() => {
    if (!quiniela) return
    const conEspn = (quiniela.partidos ?? []).filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    // Polling 90s, pausa cuando la pestaña no está visible
    // (ahorro de ancho de banda + cuota ESPN cuando hay muchos clientes abiertos)
    let interval = null
    const tick = () => fetchLiveData(quiniela)
    const start = () => {
      if (interval) return
      tick()
      interval = setInterval(tick, 90000)
    }
    const stop = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiniela?.id])

  // ── Tracking: ranking visto ─────────────────────────────────────
  useEffect(() => {
    if (quinielaId) track('ranking_visto', { quinielaId })
  }, [quinielaId])

  // ── Detectar si este dispositivo ya envió predicción ─────────────
  // (para esconder el CTA de "Hacer mi predicción")
  const [yaEnvió, setYaEnvió] = useState(false)
  useEffect(() => {
    if (!quinielaId) return
    try {
      const flag = localStorage.getItem(`quiniela-${quinielaId}-enviada`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setYaEnvió(!!flag)
    } catch { /* localStorage no disponible */ }
  }, [quinielaId])

  // ── Refrescar el banner de "Cierra en X min" cada minuto cerca del cierre
  const [, setTickCierre] = useState(0)
  useEffect(() => {
    if (!quiniela?.cierre || quinielaCerrada(quiniela)) return
    const d = cierreToDate(quiniela.cierre)
    if (!d) return
    const ms = d.getTime() - Date.now()
    if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return
    const i = setInterval(() => setTickCierre(t => t + 1), 60 * 1000)
    return () => clearInterval(i)
  }, [quiniela])

  const handleRefresh = async () => {
    if (actualizando || !quiniela) return
    setActualizando(true)
    try { await fetchLiveData(quiniela) }
    finally { setActualizando(false) }
  }

  // ── Render estados ────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando ranking…
    </div>
  )
  if (error || !quiniela) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 24 }}>No se pudo cargar el ranking</p>
        <a href="/" style={{
          display: 'inline-block', padding: '11px 24px', borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--green), var(--green-light))',
          color: '#07120A', fontWeight: 800, fontSize: 14, textDecoration: 'none',
          boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
        }}>
          ← Ver quinielas activas
        </a>
      </div>
    </div>
  )

  const partidos   = quiniela.partidos ?? []
  const resultados = quiniela.resultados ?? {}
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
  const terminados = partidos.filter((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (r?.cancelado) return false
    return getResultado(r) !== null
  }).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp · Ranking</a>
            <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }} aria-label="Volver a inicio">← Inicio</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 10, letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {quiniela.empresa && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--green-light)',
                border: '1px solid var(--green)', letterSpacing: 0.2,
              }}>
                🏢 {quiniela.empresa}
              </span>
            )}
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
            {!tienePremio(quiniela) && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--muted)',
                border: '1px dashed var(--border-strong)',
              }}>
                🎉 Solo por diversión
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
        {/* CTA para registrar predicción — solo si la quiniela sigue abierta y este dispositivo aún no envió */}
        {!quinielaCerrada(quiniela) && !yaEnvió && (() => {
          const tr = tiempoRestante(quiniela.cierre)
          // Tono del banner según urgencia
          const border = tr?.nivel === 'critico' ? 'var(--red)' : tr?.nivel === 'urgente' ? 'var(--yellow)' : 'var(--green)'
          const titulo = tr?.nivel === 'critico'
            ? `⏰ ¡Último momento! ${tr.texto.replace('⏰ ', '')}`
            : tr?.nivel === 'urgente'
              ? `⏳ Cierra pronto — registra tu predicción`
              : '¿Aún no haces tu predicción?'
          const subtitulo = tr?.nivel === 'critico'
            ? 'No te quedes fuera, regístrate ahora.'
            : tr?.nivel === 'urgente'
              ? tr.texto.replace('⏳ ', '')
              : 'Regístrate antes del cierre para aparecer en este ranking.'
          const cta = tr?.nivel === 'critico' ? 'Registrar ahora →' : 'Hacer mi predicción →'
          return (
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              padding: '1rem 1.25rem', marginBottom: 14,
              border: `1.5px solid ${border}`, boxShadow: 'var(--shadow-md)',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>
                  {titulo}
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {subtitulo}
                </p>
              </div>
              <a
                href={`/quiniela/${quinielaId}`}
                style={{
                  padding: '11px 20px', borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, var(--green), var(--green-light))',
                  color: '#07120A', fontWeight: 800, fontSize: 14, textDecoration: 'none',
                  boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {cta}
              </a>
            </div>
          )
        })()}
        <RankingTable quiniela={quiniela} predicciones={predicciones} liveScores={liveScores} liveStats={liveStats} />
        <Footer />
      </div>
    </div>
  )
}
