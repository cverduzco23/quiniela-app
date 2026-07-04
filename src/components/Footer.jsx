import { BrandMark } from './Brand'

export function Footer({ maxWidth = 560 }) {
  const year = new Date().getFullYear()

  return (
    <footer style={{
      maxWidth, margin: '24px auto 0', padding: '18px 0 6px',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <a
          href="https://quinielapp.fun"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
        >
          <BrandMark size={18} />
          quinielapp.fun
        </a>
        <span style={{ color: 'var(--muted)', opacity: 0.75, fontSize: 12 }}>
          © {year}
        </span>
      </div>
    </footer>
  )
}
