const WHATSAPP_GRUPO = 'https://chat.whatsapp.com/EejJeHDSnhh8i1TFbkUj2P?mode=gi_t'

export function WhatsAppCTA({ titulo = '¿Quieres seguir jugando?', subtitulo = 'Únete al grupo de WhatsApp para enterarte cuando haya nueva quiniela.' }) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem',
      border: '1px solid #25D366', boxShadow: 'var(--shadow-sm)',
      marginTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 40, height: 40, borderRadius: '50%', background: '#25D366',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>{titulo}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{subtitulo}</p>
        </div>
      </div>
      <a
        href={WHATSAPP_GRUPO}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block', textAlign: 'center', padding: '12px',
          borderRadius: 'var(--radius-md)', background: '#25D366',
          color: '#FFFFFF', fontWeight: 800, fontSize: 14, textDecoration: 'none',
          letterSpacing: 0.2,
        }}
      >
        Unirme al grupo →
      </a>
    </div>
  )
}
