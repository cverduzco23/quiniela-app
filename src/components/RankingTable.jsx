import { useState } from 'react'
import { cierreToDate, quinielaCerrada, quinielaFinalizada } from '../utils/cierre'
import { goalsToResultado, getResultado, getPickResultado, getEfectivo, calcularPuntos } from '../utils/scoring'
import { tienePremio, calcularGanadores, formatearMXN, descripcionRegla } from '../utils/premios'
import { normalizarNombre } from '../utils/nombres'
import { compartirRanking } from '../utils/shareRanking'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function pickDisplay(pick) {
  if (!pick) return '—'
  if (typeof pick === 'object') {
    const l = pick.local ?? '?', v = pick.visitante ?? '?'
    return `${l}–${v}`
  }
  return { home: 'Local', draw: 'Empate', away: 'Visitante' }[pick] ?? pick
}

const medals = ['🥇', '🥈', '🥉']
const resultColor = {
  home: { bg: 'var(--green-bg)',   color: 'var(--green)' },
  draw: { bg: 'var(--neutral-bg)', color: 'var(--muted)' },
  away: { bg: 'var(--yellow-bg)',  color: 'var(--yellow)' },
}
const resultLabel = { home: 'Local', draw: 'Empate', away: 'Visitante' }
const PAGE_SIZE = 50

