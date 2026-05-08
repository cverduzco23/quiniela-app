import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

function esCerrada(q) {
  return !!(q.cerrada || (q.cierre && new Date() > new Date(q.cierre)))
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

export default function Home() {
  const [quinielas, setQuinielas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc'), limit(10)))
      .then(snap => setQuinielas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [])

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#6B7280', fontSize: 14 }}>
      Cargando…
    </div>
  )

  const activas  = quinielas.filter(q => !esCerrada(q))
  const cerradas = quinielas.filter(q => esCerrada(q))
  const principal = activas[0] ?? null
  const ultima    = cerradas[0] ?? null

  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(150deg, #0F2942 0%, #1B5299 100%)', color: '#fff', padding: '2.5rem 1.25rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 12, fontWeight: 600 }}>⚽ QuinielApp</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 10 }}>Predice. Compite. Gana.</h1>
          <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.6 }}>La quiniela deportiva de tu grupo.</p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

        {!principal && !ultima && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 8 }}>Sin quinielas activas</p>
            <p style={{ fontSize: 14, color: '#6B7280' }}>El organizador aún no ha publicado ninguna quiniela.</p>
          </div>
        )}

        {/* Quiniela activa principal */}
        {principal && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Quiniela activa
            </p>
            <div style={{
              background: '#fff', borderRadius: 16, padding: '1.5rem',
              boxShadow: '0 4px 16px rgba(27,82,153,0.14)',
              border: '2px solid #1B5299',
            }}>
              <p style={{ fontSize: 19, fontWeight: 700, color: '#0F2942', marginBottom: 8 }}>{principal.nombre}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>⚽ {principal.partidos?.length ?? 0} partidos</span>
                {principal.cierre && (
                  <span style={{ fontSize: 13, color: '#D97706', fontWeight: 600 }}>
                    ⏳ Cierra: {formatFecha(principal.cierre)}
                  </span>
                )}
              </div>
              <a
                href={`/?q=${principal.id}`}
                style={{
                  display: 'block', textAlign: 'center', padding: '14px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #0F2942 0%, #1B5299 100%)',
                  color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(27,82,153,0.35)',
                  marginBottom: 10,
                }}
              >
                Hacer mi predicción →
              </a>
              <a
                href={`/ranking?q=${principal.id}`}
                style={{
                  display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10,
                  background: 'transparent', border: '1px solid #D1D5DB',
                  color: '#6B7280', fontWeight: 500, fontSize: 13, textDecoration: 'none',
                }}
              >
                Ver ranking
              </a>
            </div>
          </div>
        )}

        {/* Otras activas */}
        {activas.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Otras quinielas activas
            </p>
            {activas.slice(1).map(q => (
              <div key={q.id} style={{
                background: '#fff', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10,
                boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>⚽ {q.partidos?.length ?? 0} partidos</span>
                </div>
                <a href={`/?q=${q.id}`} style={{ fontSize: 13, color: '#1B5299', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Predecir →
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Última quiniela cerrada */}
        {ultima && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {principal ? 'Última quiniela terminada' : 'Quiniela más reciente'}
            </p>
            <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{ultima.nombre}</p>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>⚽ {ultima.partidos?.length ?? 0} partidos</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: '#F3F4F6', color: '#6B7280', flexShrink: 0, marginLeft: 8 }}>
                  Finalizada
                </span>
              </div>
              <a
                href={`/ranking?q=${ultima.id}`}
                style={{
                  display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10,
                  background: '#F3F4F6', color: '#374151', fontWeight: 600, fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                Ver ranking completo →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
