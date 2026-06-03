/**
 * Footer global discreto.
 * Aparece al final de las páginas principales (home, predicciones, ranking)
 * con un link sutil a la home pública. Evita pop-ups y banners agresivos.
 */
export function Footer() {
  return (
    <footer style={{
      maxWidth: 560, margin: '24px auto 0', padding: '20px 1rem 24px',
      borderTop: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, letterSpacing: 0.2 }}>
        ¿Quieres una quiniela así para tu equipo?{' '}
        <a
          href="https://quinielapp.fun"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}
        >
          quinielapp.fun
        </a>
      </p>
    </footer>
  )
}
