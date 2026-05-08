import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, addDoc, collection, updateDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import Home from './home'

function formatFecha(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function pickValido(pick) {
  if (!pick) return false
  const l = pick.local, v = pick.visitante
  return l !== '' && l !== undefined && v !== '' && v !== undefined &&
    !isNaN(Number(l)) && !isNaN(Number(v))
}

function getPickResultado(pick) {
  if (!pickValido(pick)) return null
  const l = Number(pick.local), v = Number(pick.visitante)
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const resultadoInfo = (res, local, visitante) => ({
  home:  { label: `${local} gana`,     bg: '#DCFCE7', color: '#15803D' },
  draw:  { label: 'Empate',            bg: '#F3F4F6', color: '#4B5563' },
  away:  { label: `${visitante} gana`, bg: '#EBF3FF', color: '#1D4ED8' },
}[res])

export default function Predicciones() {
  const [searchParams] = useSearchParams()
  const quinielaId = searchParams.get('q')

  const [quiniela, setQuiniela]           = useState(null)
  const [cargando, setCargando]           = useState(true)
  const [error, setError]                 = useState(null)
  const [nombre, setNombre]               = useState('')
  const [picks, setPicks]                 = useState({})
  const [enviado, setEnviado]             = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [nombreError, setNombreError]     = useState('')
  const [mostrarResumen, setMostrarResumen] = useState(false)

  const visitanteRefs = useRef([])

  useEffect(() => {
    if (!quinielaId) { setCargando(false); setError('no-id'); return }
    getDoc(doc(db, 'quinielas', quinielaId))
      .then(snap => {
        if (!snap.exists()) setError('not-found')
        else setQuiniela(snap.data())
      })
      .catch(() => setError('error'))
      .finally(() => setCargando(false))
  }, [quinielaId])

  const partidos   = quiniela?.partidos ?? []
  const cerrada    = quiniela?.cerrada || (quiniela?.cierre && new Date() > new Date(quiniela.cierre))
  const progreso   = partidos.filter((_, i) => pickValido(picks[i])).length
  const completado = nombre.trim().length > 0 && progreso === partidos.length

  // Auto-cierre ESPN con intervalo cada 60s (item 2)
  useEffect(() => {
    if (!quiniela || cerrada || !quinielaId) return
    const conEspn = partidos.filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    const checkInicio = async () => {
      const porLiga = {}
      conEspn.forEach(p => {
        if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
        porLiga[p.ligaId].push(p)
      })
      for (const [liga, ps] of Object.entries(porLiga)) {
        try {
          const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`)
          const d = await r.json()
          const events = d.events ?? []
          for (const p of ps) {
            const ev = events.find(e => e.id === p.espnId)
            if (!ev) continue
            const state = ev.status?.type?.state
            if (state === 'in' || state === 'post') {
              await updateDoc(doc(db, 'quinielas', quinielaId), { cerrada: true })
              setQuiniela(prev => ({ ...prev, cerrada: true }))
              return
            }
          }
        } catch { /* silencioso */ }
      }
    }

    checkInicio()
    const interval = setInterval(checkInicio, 60000)
    return () => clearInterval(interval)
  }, [quiniela?.id])

  const setPick = (i, campo, valor) =>
    setPicks(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), [campo]: valor } }))

  const enviar = async () => {
    if (!completado || cerrada || enviando) return
    setEnviando(true)
    setNombreError('')
    try {
      const snap = await getDocs(query(
        collection(db, 'predicciones'),
        where('quinielaId', '==', quinielaId),
        where('nombre', '==', nombre.trim())
      ))
      if (!snap.empty) {
        setNombreError(`Ya hay alguien registrado como "${nombre.trim()}". Usa un nombre diferente o añade tu apellido.`)
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      await addDoc(collection(db, 'predicciones'), {
        quinielaId,
        nombre: nombre.trim(),
        picks,
        fecha: new Date().toISOString(),
      })
      setEnviado(true)
    } catch {
      alert('Error al guardar. Intenta de nuevo.')
      setEnviando(false)
    }
  }

  // ── Estados de pantalla ────────────────────────────────────────────────────

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#6B7280', fontSize: 14 }}>
      Cargando quiniela…
    </div>
  )

  if (error === 'no-id') return <Home />

  if (error) return (
    <div style={{ textAlign: 'center', padding: '5rem 1.5rem', color: '#6B7280' }}>
      <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
      <p style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        {error === 'not-found' ? 'Quiniela no encontrada' : 'Error de conexión'}
      </p>
      <p style={{ fontSize: 14 }}>Contacta al organizador para obtener el enlace correcto.</p>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: 'linear-gradient(135deg, #16A34A, #22C55E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: 44, color: '#fff',
        }}>✓</div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>¡Listo, {nombre}!</h2>
        <p style={{ color: '#6B7280', fontSize: 15, marginBottom: 6 }}>Tus predicciones fueron registradas.</p>
        <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 28 }}>Revisa el ranking cuando terminen los partidos.</p>
        <a
          href={`/ranking?q=${quinielaId}`}
          style={{
            display: 'inline-block', padding: '13px 28px', borderRadius: 12,
            background: 'linear-gradient(135deg, #0F2942 0%, #1B5299 100%)',
            color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(27,82,153,0.35)',
          }}
        >
          Ver ranking →
        </a>
      </div>
    </div>
  )

  const pct = partidos.length > 0 ? (progreso / partidos.length) * 100 : 0

  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(150deg, #0F2942 0%, #1B5299 100%)', color: '#fff', padding: '2rem 1.25rem 1.75rem' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8, fontWeight: 600 }}>⚽ QuinielApp</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>{quiniela.nombre}</h1>
          {quiniela.cierre && (
            <span style={{
              display: 'inline-block', fontSize: 12, fontWeight: 500,
              padding: '4px 12px', borderRadius: 99,
              background: cerrada ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.15)',
              color: cerrada ? '#FCA5A5' : 'rgba(255,255,255,0.9)',
            }}>
              {cerrada ? '🔒 Quiniela cerrada' : `⏳ Cierre: ${formatFecha(quiniela.cierre)}`}
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* Reglas de puntos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { pts: '1 pt',   desc: 'Resultado correcto' },
            { pts: '+2 pts', desc: 'Marcador exacto' },
          ].map(r => (
            <div key={r.desc} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', borderRadius: 8, padding: '6px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)', flex: '1 1 auto',
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1B5299' }}>{r.pts}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {/* ── Quiniela cerrada ─────────────────────────────────────────────── */}
        {cerrada ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 8 }}>Plazo de registro cerrado</p>
            <p style={{ fontSize: 14, color: '#6B7280' }}>Ya no se pueden ingresar predicciones.</p>
          </div>

        /* ── Pantalla de resumen antes de enviar (item 11) ──────────────── */
        ) : mostrarResumen ? (
          <div>
            <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', marginBottom: 10, boxShadow: '0 2px 8px rgba(27,82,153,0.10)', border: '2px solid #1B5299' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Revisa tus picks
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#0F2942', marginBottom: 16 }}>{nombre}</p>

              {partidos.map((p, i) => {
                const pick = picks[i]
                const res  = getPickResultado(pick)
                const info = res ? resultadoInfo(res, p.local, p.visitante) : null
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: i < partidos.length - 1 ? '1px solid #F3F4F6' : 'none',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#0F2942', padding: '2px 14px', background: '#EBF3FF', borderRadius: 8, flexShrink: 0 }}>
                      {pick?.local ?? '?'} – {pick?.visitante ?? '?'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{p.visitante}</span>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                    </div>
                    {info && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: info.bg, color: info.color, flexShrink: 0 }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {nombreError && (
              <div style={{
                marginBottom: 10, padding: '10px 14px', borderRadius: 10,
                background: '#FEF2F2', border: '1px solid #FECACA',
                fontSize: 13, color: '#DC2626', lineHeight: 1.5,
              }}>
                ⚠️ {nombreError}
              </div>
            )}

            <button
              onClick={enviar}
              disabled={enviando}
              style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                background: enviando ? '#D1D5DB' : 'linear-gradient(135deg, #0F2942 0%, #1B5299 100%)',
                color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.3,
                cursor: enviando ? 'not-allowed' : 'pointer',
                boxShadow: enviando ? 'none' : '0 4px 14px rgba(27,82,153,0.35)',
                marginBottom: 10,
              }}
            >
              {enviando ? 'Enviando…' : 'Confirmar y enviar →'}
            </button>
            <button
              onClick={() => setMostrarResumen(false)}
              disabled={enviando}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #D1D5DB',
                background: 'transparent', color: '#6B7280', fontSize: 14, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ← Editar picks
            </button>
          </div>

        /* ── Formulario principal ────────────────────────────────────────── */
        ) : (
          <>
            {/* Nombre */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
                Tu nombre
              </label>
              <input
                type="text"
                placeholder="¿Cómo te llamas?"
                value={nombre}
                onChange={e => { setNombre(e.target.value); setNombreError('') }}
                style={{ fontSize: 15, borderColor: nombreError ? '#EF4444' : undefined }}
              />
              {nombreError && (
                <p style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{nombreError}</p>
              )}
            </div>

            {/* Partidos */}
            {partidos.map((p, i) => {
              const pick = picks[i]
              const res  = getPickResultado(pick)
              const info = res ? resultadoInfo(res, p.local, p.visitante) : null

              return (
                <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Partido {i + 1}
                    </span>
                    {p.hora && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{formatFecha(p.hora)}</span>}
                  </div>

                  {/* Score inputs */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 }}>
                    {/* Local */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.local}
                      </span>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.local ?? ''}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                          setPick(i, 'local', v)
                          if (v.length >= 2) visitanteRefs.current[i]?.focus()
                        }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontSize: 30, fontWeight: 800,
                          padding: '10px 4px', borderRadius: 12,
                          border: pickValido({ local: pick?.local, visitante: '0' }) ? '2px solid #1B5299' : '1.5px solid #E5E7EB',
                          background: pick?.local !== undefined && pick?.local !== '' ? '#EBF3FF' : '#FAFAFA',
                          color: '#0F2942',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: 22, color: '#D1D5DB', fontWeight: 700, paddingBottom: 12 }}>–</span>

                    {/* Visitante */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.visitante}
                      </span>
                      <input
                        ref={el => { visitanteRefs.current[i] = el }}
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.visitante ?? ''}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2); setPick(i, 'visitante', v) }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontSize: 30, fontWeight: 800,
                          padding: '10px 4px', borderRadius: 12,
                          border: pickValido({ local: '0', visitante: pick?.visitante }) ? '2px solid #1B5299' : '1.5px solid #E5E7EB',
                          background: pick?.visitante !== undefined && pick?.visitante !== '' ? '#EBF3FF' : '#FAFAFA',
                          color: '#0F2942',
                        }}
                      />
                    </div>
                  </div>

                  {/* Resultado derivado */}
                  <div style={{ textAlign: 'center', marginTop: 12, minHeight: 24 }}>
                    {info && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 99, background: info.bg, color: info.color }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <div style={{ flex: 1, height: 5, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #0F2942, #1B5299)', width: `${pct}%`, transition: 'width 0.25s' }} />
              </div>
              <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {progreso}/{partidos.length} partidos
              </span>
            </div>

            {/* Botón revisar */}
            <button
              onClick={() => { if (completado) setMostrarResumen(true) }}
              disabled={!completado}
              style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                background: completado ? 'linear-gradient(135deg, #0F2942 0%, #1B5299 100%)' : '#D1D5DB',
                color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.3,
                cursor: completado ? 'pointer' : 'not-allowed',
                boxShadow: completado ? '0 4px 14px rgba(27,82,153,0.35)' : 'none',
              }}
            >
              Revisar predicciones →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
