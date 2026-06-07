/**
 * Medidor visual de fuerza de contraseña. Compartido entre el cambio inicial
 * y "Mi cuenta". No bloquea: solo muestra qué tan fuerte es y sugiere reforzarla.
 */
import { evaluarPassword } from '../utils/password'

const COLOR = { 'débil': 'var(--red)', 'media': 'var(--yellow)', 'fuerte': 'var(--green)' }

export function MedidorPassword({ pwd }) {
  if (!pwd) return null
  const { nivel, score } = evaluarPassword(pwd)
  const ancho = (Math.max(1, score) / 4) * 100
  const color = COLOR[nivel]
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${ancho}%`, height: '100%', background: color, transition: 'width 0.2s, background 0.2s' }} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
        Seguridad: <strong style={{ color }}>{nivel}</strong>
        {nivel !== 'fuerte' && ' — agrégale símbolos o hazla más larga para reforzarla.'}
      </p>
    </div>
  )
}
