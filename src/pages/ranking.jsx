import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getResultado } from '../utils/scoring'
import { RankingTable } from '../components/RankingTable'

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
        <RankingTable quiniela={quiniela} predicciones={predicciones} liveScores={liveScores} />
      </div>
    </div>
  )
}
