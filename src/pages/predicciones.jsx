import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, addDoc, collection, updateDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { cierreToDate, quinielaCerrada } from '../utils/cierre'
import { RankingTable } from '../components/RankingTable'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function pickValido(pick) {
  if (!pick) return false
  const l = pick.local, v = pick.visitante
  return l !== '' && l !== undefined && v !== '' && v !== undefined &&
    !isNaN(Number(l)) && !isNaN(Number(v))
}

function getPickResultado(pick) {
  if (!pickValido(pick)) return null
  const l = Number(pick.local), v = Number(pick.visitante)
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const resultadoInfo = (res, local, visitante) => ({
  home:  { label: `${local} gana`,     bg: 'var(--green-bg)',  color: 'var(--green)' },
  draw:  { label: 'Empate',            bg: 'var(--neutral-bg)', color: 'var(--muted)' },
  away:  { label: `${visitante} gana`, bg: 'var(--yellow-bg)', color: 'var(--yellow)' },
}[res])

const ctaPrimary = (disabled) => ({
  width: '100%', padding: '15px', borderRadius: 'var(--radius-md)', border: 'none',
  background: disabled ? 'var(--card-light)' : 'linear-gradient(135deg, var(--green), var(--green-light))',
  color: disabled ? 'var(--muted)' : '#07120A', fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : 'var(--shadow-green)',
})

const card = {
  background: 'var(--card)', borderRadius: 'var(--radius-md)',
  padding: '1.1rem 1.25rem', marginBottom: 10,
  border: '1px solid var(--border)',
}

const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }

