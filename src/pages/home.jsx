import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, limit, where, doc, getDoc } from 'firebase/firestore'
import { db, track } from '../firebase'
import { cierreToDate, quinielaCerrada, quinielaFinalizada, hayPartidoEnVivo } from '../utils/cierre'
import { tienePremio } from '../utils/premios'
import { PromoCTA } from '../components/PromoCTA'
import { Footer } from '../components/Footer'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'
import { ordenSeccionesHome } from '../utils/homeSections'
import { CuentaRegresiva } from '../components/CuentaRegresiva'
import { BrandWordmark } from '../components/Brand'

const sinPremioBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)',
  background: 'var(--neutral-bg)', color: 'var(--muted)', border: '1px dashed var(--border-strong)',
  whiteSpace: 'nowrap',
}

function HomeIcon({ name, size = 14, style }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0, ...style },
    'aria-hidden': 'true',
  }
  if (name === 'key') {
    return (
      <svg {...common}>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8-8" />
        <path d="m16 7 2 2" />
        <path d="m14 9 2 2" />
      </svg>
    )
  }
  if (name === 'ball') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" />
        <path d="M12 7V3" />
        <path d="m16 10 4-1.5" />
        <path d="m14.5 15 2.5 3.5" />
        <path d="m9.5 15-2.5 3.5" />
        <path d="M8 10 4 8.5" />
      </svg>
    )
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <rect x="7" y="11" width="3" height="5" rx="1" />
        <rect x="12" y="8" width="3" height="8" rx="1" />
        <rect x="17" y="5" width="3" height="11" rx="1" />
      </svg>
    )
  }
  if (name === 'ranking') {
    return (
      <svg {...common}>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </svg>
    )
  }
  if (name === 'edit') {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
      </svg>
    )
  }
  if (name === 'panel') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 4v16" />
        <path d="M12 9h5" />
        <path d="M12 13h4" />
        <path d="M6 8h.01" />
        <path d="M6 12h.01" />
      </svg>
    )
  }
  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }
  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }
  if (name === 'warning') {
    return (
      <svg {...common}>
        <path d="M10.3 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (name === 'party') {
    return (
      <svg {...common}>
        <path d="m5 19 4-12 8 8-12 4Z" />
        <path d="m9 7 8 8" />
        <path d="M14 5h.01" />
        <path d="M18 3v3" />
        <path d="M20 4.5h-4" />
        <path d="M19 10h.01" />
      </svg>
    )
  }
  if (name === 'whatsapp') {
    return (
      <svg {...common}>
        <path d="M12 21a9 9 0 0 0 7.6-13.8A9 9 0 0 0 4.8 17.4L4 21l3.7-.8A9 9 0 0 0 12 21Z" />
        <path d="M9.3 8.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.4.5c.6 1 1.4 1.8 2.4 2.4l.5-.4c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.6v.4c0 .3 0 .6-.4.8-.5.3-1.1.5-1.7.5-2.7 0-6.2-3.2-6.2-6.2 0-.6.1-1.2.3-1.7Z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SectionIcon({ name, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'block', flexShrink: 0 },
    'aria-hidden': 'true',
  }
  if (name === 'juggle') {
    return (
      <span className="home-section-icon home-section-icon-juggle" aria-hidden="true">
        <svg {...common}>
          <circle className="home-juggle-ball" cx="22.2" cy="23.4" r="3.2" />
          <path className="home-juggle-ball" d="m22.2 20.2 1.3 2-1.3 2-1.3-2 1.3-2Z" />
          <circle cx="12.5" cy="7.2" r="3.1" />
          <path d="M12.5 10.7v7.2" />
          <path d="M9.8 13.8 6.3 17.2" />
          <path d="M15.2 13.8 19.5 11.8" />
          <path d="M12.5 17.9 8.8 25.5" />
          <path d="M7.2 25.7h4" />
          <g className="home-juggle-leg">
            <path d="M12.5 17.9 19.6 22.4" />
            <path d="M18.4 22.7h4.2" />
          </g>
        </svg>
      </span>
    )
  }
  if (name === 'write') {
    return (
      <span className="home-section-icon" aria-hidden="true">
        <svg {...common}>
          <path d="M7 25h17" />
          <g className="home-pencil-body">
            <path d="M8 20.5 19.8 8.7a2.6 2.6 0 0 1 3.7 3.7L11.7 24.2 7 25l1-4.5Z" />
            <path className="home-pencil-tip" d="m18 10.5 3.5 3.5" />
          </g>
          <path className="home-pencil-line" d="M7 18.5c2.8-1.2 5.7-1.2 8.5 0" />
        </svg>
      </span>
    )
  }
  return null
}

function SectionHeading({ children, icon }) {
  return (
    <p style={{
      display: 'flex', alignItems: 'center', gap: 7,
      fontSize: 'var(--home-section-title-size, 11px)',
      fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
      letterSpacing: 1, marginBottom: 10,
    }}>
      {icon && <SectionIcon name={icon} />}
      <span>{children}</span>
    </p>
  )
}

function SinPremioBadge() {
  return (
    <span style={sinPremioBadgeStyle}>
      <HomeIcon name="party" size={12} />
      Solo por diversión
    </span>
  )
}

function MetaItem({ icon, children, color = 'var(--muted)', style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--home-meta-size, 13px)', color, ...style }}>
      <HomeIcon name={icon} size={13} />
      {children}
    </span>
  )
}

