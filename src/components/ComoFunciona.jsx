/**
 * Guía "¿Cómo funciona?" para administradores.
 * Modal con los conceptos clave: crear, puntos, cierre/finalización, resultados.
 * Se abre desde el header del panel y es siempre accesible.
 */
import { waLink, mensajeReporteProblema } from '../utils/whatsapp'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '5vh 1rem', overflowY: 'auto',
}
const modal = {
  background: 'var(--card)', borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
  maxWidth: 560, width: '100%', padding: '1.5rem',
}
const seccion = {
  background: 'var(--bg-soft)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '1rem 1.1rem', marginBottom: 12,
}
const h = { fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }
const p = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 6 }
const strong = { color: 'var(--text)', fontWeight: 700 }

export function ComoFunciona({ onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>
            ¿Cómo funciona?
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', width: 32, height: 32, borderRadius: 'var(--radius-sm)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={seccion}>
          <p style={h}>1. Crear tu quiniela</p>
          <p style={p}>• Ponle un <span style={strong}>nombre</span> y una <span style={strong}>fecha de cierre</span> (después de esa hora ya nadie puede registrar predicciones).</p>
          <p style={p}>• Usa el <span style={strong}>buscador de partidos</span> para traerlos con un clic — sus resultados se sincronizan solos.</p>
          <p style={p}>• Se genera un <span style={strong}>código de acceso</span> (lo puedes cambiar). Compártelo junto con el enlace; solo quien lo tenga puede participar.</p>
        </div>

        <div style={seccion}>
          <p style={h}>2. Cómo se miden los puntos</p>
          <p style={p}>• <span style={strong}>1 punto</span> por atinarle al resultado (local gana / empate / visitante gana).</p>
          <p style={p}>• <span style={strong}>+2 puntos extra</span> si además aciertas el marcador exacto. Es decir, hasta <span style={strong}>3 puntos por partido</span>.</p>
          <p style={p}>• Los partidos <span style={strong}>cancelados</span> no cuentan para nadie.</p>
          <p style={p}>• <span style={strong}>Gana quien acumule más puntos.</span> Si dos o más empatan en puntos, comparten la misma posición y, si hay premio, lo reparten en partes iguales. La hora a la que enviaron su predicción no influye en nada.</p>
        </div>

        <div style={seccion}>
          <p style={h}>3. Cierre y resultados</p>
          <p style={p}>• La quiniela se <span style={strong}>cierra sola</span> a la hora de cierre (o cuando empiezan los partidos). Ya nadie puede entrar ni cambiar sus picks.</p>
          <p style={p}>• Los marcadores <span style={strong}>se llenan solos</span>: la app los trae de ESPN y los guarda al terminar cada partido (incluidos los cancelados). No tienes que hacer nada.</p>
          <p style={p}>• Durante los partidos, el <span style={strong}>ranking se actualiza en vivo</span> cada minuto. Cuando todos terminan, la quiniela queda <span style={strong}>finalizada</span> y se ve el ganador.</p>
        </div>

        <div style={seccion}>
          <p style={h}>4. Compartir</p>
          <p style={p}>Desde la pestaña <span style={strong}>Compartir</span> de cada quiniela copias el enlace y el código para mandarlos por WhatsApp a tus participantes.</p>
        </div>

        <div style={seccion}>
          <p style={h}>¿Algo no funciona?</p>
          <p style={{ ...p, marginBottom: 0 }}>
            Si un marcador no llegó o viste cualquier falla,{' '}
            <a
              href={waLink(mensajeReporteProblema())}
              target="_blank" rel="noreferrer"
              style={{ color: 'var(--green)', fontWeight: 700 }}
            >
              repórtala por WhatsApp
            </a>{' '}
            y lo revisamos.
          </p>
        </div>

        <button
          onClick={onClose}
          style={{ width: '100%', marginTop: 6, padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg, var(--green), var(--green-light))', color: '#07120A', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
