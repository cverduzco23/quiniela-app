import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db, track } from '../firebase'
import { Footer } from '../components/Footer'
import { BrandMark } from '../components/Brand'

// Tabla general de una temporada (grupo de quinielas de un organizador).
// La tabla viene precalculada por la Cloud Function al finalizar cada
// jornada, así que esta página cuesta 1 lectura. Es pública, como el ranking.
export default function Temporada() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const desdeQuiniela = searchParams.get('q')

  const [temporada, setTemporada] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!id) { setCargando(false); setError(true); return }
    let vivo = true
    getDoc(doc(db, 'temporadas', id))
      .then(snap => {
        if (!vivo) return
        if (!snap.exists()) setError(true)
        else setTemporada({ id: snap.id, ...snap.data() })
      })
      .catch(() => { if (vivo) setError(true) })
      .finally(() => { if (vivo) setCargando(false) })
    track('temporada_vista', { temporadaId: id })
    return () => { vivo = false }
  }, [id])

  const backHref = desdeQuiniela ? `/ranking/${desdeQuiniela}` : '/'
  const handleBack = (e) => {
    if (window.history.length <= 1) return
    e.preventDefault()
    window.history.back()
  }

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando temporada…
    </div>
  )

  if (error || !temporada) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ maxWidth: 360 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>No se encontró la temporada</p>
        <a href={backHref} onClick={handleBack} style={{
          display: 'inline-block', padding: '11px 24px', borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--green), var(--green-light))',
          color: '#07120A', fontWeight: 800, fontSize: 14, textDecoration: 'none',
          boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
        }}>
          ← Volver
        </a>
      </div>
    </div>
  )

  const tabla = temporada.tabla ?? []
  const jornadasJugadas = temporada.jornadasJugadas ?? 0
  const totalQuinielas = temporada.totalQuinielas ?? 0

  // Posiciones olímpicas: empate en puntos comparte posición.
  const posiciones = tabla.map((j, i) => {
    if (i === 0) return 1
    return tabla[i - 1].puntos === j.puntos ? null : i + 1
  })
  let ultimaPos = 1
  const posicionesFinales = posiciones.map(p => { if (p != null) ultimaPos = p; return ultimaPos })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="ranking-bg-fade" aria-hidden="true" />
      <div className="hero-pad ranking-hero-pad" style={{ color: 'var(--text)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="ranking-brand-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <a href={backHref} onClick={handleBack} className="app-back-button" aria-label="Volver" title="Volver">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </a>
            <a href="/" className="ranking-brand-link" aria-label="QuinielApp Temporada">
              <BrandMark size={22} />
              <span className="ranking-brand-name">
                Quiniel<span style={{ color: 'var(--green)' }}>App</span>
              </span>
              <span className="ranking-brand-dot" aria-hidden="true" />
              <span className="ranking-brand-label">Temporada</span>
            </a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.01em' }}>
            {temporada.nombre}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Tabla general · {jornadasJugadas} de {totalQuinielas} jornada{totalQuinielas !== 1 ? 's' : ''} jugada{jornadasJugadas !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', padding: '20px 16px 6px', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
        <div className="ranking-panel ranking-table-panel">
          <div className="ranking-table-head" style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 44px 44px 52px' }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>#</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Jugador</span>
            <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' }} title="Aciertos acumulados">✓</span>
            <span style={{ fontSize: 10, color: 'var(--yellow)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' }} title="Marcadores exactos acumulados">Ex</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' }}>Pts</span>
          </div>
          {tabla.length === 0 ? (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
              La tabla general aparecerá cuando termine la primera jornada de la temporada.
            </div>
          ) : tabla.map((j, i) => {
            const pos = posicionesFinales[i]
            const esLider = pos === 1
            return (
              <div
                key={`${j.nombre}-${i}`}
                style={{
                  display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 44px 44px 52px',
                  alignItems: 'center', padding: '13px 16px',
                  borderBottom: i < tabla.length - 1 ? '1px solid var(--border)' : 'none',
                  background: esLider ? 'rgba(250,204,21,0.05)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: esLider ? 800 : 700, color: esLider ? 'var(--yellow)' : 'var(--muted)' }}>{pos}</span>
                <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: esLider ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.nombre}</span>
                  {esLider && (
                    <span aria-label="Líder de la temporada" title="Líder de la temporada" style={{ fontSize: 12, flexShrink: 0 }}>👑</span>
                  )}
                  {(j.jornadas ?? 0) < jornadasJugadas && (
                    <span title={`Jugó ${j.jornadas} de ${jornadasJugadas} jornadas`} style={{ fontSize: 10, color: 'var(--muted-soft)', flexShrink: 0 }}>
                      {j.jornadas}/{jornadasJugadas}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{j.aciertos}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, textAlign: 'center', color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted-soft)', marginTop: 10, textAlign: 'center' }}>
          Suma los puntos de todas las jornadas finalizadas de la temporada.
        </p>
        <div className="app-footer-slot">
          <Footer maxWidth="640px" />
        </div>
      </div>
    </div>
  )
}
