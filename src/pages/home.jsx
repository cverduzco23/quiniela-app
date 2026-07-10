import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, limit, where, doc, getDoc } from 'firebase/firestore'
import { db, track } from '../firebase'
import { quinielaCerrada, quinielaFinalizada, hayPartidoEnVivo } from '../utils/cierre'
import { tienePremio } from '../utils/premios'
import { datosTarjetaQuiniela } from '../utils/quinielaCard'
import { Footer } from '../components/Footer'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'
import { ordenSeccionesHome } from '../utils/homeSections'
import { leerMisQuinielasGuardadas, recordarMiQuiniela, olvidarMiQuiniela } from '../utils/misQuinielas'
import { BrandWordmark } from '../components/Brand'
import { TusQuinielaCard } from '../components/TusQuinielaCard'

const esCerrada = quinielaCerrada
const esFinalizada = quinielaFinalizada

const badgeSinPremio = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 750,
  padding: '3px 8px',
  borderRadius: 'var(--radius-full)',
  background: 'var(--neutral-bg)',
  color: 'var(--muted)',
  border: '1px dashed var(--border-strong)',
  whiteSpace: 'nowrap',
}

const ctaPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 46,
  padding: '0 20px',
  border: 'none',
  borderRadius: 11,
  background: 'linear-gradient(135deg, var(--green), var(--green-light))',
  color: '#07120A',
  fontWeight: 850,
  fontSize: 14.5,
  textDecoration: 'none',
  boxShadow: 'var(--shadow-green)',
  whiteSpace: 'nowrap',
}

const ctaGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 9,
  border: '1px solid rgba(34,197,94,0.45)',
  background: 'rgba(34,197,94,0.08)',
  color: 'var(--green-light)',
  fontWeight: 800,
  fontSize: 13,
  textDecoration: 'none',
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: '0 0 16px',
}

// Bucket de orden para "Tus quinielas": abiertas primero, luego las que están
// jugándose, y el historial finalizado solo cuando se expande la sección.
const BUCKET_ABIERTA = 0
const BUCKET_JUGANDOSE = 1
const BUCKET_FINALIZADA = 2

function fechaCreacionMs(q) {
  const creada = q?.creada
  if (!creada) return 0
  if (typeof creada.toDate === 'function') return creada.toDate().getTime()
  if (typeof creada.seconds === 'number') return creada.seconds * 1000
  const t = new Date(creada).getTime()
  return Number.isNaN(t) ? 0 : t
}

function bucketDe(q, metaPorId) {
  const d = metaPorId.get(q.id)
  if (d?.estado === 'abierta') return BUCKET_ABIERTA
  if (d?.estado === 'jugandose') return BUCKET_JUGANDOSE
  return BUCKET_FINALIZADA
}

function useMediaQuery(queryString) {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia(queryString).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia(queryString)
    const onChange = e => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [queryString])
  return matches
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
  if (name === 'arrow') return <svg {...common}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
  if (name === 'ball') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" /><path d="M12 7V3" /><path d="m16 10 4-1.5" /><path d="m14.5 15 2.5 3.5" /><path d="m9.5 15-2.5 3.5" /><path d="M8 10 4 8.5" /></svg>
  if (name === 'chart') return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><rect x="7" y="11" width="3" height="5" rx="1" /><rect x="12" y="8" width="3" height="8" rx="1" /><rect x="17" y="5" width="3" height="11" rx="1" /></svg>
  if (name === 'chevron') return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (name === 'key') return <svg {...common}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8" /><path d="m16 7 2 2" /><path d="m14 9 2 2" /></svg>
  if (name === 'login') return <svg {...common}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></svg>
  if (name === 'party') return <svg {...common}><path d="m5 19 4-12 8 8-12 4Z" /><path d="m9 7 8 8" /><path d="M14 5h.01" /><path d="M18 3v3" /><path d="M20 4.5h-4" /><path d="M19 10h.01" /></svg>
  if (name === 'ranking') return <svg {...common}><path d="M5 19V9" /><path d="M12 19V5" /><path d="M19 19v-7" /><path d="M3 19h18" /></svg>
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  if (name === 'warning') return <svg {...common}><path d="M10.3 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
  if (name === 'whatsapp') return <svg {...common}><path d="M12 21a9 9 0 0 0 7.6-13.8A9 9 0 0 0 4.8 17.4L4 21l3.7-.8A9 9 0 0 0 12 21Z" /><path d="M9.3 8.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.4.5c.6 1 1.4 1.8 2.4 2.4l.5-.4c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.6v.4c0 .3 0 .6-.4.8-.5.3-1.1.5-1.7.5-2.7 0-6.2-3.2-6.2-6.2 0-.6.1-1.2.3-1.7Z" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>
}

