import { Link } from 'react-router-dom'
import { BrandMark } from './Brand'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'

function FooterIcon({ name, size = 15 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0 },
    'aria-hidden': 'true',
  }

  if (name === 'heart') {
    return (
      <svg {...common}>
        <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" />
      </svg>
    )
  }

  return null
}

// Los términos de Google piden avisar que reCAPTCHA (App Check) corre en el sitio.
function RecaptchaNotice() {
  return (
    <p className="app-footer-recaptcha">
      Este sitio está protegido por reCAPTCHA; aplican la{' '}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Política de Privacidad</a>
      {' '}y los{' '}
      <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Términos</a>
      {' '}de Google.
    </p>
  )
}

export function Footer({ maxWidth = '100%', variant = 'full' }) {
  const year = new Date().getFullYear()

  if (variant === 'simple') {
    return (
      <footer className="app-footer app-footer-full" style={{ maxWidth }}>
        <div className="app-footer-links">
          <Link to="/privacidad" className="app-footer-textlink">Privacidad</Link>
          <span className="app-footer-dot" aria-hidden="true">·</span>
          <Link to="/terminos" className="app-footer-textlink">Términos</Link>
          <span className="app-footer-dot" aria-hidden="true">·</span>
          <a href={waLink(MENSAJES_WA.soporte)} target="_blank" rel="noreferrer" className="app-footer-textlink">Contacto</a>
        </div>
        <p className="app-footer-copy">
          © {year} QuinielApp · <a href="https://quinielapp.fun" target="_blank" rel="noreferrer" className="app-footer-copy-link">quinielapp.fun</a>
        </p>
        <RecaptchaNotice />
      </footer>
    )
  }

  return (
    <footer className="app-footer app-footer-full" style={{ maxWidth }}>
      <div className="app-footer-links">
        <Link to="/privacidad" className="app-footer-textlink">Privacidad</Link>
        <span className="app-footer-dot" aria-hidden="true">·</span>
        <Link to="/terminos" className="app-footer-textlink">Términos</Link>
        <span className="app-footer-dot" aria-hidden="true">·</span>
        <a href={waLink(MENSAJES_WA.soporte)} target="_blank" rel="noreferrer" className="app-footer-textlink">Contacto</a>
      </div>
      <Link to="/donar" className="app-footer-apoyar">
        <FooterIcon name="heart" size={14} />
        Apoyar
      </Link>
      <p className="app-footer-copy">
        © {year} <BrandMark size={14} /> QuinielApp
      </p>
      <RecaptchaNotice />
    </footer>
  )
}
