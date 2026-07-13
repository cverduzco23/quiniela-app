import { useMemo, useState } from 'react'
import { datosTarjetaQuiniela } from '../utils/quinielaCard'
import { asignarAliasQuiniela } from '../utils/misQuinielas'
import { useDialog } from './Dialogs'

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

function QuitarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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

function Badge({ estado, enviada, enVivo }) {
  if (estado === 'abierta') {
    if (enviada) {
      return (
        <span className="tq-badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#86EFAC' }}>
          Enviada
        </span>
      )
    }
    return (
      <span className="tq-badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#86EFAC' }}>
        Abierta
      </span>
    )
  }
  if (estado === 'jugandose') {
    return (
      <span className="tq-badge" style={{ background: 'rgba(34,197,94,0.14)', color: '#86EFAC' }}>
        {enVivo && <span className="tq-pulse-dot" style={{ background: '#86EFAC' }} />}
        {enVivo ? 'En vivo' : 'Jugándose'}
      </span>
    )
  }
  return (
    <span className="tq-badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}>
      Finalizada
    </span>
  )
}

function Banda({ d, miNombreVisible, onAlias }) {
  if (d.estado === 'abierta') {
    return (
      <div className="tq-banda" style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.12),rgba(250,204,21,0.03))', border: '1px solid rgba(250,204,21,0.28)' }}>
        <div className="tq-banda-num-col">
          <p className="tq-banda-num" style={{ color: '#FCD34D' }}>
            {d.restante ? d.restante.valor : '-'}<span className="tq-banda-num-suf">{d.restante ? d.restante.unidad : ''}</span>
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
        {d.nombresDisponibles?.length > 0 ? (
          <div
            className="tq-alias"
            onClick={e => { e.preventDefault(); e.stopPropagation() }}
            onMouseDown={e => e.stopPropagation()}
          >
            <span className="tq-alias-text">¿Ya estás dentro?</span>
            <select
              className="tq-alias-select"
              defaultValue=""
              onChange={e => { if (e.target.value) onAlias(e.target.value) }}
            >
              <option value="" disabled>Selecciona tu nombre</option>
              {d.nombresDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ) : (
          <p className="tq-banda-vacia-text">Consulta tu posición en el ranking</p>
        )}
      </div>
    )
  }
  if (d.estado === 'jugandose') {
    return (
      <div className="tq-banda" style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.04))', border: '1px solid rgba(34,197,94,0.28)' }}>
        <div className="tq-banda-num-col">
          <p className="tq-banda-num tq-banda-num--lg" style={{ color: d.rankingIniciado ? '#FFFFFF' : '#9CA3AF' }}>
            {d.rankingIniciado ? (
              <>{d.posicion}<span className="tq-banda-num-suf" style={{ color: '#86EFAC' }}>º</span></>
            ) : 'N/D'}
          </p>
          <p className="tq-banda-sub">DE {d.totalJugadores}</p>
        </div>
        <div className="tq-banda-divider" />
        <div className="tq-banda-mid" style={{ flex: 1 }}>
          <p className="tq-banda-label" style={{ color: '#86EFAC' }}>TU POSICIÓN</p>
          <p className="tq-banda-value">
            {miNombreVisible} - <span className="tq-banda-value-pts">{d.misPuntos}</span> pts
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
          {miNombreVisible} - <span className="tq-banda-value-pts">{d.misPuntos}</span> pts
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
  if (d.estado === 'jugandose') {
    const pct = d.numPartidos > 0 ? Math.round((d.partidosJugados / d.numPartidos) * 100) : 0
    const restantes = d.numPartidos - d.partidosJugados
    return (
      <>
        <div className="tq-progress-row">
          <span>{d.partidosJugados} de {d.numPartidos} partidos</span>
          <span style={{ color: '#86EFAC', fontWeight: 700 }}>
            {d.enVivo ? 'Partido en vivo' : restantes > 0 ? `${restantes} por jugarse` : 'Todos jugados'}
          </span>
        </div>
        <div className="tq-bar"><div className="tq-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#22C55E,#86EFAC)' }} /></div>
      </>
    )
  }
  // finalizada
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

export function TusQuinielaCard({ q, predicciones, participantes, onQuitar }) {
  const { confirmar } = useDialog()
  // aliasVersion no se lee dentro del cálculo, pero forzar su recomputación
  // es la señal de que se acaba de guardar un alias nuevo en localStorage.
  const [aliasVersion, setAliasVersion] = useState(0)
  const d = useMemo(
    () => datosTarjetaQuiniela(q, predicciones, participantes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, predicciones, participantes, aliasVersion],
  )
  const href = d.estado === 'abierta' && !d.enviada ? `/quiniela/${q.id}` : `/ranking/${q.id}`
  const ctaLabel = d.estado === 'abierta' ? (d.enviada ? 'Ver ranking' : 'Completar predicciones') : d.estado === 'jugandose' ? 'Ver ranking' : 'Ver resultados'
  const ctaGhost = d.estado === 'finalizada'
  const mostrarRankingSecundario = d.estado === 'abierta' && !d.enviada

  const handleAlias = (nombre) => {
    asignarAliasQuiniela(q.id, nombre)
    setAliasVersion(v => v + 1)
  }

  const handleQuitar = async () => {
    const ok = await confirmar(
      <>
        ¿Quitar <strong style={{ color: 'var(--text-strong)' }}>{q.nombre}</strong> de tus quinielas guardadas?
        <br />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Podrás volver a entrar con el código cuando quieras.</span>
      </>,
      { confirmar: 'Quitar', cancelar: 'Cancelar', peligro: true },
    )
    if (ok) onQuitar?.(q.id)
  }

  return (
    <div className="tq-card">
      <a href={href} className="tq-card-link">
        <div className="tq-header">
          <div style={{ minWidth: 0 }}>
            <p className="tq-title">{q.nombre}</p>
            <p className="tq-meta">{d.numPartidos} partidos · {d.participantes} participantes</p>
          </div>
          <Badge estado={d.estado} enviada={d.enviada} enVivo={d.enVivo} />
        </div>
        <Banda d={d} miNombreVisible={d.miNombre} onAlias={handleAlias} />
        {d.estado !== 'abierta' && (
          <div className="tq-progress">
            <ProgressRow d={d} />
          </div>
        )}
      </a>
      <div className={`tq-actions${mostrarRankingSecundario ? ' tq-actions--open-choice' : ''}`}>
        <a href={href} className={ctaGhost ? 'tq-cta tq-cta--ghost' : 'tq-cta tq-cta--solid'}>
          {ctaLabel}
        </a>
        {mostrarRankingSecundario && (
          <a href={`/ranking/${q.id}`} className="tq-cta tq-cta--ghost tq-cta--ranking">
            Ver ranking
          </a>
        )}
        <button type="button" className="tq-share" onClick={() => compartirQuiniela(q)} aria-label="Compartir quiniela">
          <ShareIcon />
          <span className="tq-share-label">Compartir</span>
        </button>
        <button type="button" className="tq-quitar" onClick={handleQuitar} aria-label="Quitar de tus quinielas">
          <QuitarIcon />
        </button>
      </div>
    </div>
  )
}