function SinPremioBadge() {
  return (
    <span style={badgeSinPremio}>
      <HomeIcon name="party" size={12} />
      Solo por diversión
    </span>
  )
}

function MetaItem({ icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--muted)', minWidth: 0 }}>
      <HomeIcon name={icon} size={13} />
      {children}
    </span>
  )
}

function HomeHeader({ scrolled }) {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: scrolled ? 'rgba(11,18,32,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      transition: 'background-color 0.25s ease, border-color 0.25s ease',
    }}>
      <div className="public-home-shell public-home-nav" style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
        <a href="/" aria-label="QuinielApp inicio" style={{ display: 'inline-flex', textDecoration: 'none', minWidth: 0 }}>
          <BrandWordmark markSize={28} fontSize={20} />
        </a>
        <nav className="public-home-links" aria-label="Secciones de inicio" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#como-funciona" style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Cómo funciona</a>
          <a href="#quinielas" style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Quinielas</a>
          <a href="/admin" onClick={() => track('home_login_header')} style={ctaGhost}>
            <HomeIcon name="login" size={14} />
            Log In
          </a>
        </nav>
      </div>
    </header>
  )
}

function CodeEntry({ codigoBusqueda, setCodigoBusqueda, errorBusqueda, setErrorBusqueda, buscando, buscarPorCodigo, codeRowRef }) {
  return (
    <div className="public-code-card">
      <p style={{ fontSize: 10.5, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-soft)', marginBottom: 8 }}>
        Entra a tu quiniela
      </p>
      <div ref={codeRowRef} className="public-home-code-row" style={{ display: 'flex', gap: 10, maxWidth: 430 }}>
        <div className="public-code-input-wrap" style={{ position: 'relative', flex: '1 1 180px' }}>
          <input
            type="text"
            placeholder="ej. MX26GP"
            value={codigoBusqueda}
            maxLength={10}
            autoCapitalize="characters"
            onChange={e => {
              setCodigoBusqueda(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
              setErrorBusqueda('')
            }}
            onKeyDown={e => e.key === 'Enter' && buscarPorCodigo('predicciones')}
            aria-label="Código de acceso"
            style={{
              width: '100%',
              minHeight: 52,
              background: '#151F32',
              borderColor: errorBusqueda ? 'var(--red)' : 'rgba(255,255,255,0.12)',
              borderRadius: 11,
              fontSize: 16,
              letterSpacing: '0.12em',
              fontWeight: 800,
              textTransform: 'uppercase',
              caretColor: 'var(--green)',
            }}
          />
          <span className="public-code-caret" aria-hidden="true" />
        </div>
        <button
          onClick={() => buscarPorCodigo('predicciones')}
          disabled={buscando}
          style={{
            ...ctaPrimary,
            minHeight: 52,
            opacity: buscando ? 0.65 : 1,
            cursor: buscando ? 'not-allowed' : 'pointer',
            boxShadow: buscando ? 'none' : ctaPrimary.boxShadow,
          }}
        >
          {buscando ? 'Buscando…' : 'Entrar'}
          {!buscando && <HomeIcon name="arrow" size={16} />}
        </button>
      </div>
      <div style={{ minHeight: 20, marginTop: 11 }}>
        {errorBusqueda && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#FCA5A5', margin: 0 }}>
            <HomeIcon name="warning" size={13} />
            {errorBusqueda}
          </p>
        )}
      </div>
    </div>
  )
}

function RankingPreview({ principal, conteos }) {
  const nombre = principal?.nombre || 'Mundial 2026'
  const participantes = principal ? (conteos[principal.id] ?? 0) : 48
  const partidos = principal?.partidos?.length ?? 12
  const rows = [
    ['1', 'Marina Ruiz', Math.max(7, partidos)],
    ['2', 'Luis Perez', Math.max(5, Math.ceil(partidos / 2))],
    ['3', 'Diego', Math.max(4, Math.ceil(partidos / 3))],
  ]
  return (
    <aside className="public-ranking-preview" aria-label="Vista previa de ranking" style={{
      background: '#151F32',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 16,
      padding: 18,
      boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
      transform: 'rotate(1.2deg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</p>
          <p style={{ fontSize: 11.5, color: 'var(--muted-soft)', marginTop: 2 }}>{participantes} jugando · {partidos} partidos</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 'var(--radius-full)', background: 'var(--red-bg-strong)', color: '#FCA5A5', fontSize: 10, fontWeight: 850, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', animation: 'pulse-dot 1.2s infinite' }} />
          EN VIVO
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([pos, name, puntos], i) => (
          <div key={pos} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            background: i === 2 ? 'rgba(34,197,94,0.08)' : '#0F1A2C',
            border: i === 2 ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
            padding: '11px 13px',
          }}>
            <span style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: i === 0 ? 'linear-gradient(135deg,#FDE68A,#FACC15)' : i === 1 ? 'linear-gradient(135deg,#E5E7EB,#9CA3AF)' : 'linear-gradient(135deg,#FCD9B6,#D08B4F)',
              color: i === 0 ? '#3F2700' : '#1F2937',
              fontSize: 12,
              fontWeight: 900,
            }}>{pos}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: i === 2 ? 850 : 750, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name} {i === 2 && <span style={{ fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--green)', color: '#07120A' }}>TU</span>}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{puntos}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function estadoQuiniela(q) {
  if (esFinalizada(q)) return { label: 'Finalizada', color: 'var(--muted)', bg: 'var(--neutral-bg)', href: `/ranking/${q.id}`, cta: 'Ver resultados' }
  if (esCerrada(q)) return { label: hayPartidoEnVivo(q) ? 'En vivo' : 'Jugándose', color: hayPartidoEnVivo(q) ? '#FCA5A5' : 'var(--yellow)', bg: hayPartidoEnVivo(q) ? 'var(--red-bg-strong)' : 'var(--yellow-bg)', href: `/ranking/${q.id}`, cta: 'Ver ranking' }
  return { label: 'Abierta', color: 'var(--green-light)', bg: 'var(--green-bg)', href: `/quiniela/${q.id}`, cta: 'Jugar' }
}

function HomeQuinielaRow({ q, conteos }) {
  const estado = estadoQuiniela(q)
  return (
    <div className="public-live-card" style={{
      background: 'var(--card)',
      borderRadius: 14,
      padding: '18px 20px',
      border: '1px solid rgba(34,197,94,0.28)',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      alignItems: 'center',
      gap: 18,
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 850, color: 'var(--text-strong)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>{q.nombre}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <MetaItem icon="ball">{q.partidos?.length ?? 0} partidos</MetaItem>
          <MetaItem icon="users">{conteos[q.id] ?? 0} participantes</MetaItem>
          {!tienePremio(q) && <SinPremioBadge />}
        </div>
      </div>
      <span className="public-card-status" style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 850,
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: estado.bg,
        color: estado.color,
        whiteSpace: 'nowrap',
      }}>
        {estado.label === 'En vivo' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FCA5A5', animation: 'pulse-dot 1.2s infinite' }} />}
        {estado.label}
      </span>
      <a href={estado.href} className="public-live-ranking-link" style={{ ...ctaGhost, minHeight: 40 }}>
        {estado.cta === 'Jugar' ? <HomeIcon name="arrow" size={14} /> : <HomeIcon name="ranking" size={14} />}
        {estado.cta}
      </a>
    </div>
  )
}

function QuinielasPublicasSection({ quinielas, conteos }) {
  if (quinielas.length === 0) return null
  return (
    <section className="public-section-open" style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Quinielas públicas</h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted-soft)', marginTop: 3 }}>Abiertas a cualquiera, sin código</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {quinielas.map(q => <HomeQuinielaRow key={q.id} q={q} conteos={conteos} />)}
      </div>
    </section>
  )
}

const MAX_TUS_QUINIELAS = 8

function TusQuinielasSection({ quinielas, conteos, predicciones, onQuitar }) {
  const [expandido, setExpandido] = useState(false)
  const esMovil = useMediaQuery('(max-width: 640px)')
  if (quinielas.length === 0) return null
  const metaPorId = new Map(quinielas.map(q => [
    q.id,
    datosTarjetaQuiniela(q, predicciones[q.id] ?? [], conteos[q.id] ?? 0),
  ]))
  const ordenadas = [...quinielas]
    .sort((a, b) => {
      const bA = bucketDe(a, metaPorId)
      const bB = bucketDe(b, metaPorId)
      if (bA !== bB) return bA - bB
      return fechaCreacionMs(b) - fechaCreacionMs(a)
    })
    .slice(0, MAX_TUS_QUINIELAS)
  const principales = ordenadas.filter(q => metaPorId.get(q.id)?.estado !== 'finalizada')
  const colapsadas = (principales.length > 0 ? principales : ordenadas).slice(0, 3)
  const visibles = esMovil && !expandido ? colapsadas : ordenadas
  const hayMas = esMovil && ordenadas.length > colapsadas.length
  return (
    <section id="quinielas" className="public-section-mine" style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Tus quinielas</h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted-soft)', marginTop: 3 }}>Guardadas en este dispositivo</p>
        </div>
      </div>
      <div className="tq-grid">
        {visibles.map(q => (
          <TusQuinielaCard
            key={q.id}
            q={q}
            predicciones={predicciones[q.id] ?? []}
            participantes={conteos[q.id] ?? 0}
            onQuitar={onQuitar}
          />
        ))}
      </div>
      {hayMas && (
        <button type="button" className="tq-vermas" onClick={() => setExpandido(v => !v)}>
          {expandido ? 'Ver menos' : 'Ver más'}
          <HomeIcon name="chevron" size={12} style={{ transform: expandido ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="como-funciona" style={{ background: '#0E1626', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div className="public-home-shell public-how-inner" style={{ maxWidth: 1100, margin: '0 auto', padding: '44px 24px' }}>
        <h2 style={{ ...sectionTitleStyle, textAlign: 'center', marginBottom: 24 }}>Cómo funciona</h2>
        <div className="public-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            ['1', 'Entra con tu código', 'Sin cuenta, solo el código que te pasaron.'],
            ['2', 'Predice los marcadores', 'Antes de que cierre la quiniela.'],
            ['3', 'Sube en el ranking', 'Puntos por cada acierto, en vivo.'],
          ].map(([num, title, text]) => (
            <div key={num} className="public-step-item" style={{ textAlign: 'center' }}>
              <span className="public-step-number" style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 13, background: 'var(--green-bg)', color: 'var(--green-light)', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 13 }}>{num}</span>
              <div className="public-step-copy">
                <p style={{ fontSize: 15, fontWeight: 850, color: 'var(--text-strong)', marginBottom: 6 }}>{title}</p>
                <p className="public-step-text" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 260, margin: '0 auto' }}>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  const faq = [
    ['¿Necesito crear una cuenta para jugar?', 'No. Entras con el código de la quiniela y tu nombre. La cuenta con Log In es solo para quien organiza quinielas.'],
    ['¿Cuánto cuesta jugar?', 'Depende de la quiniela que organice tu grupo. QuinielApp solo facilita el registro, predicciones y ranking.'],
    ['¿Cómo creo mi propia quiniela?', (
      <>
        <a href="/admin?registro=1" onClick={() => track('faq_crear_cuenta')} style={{ color: 'var(--green-light)', fontWeight: 800, textDecoration: 'none' }}>
          Crea tu cuenta gratis
        </a>
        {' '}en un minuto y arma tu quiniela. Si prefieres que te ayudemos,{' '}
        <a href={waLink(MENSAJES_WA.crearQuiniela)} target="_blank" rel="noreferrer" onClick={() => track('faq_whatsapp_crear')} style={{ color: 'var(--green-light)', fontWeight: 800, textDecoration: 'none' }}>
          escríbenos por WhatsApp
        </a>.
      </>
    )],
  ]
  const [abiertas, setAbiertas] = useState(() => new Set())
  const toggle = (i) => {
    setAbiertas(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  return (
    <section className="public-faq-section" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
      <h2 style={sectionTitleStyle}>Preguntas frecuentes</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {faq.map(([titulo, texto], i) => {
          const abierta = abiertas.has(i)
          return (
            <div key={titulo} className={`public-faq-item${abierta ? ' public-faq-item--open' : ''}`} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '15px 18px' }}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={abierta}
                style={{ all: 'unset', boxSizing: 'border-box', width: '100%', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 14.5, fontWeight: 850, color: 'var(--text-strong)' }}
              >
                <span>{titulo}</span>
                <span className="public-faq-chevron" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--neutral-bg)', color: 'var(--muted)' }}>
                  <HomeIcon name="chevron" size={15} />
                </span>
              </button>
              <div style={{ display: 'grid', gridTemplateRows: abierta ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.55, paddingRight: 44 }}>{texto}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PromoCreateCard() {
  return (
    <div className="public-create-card">
      <div className="public-create-copy">
        <span className="public-create-icon">
          <HomeIcon name="ball" size={26} />
        </span>
        <div className="public-create-text">
          <p className="public-create-title">¿Quieres crear tu propia quiniela?</p>
          <p className="public-create-subtitle">
            Para tu equipo, empresa o grupo de amigos.
          </p>
        </div>
      </div>
      <div className="public-create-actions">
        <a href="/admin?registro=1" onClick={() => track('cta_crear_cuenta')} className="public-create-button">
          <HomeIcon name="ball" size={19} />
          Crear mi cuenta gratis
        </a>
        <a href={waLink(MENSAJES_WA.crearQuiniela)} target="_blank" rel="noreferrer" onClick={() => track('cta_crear_quiniela')} className="public-create-whatsapp">
          <HomeIcon name="whatsapp" size={15} />
          ¿Dudas? Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  )
}

export default function Home() {
  const [quinielasPublicas, setQuinielasPublicas] = useState([])
  const [misQuinielas, setMisQuinielas] = useState([])
  const [misPredicciones, setMisPredicciones] = useState({})
  const [conteos, setConteos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [homeConfig, setHomeConfig] = useState({})
  const verSeccion = (clave) => homeConfig?.[clave] !== false

  const navigate = useNavigate()
  const [codigoBusqueda, setCodigoBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const codeRowRef = useRef(null)

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const mostrarError = (msg) => {
    setErrorBusqueda(msg)
    const el = codeRowRef.current
    if (el) {
      el.style.animation = 'none'
      void el.offsetWidth
      el.style.animation = 'code-input-shake .4s'
    }
  }

  const buscarPorCodigo = async (destino = 'predicciones') => {
    const limpio = codigoBusqueda.trim()
    if (!limpio) {
      mostrarError('Ingresa el código que te compartió el organizador.')
      return
    }
    if (limpio.length < 4) {
      mostrarError('El código es muy corto.')
      return
    }
    setBuscando(true)
    setErrorBusqueda('')
    try {
      const snap = await getDocs(query(
        collection(db, 'quinielas'),
        where('codigoAccesoLower', '==', limpio.toLowerCase()),
      ))
      if (snap.empty) {
        mostrarError('Código no encontrado. Verifica con quien te invitó.')
        track('codigo_busqueda_fallo')
        return
      }
      const docSnap = snap.docs[0]
      const data = docSnap.data()
      recordarMiQuiniela({ id: docSnap.id, codigoAcceso: data.codigoAcceso ?? limpio, nombre: data.nombre ?? '' })
      track('codigo_busqueda_exito', { quinielaId: docSnap.id, destino })
      navigate(destino === 'ranking' ? `/ranking/${docSnap.id}` : `/quiniela/${docSnap.id}`)
    } catch {
      mostrarError('Error de conexión. Intenta de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

  const quitarMiQuiniela = (id) => {
    olvidarMiQuiniela(id)
    setMisQuinielas(prev => prev.filter(q => q.id !== id))
  }

  useEffect(() => {
    getDoc(doc(db, 'config', 'home'))
      .then(s => { if (s.exists()) setHomeConfig(s.data()) })
      .catch(() => {})
  }, [])

  const [, setTickVivo] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTickVivo(t => t + 1), 30000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const guardadas = leerMisQuinielasGuardadas()
    Promise.all([
      getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc'), limit(10))),
      getDocs(collection(db, 'predicciones')),
      Promise.all(guardadas.map(q => getDoc(doc(db, 'quinielas', q.id)).catch(() => null))),
    ]).then(([qSnap, pSnap, misSnaps]) => {
      const guardadasIds = new Set(guardadas.map(q => q.id))
      const conteoMap = {}
      const prediccionesMap = {}
      pSnap.docs.forEach(d => {
        const data = d.data()
        const qId = data.quinielaId
        conteoMap[qId] = (conteoMap[qId] ?? 0) + 1
        if (guardadasIds.has(qId)) {
          if (!prediccionesMap[qId]) prediccionesMap[qId] = []
          prediccionesMap[qId].push(data)
        }
      })
      setConteos(conteoMap)
      setMisPredicciones(prediccionesMap)
      // Públicas: solo las que el super admin marcó explícitamente como tal.
      // Todas las demás (incluidas las viejas sin este campo) son privadas por default.
      setQuinielasPublicas(qSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.privada === false))
      const porId = new Map(guardadas.map((q, idx) => [q.id, { guardada: q, idx }]))
      const personales = misSnaps
        .filter(s => s?.exists?.())
        .map(s => ({ id: s.id, ...s.data(), _miOrden: porId.get(s.id)?.idx ?? 999 }))
        .sort((a, b) => a._miOrden - b._miOrden)
      setMisQuinielas(personales)
    }).catch(() => {}).finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
        Cargando…
      </div>
    )
  }

  const publicasAbiertas = quinielasPublicas.filter(q => !esCerrada(q))
  const principal = publicasAbiertas.find(q => q.destacada) ?? publicasAbiertas[0] ?? null

  const ordenHome = ordenSeccionesHome(homeConfig)
  const ordenDe = (clave) => ordenHome.indexOf(clave)
  const hayMisQuinielas = misQuinielas.length > 0
  const hayQuinielasPublicas = quinielasPublicas.length > 0
  const seccionesVisibles = [
    { clave: 'mostrarComoFunciona', visible: verSeccion('mostrarComoFunciona') },
    { clave: 'mostrarCrearQuiniela', visible: verSeccion('mostrarCrearQuiniela') },
    { clave: 'mostrarMisQuinielas', visible: verSeccion('mostrarMisQuinielas') && hayMisQuinielas },
    { clave: 'mostrarPublicas', visible: verSeccion('mostrarPublicas') && hayQuinielasPublicas },
    { clave: 'mostrarFaq', visible: verSeccion('mostrarFaq') },
    { clave: 'mostrarImagen', visible: verSeccion('mostrarImagen') },
  ]
    .filter(s => s.visible)
    .sort((a, b) => ordenDe(a.clave) - ordenDe(b.clave))
  const mainClassName = `public-home-main${seccionesVisibles[0]?.clave === 'mostrarComoFunciona' ? ' public-home-main--starts-with-how' : ''}`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--hero-gradient)' }}>
        <HomeHeader scrolled={scrolled} />

        <section style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="public-home-hero public-home-shell" style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '56px 24px 58px',
            display: 'grid',
            gridTemplateColumns: '1.05fr 0.95fr',
            gap: 46,
            alignItems: 'center',
          }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 14px', lineHeight: 1.02, letterSpacing: 0 }}>
                Arma tu quiniela.<br className="public-home-title-break" /> Juega con tus amigos.
              </h1>
              <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.72)', margin: '0 0 26px', lineHeight: 1.6, maxWidth: 470 }}>
                Predice los marcadores, sube en el ranking en vivo y presume tus aciertos.{' '}
                <strong style={{ color: 'var(--text-strong)', fontWeight: 700 }}>Sin cuentas ni complicaciones.</strong>
              </p>
              {verSeccion('mostrarCodigo') && (
                <CodeEntry
                  codigoBusqueda={codigoBusqueda}
                  setCodigoBusqueda={setCodigoBusqueda}
                  errorBusqueda={errorBusqueda}
                  setErrorBusqueda={setErrorBusqueda}
                  buscando={buscando}
                  buscarPorCodigo={buscarPorCodigo}
                  codeRowRef={codeRowRef}
                />
              )}
              <p style={{ fontSize: 12.5, color: 'var(--muted-soft)', margin: '14px 0 0' }}>
                ¿Organizas una quiniela? <a href="/admin" onClick={() => track('home_login_hero')} style={{ color: 'var(--green-light)', fontWeight: 800, textDecoration: 'none' }}>Entra como organizador</a>.
              </p>
            </div>
            <RankingPreview principal={principal} conteos={conteos} />
          </div>
        </section>
      </div>

      <main className={mainClassName} style={{ display: 'flex', flexDirection: 'column', gap: 32, padding: '32px 0' }}>
        {verSeccion('mostrarComoFunciona') && (
          <div style={{ order: ordenDe('mostrarComoFunciona') }}>
            <HowItWorks />
          </div>
        )}

        {verSeccion('mostrarCrearQuiniela') && (
          <section className="public-section-create" style={{ order: ordenDe('mostrarCrearQuiniela'), maxWidth: 1100, width: '100%', margin: '0 auto', padding: '0 24px' }}>
            <PromoCreateCard />
          </section>
        )}

        {verSeccion('mostrarMisQuinielas') && hayMisQuinielas && (
          <div style={{ order: ordenDe('mostrarMisQuinielas') }}>
            <TusQuinielasSection
              quinielas={misQuinielas}
              conteos={conteos}
              predicciones={misPredicciones}
              onQuitar={quitarMiQuiniela}
            />
          </div>
        )}

        {verSeccion('mostrarPublicas') && hayQuinielasPublicas && (
          <div style={{ order: ordenDe('mostrarPublicas') }}>
            <QuinielasPublicasSection quinielas={quinielasPublicas} conteos={conteos} />
          </div>
        )}

        {verSeccion('mostrarFaq') && (
          <div style={{ order: ordenDe('mostrarFaq') }}>
            <FaqSection />
          </div>
        )}

        {verSeccion('mostrarImagen') && (
          <section style={{ order: ordenDe('mostrarImagen'), maxWidth: 1100, width: '100%', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
            <img src="/jugador-verde.png" alt="" style={{ width: '100%', maxWidth: 330, height: 'auto', display: 'block', margin: '0 auto' }} />
          </section>
        )}
      </main>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 28px' }}>
        <Footer />
      </div>
    </div>
  )
}
