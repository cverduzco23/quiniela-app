import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { toPng } from 'html-to-image'
import { db } from '../firebase'
import { getResultado, calcularPuntos } from '../utils/scoring'
import { RankingTable } from '../components/RankingTable'

const medals = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const [searchParams] = useSearchParams()
  const quinielaId = searchParams.get('q')

  const [quiniela, setQuiniela]         = useState(null)
  const [predicciones, setPredicciones] = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)
  const [liveScores, setLiveScores]     = useState({})
  const [ultimaAct, setUltimaAct]       = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)

  const tarjetaRef = useRef(null)

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
    const nuevos = {}
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
        })
      } catch { /* silencioso */ }
    }
    setLiveScores(nuevos)
    setUltimaAct(new Date())
  }

  useEffect(() => {
    if (!quiniela) return
    const conEspn = (quiniela.partidos ?? []).filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLiveData(quiniela)
    const interval = setInterval(() => fetchLiveData(quiniela), 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiniela?.id])

  const handleRefresh = async () => {
    if (actualizando || !quiniela) return
    setActualizando(true)
    try { await fetchLiveData(quiniela) }
    finally { setActualizando(false) }
  }

  const handleCompartir = async () => {
    if (compartiendo || !tarjetaRef.current || !quiniela) return
    setCompartiendo(true)
    try {
      const dataUrl = await toPng(tarjetaRef.current, { cacheBust: true })
      const blob    = await (await fetch(dataUrl)).blob()
      const file    = new File([blob], 'quiniela-top5.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: quiniela.nombre, files: [file] })
      } else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = 'quiniela-top5.png'
        a.click()
      }
    } catch { /* silencioso si el usuario cancela */ }
    finally { setCompartiendo(false) }
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

  const partidos   = quiniela.partidos ?? []
  const resultados = quiniela.resultados ?? {}
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
  const terminados = partidos.filter((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (r?.cancelado) return false
    return getResultado(r) !== null
  }).length

  // Para TarjetaCompartible
  const jugadores = predicciones
    .map(p => ({ ...p, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    .sort((a, b) => b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos || (a.fecha ?? '￿').localeCompare(b.fecha ?? '￿'))

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
        {/* Botón compartir tarjeta */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={handleCompartir}
            disabled={compartiendo || jugadores.length === 0}
            aria-label="Compartir tarjeta del top 5 como imagen"
            style={{
              background: 'var(--card)', border: '1px solid var(--border-strong)',
              color: compartiendo ? 'var(--muted)' : 'var(--text)',
              padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700,
              cursor: (compartiendo || jugadores.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (compartiendo || jugadores.length === 0) ? 0.5 : 1,
            }}
          >
            {compartiendo ? 'Generando…' : 'Compartir tarjeta 📤'}
          </button>
        </div>

        <RankingTable quiniela={quiniela} predicciones={predicciones} liveScores={liveScores} />
      </div>

      {/* Tarjeta oculta para captura de imagen */}
      <TarjetaCompartible ref={tarjetaRef} quiniela={quiniela} jugadores={jugadores} />
    </div>
  )
}

function TarjetaCompartible({ quiniela, jugadores, ref }) {
  const top5 = jugadores.slice(0, 5)
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed', left: -1200, top: 0,
        width: 400, background: 'linear-gradient(160deg, #0F2942 0%, #1B5299 100%)',
        borderRadius: 16, padding: '24px 24px 20px',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#F9FAFB', zIndex: -1,
      }}
    >
      <div style={{ fontSize: 12, color: '#86EFAC', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
        ⚽ QuinielApp
      </div>
      <div style={{ fontFamily: "'Rajdhani', 'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: '#FFFFFF', marginBottom: 18, lineHeight: 1.2 }}>
        {quiniela.nombre}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Top 5
      </div>
      {top5.map((j, i) => (
        <div key={j.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < top5.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
          <span style={{ fontSize: i < 3 ? 16 : 13, width: 28, flexShrink: 0 }}>{medals[i] ?? `${i + 1}.`}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.nombre}</span>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, color: '#FACC15' }}>{j.puntos} pts</span>
        </div>
      ))}
    </div>
  )
}
