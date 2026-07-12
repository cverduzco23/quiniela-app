import { Link } from 'react-router-dom'
import avisoPrivacidad from '../../legal/AVISO_DE_PRIVACIDAD.md?raw'
import terminosCondiciones from '../../legal/TERMINOS_Y_CONDICIONES.md?raw'
import { renderMarkdownLite } from '../utils/markdownLite'
import { BrandWordmark } from '../components/Brand'
import { Footer } from '../components/Footer'

function LegalPage({ contenido }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '28px 20px 0', flex: 1 }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13, fontWeight: 750, textDecoration: 'none', marginBottom: 24 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Inicio
        </Link>
        <div style={{ marginBottom: 28 }}>
          <BrandWordmark markSize={26} fontSize={19} />
        </div>
        <article>
          {renderMarkdownLite(contenido)}
        </article>
      </div>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '0 20px 28px' }}>
        <Footer />
      </div>
    </div>
  )
}

export function Privacidad() {
  return <LegalPage contenido={avisoPrivacidad} />
}

export function Terminos() {
  return <LegalPage contenido={terminosCondiciones} />
}
