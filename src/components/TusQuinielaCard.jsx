import { useMemo } from 'react'
import { datosTarjetaQuiniela } from '../utils/quinielaCard'

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  )
}

function compartirQuiniela(q) {
  const url = `${window.location.origin}/quiniela/${q.id}`
  if (navigator.share) {
    navigator.share({ text: `Entra a mi quiniela "${q.nombre}": ${url}` }).catch(() => {})
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => {})
  }
}

function Badge({ estado }) {
  if (estado === 'abierta') {
    return (
      <span className="tq-badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#86EFAC' }}>
        Abierta
      </span>
    )
  }
  if (estado === 'jugandose') {
    return (
      <span className="tq-badge" style={{ background: 'rgba(239,68,68,0.16)', color: '#FCA5A5' }}>
        <span className="tq-pulse-dot" />
        En vivo
      </span>
    )
  }
  return (
    <span className="tq-badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}>
      Finalizada
    </span>
  )
}

function Banda({ d, miNombreVisible }) {
  if (d.estado === 'abierta') {
    return (
      <div className="tq-banda" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.12),rgba(250,204,21,0.03))', border: '1px solid rgba(250,204,21,0.28)' }}>
        <div className="tq-banda-num-col">
          <p className="tq-banda-num" style={{ color: '#FCD34D' }}>
            {d.restante ? d.restante.valor : '—'}<span className="tq-banda-num-suf">{d.restante ? d.restante.unidad : ''}</span>
          </p>
          <p className="tq-banda-sub">PARA CERRAR</p>
        </div>
        <div className="tq-banda-divider" />
        <div className="tq-banda-mid" style={{ flex: 1 }}>
          <p className="tq-banda-label" style={{ color: '#FCD34D' }}>CIERRA</p>
          <p className="tq-banda-value" style={{ fontSize: 14 }}>{d.cierreTexto}</p>
        </div>
      </div>
    )
  }
  if (!d.tengoPosicion) {
    return (
      <div className="tq-banda tq-banda--vacia" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <p className="tq-banda-vacia-text">Consulta tu posición en el ranking</p>
      </div>
    )
  }
  if (d.estado === 'jugandose') {
    return (
      <div className="tq-banda" style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.04))', border: '1px solid rgba(34,197,94,0.28)' }}>
        <div className="tq-banda-num-col">
          <p className="tq-banda-num tq-banda-num--lg" style={{ color: '#FFFFFF' }}>
            {d.posicion}<span className="tq-banda-num-suf" style={{ color: '#86EFAC' }}>º</span>
          </p>
          <p className="tq-banda-sub">DE {d.totalJugadores}</p>
        </div>
        <div className="tq-banda-divider" />
        <div className="tq-banda-mid" style={{ flex: 1 }}>
          <p className="tq-banda-label" style={{ color: '#86EFAC' }}>TU POSICIÓN</p>
          <p className="tq-banda-value">
            {miNombreVisible} — <span className="tq-banda-value-pts">{d.misPuntos}</span> pts
          </p>
          {d.subnota && <p className="tq-banda-subnota tq-banda-subnota--inline">{d.subnota.toLowerCase()}</p>}
        </div>
        {d.subnota && (
          <div className="tq-banda-side">
            <p className="tq-banda-subnota">{d.subnota}</p>
          </div>
        )}
      </div>
    )
  }
  // finalizada
  const dorado = d.esGanador
  return (
    <div className="tq-banda" style={{
      background: dorado ? 'linear-gradient(135deg,rgba(250,204,21,0.14),rgba(250,204,21,0.04))' : 'linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))',
      border: dorado ? '1px solid rgba(250,204,21,0.3)' : '1px solid rgba(255,255,255,0.1)',
    }}>
      <div className="tq-banda-num-col">
        <p className="tq-banda-num tq-banda-num--lg" style={{ color: dorado ? '#FDE68A' : '#FFFFFF' }}>
          {d.posicion}<span className="tq-banda-num-suf">º</span>
        </p>
        <p className="tq-banda-sub">DE {d.totalJugadores}</p>
      </div>
      <div className="tq-banda-divider" />
      <div className="tq-banda-mid" style={{ flex: 1 }}>
        <p className="tq-banda-label" style={{ color: dorado ? '#FCD34D' : '#9CA3AF' }}>{dorado ? '🏆 GANASTE' : 'TU POSICIÓN'}</p>
        <p className="tq-banda-value">
          {miNombreVisible} — <span className="tq-banda-value-pts">{d.misPuntos}</span> pts
        </p>
        {d.subnota && <p className="tq-banda-subnota tq-banda-subnota--inline">{d.subnota.toLowerCase()}</p>}
      </div>
      {d.subnota && (
        <div className="tq-banda-side">
          <p className="tq-banda-subnota">{d.subnota}</p>
        </div>
      )}
    </div>
  )
}

