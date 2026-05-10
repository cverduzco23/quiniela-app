import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { cierreToDate, quinielaCerrada } from '../utils/cierre'

const esCerrada = quinielaCerrada

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

const ctaPrimary = {
  display: 'block', textAlign: 'center', padding: '14px', borderRadius: 'var(--radius-md)',
  background: 'linear-gradient(135deg, var(--green), var(--green-light))',
  color: '#07120A', fontWeight: 800, fontSize: 15, textDecoration: 'none',
  boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
}

const ctaSecondary = {
  display: 'block', textAlign: 'center', padding: '12px', borderRadius: 'var(--radius-md)',
  background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
  color: 'var(--text)', fontWeight: 700, fontSize: 14, textDecoration: 'none',
}

export default function Home() {
  const [quinielas, setQuinielas] = useState([])
  const [conteos, setConteos]     = useState({})
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc'), limit(10))),
      getDocs(collection(db, 'predicciones')),
    ]).then(([qSnap, pSnap]) => {
      const conteoMap = {}
      pSnap.docs.forEach(d => {
        const qId = d.data().quinielaId
        conteoMap[qId] = (conteoMap[qId] ?? 0) + 1
      })
      setConteos(conteoMap)
      setQuinielas(qSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    .catch(() => {})
    .finally(() => setCargando(false))
  }, [])

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando…
    </div>
  )

  const activas       = quinielas.filter(q => !esCerrada(q))
  const cerradas      = quinielas.filter(q => esCerrada(q))
  const enJuego       = cerradas.filter(q => !q.finalizada)
  const ultimaFinal   = cerradas.find(q => q.finalizada) ?? null
  const principal     = activas.find(q => q.destacada) ?? activas[0] ?? null
  const otrasActivas  = activas.filter(q => q.id !== principal?.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', marginBottom: 12, fontWeight: 700 }}>⚽ QuinielApp</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 7vw, 40px)', fontWeight: 700, lineHeight: 1.05, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Predice. Compite. <span style={{ color: 'var(--green)' }}>Gana.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>La quiniela deportiva de tu grupo.</p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

        {!principal && enJuego.length === 0 && !ultimaFinal && (
          <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '3rem 2rem', textAlign: 'center', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⚽</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>Próximamente la siguiente jornada</p>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>Estamos preparando la próxima quiniela. Vuelve pronto para registrar tus predicciones.</p>
          </div>
        )}

        {/* Quiniela activa principal */}
        {principal && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Quiniela activa
            </p>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--green)',
            }}>
              <p style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>{principal.nombre}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  ⚽ {principal.partidos?.length ?? 0} partidos
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  👥 {conteos[principal.id] ?? 0} {(conteos[principal.id] ?? 0) === 1 ? 'participante' : 'participantes'}
                </span>
                {principal.cierre && (
                  <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 600 }}>
                    ⏳ Cierra: {formatFecha(principal.cierre)}
                  </span>
                )}
              </div>
              <a href={`/?q=${principal.id}`} style={{ ...ctaPrimary, marginBottom: 10 }}>
                Hacer mi predicción →
              </a>
              <a href={`/ranking?q=${principal.id}`} style={ctaSecondary}>
                Ver ranking
              </a>
            </div>
          </div>
        )}

        {/* Otras activas */}
        {otrasActivas.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Otras quinielas activas
            </p>
            {otrasActivas.map(q => (
              <div key={q.id} style={{
                background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: 10,
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    ⚽ {q.partidos?.length ?? 0} · 👥 {conteos[q.id] ?? 0}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                  <a href={`/?q=${q.id}`} style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Predecir →
                  </a>
                  <a href={`/ranking?q=${q.id}`} style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Ranking →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Jugándose ahora (todas) */}
        {enJuego.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Jugándose ahora
            </p>
            {enJuego.map(q => (
              <div key={q.id} style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', border: '1px solid var(--yellow-soft)', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{q.nombre}</p>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                    flexShrink: 0, marginLeft: 8,
                    background: 'var(--yellow-bg)', color: 'var(--yellow)',
                  }}>
                    Jugándose
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                  ⚽ {q.partidos?.length ?? 0} partidos · 👥 {conteos[q.id] ?? 0} {(conteos[q.id] ?? 0) === 1 ? 'participante' : 'participantes'}
                </p>
                <a href={`/ranking?q=${q.id}`} style={ctaSecondary}>
                  Ver ranking completo →
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Última finalizada */}
        {ultimaFinal && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {principal || enJuego.length > 0 ? 'Última quiniela terminada' : 'Quiniela más reciente'}
            </p>
            <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{ultimaFinal.nombre}</p>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                  flexShrink: 0, marginLeft: 8,
                  background: 'var(--neutral-bg)', color: 'var(--muted)',
                }}>
                  Finalizada
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                ⚽ {ultimaFinal.partidos?.length ?? 0} partidos · 👥 {conteos[ultimaFinal.id] ?? 0} {(conteos[ultimaFinal.id] ?? 0) === 1 ? 'participante' : 'participantes'}
              </p>
              <a href={`/ranking?q=${ultimaFinal.id}`} style={ctaSecondary}>
                Ver ranking completo →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
