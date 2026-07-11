import { BrandMark } from './Brand'

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

  return null
}

export function Footer({ maxWidth = '100%' }) {
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer" style={{ maxWidth }}>
      <div className="app-footer-inner">
        <a
          href="https://quinielapp.fun"
          target="_blank"
          rel="noreferrer"
          className="app-footer-brand"
        >
          <BrandMark size={14} />
          <span>quinielapp.fun · © {year}</span>
        </a>
        <a
          href={DONATION_URL}
          target="_blank"
          rel="noreferrer"
          className="app-footer-link"
        >
          <FooterIcon name="heart" size={15} />
          Apoyar
        </a>
      </div>
    </footer>
  )
}
