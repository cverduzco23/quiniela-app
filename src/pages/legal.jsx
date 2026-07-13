import { Link, useNavigate } from 'react-router-dom'
import avisoPrivacidad from '../../legal/AVISO_DE_PRIVACIDAD.md?raw'
import terminosCondiciones from '../../legal/TERMINOS_Y_CONDICIONES.md?raw'
import { extraerSeccionesMarkdown, renderMarkdownLite } from '../utils/markdownLite'
import { BrandWordmark } from '../components/Brand'
import { Footer } from '../components/Footer'

function LegalPage({ contenido, activa }) {
  const navigate = useNavigate()
  const secciones = extraerSeccionesMarkdown(contenido)
  // Back = pantalla previa; si se llegó por link directo (sin historial), a Home.
  const volver = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }
  return (
    <div className="legal-page">
      <div className="public-home-bg-fade" aria-hidden="true" />
      <header className="legal-header">
        <button type="button" onClick={volver} className="legal-back-button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Volver
        </button>
        <span className="legal-brand">
          <BrandWordmark markSize={26} fontSize={19} />
        </span>
        <nav className="legal-document-nav" aria-label="Documentos legales">
          <Link to="/privacidad" className={activa === 'privacidad' ? 'is-active' : ''}>Privacidad</Link>
          <Link to="/terminos" className={activa === 'terminos' ? 'is-active' : ''}>Términos</Link>
        </nav>
      </header>

      <main className="legal-layout">
        <aside className="legal-toc" aria-label="Índice del documento">
          <p>EN ESTA PÁGINA</p>
          <nav>
            {secciones.map(seccion => (
              <a key={seccion.id} href={`#${seccion.id}`}>{seccion.titulo}</a>
            ))}
          </nav>
        </aside>
        <article className="legal-article">
          {renderMarkdownLite(contenido)}
        </article>
      </main>

      <div className="legal-footer-wrap">
        <Footer />
      </div>
    </div>
  )
}

export function Privacidad() {
  return <LegalPage contenido={avisoPrivacidad} activa="privacidad" />
}

export function Terminos() {
  return <LegalPage contenido={terminosCondiciones} activa="terminos" />
}
