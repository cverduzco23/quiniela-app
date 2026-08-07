// Stepper de progreso de la quiniela: Abierta -> En juego -> Final.
// Es una linea de tiempo informativa, no navegable.
export function ProgresoPasos({
  etapa,
  animarActivo = false,
  participantes = 0,
  partidosJugados = 0,
  partidosTotales = 0,
}) {
  const idx = etapa === 'final' ? 2 : etapa === 'enjuego' ? 1 : 0
  const pasos = ['Abierta', 'En juego', 'Final']
  const total = Math.max(0, Number(partidosTotales) || 0)
  const jugados = Math.min(total, Math.max(0, Number(partidosJugados) || 0))
  const pct = total > 0 ? (jugados / total) * 100 : 0
  const avanceIzquierdo = Math.min(100, pct * 2)
  const avanceDerecho = Math.max(0, (pct - 50) * 2)

  const circuloMovil = (i) => {
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

    return <span aria-hidden="true" style={{ width: 20, height: 20, boxSizing: 'border-box', borderRadius: '50%', border: '2px solid var(--border-strong)', background: 'transparent', flexShrink: 0 }} />
  }

  const lineaMovil = (i) => {
    if (i === 1 && etapa === 'enjuego') {
      return (
        <span aria-hidden="true" className="progreso-pasos-mobile-track">
          <span className="progreso-pasos-mobile-fill" style={{ width: `${pct}%` }} />
          {pct > 0 && pct < 100 && (
            <span className="progreso-pasos-mobile-head" style={{ left: `${pct}%` }} />
          )}
        </span>
      )
    }
    let bg = 'var(--border-strong)'
    if (idx > i) bg = i === 1 ? 'linear-gradient(90deg, var(--green), var(--yellow))' : 'var(--green)'
    return <span aria-hidden="true" style={{ flex: 1, height: 2, borderRadius: 1, background: bg, margin: '0 8px' }} />
  }

  const iconoPaso = (i, estado) => {
    const cumplido = estado === 'cumplido' || estado === 'final'
    return (
      <span aria-hidden="true" className={`progreso-pasos-desktop-dot${estado === 'actual' && animarActivo ? ' is-active' : ''}`}>
        {cumplido && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={i === 2 ? '#3F2D00' : '#07120A'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
          </svg>
        )}
      </span>
    )
  }

  const pill = (i) => {
    const estado = i < idx ? 'cumplido' : i === idx ? (i === 2 ? 'final' : 'actual') : 'pendiente'
    return (
      <span className={`progreso-pasos-desktop-pill is-${estado}`}>
        {iconoPaso(i, estado)}
        {pasos[i]}
      </span>
    )
  }

  const lineaDesktop = (clase = '') => (
    <span aria-hidden="true" className={`progreso-pasos-desktop-linea${clase ? ` ${clase}` : ''}`} />
  )

  const lineaAvance = (lado, ancho, mostrarPunta) => (
    <span aria-hidden="true" className="progreso-pasos-desktop-track">
      <span
        className={`progreso-pasos-desktop-fill is-${lado}`}
        style={{ width: `${ancho}%` }}
      >
        <span className="progreso-pasos-desktop-sweep" />
      </span>
      {mostrarPunta && (
        <span className="progreso-pasos-desktop-head" style={{ left: `${ancho}%` }} />
      )}
    </span>
  )

  const participantesLabel = `${participantes} ${participantes === 1 ? 'participante registrado' : 'participantes registrados'}`
  const partidosLabel = etapa === 'abierta'
    ? `${total} ${total === 1 ? 'partido por jugar' : 'partidos por jugar'}`
    : `${jugados} de ${total} ${total === 1 ? 'partido jugado' : 'partidos jugados'}`

  return (
    <div className="progreso-pasos" role="group" aria-label={`Estado de la quiniela: ${pasos[idx]}`}>
      <div className="progreso-pasos-mobile">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {circuloMovil(0)}{lineaMovil(0)}{circuloMovil(1)}{lineaMovil(1)}{circuloMovil(2)}
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

      <div className="progreso-pasos-desktop">
        {pill(0)}
        <span className="progreso-pasos-desktop-tramo">
          {lineaDesktop(idx > 0 ? 'is-recorrida' : '')}
          <span className="progreso-pasos-desktop-label is-contexto">{participantesLabel}</span>
          {lineaDesktop(idx > 0 ? 'is-recorrida' : '')}
        </span>
        {pill(1)}
        <span className="progreso-pasos-desktop-tramo">
          {etapa === 'enjuego'
            ? lineaAvance('izquierda', avanceIzquierdo, avanceIzquierdo > 0 && avanceIzquierdo < 100)
            : lineaDesktop(etapa === 'final' ? 'is-final-izquierda' : '')}
          <span className={`progreso-pasos-desktop-label${etapa === 'enjuego' ? ' is-actual' : ' is-contexto'}`}>{partidosLabel}</span>
          {etapa === 'enjuego'
            ? lineaAvance('derecha', avanceDerecho, avanceDerecho > 0)
            : lineaDesktop(etapa === 'final' ? 'is-final-derecha' : '')}
        </span>
        {pill(2)}
      </div>
    </div>
  )
}