function ProgressRow({ d }) {
  if (d.estado === 'abierta') {
    const pct = d.prediccionesTotal > 0 ? Math.round((d.prediccionesHechas / d.prediccionesTotal) * 100) : 0
    const pendientes = d.prediccionesTotal - d.prediccionesHechas
    return (
      <>
        <div className="tq-progress-row">
          <span>Tus predicciones · {d.prediccionesHechas} de {d.prediccionesTotal}</span>
          <span style={{ color: '#FCD34D', fontWeight: 700 }}>{pendientes > 0 ? `${pendientes} pendientes` : 'Completas'}</span>
        </div>
        <div className="tq-bar"><div className="tq-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#F59E0B,#FCD34D)' }} /></div>
      </>
    )
  }
  if (d.estado === 'jugandose') {
    const pct = d.numPartidos > 0 ? Math.round((d.partidosJugados / d.numPartidos) * 100) : 0
    const restantes = d.numPartidos - d.partidosJugados
    return (
      <>
        <div className="tq-progress-row">
          <span>{d.partidosJugados} de {d.numPartidos} partidos</span>
          <span style={{ color: '#86EFAC', fontWeight: 700 }}>{restantes > 0 ? `${restantes} por jugarse` : 'Todos jugados'}</span>
        </div>
        <div className="tq-bar"><div className="tq-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#22C55E,#86EFAC)' }} /></div>
      </>
    )
  }
  return (
    <>
      <div className="tq-progress-row">
        <span>{d.numPartidos} de {d.numPartidos} partidos</span>
        <span style={{ color: '#9CA3AF', fontWeight: 700 }}>Cerrada</span>
      </div>
      <div className="tq-bar"><div className="tq-bar-fill" style={{ width: '100%', background: 'linear-gradient(90deg,#9CA3AF,#E5E7EB)' }} /></div>
    </>
  )
}

export function TusQuinielaCard({ q, predicciones, participantes }) {
  const d = useMemo(() => datosTarjetaQuiniela(q, predicciones, participantes), [q, predicciones, participantes])
  const href = d.estado === 'abierta' ? `/quiniela/${q.id}` : `/ranking/${q.id}`
  const ctaLabel = d.estado === 'abierta' ? 'Completar predicciones' : d.estado === 'jugandose' ? 'Ver ranking' : 'Ver resultados'
  const ctaGhost = d.estado === 'finalizada'

  return (
    <div className="tq-card">
      <a href={href} className="tq-card-link">
        <div className="tq-header">
          <div style={{ minWidth: 0 }}>
            <p className="tq-title">{q.nombre}</p>
            <p className="tq-meta">{d.numPartidos} partidos · {d.participantes} participantes</p>
          </div>
          <Badge estado={d.estado} />
        </div>
        <Banda d={d} miNombreVisible={d.miNombre} />
        <div className="tq-progress">
          <ProgressRow d={d} />
        </div>
      </a>
      <div className="tq-actions">
        <a href={href} className={ctaGhost ? 'tq-cta tq-cta--ghost' : 'tq-cta tq-cta--solid'}>
          {ctaLabel}
        </a>
        <button type="button" className="tq-share" onClick={() => compartirQuiniela(q)} aria-label="Compartir quiniela">
          <ShareIcon />
          <span className="tq-share-label">Compartir</span>
        </button>
      </div>
    </div>
  )
}
