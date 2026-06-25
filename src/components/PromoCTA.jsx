import { waLink, MENSAJES_WA } from '../utils/whatsapp'

function PromoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" />
      <path d="M12 7V3" />
      <path d="m16 10 4-1.5" />
      <path d="m14.5 15 2.5 3.5" />
      <path d="m9.5 15-2.5 3.5" />
      <path d="M8 10 4 8.5" />
    </svg>
  )
}

/**
 * CTA comercial discreto: invita al usuario a crear su propia quiniela.
 * Lleva directo a WhatsApp con un mensaje pre-armado para arrancar el alta.
 *
 * Se usa típicamente al final de un flujo (post-envío de predicción).
 * Para promoción aún más sutil, ver el Footer global.
 */
export function PromoCTA({
  titulo = '¿Quieres crear tu propia quiniela?',
  subtitulo = 'Para tu equipo, empresa o grupo de amigos. La primera es gratis.',
  ctaLabel = 'Crear mi quiniela por WhatsApp',
  href = waLink(MENSAJES_WA.crearQuiniela),
}) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--home-card-padding, 1.25rem 1.5rem)',
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      marginTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          width: 'var(--home-card-icon-size, 34px)', height: 'var(--home-card-icon-size, 34px)', borderRadius: '50%',
          background: 'var(--green-bg)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(34,197,94,0.35)', flexShrink: 0, fontWeight: 800,
        }} aria-hidden="true">
          <PromoIcon size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 'var(--home-card-title-size, 15px)', fontWeight: 700, color: 'var(--text-strong)' }}>{titulo}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
            {subtitulo}
          </p>
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="green-shine-button"
        style={{
          position: 'relative', overflow: 'hidden',
          display: 'block', textAlign: 'center', padding: 'var(--home-action-padding, 13px)',
          borderRadius: 'var(--radius-md)', textDecoration: 'none',
          background: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 52%, #20B85A 100%)',
          color: '#07120A', fontWeight: 800, fontSize: 'var(--home-code-button-size, 14px)',
          letterSpacing: 0.2,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(6,78,39,0.14), var(--shadow-green)',
        }}
      >
        <span style={{ position: 'relative', zIndex: 1 }}>{ctaLabel}</span>
      </a>
    </div>
  )
}
