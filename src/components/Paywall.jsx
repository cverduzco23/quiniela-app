import { waLink, MENSAJES_WA } from '../utils/whatsapp'
import { track } from '../firebase'

/**
 * Pantalla de planes que ve el cliente cuando ya usó su(s) quiniela(s) incluida(s)
 * y quiere crear otra. Cada opción abre WhatsApp con un mensaje pre-armado; el
 * cobro lo cierra el super admin manualmente (link de MercadoPago + validación).
 *
 * No procesa pagos: es un punto de contacto, no un checkout.
 */
const card = {
  background: 'var(--card)', borderRadius: 'var(--radius-md)',
  padding: '1.25rem 1.5rem', border: '1px solid var(--border)', marginBottom: 12,
}

function Plan({ titulo, precio, detalle, mensaje, evento, destacado }) {
  return (
    <div style={{
      border: `1.5px solid ${destacado ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)', padding: '1.1rem 1.25rem', marginBottom: 12,
      background: destacado ? 'var(--green-bg)' : 'var(--bg-soft)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{titulo}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: destacado ? 'var(--green)' : 'var(--text-strong)' }}>${precio}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, marginBottom: 12 }}>{detalle}</p>
      <a
        href={waLink(mensaje)}
        target="_blank"
        rel="noreferrer"
        onClick={() => track(evento)}
        style={{
          display: 'block', textAlign: 'center', padding: '11px',
          borderRadius: 'var(--radius-sm)', textDecoration: 'none',
          background: '#25D366', color: '#06140B', fontWeight: 800, fontSize: 13.5,
        }}
      >
        💬 Lo quiero — pedir por WhatsApp
      </a>
    </div>
  )
}

export function Paywall({ titulo = '¡Tu quiniela gratis quedó lista! 🎉' }) {
  return (
    <div style={card}>
      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>{titulo}</p>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 16 }}>
        Para crear más quinielas, elige el plan que mejor te acomode. Te respondemos por
        WhatsApp con el link de pago y activamos tu cuenta enseguida.
      </p>

      <Plan
        titulo="Una quiniela más"
        precio="49"
        detalle="Pago único. Creas una quiniela adicional. Ideal para un evento puntual."
        mensaje={MENSAJES_WA.comprarQuiniela}
        evento="paywall_por_quiniela"
      />
      <Plan
        titulo="Pase Mundial"
        precio="299"
        detalle="Quinielas ilimitadas durante todo el Mundial. La mejor opción si vas a correr varias."
        mensaje={MENSAJES_WA.paseMundial}
        evento="paywall_pase_mundial"
        destacado
      />

      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
        En cuanto confirmemos tu pago, podrás crear tu siguiente quiniela aquí mismo.
      </p>
    </div>
  )
}