export function RankingTable({ quiniela, predicciones, liveScores = {} }) {
  const [expandido, setExpandido] = useState(new Set())
  const [visibles, setVisibles]   = useState(PAGE_SIZE)
  const [compartiendo, setCompartiendo] = useState(false)
  const [feedbackShare, setFeedbackShare] = useState('')

  const toggleExpandido = (nombre) => {
    setExpandido(prev => {
      const s = new Set(prev)
      s.has(nombre) ? s.delete(nombre) : s.add(nombre)
      return s
    })
  }

  const partidos   = quiniela.partidos ?? []
  const resultados = quiniela.resultados ?? {}
  const cerrada    = quinielaCerrada(quiniela)
  const finalizada = quinielaFinalizada(quiniela)
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
  const terminados = partidos.filter((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (r?.cancelado) return false
    return getResultado(r) !== null
  }).length
  const hayResultados = terminados > 0 || enVivo

  const jugadores = predicciones
    .map(p => ({ nombre: normalizarNombre(p.nombre), picks: p.picks, fecha: p.fecha, ...calcularPuntos(p.picks, resultados, liveScores, partidos) }))
    .sort((a, b) =>
      b.puntos - a.puntos ||
      b.exactos - a.exactos ||
      b.aciertos - a.aciertos ||
      (a.fecha ?? '￿').localeCompare(b.fecha ?? '￿')
    )

  // Ranking olímpico: jugadores con los mismos puntos comparten posición
  const posiciones = []
  jugadores.forEach((j, i) => {
    if (i === 0) { posiciones.push(1); return }
    const prev = jugadores[i - 1]
    posiciones.push(prev.puntos === j.puntos ? posiciones[i - 1] : i + 1)
  })

  const shown     = jugadores.slice(0, visibles)
  const restantes = jugadores.length - shown.length

  const conPremio = tienePremio(quiniela)
  const { ganadores, premioPorNombre, bote } = calcularGanadores(jugadores, quiniela, jugadores.length)

  return (
    <>
      <style>{`@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}`}</style>
      {/* Reglas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ pts: '1 pt', desc: 'Resultado correcto' }, { pts: '+2 pts', desc: 'Marcador exacto' }].map(r => (
          <div key={r.desc} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', border: '1px solid var(--border)', flex: '1 1 auto' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{r.pts}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</span>
          </div>
        ))}
      </div>

      {/* Banner de premio */}
      {conPremio && <PremioBanner quiniela={quiniela} bote={bote} ganadores={ganadores} finalizada={finalizada} hayResultados={hayResultados} />}
      {!conPremio && <SinPremioBanner />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { val: jugadores.length,                   label: 'Participantes' },
          { val: `${terminados}/${partidos.length}`, label: 'Partidos' },
          { val: jugadores[0]?.puntos ?? 0,          label: 'Pts líder' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '14px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, display: 'block', color: 'var(--yellow)' }}>{s.val}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Partidos */}
      {partidos.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Partidos</span>
            {enVivo && <span style={{ fontSize: 11, fontWeight: 700, color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />En vivo</span>}
          </div>
          {partidos.map((p, i) => {
            const live      = p.espnId ? liveScores?.[p.espnId] : null
            const stored    = resultados[i] ?? resultados[String(i)]
            const cancelado = !!stored?.cancelado
            const esVivo    = !cancelado && live?.state === 'in'
            const esFinish  = !cancelado && live?.state === 'post'
            let scoreLocal = '–', scoreVisitante = '–', resDisplay = null
            if (!cancelado && live && (esVivo || esFinish) && live.local !== '') {
              scoreLocal = live.local; scoreVisitante = live.visitante
              resDisplay = goalsToResultado(live.local, live.visitante)
            } else if (!cancelado && stored) {
              scoreLocal = stored.local ?? '–'; scoreVisitante = stored.visitante ?? '–'
              resDisplay = getResultado(stored)
            }
            return (
              <div key={i} style={{ borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none', background: esVivo ? 'rgba(250,204,21,0.06)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: p.hora ? '9px 16px 2px' : '11px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                    {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: cancelado ? 'var(--muted)' : esVivo ? '#FCA5A5' : 'var(--text-strong)', padding: '3px 8px', background: esVivo ? 'var(--red-bg)' : 'var(--card-light)', borderRadius: 'var(--radius-sm)', margin: '0 6px', minWidth: 46, textAlign: 'center', flexShrink: 0, textDecoration: cancelado ? 'line-through' : 'none' }}>
                    {scoreLocal}–{scoreVisitante}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                    {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                  </div>
                  <div style={{ marginLeft: 10, minWidth: 70, textAlign: 'right' }}>
                    {cancelado ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)', border: '1px solid var(--border-strong)' }}>Cancelado</span>
                    ) : esVivo ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 'var(--radius-full)', background: 'var(--red-bg-strong)', color: '#FCA5A5', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite' }} />{live.clock || 'EN VIVO'}
                      </span>
                    ) : resDisplay ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: resultColor[resDisplay].bg, color: resultColor[resDisplay].color, whiteSpace: 'nowrap' }}>
                        {resultLabel[resDisplay]}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)' }}>Pendiente</span>
                    )}
                    {(esFinish || stored) && !esVivo && !cancelado && p.espnId && (
                      <a href={`https://www.espn.com/soccer/match/_/gameId/${p.espnId}`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', marginTop: 4 }}>
                        Ver resumen →
                      </a>
                    )}
                  </div>
                </div>
                {p.hora && <p style={{ fontSize: 10, color: 'var(--muted)', padding: '0 16px 8px', margin: 0 }}>{formatFecha(p.hora)}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla ranking */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {enVivo && (
          <div style={{ background: 'var(--red-bg)', borderBottom: '1px solid var(--red)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, color: '#FCA5A5', fontWeight: 600 }}>Ranking provisional — actualizando cada minuto</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px', padding: '10px 16px', background: 'var(--card-light)', borderBottom: '1px solid var(--border)' }}>
          {['#', 'Jugador', 'Result.', 'Exactos', 'Pts'].map((h, idx) => (
            <span key={h} style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: idx >= 2 ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>

        {jugadores.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Nadie ha registrado predicciones todavía.
          </div>
        ) : shown.map((j, i) => {
          const abierto = expandido.has(j.nombre)
          const pos = posiciones[i]
          const esLider = pos === 1 && hayResultados
          const medalla = pos <= 3 ? medals[pos - 1] : null

          return (
            <div key={j.nombre} style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div
                onClick={() => cerrada && toggleExpandido(j.nombre)}
                style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr 60px 60px 52px',
                  padding: '13px 16px', alignItems: 'center',
                  background: esLider ? 'linear-gradient(90deg, var(--yellow-bg), transparent 60%)' : 'transparent',
                  cursor: cerrada ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: medalla ? 18 : 14, fontWeight: 700, color: medalla ? 'var(--yellow)' : 'var(--muted)' }}>
                  {medalla ?? `${pos}`}
                </span>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ fontSize: 14, fontWeight: esLider ? 700 : 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {j.nombre}
                    {cerrada && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>}
                  </span>
                  {j.fecha && (
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Enviado: {formatFecha(j.fecha)}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>{j.aciertos}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'center', color: j.exactos > 0 ? 'var(--yellow)' : 'var(--muted)', fontWeight: j.exactos > 0 ? 700 : 600 }}>{j.exactos}</span>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: esLider ? 'var(--yellow)' : 'var(--green)' }}>{j.puntos}</span>
                  {premioPorNombre[j.nombre] !== undefined && (
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--green)', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {formatearMXN(premioPorNombre[j.nombre])}
                    </span>
                  )}
                </div>
              </div>

              {abierto && cerrada && (
                <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', padding: '0 16px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 0 8px' }}>
                    Predicciones de {j.nombre}
                  </p>
                  {partidos.map((partido, pi) => {
                    const pick      = j.picks?.[pi] ?? j.picks?.[String(pi)]
                    const res       = getEfectivo(partido, pi, resultados, liveScores)
                    const cancelado = !!res?.cancelado
                    const resR      = cancelado ? null : getResultado(res)
                    const pickR     = getPickResultado(pick)
                    const correcto  = !cancelado && resR && pickR && resR === pickR
                    const exacto    = correcto && typeof pick === 'object' && pick !== null &&
                                      String(res.local) === String(pick.local) &&
                                      String(res.visitante) === String(pick.visitante)
                    const pts       = cancelado ? null : !resR ? null : exacto ? 3 : correcto ? 1 : 0
                    return (
                      <div key={pi} style={{
                        display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 8,
                        padding: '8px 12px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
                        background: cancelado ? 'var(--card)' : !resR ? 'var(--card)' : (exacto || correcto) ? 'var(--green-bg)' : 'var(--red-bg)',
                        border: '1px solid',
                        borderColor: cancelado ? 'var(--border)' : !resR ? 'var(--border)' : exacto ? 'var(--green)' : correcto ? 'var(--green-dark)' : 'var(--red)',
                        opacity: cancelado ? 0.7 : 1,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {partido.local} vs {partido.visitante}
                          </p>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--neutral-bg)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {pickDisplay(pick)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {cancelado ? 'Cancelado' : res ? `${res.local}–${res.visitante}` : '—'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right', color: pts === 3 ? 'var(--yellow)' : pts === 1 ? 'var(--green)' : pts === 0 ? 'var(--red)' : 'var(--muted)' }}>
                          {cancelado ? '–' : pts === null ? '—' : pts === 0 ? '✗' : `+${pts}`}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{j.puntos} pts</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {!cerrada && jugadores.length > 0 && (
          <div style={{ padding: '10px 16px', background: 'var(--yellow-bg)', borderTop: '1px solid var(--yellow-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--yellow-soft)' }}>🔒 Las predicciones de cada jugador se revelan al cierre de la quiniela</span>
          </div>
        )}

        {restantes > 0 && (
          <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setVisibles(v => v + PAGE_SIZE)}
              style={{ background: 'var(--card-light)', border: '1px solid var(--border-strong)', color: 'var(--muted)', padding: '8px 20px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Ver más ({restantes} restante{restantes !== 1 ? 's' : ''})
            </button>
          </div>
        )}
      </div>

      {jugadores.length > 0 && (
        <>
          <button
            onClick={async () => {
              if (compartiendo) return
              setCompartiendo(true)
              setFeedbackShare('')
              try {
                const res = await compartirRanking({
                  quiniela,
                  jugadores,
                  premioPorNombre,
                  bote,
                  finalizada,
                  enVivo,
                  terminados,
                  totalPartidos: partidos.length,
                  conPremio,
                })
                if (res?.copiado) {
                  setFeedbackShare('✓ Imagen copiada — pégala en WhatsApp')
                  setTimeout(() => setFeedbackShare(''), 4000)
                } else if (res?.descargado) {
                  setFeedbackShare('✓ Imagen descargada — súbela a WhatsApp')
                  setTimeout(() => setFeedbackShare(''), 4000)
                }
              } catch (err) {
                console.error('Error compartiendo:', err)
                alert('No se pudo generar la imagen. Intenta de nuevo.')
              } finally {
                setCompartiendo(false)
              }
            }}
            disabled={compartiendo}
            style={{
              width: '100%', marginTop: 14, padding: '13px 16px',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: compartiendo ? 'var(--card-light)' : '#25D366',
              color: compartiendo ? 'var(--muted)' : '#FFFFFF',
              fontSize: 14, fontWeight: 800, letterSpacing: 0.2,
              cursor: compartiendo ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {compartiendo ? 'Generando imagen…' : '📷 Compartir ranking como imagen'}
          </button>
          {feedbackShare && (
            <p style={{ fontSize: 12, color: 'var(--green)', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
              {feedbackShare}
            </p>
          )}
        </>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 14, lineHeight: 1.8 }}>
        1 pt resultado correcto · +2 pts marcador exacto (máx. 3 pts por partido){'\n'}
        Empate: más exactos → más aciertos → si persiste, comparten posición {conPremio ? 'y se reparte el premio en partes iguales' : ''} · {enVivo ? '🔴 Actualizando cada 60 seg' : 'Actualización en tiempo real'}
      </p>
    </>
  )
}

function SinPremioBanner() {
  return (
    <div style={{
      background: 'var(--card)', border: '1px dashed var(--border-strong)',
      borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">🎉</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', letterSpacing: 0.3, marginBottom: 2 }}>
          SOLO POR DIVERSIÓN
        </p>
        <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Quiniela sin premio en dinero. Compite por la cima del ranking.
        </p>
      </div>
    </div>
  )
}

function PremioBanner({ quiniela, bote, ganadores, finalizada, hayResultados }) {
  const medalla = (pos) => pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : ''
  const grupos = ganadores.reduce((acc, g) => {
    (acc[g.posicion] ??= []).push(g)
    return acc
  }, {})

  if (quiniela.boteDevuelto) {
    return (
      <div style={{
        background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', letterSpacing: 0.4 }}>
            💸 Bote devuelto
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {formatearMXN(bote)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          El organizador decidió devolver el bote a los participantes. No se reparten premios.
        </p>
      </div>
    )
  }

  if (!hayResultados || ganadores.length === 0) {
    const mensaje = !hayResultados
      ? descripcionRegla(quiniela)
      : finalizada
        ? 'Sin ganadores: nadie acertó ningún partido.'
        : 'Aún no hay puntos para definir ganadores.'
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))',
        border: '1px solid var(--green)', borderRadius: 'var(--radius-md)',
        padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Premio</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.01em' }}>
            {formatearMXN(bote)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{mensaje}</p>
      </div>
    )
  }

  const titulo = finalizada ? '🏆 Ganadores' : '📊 Si terminara ahora'
  return (
    <div style={{
      background: finalizada
        ? 'linear-gradient(135deg, rgba(250,204,21,0.14), rgba(250,204,21,0.04))'
        : 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
      border: `1px solid ${finalizada ? 'var(--yellow)' : 'var(--green)'}`,
      borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: finalizada ? 'var(--yellow)' : 'var(--green)', letterSpacing: 0.4 }}>
          {titulo}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          Bote: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatearMXN(bote)}</span>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {Object.entries(grupos).map(([pos, gs]) => (
          <div key={pos} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '8px 12px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{medalla(Number(pos))}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {gs.map(g => g.nombre).join(', ')}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {formatearMXN(gs[0].premio)}{gs.length > 1 ? ' c/u' : ''}
            </span>
          </div>
        ))}
      </div>
      {!finalizada && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
          Premios provisionales. Pueden cambiar mientras la quiniela siga en juego.
        </p>
      )}
    </div>
  )
}
