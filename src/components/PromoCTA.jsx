/**
 * CTA comercial discreto: invita al usuario a crear su propia quiniela.
 * Reemplaza al antiguo WhatsAppCTA (grupo familiar) por mensajería neutra.
 *
 * Se usa típicamente al final de un flujo (post-envío de predicción).
 * Para promoción aún más sutil, ver el Footer global.
 */
export function PromoCTA({
  titulo = '¿Quieres tu propia quiniela?',
  subtitulo = 'Crea la quiniela de tu equipo o empresa, gratis.',
  ctaLabel = 'Crear mi quiniela →',
  href = 'https://quinielapp.fun',
}) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.1rem 1.25rem',
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      marginTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 'var(--radius-sm)',
          background: 'var(--green-bg)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0, fontWeight: 800,
        }} aria-hidden="true">⚽</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>{titulo}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{subtitulo}</p>
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block', textAlign: 'center', padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--green)',
          fontWeight: 700, fontSize: 13, textDecoration: 'none',
          border: '1px solid var(--green)',
          letterSpacing: 0.1,
        }}
      >
        {ctaLabel}
      </a>
    </div>
  )
}