function HomeCierreInfo({ cierre }) {
  if (!cierre) return null
  const d = cierreToDate(cierre)
  const ms = d ? d.getTime() - Date.now() : null
  const mostrarTimer = ms != null && ms > 0 && ms <= 24 * 60 * 60 * 1000
  return (
    <div style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--home-close-gap, 12px)',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.66))',
      border: '1px solid rgba(250,204,21,0.45)',
      borderRadius: 'var(--radius-md)', padding: 'var(--home-close-padding, 10px 12px)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--home-close-inner-gap, 9px)', minWidth: 0 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 'var(--home-close-icon-size, 28px)', height: 'var(--home-close-icon-size, 28px)', borderRadius: '50%', flexShrink: 0,
          background: 'rgba(250,204,21,0.10)', color: 'var(--yellow)',
          border: '1px solid rgba(250,204,21,0.35)',
        }}>
          <HomeIcon name="clock" size={14} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 'var(--home-close-label-size, 10px)', fontWeight: 800, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 1.1 }}>
            Cierre
          </span>
          <span style={{ display: 'block', fontSize: 'var(--home-meta-size, 13px)', color: 'var(--text)', fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatFecha(cierre)}
          </span>
        </span>
      </div>
      {mostrarTimer && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 'var(--home-close-label-size, 10px)', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 1.1 }}>
            Faltan
          </span>
          <CuentaRegresiva
            cierre={cierre}
            prefijo=""
            mostrarIcono={false}
            estilo={{
              padding: 0, border: 'none', background: 'transparent', color: 'var(--yellow)',
              fontSize: 'var(--home-meta-size, 13px)', fontWeight: 900, letterSpacing: 0.2,
              marginTop: 3,
            }}
          />
        </div>
      )}
    </div>
  )
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
  display: 'block', textAlign: 'center', padding: 'var(--home-cta-padding, 14px)', borderRadius: 'var(--radius-md)',
  background: 'linear-gradient(135deg, var(--green), var(--green-light))',
  color: '#07120A', fontWeight: 800, fontSize: 'var(--home-cta-size, 15px)', textDecoration: 'none',
  boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
}

const ctaSecondary = {
  display: 'block', textAlign: 'center', padding: 'var(--home-secondary-cta-padding, 12px)', borderRadius: 'var(--radius-md)',
  background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
  color: 'var(--text)', fontWeight: 700, fontSize: 'var(--home-secondary-cta-size, 14px)', textDecoration: 'none',
}

