import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db, track } from '../firebase'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from '../utils/cierre'
import { tienePremio } from '../utils/premios'
import { PromoCTA } from '../components/PromoCTA'
import { Footer } from '../components/Footer'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'

const sinPremioBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)',
  background: 'var(--neutral-bg)', color: 'var(--muted)', border: '1px dashed var(--border-strong)',
  whiteSpace: 'nowrap',
}

function SinPremioBadge() {
  return <span style={sinPremioBadgeStyle}>🎉 Solo por diversión</span>
}

const esCerrada = quinielaCerrada
const esFinalizada = quinielaFinalizada

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

  // Buscador por código de acceso
  const navigate = useNavigate()
  const [codigoBusqueda, setCodigoBusqueda] = useState('')
  const [buscando, setBuscando]             = useState(false)
  const [errorBusqueda, setErrorBusqueda]   = useState('')

  /**
   * Valida el código de acceso y redirige al destino indicado.
   * destino = 'predicciones' → /quiniela/<id> (form para hacer predicción)
   * destino = 'ranking'      → /ranking/<id> (solo ver el ranking)
   * En ambos casos guardamos el código en localStorage para que la pantalla
   * de predicción no pida el código de nuevo si después decide registrarse.
   */
  const buscarPorCodigo = async (destino = 'predicciones') => {
    const limpio = codigoBusqueda.trim()
    if (!limpio) {
      setErrorBusqueda('Ingresa el código que te compartió el organizador.')
      return
    }
    setBuscando(true)
    setErrorBusqueda('')
    try {
      const snap = await getDocs(query(
        collection(db, 'quinielas'),
        where('codigoAccesoLower', '==', limpio.toLowerCase())
      ))
      if (snap.empty) {
        setErrorBusqueda('Código no encontrado. Verifica con quien te invitó.')
        track('codigo_busqueda_fallo')
        return
      }
      const docSnap = snap.docs[0]
      const data = docSnap.data()
      try {
        if (data.codigoAcceso) {
          localStorage.setItem(`quiniela-${docSnap.id}-acceso`, data.codigoAcceso)
        }
      } catch { /* noop */ }
      track('codigo_busqueda_exito', { quinielaId: docSnap.id, destino })
      const ruta = destino === 'ranking' ? `/ranking/${docSnap.id}` : `/quiniela/${docSnap.id}`
      navigate(ruta)
    } catch {
      setErrorBusqueda('Error de conexión. Intenta de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

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
      // Excluir quinielas privadas: solo se acceden con el enlace directo.
      setQuinielas(
        qSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(q => !q.privada)
      )
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
  const enJuego       = cerradas.filter(q => !esFinalizada(q))
  const ultimaFinal   = cerradas
    .filter(q => esFinalizada(q))
    .sort((a, b) => {
      const tB = (b.finalizadaEn ? new Date(b.finalizadaEn).getTime() : null) ?? cierreToDate(b.cierre)?.getTime() ?? 0
      const tA = (a.finalizadaEn ? new Date(a.finalizadaEn).getTime() : null) ?? cierreToDate(a.cierre)?.getTime() ?? 0
      return tB - tA
    })[0] ?? null
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
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>Quinielas privadas para tu equipo o empresa.</p>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

        {/* ── Buscador por código de acceso (CTA principal) ──────────── */}
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem', marginBottom: 24,
          border: '1.5px solid var(--green)', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">🔑</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                ¿Tienes un código de acceso?
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Ingresa el código que te compartió el organizador para entrar a tu quiniela.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Ej. ACME2026"
              value={codigoBusqueda}
              onChange={e => { setCodigoBusqueda(e.target.value); setErrorBusqueda('') }}
              onKeyDown={e => e.key === 'Enter' && buscarPorCodigo('predicciones')}
              style={{
                flex: '1 1 180px', fontSize: 16, letterSpacing: 1.5, fontWeight: 700,
                borderColor: errorBusqueda ? 'var(--red)' : undefined,
              }}
            />
            <button
              onClick={() => buscarPorCodigo('predicciones')}
              disabled={buscando}
              style={{
                padding: '12px 22px', borderRadius: 'var(--radius-md)', border: 'none',
                background: buscando ? 'var(--card-light)' : 'linear-gradient(135deg, var(--green), var(--green-light))',
                color: buscando ? 'var(--muted)' : '#07120A',
                fontSize: 14, fontWeight: 800, letterSpacing: 0.2,
                cursor: buscando ? 'not-allowed' : 'pointer',
                boxShadow: buscando ? 'none' : 'var(--shadow-green)',
                whiteSpace: 'nowrap',
              }}
            >
              {buscando ? 'Buscando…' : 'Entrar →'}
            </button>
          </div>
          {errorBusqueda && (
            <p style={{ fontSize: 12, color: '#FCA5A5', marginTop: 10 }}>
              ⚠️ {errorBusqueda}
            </p>
          )}
        </div>

        {/* ── CTA: crear tu propia quiniela (alta vía WhatsApp) ──────────── */}
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem', marginBottom: 24,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">⚽</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                ¿Quieres crear tu propia quiniela?
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                Para tu equipo, empresa o grupo de amigos. <strong style={{ color: 'var(--green-light)' }}>La primera es gratis.</strong>
              </p>
            </div>
          </div>
          <a
            href={waLink(MENSAJES_WA.crearQuiniela)}
            target="_blank"
            rel="noreferrer"
            onClick={() => track('cta_crear_quiniela')}
            style={{
              display: 'block', textAlign: 'center', padding: '13px',
              borderRadius: 'var(--radius-md)', textDecoration: 'none',
              background: '#25D366', color: '#06140B', fontWeight: 800, fontSize: 14,
              letterSpacing: 0.2,
            }}
          >
            💬 Crear mi quiniela por WhatsApp
          </a>
          <a
            href="/admin"
            onClick={() => track('cta_soy_organizador')}
            style={{
              display: 'block', textAlign: 'center', marginTop: 10,
              fontSize: 12, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none',
            }}
          >
            ¿Ya tienes cuenta? <span style={{ color: 'var(--green-light)', textDecoration: 'underline' }}>Entrar a mi panel →</span>
          </a>
        </div>

        {!principal && enJuego.length === 0 && !ultimaFinal && (
          <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '2.5rem 2rem', textAlign: 'center', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>⚽</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No hay quinielas públicas activas</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Si te invitaron a una quiniela privada, ingresa el código arriba para entrar.</p>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <p style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-strong)' }}>{principal.nombre}</p>
                {!tienePremio(principal) && <SinPremioBadge />}
              </div>
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
              <a href={`/quiniela/${principal.id}`} style={{ ...ctaPrimary, marginBottom: 10 }}>
                Hacer mi predicción →
              </a>
              <a href={`/ranking/${principal.id}`} style={ctaSecondary}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      ⚽ {q.partidos?.length ?? 0} · 👥 {conteos[q.id] ?? 0}
                    </span>
                    {!tienePremio(q) && <SinPremioBadge />}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                  <a href={`/quiniela/${q.id}`} style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    Predecir →
                  </a>
                  <a href={`/ranking/${q.id}`} style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    ⚽ {q.partidos?.length ?? 0} partidos · 👥 {conteos[q.id] ?? 0} {(conteos[q.id] ?? 0) === 1 ? 'participante' : 'participantes'}
                  </p>
                  {!tienePremio(q) && <SinPremioBadge />}
                </div>
                <a href={`/ranking/${q.id}`} style={ctaSecondary}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                  ⚽ {ultimaFinal.partidos?.length ?? 0} partidos · 👥 {conteos[ultimaFinal.id] ?? 0} {(conteos[ultimaFinal.id] ?? 0) === 1 ? 'participante' : 'participantes'}
                </p>
                {!tienePremio(ultimaFinal) && <SinPremioBadge />}
              </div>
              <a href={`/ranking/${ultimaFinal.id}`} style={ctaSecondary}>
                Ver ranking completo →
              </a>
            </div>
          </div>
        )}

        {/* Imagen decorativa */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <img
            src="/jugador-verde.png"
            alt=""
            style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block', margin: '0 auto' }}
          />
        </div>

        {/* CTA comercial discreto */}
        <PromoCTA />

        {/* Disclaimer al fondo */}
        <p style={{
          fontSize: 11, color: 'var(--muted)', textAlign: 'center',
          marginTop: 16, padding: '0 1rem', lineHeight: 1.6, fontStyle: 'italic',
        }}>
          Plataforma para crear quinielas privadas entre grupos cerrados.
          <br />No es una plataforma de apuestas comerciales.
        </p>

        <Footer />
      </div>
    </div>
  )
}