export default function Predicciones() {
  const [searchParams] = useSearchParams()
  const quinielaId = searchParams.get('q')

  const [quiniela, setQuiniela]           = useState(null)
  const [cargando, setCargando]           = useState(true)
  const [error, setError]                 = useState(null)
  const [nombre, setNombre]               = useState('')
  const [picks, setPicks]                 = useState({})
  const [enviado, setEnviado]             = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [nombreError, setNombreError]     = useState('')
  const [mostrarResumen, setMostrarResumen] = useState(false)
  const [celebrando, setCelebrando]       = useState(false)
  const [predsCerradas, setPredsCerradas] = useState([])

  const visitanteRefs = useRef([])
  const progresoPrevRef = useRef(0)
  const restauradoRef = useRef(false)
  const lsKey = quinielaId ? `quiniela-${quinielaId}-progreso` : null

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!quinielaId) { setCargando(false); setError('no-id'); return }
    getDoc(doc(db, 'quinielas', quinielaId))
      .then(snap => {
        if (!snap.exists()) setError('not-found')
        else setQuiniela({ id: snap.id, ...snap.data() })
      })
      .catch(() => setError('error'))
      .finally(() => setCargando(false))
  }, [quinielaId])

  const partidos   = quiniela?.partidos ?? []
  const cerrada    = quinielaCerrada(quiniela)
  const progreso   = partidos.filter((_, i) => pickValido(picks[i])).length
  const completado = nombre.trim().length > 0 && progreso === partidos.length

  // Restaurar progreso desde localStorage cuando se carga la quiniela (si no está cerrada)
  useEffect(() => {
    if (!quiniela || cerrada || restauradoRef.current || !lsKey) return
    restauradoRef.current = true
    try {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return
      const data = JSON.parse(raw)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (data?.nombre && typeof data.nombre === 'string') setNombre(data.nombre)
      if (data?.picks && typeof data.picks === 'object') setPicks(data.picks)
    } catch { /* corrupto, ignorar */ }
  }, [quiniela, cerrada, lsKey])

  // Persistir progreso en localStorage en cada cambio
  useEffect(() => {
    if (!lsKey || enviado || cerrada || !restauradoRef.current) return
    if (!nombre.trim() && Object.keys(picks).length === 0) return
    try {
      localStorage.setItem(lsKey, JSON.stringify({ nombre, picks }))
    } catch { /* sin espacio o deshabilitado */ }
  }, [nombre, picks, lsKey, enviado, cerrada])

  // Celebración al completar todos los picks (transición: < total → === total)
  useEffect(() => {
    const total = partidos.length
    if (total === 0 || cerrada || enviado) return
    const prev = progresoPrevRef.current
    progresoPrevRef.current = progreso
    if (progreso === total && prev < total) {
      navigator.vibrate?.(200)
      setCelebrando(true)
      const t = setTimeout(() => setCelebrando(false), 1500)
      return () => clearTimeout(t)
    }
  }, [progreso, partidos.length, cerrada, enviado])

  // Cargar predicciones cuando la quiniela está cerrada (para ranking inline)
  useEffect(() => {
    if (!cerrada || !quiniela?.id) return
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quiniela.id)))
      .then(snap => setPredsCerradas(snap.docs.map(d => d.data())))
      .catch(() => {})
  }, [cerrada, quiniela?.id])

  // Auto-cierre ESPN con intervalo cada 60s
  useEffect(() => {
    if (!quiniela || cerrada || !quinielaId) return
    const conEspn = partidos.filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    const checkInicio = async () => {
      const porLiga = {}
      conEspn.forEach(p => {
        if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
        porLiga[p.ligaId].push(p)
      })
      for (const [liga, ps] of Object.entries(porLiga)) {
        try {
          const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`)
          const d = await r.json()
          const events = d.events ?? []
          for (const p of ps) {
            const ev = events.find(e => e.id === p.espnId)
            if (!ev) continue
            const state = ev.status?.type?.state
            if (state === 'in' || state === 'post') {
              await updateDoc(doc(db, 'quinielas', quinielaId), { cerrada: true })
              setQuiniela(prev => ({ ...prev, cerrada: true }))
              return
            }
          }
        } catch { /* silencioso */ }
      }
    }

    checkInicio()
    const interval = setInterval(checkInicio, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiniela?.id])

  const setPick = (i, campo, valor) =>
    setPicks(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), [campo]: valor } }))

  const enviar = async () => {
    if (!completado || cerrada || enviando) return
    setEnviando(true)
    setNombreError('')
    try {
      const snap = await getDocs(query(
        collection(db, 'predicciones'),
        where('quinielaId', '==', quinielaId),
        where('nombre', '==', nombre.trim())
      ))
      if (!snap.empty) {
        setNombreError(`Ya hay alguien registrado como "${nombre.trim()}". Usa un nombre diferente o añade tu apellido.`)
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      await addDoc(collection(db, 'predicciones'), {
        quinielaId,
        nombre: nombre.trim(),
        picks,
        fecha: new Date().toISOString(),
      })
      try { if (lsKey) localStorage.removeItem(lsKey) } catch { /* noop */ }
      setEnviado(true)
    } catch {
      alert('Error al guardar. Intenta de nuevo.')
      setEnviando(false)
    }
  }

  // ── Estados ─────────────────────────────────────────────────

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando quiniela…
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          {error === 'not-found' ? 'Quiniela no encontrada' : 'Error de conexión'}
        </p>
        <p style={{ fontSize: 14 }}>Contacta al organizador para obtener el enlace correcto.</p>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp</a>
          <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }} aria-label="Volver a inicio">← Inicio</a>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--green), var(--green-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 36, color: '#07120A',
            boxShadow: 'var(--shadow-green)',
          }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, marginBottom: 8, color: 'var(--text-strong)' }}>¡Listo, {nombre}!</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Tus predicciones fueron registradas.</p>
        </div>

        {/* Resumen de picks */}
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: 12, border: '1px solid var(--green)', boxShadow: 'var(--shadow-md)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Tu quiniela · {quiniela.nombre}
          </p>
          {partidos.map((p, i) => {
            const pick = picks[i]
            const res  = getPickResultado(pick)
            const info = res ? resultadoInfo(res, p.local, p.visitante) : null
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                  {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', padding: '2px 12px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                  {pick?.local ?? '?'}–{pick?.visitante ?? '?'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{p.visitante}</span>
                  {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                </div>
                {info && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color, flexShrink: 0 }}>{info.label}</span>}
              </div>
            )
          })}
        </div>

        {navigator.share ? (
          <button
            onClick={() => navigator.share?.({
              title: `Mi quiniela — ${quiniela.nombre}`,
              text: `Acabo de hacer mis predicciones para ${quiniela.nombre}. Únete:`,
              url: `${window.location.origin}/?q=${quinielaId}`,
            }).catch(() => {})}
            style={{ ...ctaPrimary(false), marginBottom: 10 }}
          >
            Compartir mi quiniela
          </button>
        ) : (
          <button
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/?q=${quinielaId}`).catch(() => {})}
            style={{ ...ctaPrimary(false), marginBottom: 10 }}
          >
            Copiar enlace de la quiniela
          </button>
        )}

        <a
          href={`/ranking?q=${quinielaId}`}
          style={{
            display: 'block', textAlign: 'center', padding: '12px 28px', borderRadius: 'var(--radius-md)',
            background: 'var(--card-light)', color: 'var(--muted)',
            fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '1px solid var(--border-strong)',
          }}
        >
          Ver ranking →
        </a>
      </div>
    </div>
  )

  const pct = partidos.length > 0 ? (progreso / partidos.length) * 100 : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: celebrando ? 'hidden' : 'visible' }}>
      {celebrando && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '2px solid var(--green)', borderRadius: 'var(--radius-md)',
            padding: '14px 22px', boxShadow: 'var(--shadow-green)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--green)',
            animation: 'pop 0.5s ease-out',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🎉 ¡Picks completos!
          </div>
          {Array.from({ length: 28 }).map((_, k) => {
            const colors = ['var(--green)', 'var(--green-light)', 'var(--yellow)', '#FCA5A5']
            const left = (k * 3.7) % 100
            const delay = (k % 7) * 0.08
            const size = 6 + (k % 5) * 2
            return (
              <span key={k} style={{
                position: 'absolute', top: '-20px', left: `${left}%`,
                width: size, height: size, background: colors[k % colors.length],
                borderRadius: k % 2 === 0 ? '50%' : 2,
                animation: `confetti 1.5s ease-in ${delay}s forwards`,
              }} />
            )
          })}
        </div>
      )}

      {/* Hero */}
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp</a>
            <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }}>← Inicio</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 10, letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          {quiniela.cierre && (
            <span style={{
              display: 'inline-block', fontSize: 12, fontWeight: 600,
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: cerrada ? 'var(--red-bg-strong)' : 'var(--neutral-bg)',
              color: cerrada ? '#FCA5A5' : 'var(--text)',
              border: `1px solid ${cerrada ? 'var(--red)' : 'var(--border)'}`,
            }}>
              {cerrada ? '🔒 Quiniela cerrada' : `⏳ Cierre: ${formatFecha(quiniela.cierre)}`}
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* Reglas de puntos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { pts: '1 pt',   desc: 'Resultado correcto' },
            { pts: '+2 pts', desc: 'Marcador exacto' },
          ].map(r => (
            <div key={r.desc} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '6px 12px',
              border: '1px solid var(--border)', flex: '1 1 auto',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{r.pts}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {/* ── Quiniela cerrada — ranking inline ───────────────────────── */}
        {cerrada ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--radius-full)', background: 'var(--red-bg-strong)', color: '#FCA5A5', border: '1px solid var(--red)' }}>
                🔒 Quiniela cerrada
              </span>
              <a href={`/ranking?q=${quinielaId}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
                Ver ranking completo →
              </a>
            </div>
            <RankingTable quiniela={quiniela} predicciones={predsCerradas} liveScores={{}} />
          </>

        /* ── Pantalla de resumen ───────────────────────────────────────── */
        ) : mostrarResumen ? (
          <div>
            <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: 10, border: '1px solid var(--green)', boxShadow: 'var(--shadow-md)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Revisa tus picks
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 16 }}>{nombre}</p>

              {partidos.map((p, i) => {
                const pick = picks[i]
                const res  = getPickResultado(pick)
                const info = res ? resultadoInfo(res, p.local, p.visitante) : null
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', padding: '2px 14px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                      {pick?.local ?? '?'} – {pick?.visitante ?? '?'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{p.visitante}</span>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                    </div>
                    {info && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color, flexShrink: 0 }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {nombreError && (
              <div style={{
                marginBottom: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--red-bg)', border: '1px solid var(--red)',
                fontSize: 13, color: '#FCA5A5', lineHeight: 1.5,
              }}>
                ⚠️ {nombreError}
              </div>
            )}

            <button onClick={enviar} disabled={enviando} style={{ ...ctaPrimary(enviando), marginBottom: 10 }}>
              {enviando ? 'Enviando…' : 'Confirmar y enviar →'}
            </button>
            <button
              onClick={() => setMostrarResumen(false)}
              disabled={enviando}
              style={{
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)',
                background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Editar picks
            </button>
          </div>

        /* ── Formulario principal ───────────────────────────────────────── */
        ) : (
          <>
            {/* Nombre */}
            <div style={card}>
              <label htmlFor="jugador-nombre" style={lbl}>Tu nombre</label>
              <input
                id="jugador-nombre"
                type="text"
                placeholder="¿Cómo te llamas?"
                value={nombre}
                onChange={e => { setNombre(e.target.value); setNombreError('') }}
                style={{ fontSize: 15, borderColor: nombreError ? 'var(--red)' : undefined }}
              />
              {nombreError && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{nombreError}</p>
              )}
            </div>

            {/* Partidos */}
            {partidos.map((p, i) => {
              const pick = picks[i]
              const res  = getPickResultado(pick)
              const info = res ? resultadoInfo(res, p.local, p.visitante) : null

              return (
                <div key={i} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Partido {i + 1}
                    </span>
                    {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatFecha(p.hora)}</span>}
                  </div>

                  {/* Score inputs */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 }}>
                    {/* Local */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.local}
                      </span>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.local ?? ''}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                          const norm = v === '' ? '' : String(Number(v))
                          setPick(i, 'local', norm)
                        }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700,
                          padding: '10px 4px', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: pick?.local, visitante: '0' }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.local !== undefined && pick?.local !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: 22, color: 'var(--muted-dim)', fontWeight: 700, paddingBottom: 12 }}>–</span>

                    {/* Visitante */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.visitante}
                      </span>
                      <input
                        ref={el => { visitanteRefs.current[i] = el }}
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.visitante ?? ''}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2); setPick(i, 'visitante', v === '' ? '' : String(Number(v))) }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700,
                          padding: '10px 4px', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: '0', visitante: pick?.visitante }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.visitante !== undefined && pick?.visitante !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Resultado derivado */}
                  <div style={{ textAlign: 'center', marginTop: 12, minHeight: 24 }}>
                    {info && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <div style={{ flex: 1, height: 5, background: 'var(--card-light)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 'var(--radius-full)', background: 'linear-gradient(90deg, var(--green), var(--green-light))', width: `${pct}%`, transition: 'width 0.25s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {progreso}/{partidos.length} partidos
              </span>
            </div>

            {/* Botón revisar */}
            <button
              onClick={() => { if (completado) setMostrarResumen(true) }}
              disabled={!completado}
              style={ctaPrimary(!completado)}
            >
              Revisar predicciones →
            </button>
            {!completado && (
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
                {!nombre.trim() && progreso < partidos.length
                  ? `Falta tu nombre y ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''}`
                  : !nombre.trim()
                    ? 'Falta tu nombre'
                    : `Falta${partidos.length - progreso !== 1 ? 'n' : ''} ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''} por completar`
                }
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