const ctaRanking = {
  ...ctaSecondary,
  background: 'linear-gradient(135deg, rgba(34,197,94,0.14), rgba(34,197,94,0.06))',
  border: '1px solid rgba(34,197,94,0.42)',
  color: 'var(--green-light)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(34,197,94,0.04)',
}

const ctaRankingYellow = {
  ...ctaSecondary,
  background: 'linear-gradient(135deg, rgba(250,204,21,0.16), rgba(250,204,21,0.06))',
  border: '1px solid rgba(250,204,21,0.48)',
  color: 'var(--yellow)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(250,204,21,0.04)',
}

export default function Home() {
  const [quinielas, setQuinielas] = useState([])
  const [conteos, setConteos]     = useState({})
  const [cargando, setCargando]   = useState(true)
  // Config de secciones visibles (la edita el super admin). Campo ausente = visible.
  const [homeConfig, setHomeConfig] = useState({})
  const verSeccion = (clave) => homeConfig?.[clave] !== false

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
    // Config del inicio: no bloquea la carga; si falla, todo queda visible.
    getDoc(doc(db, 'config', 'home'))
      .then(s => { if (s.exists()) setHomeConfig(s.data()) })
      .catch(() => {})
  }, [])

  // Tick cada 30s para refrescar el indicador "Partido en vivo" sin recargar.
  const [, setTickVivo] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTickVivo(t => t + 1), 30000)
    return () => clearInterval(i)
  }, [])

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

  // Orden configurable de las secciones (lo controla el super admin). Usamos
  // flexbox `order`: cada sección recibe su posición; los bloques fijos del pie
  // (imagen, promo, disclaimer) quedan al final con un order alto.
  const ordenHome = ordenSeccionesHome(homeConfig)
  const ordenDe = (clave) => ordenHome.indexOf(clave)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad home-hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="home-brand-lockup" style={{ marginBottom: 14 }}>
            <BrandWordmark markSize={36} fontSize={30} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--home-title-size, clamp(26px, 6.2vw, 34px))', fontWeight: 650, lineHeight: 1.08, marginBottom: 0, letterSpacing: 0, color: 'var(--text)' }}>
            Predice. Compite. <span style={{ color: 'var(--green)' }}>Gana.</span>
          </h1>
        </div>
      </div>

      <div className="home-content" style={{ maxWidth: 560, margin: '0 auto', padding: 'var(--home-content-padding, 1.5rem 1rem 3rem)', display: 'flex', flexDirection: 'column' }}>

        {/* ── Buscador por código de acceso (CTA principal) ──────────── */}
        {verSeccion('mostrarCodigo') && (
        <div style={{
          order: ordenDe('mostrarCodigo'),
          background: 'var(--card)', borderRadius: 'var(--radius-lg)',
          padding: 'var(--home-card-padding, 1.25rem 1.5rem)', marginBottom: 'var(--home-section-gap, 24px)',
          border: '1.5px solid var(--green)', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', color: 'var(--green)', flexShrink: 0 }} aria-hidden="true">
              <HomeIcon name="key" size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--home-card-title-size, 15px)', fontWeight: 700, color: 'var(--text-strong)' }}>
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
                flex: '1 1 180px', fontSize: 'var(--home-code-input-size, 16px)', letterSpacing: 1.5, fontWeight: 700,
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
                fontSize: 'var(--home-code-button-size, 14px)', fontWeight: 800, letterSpacing: 0.2,
                cursor: buscando ? 'not-allowed' : 'pointer',
                boxShadow: buscando ? 'none' : 'var(--shadow-green)',
                whiteSpace: 'nowrap',
              }}
            >
              {buscando ? 'Buscando…' : 'Entrar →'}
            </button>
          </div>
          {errorBusqueda && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#FCA5A5', marginTop: 10 }}>
              <HomeIcon name="warning" size={13} />
              {errorBusqueda}
            </p>
          )}
        </div>
        )}

        {/* ── ¿Cómo funciona? (3 pasos, para quien llega por primera vez) ─── */}
        {verSeccion('mostrarComoFunciona') && (
        <div style={{ order: ordenDe('mostrarComoFunciona'), marginBottom: 'var(--home-section-gap, 24px)' }}>
          <p style={{ fontSize: 'var(--home-section-title-size, 11px)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            ¿Cómo funciona?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { icono: 'key', titulo: 'Entra con tu código', sub: 'Te lo da el organizador' },
              { icono: 'ball', titulo: 'Predice los partidos', sub: 'Antes del cierre' },
              { icono: 'chart', titulo: 'Sigue el ranking', sub: 'En vivo' },
            ].map((paso, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 0, textAlign: 'center',
                background: 'var(--card)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', padding: 'var(--home-step-padding, 12px 6px)',
              }}>
                <div style={{ color: 'var(--green)', marginBottom: 4 }} aria-hidden="true"><HomeIcon name={paso.icono} size={20} /></div>
                <p style={{ fontSize: 'var(--home-step-title-size, 11.5px)', fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.25, marginBottom: 2 }}>{paso.titulo}</p>
                <p style={{ fontSize: 'var(--home-step-sub-size, 10px)', color: 'var(--muted)', lineHeight: 1.2 }}>{paso.sub}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── CTA: crear tu propia quiniela (alta vía WhatsApp) ──────────── */}
        {verSeccion('mostrarCrearQuiniela') && (
        <div style={{
          order: ordenDe('mostrarCrearQuiniela'),
          background: 'var(--card)', borderRadius: 'var(--radius-lg)',
          padding: 'var(--home-card-padding, 1.25rem 1.5rem)', marginBottom: 'var(--home-section-gap, 24px)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 'var(--home-card-icon-size, 34px)', height: 'var(--home-card-icon-size, 34px)', borderRadius: '50%',
              color: 'var(--green)', background: 'var(--green-bg)',
              border: '1px solid rgba(34,197,94,0.35)', flexShrink: 0,
            }} aria-hidden="true">
              <HomeIcon name="ball" size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--home-card-title-size, 15px)', fontWeight: 700, color: 'var(--text-strong)' }}>
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
              position: 'relative', overflow: 'hidden',
              display: 'block', textAlign: 'center', padding: 'var(--home-action-padding, 13px)',
              borderRadius: 'var(--radius-md)', textDecoration: 'none',
              background: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 52%, #20B85A 100%)',
              color: '#07120A', fontWeight: 800, fontSize: 'var(--home-code-button-size, 14px)',
              letterSpacing: 0.2,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(6,78,39,0.14), var(--shadow-green)',
            }}
          >
            <span aria-hidden="true" style={{
              position: 'absolute', inset: '-20% -35%', pointerEvents: 'none',
              background: 'linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.20) 46%, rgba(255,255,255,0.48) 50%, rgba(255,255,255,0.18) 56%, transparent 66%)',
              animation: 'cta-button-shine 9.5s ease-in-out infinite',
            }} />
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <HomeIcon name="whatsapp" size={16} />
              Crear mi quiniela por WhatsApp
            </span>
          </a>
          <a
            href="/admin"
            onClick={() => track('cta_soy_organizador')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              textAlign: 'center', marginTop: 10, padding: 'var(--home-secondary-action-padding, 10px 12px)',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)',
              background: 'var(--neutral-bg)',
              fontSize: 13, fontWeight: 800, color: 'var(--text)', textDecoration: 'none',
            }}
          >
            <HomeIcon name="panel" size={15} />
            Entrar a mi panel
          </a>
        </div>
        )}

        {verSeccion('mostrarActiva') && !principal && enJuego.length === 0 && !ultimaFinal && (
          <div style={{ order: ordenDe('mostrarActiva'), marginBottom: 'var(--home-section-gap, 24px)', background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--home-empty-padding, 2.5rem 2rem)', textAlign: 'center', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'inline-flex', color: 'var(--green)', marginBottom: 14 }}><HomeIcon name="ball" size={48} /></div>
            <p style={{ fontWeight: 700, fontSize: 'var(--home-card-title-size, 16px)', color: 'var(--text)', marginBottom: 6 }}>No hay quinielas públicas abiertas</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Si te invitaron a una quiniela privada, ingresa el código arriba para entrar.</p>
          </div>
        )}

        {/* Quiniela abierta principal */}
        {verSeccion('mostrarActiva') && principal && (
          <div style={{ order: ordenDe('mostrarActiva'), marginBottom: 'var(--home-section-gap, 20px)' }}>
            <SectionHeading icon="write">
              Quiniela abierta
            </SectionHeading>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--home-featured-card-padding, 1.5rem)',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--green)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <p style={{ fontSize: 'var(--home-main-title-size, 19px)', fontWeight: 700, color: 'var(--text-strong)' }}>{principal.nombre}</p>
                {!tienePremio(principal) && <SinPremioBadge />}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <MetaItem icon="ball">{principal.partidos?.length ?? 0} partidos</MetaItem>
                <MetaItem icon="users">{conteos[principal.id] ?? 0} {(conteos[principal.id] ?? 0) === 1 ? 'participante' : 'participantes'}</MetaItem>
                <HomeCierreInfo cierre={principal.cierre} />
              </div>
              <a href={`/quiniela/${principal.id}`} style={{
                ...ctaPrimary,
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 52%, #20B85A 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(6,78,39,0.14), var(--shadow-green)',
                marginBottom: 10,
              }}>
                <span aria-hidden="true" style={{
                  position: 'absolute', inset: '-20% -35%', pointerEvents: 'none',
                  background: 'linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.20) 46%, rgba(255,255,255,0.48) 50%, rgba(255,255,255,0.18) 56%, transparent 66%)',
                  animation: 'cta-button-shine 9.5s ease-in-out infinite',
                }} />
                <span style={{ position: 'relative' }}>Entrar a la quiniela →</span>
              </a>
              <a href={`/ranking/${principal.id}`} style={ctaRanking}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <HomeIcon name="ranking" size={15} />
                  Ver ranking
                </span>
              </a>
            </div>
          </div>
        )}

        {/* Otras abiertas */}
        {verSeccion('mostrarActiva') && otrasActivas.length > 0 && (
          <div style={{ order: ordenDe('mostrarActiva'), marginBottom: 'var(--home-section-gap, 20px)' }}>
            <p style={{ fontSize: 'var(--home-section-title-size, 11px)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 'var(--home-section-heading-gap, 10px)' }}>
              Otras quinielas abiertas
            </p>
            {otrasActivas.map(q => (
              <div key={q.id} className="home-other-card" style={{
                background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: 10,
                border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
              }}>
                <div className="home-other-main" style={{ flex: 1, minWidth: 0, width: '100%' }}>
                  <p className="home-other-title" style={{ fontSize: 'var(--home-list-title-size, 14px)', fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</p>
                  <div className="home-other-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <MetaItem icon="ball" style={{ fontSize: 12 }}>{q.partidos?.length ?? 0}</MetaItem>
                    <MetaItem icon="users" style={{ fontSize: 12 }}>{conteos[q.id] ?? 0}</MetaItem>
                    {!tienePremio(q) && <SinPremioBadge />}
                  </div>
                </div>
                <div className="home-other-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexShrink: 0, width: '100%', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <a className="home-other-link home-other-link-primary" href={`/quiniela/${q.id}`} style={{ flex: '1 1 0', textAlign: 'center', padding: '7px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--green-bg)', fontSize: 13, color: 'var(--green)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <HomeIcon name="edit" size={14} />
                      Predecir
                    </span>
                  </a>
                  <a className="home-other-link" href={`/ranking/${q.id}`} style={{ flex: '1 1 0', textAlign: 'center', padding: '7px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-bg)', fontSize: 13, color: 'var(--muted)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <HomeIcon name="ranking" size={14} />
                      Ranking
                    </span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Jugándose ahora (todas) */}
        {verSeccion('mostrarJugandose') && enJuego.length > 0 && (
          <div style={{ order: ordenDe('mostrarJugandose'), marginBottom: 'var(--home-section-gap, 20px)' }}>
            <SectionHeading icon="juggle">
              Jugándose ahora
            </SectionHeading>
            {enJuego.map(q => {
              const enVivo = hayPartidoEnVivo(q)
              return (
              <div key={q.id} style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--home-card-padding, 1.25rem 1.5rem)', border: `1px solid ${enVivo ? 'var(--red)' : 'var(--yellow-soft)'}`, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <p style={{ fontSize: 'var(--home-live-title-size, 16px)', fontWeight: 600, color: 'var(--text)' }}>{q.nombre}</p>
                  {enVivo ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                      flexShrink: 0, marginLeft: 8,
                      background: 'var(--red-bg-strong)', color: '#FCA5A5', border: '1px solid var(--red)',
                      animation: 'pulse-badge 1.4s ease-in-out infinite',
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FCA5A5', display: 'inline-block' }} />
                      Partido en vivo
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                      flexShrink: 0, marginLeft: 8,
                      background: 'var(--yellow-bg)', color: 'var(--yellow)',
                    }}>
                      Jugándose
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <MetaItem icon="ball" style={{ fontSize: 12 }}>{q.partidos?.length ?? 0} partidos</MetaItem>
                  <MetaItem icon="users" style={{ fontSize: 12 }}>{conteos[q.id] ?? 0} {(conteos[q.id] ?? 0) === 1 ? 'participante' : 'participantes'}</MetaItem>
                  {!tienePremio(q) && <SinPremioBadge />}
                </div>
                <a href={`/ranking/${q.id}`} style={ctaRankingYellow}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <HomeIcon name="ranking" size={15} />
                    Ver ranking
                  </span>
                </a>
              </div>
              )
            })}
          </div>
        )}

        {/* Última finalizada */}
        {verSeccion('mostrarTerminada') && ultimaFinal && (
          <div style={{ order: ordenDe('mostrarTerminada'), marginBottom: 24 }}>
            <p style={{ fontSize: 'var(--home-section-title-size, 11px)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {principal || enJuego.length > 0 ? 'Última quiniela terminada' : 'Quiniela más reciente'}
            </p>
            <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--home-card-padding, 1.25rem 1.5rem)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <p style={{ fontSize: 'var(--home-live-title-size, 16px)', fontWeight: 600, color: 'var(--text)' }}>{ultimaFinal.nombre}</p>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                  flexShrink: 0, marginLeft: 8,
                  background: 'var(--neutral-bg)', color: 'var(--muted)',
                }}>
                  Finalizada
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <MetaItem icon="ball" style={{ fontSize: 12 }}>{ultimaFinal.partidos?.length ?? 0} partidos</MetaItem>
                <MetaItem icon="users" style={{ fontSize: 12 }}>{conteos[ultimaFinal.id] ?? 0} {(conteos[ultimaFinal.id] ?? 0) === 1 ? 'participante' : 'participantes'}</MetaItem>
                {!tienePremio(ultimaFinal) && <SinPremioBadge />}
              </div>
              <a href={`/ranking/${ultimaFinal.id}`} style={ctaSecondary}>
                Ver ranking completo →
              </a>
            </div>
          </div>
        )}

        {/* Imagen decorativa (ordenable) */}
        {verSeccion('mostrarImagen') && (
          <div style={{ order: ordenDe('mostrarImagen'), marginBottom: 24, textAlign: 'center' }}>
            <img
              src="/jugador-verde.png"
              alt=""
              style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block', margin: '0 auto' }}
            />
          </div>
        )}

        {/* CTA comercial discreto (ordenable) */}
        {verSeccion('mostrarPromo') && (
          <div style={{ order: ordenDe('mostrarPromo'), marginBottom: 24 }}>
            <PromoCTA />
          </div>
        )}

        {/* Footer: siempre al final, sin importar el orden de las secciones. */}
        <div style={{ order: 99 }}>
          <Footer />
        </div>
      </div>
    </div>
  )
}
