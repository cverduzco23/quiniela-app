// Stepper de progreso de la quiniela: Abierta -> En juego -> Final.
// Es una linea de tiempo informativa, no navegable.
export function ProgresoPasos({ etapa, animarActivo = false }) {
  const idx = etapa === 'final' ? 2 : etapa === 'enjuego' ? 1 : 0
  const pasos = ['Abierta', 'En juego', 'Final']

  const circulo = (i) => {
    const completado = i < idx
    const activo = i === idx

    if (completado || (activo && i === 2)) {
      const esFinal = i === 2
      return (
        <span aria-hidden="true" style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: esFinal ? 'var(--yellow)' : 'var(--green)',
          boxShadow: activo ? `0 0 10px ${esFinal ? 'rgba(250,204,21,0.45)' : 'rgba(34,197,94,0.45)'}` : 'none',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={esFinal ? '#3F2D00' : '#07120A'} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
          </svg>
        </span>
      )
    }

    if (activo) {
      return <span
        aria-hidden="true"
        className={animarActivo ? 'progreso-pasos-circulo-activo' : undefined}
        style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green)', flexShrink: 0, boxShadow: '0 0 10px rgba(34,197,94,0.5)' }}
      />
    }

    return <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border-strong)', background: 'transparent', flexShrink: 0 }} />
  }

  const linea = (i) => {
    let bg = 'var(--border-strong)'
    if (idx > i) bg = i === 1 ? 'linear-gradient(90deg, var(--green), var(--yellow))' : 'var(--green)'
    return <span aria-hidden="true" style={{ flex: 1, height: 2, borderRadius: 1, background: bg, margin: '0 8px' }} />
  }

  return (
    <div role="group" aria-label={`Estado de la quiniela: ${pasos[idx]}`} style={{ width: '100%', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {circulo(0)}{linea(0)}{circulo(1)}{linea(1)}{circulo(2)}
      </div>
      <div style={{ display: 'flex', marginTop: 7 }}>
        {pasos.map((p, i) => (
          <span key={p} style={{
            flex: '1 1 0', minWidth: 0,
            fontSize: 10, fontWeight: i === idx ? 800 : 700,
            textTransform: 'uppercase', letterSpacing: 0.8,
            color: i === idx ? (i === 2 ? 'var(--yellow)' : 'var(--green)') : 'var(--muted)',
            textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
          }}>{p}</span>
        ))}
      </div>
    </div>
  )
}
