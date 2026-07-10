import { BrandMark } from './Brand'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'

const DONATION_URL = 'https://link.mercadopago.com.mx/donativoapp'

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

  if (name === 'whatsapp') {
    return (
      <svg {...common}>
        <path d="M12 21a9 9 0 0 0 7.6-13.8A9 9 0 0 0 4.8 17.4L4 21l3.7-.8A9 9 0 0 0 12 21Z" />
        <path d="M9.3 8.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.4.5c.6 1 1.4 1.8 2.4 2.4l.5-.4c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.6v.4c0 .3 0 .6-.4.8-.5.3-1.1.5-1.7.5-2.7 0-6.2-3.2-6.2-6.2 0-.6.1-1.2.3-1.7Z" />
      </svg>
    )
  }

  return null
}

export function Footer({ maxWidth = '100%' }) {
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer" style={{ maxWidth }}>
      <div className="app-footer-inner">
        <div className="app-footer-links">
          <a
            href={DONATION_URL}
            target="_blank"
            rel="noreferrer"
            className="app-footer-link"
          >
            <span className="app-footer-link-icon is-donate">
              <FooterIcon name="heart" size={15} />
            </span>
            Donar
          </a>
          <a
            href={waLink(MENSAJES_WA.soporte)}
            target="_blank"
            rel="noreferrer"
            className="app-footer-link"
          >
            <span className="app-footer-link-icon is-whatsapp">
              <FooterIcon name="whatsapp" size={15} />
            </span>
            Contáctanos
          </a>
        </div>
        <a
          href="https://quinielapp.fun"
          target="_blank"
          rel="noreferrer"
          className="app-footer-brand"
        >
          <BrandMark size={14} />
          <span>quinielapp.fun · © {year}</span>
        </a>
      </div>
    </footer>
  )
}
