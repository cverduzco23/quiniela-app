import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore'
import { db, track } from '../firebase'
import { registrarVisita, registrarVisitaQuiniela, registrarEnVivo } from '../utils/analytics'
import { getResultado } from '../utils/scoring'
import { findEventByTeamsAndDate } from '../utils/espn'
import { tienePremio } from '../utils/premios'
import { quinielaCerrada, cierreToDate, tiempoRestante } from '../utils/cierre'
import { RankingTable } from '../components/RankingTable'
import { CuentaRegresiva } from '../components/CuentaRegresiva'
import { Footer } from '../components/Footer'
import { BrandMark } from '../components/Brand'

export default function Ranking() {
  const [searchParams] = useSearchParams()
  const { id: idDeRuta } = useParams()
  // Acepta /ranking/<id> (ruta nueva) y /ranking?q=<id> (links viejos ya compartidos).
  const quinielaId = idDeRuta || searchParams.get('q')

  const [quiniela, setQuiniela]         = useState(null)
  const [predicciones, setPredicciones] = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)
  const [liveScores, setLiveScores]     = useState({})
  const [liveStats, setLiveStats]       = useState({})
  const [liveEventos, setLiveEventos]   = useState({})
  const [ultimaAct, setUltimaAct]       = useState(null)
  const [actualizando, setActualizando] = useState(false)

  // ── Carga de datos (lectura puntual, no escucha permanente) ──────
  // Usamos getDoc/getDocs (una sola lectura) en vez de onSnapshot. Una escucha
  // en tiempo real mantiene una conexión ABIERTA por pestaña; iOS —donde todos
  // los navegadores (incluido Chrome) usan el motor de Safari— limita las
  // conexiones por sitio (~6), así que al abrir varias pestañas del mismo enlace
  // la siguiente se quedaba "Cargando…" sin conexión libre. Con lecturas
  // puntuales cada pestaña pide los datos, los recibe y suelta la conexión.
  // Los marcadores en vivo vienen de ESPN cada 90s (no de Firebase), así que no
  // perdemos nada de "tiempo real"; los datos se refrescan en ese mismo ciclo.
  const cargarDatos = async () => {
    if (!quinielaId) return false
    const [snapQ, snapP] = await Promise.all([
      getDoc(doc(db, 'quinielas', quinielaId)),
      getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId))),
    ])
    if (!snapQ.exists()) { setError('not-found'); setCargando(false); return false }
    setQuiniela({ id: snapQ.id, ...snapQ.data() })
    setPredicciones(snapP.docs.map(d => ({ id: d.id, ...d.data() })))
    setError(null)
    setCargando(false)
    return true
  }

  // ── Carga inicial + reintento ────────────────────────────────────
  // `intento` se incrementa para forzar una recarga (timeout o regreso de una
  // pestaña congelada por el navegador).
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!quinielaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCargando(false); setError('no-id'); return
    }
    let activo = true
    let respondio = false
    cargarDatos().then(ok => { if (ok) respondio = true }).catch(() => {})

    // Salvavidas anti-spinner-infinito: si en 8s no llegaron los datos (conexión
    // colgada o saturada), reintentamos; tras un par de intentos mostramos error.
    const timeout = setTimeout(() => {
      if (!activo || respondio) return
      if (intento < 2) setIntento(n => n + 1)
      else { setError('timeout'); setCargando(false) }
    }, 8000)

    return () => { activo = false; clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quinielaId, intento])

  // ── Recarga al volver de una pestaña "congelada" ─────────────────
  // Safari/Chrome móvil congelan las pestañas en segundo plano (bfcache). Al
  // volver al enlace recargamos los datos para no mostrar algo viejo o pegado.
  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) { setCargando(true); setError(null); setIntento(n => n + 1) }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // ── Polling ESPN ────────────────────────────────────────────────
  const fetchLiveData = async (quinielaData) => {
    const partidos = quinielaData?.partidos ?? []
    const conEspn  = partidos.filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    const porLiga = {}
    conEspn.forEach(p => {
      if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
      porLiga[p.ligaId].push(p)
    })
    const getStat = (stats, name) => stats?.find(s => s.name === name)?.displayValue ?? '—'
    const nuevos = {}
    const nuevosStats = {}
    const nuevosEventos = {}
    const idsCorregidos = []
    // ESPN agrupa los eventos por fecha en hora del Este de EE.UU. Un partido que
    // arrancó tarde (ej. 10pm CDMX = 11pm ET) puede seguir "en vivo" pero ESPN ya
    // lo reporta bajo el día anterior. Pedimos un rango de 3 días (ayer-mañana)
    // para no perder esos partidos por el corte de fecha.
    const fmtFecha = d => d.toISOString().slice(0, 10).replace(/-/g, '')
    const hoyDate    = new Date()
    const ayerDate   = new Date(hoyDate.getTime() - 24 * 60 * 60 * 1000)
    const mananaDate = new Date(hoyDate.getTime() + 24 * 60 * 60 * 1000)
    const rangoFechas = `${fmtFecha(ayerDate)}-${fmtFecha(mananaDate)}`

    for (const [liga, ps] of Object.entries(porLiga)) {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${rangoFechas}`)
        const d = await r.json()
        const events = d.events ?? []
        ps.forEach(p => {
          let ev = events.find(e => e.id === p.espnId)
          if (!ev) {
            // ESPN reasignó el ID del evento (reprogramación, cambio de sede, etc.).
            // Buscamos por nombres de equipos + mismo día; si hay un único candidato
            // lo usamos para el marcador en vivo y corregimos el espnId guardado.
            ev = findEventByTeamsAndDate(events, p.local, p.visitante, p.hora)
            if (!ev) return
            idsCorregidos.push({ idx: partidos.indexOf(p), nuevoId: ev.id })
          }
          const state = ev.status?.type?.state
          const completed = ev.status?.type?.completed
          const comps = ev.competitions?.[0]?.competitors ?? []
          const home  = comps.find(c => c.homeAway === 'home')
          const away  = comps.find(c => c.homeAway === 'away')
          const statusName = ev.status?.type?.name ?? ''
          const esHalftime = statusName === 'STATUS_HALFTIME'
          // ESPN reporta cancelados/pospuestos/forfeits con state="post" pero completed=false.
          // No los tratamos como resultado válido — marcamos cancelado para que el scoring los skip.
          const esCancelado = state === 'post' && completed === false
          if (esCancelado) {
            nuevos[p.espnId] = { state, cancelado: true, halftime: false, local: '', visitante: '' }
            return
          }
          nuevos[p.espnId] = { state, clock: ev.status?.displayClock ?? '', halftime: esHalftime, local: home?.score ?? '', visitante: away?.score ?? '' }
          nuevosStats[p.espnId] = {
            state,
            home: {
              nombre:       home?.team?.displayName ?? p.local,
              logo:         home?.team?.logo ?? '',
              posesion:     getStat(home?.statistics, 'possessionPct'),
              tirosArco:    getStat(home?.statistics, 'shotsOnTarget'),
              tirosTotales: getStat(home?.statistics, 'totalShots'),
              corners:      getStat(home?.statistics, 'wonCorners'),
              faltas:       getStat(home?.statistics, 'foulsCommitted'),
            },
            away: {
              nombre:       away?.team?.displayName ?? p.visitante,
              logo:         away?.team?.logo ?? '',
              posesion:     getStat(away?.statistics, 'possessionPct'),
              tirosArco:    getStat(away?.statistics, 'shotsOnTarget'),
              tirosTotales: getStat(away?.statistics, 'totalShots'),
              corners:      getStat(away?.statistics, 'wonCorners'),
              faltas:       getStat(away?.statistics, 'foulsCommitted'),
            },
          }
          // Eventos del partido (goles, tarjetas, cambios). ESPN los entrega
          // en orden cronológico; los mostramos todos (recientes arriba en la tabla).
          const detalles = ev.competitions?.[0]?.details ?? []
          const eventos = detalles.map(dt => {
            const teamId = dt.team?.id
            const lado = teamId === home?.team?.id ? 'home' : teamId === away?.team?.id ? 'away' : null
            const jugador = dt.athletesInvolved?.[0]?.shortName || dt.athletesInvolved?.[0]?.displayName || ''
            let tipo = 'default'
            if (dt.scoringPlay) tipo = 'goal'
            else if (dt.redCard) tipo = 'red-card'
            else if (dt.yellowCard) tipo = 'yellow-card'
            else if (/substitution/i.test(dt.type?.text || '')) tipo = 'substitution'
            return {
              tipo,
              minuto: dt.clock?.displayValue || '',
              lado,
              jugador,
              ownGoal: !!dt.ownGoal,
            }
          })
          if (eventos.length > 0) nuevosEventos[p.espnId] = eventos
        })
      } catch { /* silencioso */ }
    }
    setLiveScores(prev => ({ ...prev, ...nuevos }))
    setLiveStats(prev => ({ ...prev, ...nuevosStats }))
    setLiveEventos(prev => ({ ...prev, ...nuevosEventos }))
    setUltimaAct(new Date())

    if (idsCorregidos.length > 0) {
      try {
        const nuevosPartidos = partidos.map((p, i) => {
          const fix = idsCorregidos.find(c => c.idx === i)
          return fix ? { ...p, espnId: fix.nuevoId } : p
        })
        await updateDoc(doc(db, 'quinielas', quinielaData.id), { partidos: nuevosPartidos })
      } catch { /* silencioso */ }
    }

    if (
      conEspn.length > 0 &&
      !quinielaData.finalizada &&
      conEspn.every(p => nuevos[p.espnId]?.state === 'post')
    ) {
      try { await updateDoc(doc(db, 'quinielas', quinielaData.id), { finalizada: true }) }
      catch { /* silencioso */ }
    }
  }

  useEffect(() => {
    if (!quiniela) return
    const conEspn = (quiniela.partidos ?? []).filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) return

    // Polling 90s, pausa cuando la pestaña no está visible
    // (ahorro de ancho de banda + cuota ESPN cuando hay muchos clientes abiertos)
    let interval = null
    const tick = () => { cargarDatos().catch(() => {}); fetchLiveData(quiniela) }
    const start = () => {
      if (interval) return
      tick()
      interval = setInterval(tick, 90000)
    }
    const stop = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiniela?.id])

  // ── Tracking: ranking visto ─────────────────────────────────────
  useEffect(() => {
    if (quinielaId) {
      track('ranking_visto', { quinielaId })
      registrarVisita()
      registrarVisitaQuiniela(quinielaId)
    }
  }, [quinielaId])

  // ── Analítica: espectadores mientras un partido está EN VIVO ─────
  // Cuando un partido marca state==='in', registramos al espectador una vez
  // por sesión y partido (la función ya hace ese control internamente).
  useEffect(() => {
    if (!quinielaId) return
    Object.entries(liveScores).forEach(([espnId, l]) => {
      if (l?.state === 'in') registrarEnVivo(quinielaId, espnId)
    })
  }, [quinielaId, liveScores])

  // ── Detectar si este dispositivo ya envió predicción ─────────────
  // (para esconder el CTA de "Entrar a la quiniela")
  const [yaEnvió, setYaEnvió] = useState(false)
  useEffect(() => {
    if (!quinielaId) return
    try {
      const flag = localStorage.getItem(`quiniela-${quinielaId}-enviada`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setYaEnvió(!!flag)
    } catch { /* localStorage no disponible */ }
  }, [quinielaId])

  // ── Refrescar el banner de "Cierra en X min" cada minuto cerca del cierre
  const [, setTickCierre] = useState(0)
  useEffect(() => {
    if (!quiniela?.cierre || quinielaCerrada(quiniela)) return
    const d = cierreToDate(quiniela.cierre)
    if (!d) return
    const ms = d.getTime() - Date.now()
    if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return
    const i = setInterval(() => setTickCierre(t => t + 1), 60 * 1000)
    return () => clearInterval(i)
  }, [quiniela])

  const handleRefresh = async () => {
    if (actualizando || !quiniela) return
    setActualizando(true)
    try { await Promise.all([cargarDatos().catch(() => {}), fetchLiveData(quiniela)]) }
    finally { setActualizando(false) }
  }

  // ── Render estados ────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando ranking…
    </div>
  )
  if (error || !quiniela) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ display: 'inline-flex', color: 'var(--yellow)', marginBottom: 20 }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.4 3.1 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3l-8-13.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 8v5" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>No se pudo cargar el ranking</p>
        {error === 'timeout' && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
            La conexión está tardando más de lo normal. Revisa tu internet e inténtalo de nuevo.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: error === 'timeout' ? 0 : 24 }}>
          {(error === 'timeout' || error === 'error') && (
            <button onClick={() => { setError(null); setCargando(true); setIntento(n => n + 1) }} style={{
              padding: '11px 24px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--green), var(--green-light))',
              color: '#07120A', fontWeight: 800, fontSize: 14,
              boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
            }}>
              ↻ Reintentar
            </button>
          )}
          <a href="/" style={{
            display: 'inline-block', padding: '11px 24px', borderRadius: 'var(--radius-md)',
            background: (error === 'timeout' || error === 'error') ? 'transparent' : 'linear-gradient(135deg, var(--green), var(--green-light))',
            color: (error === 'timeout' || error === 'error') ? 'var(--muted)' : '#07120A',
            fontWeight: 800, fontSize: 14, textDecoration: 'none',
            boxShadow: (error === 'timeout' || error === 'error') ? 'none' : 'var(--shadow-green)', letterSpacing: 0.2,
          }}>
            ← Ver quinielas activas
          </a>
        </div>
      </div>
    </div>
  )

  const partidos   = quiniela.partidos ?? []
  const resultados = quiniela.resultados ?? {}
  const enVivo     = Object.values(liveScores).some(l => l.state === 'in')
  const hayPartidosActualizables = partidos.some(p => p.espnId && p.ligaId)
  // Finalizada: nada en vivo y todos los partidos ya con resultado o cancelados.
  // En ese estado no hay nada que "actualizar".
  const finalizada = partidos.length > 0 && !enVivo && partidos.every((_, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    return r?.cancelado || getResultado(r) !== null
  })
  const mostrarControlesActualizacion = hayPartidosActualizables && quinielaCerrada(quiniela) && !finalizada

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad ranking-hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="ranking-brand-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--ranking-brand-margin-bottom, 8px)' }}>
            <a href="/" className="app-back-button" aria-label="Ir a inicio" title="Inicio">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </a>
            <a href="/" className="ranking-brand-link" aria-label="QuinielApp Ranking">
              <BrandMark size={22} />
              <span className="ranking-brand-name">
                Quiniel<span style={{ color: 'var(--green)' }}>App</span>
              </span>
              <span className="ranking-brand-dot" aria-hidden="true" />
              <span className="ranking-brand-label">Ranking</span>
            </a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--ranking-title-size, 24px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 'var(--ranking-title-margin-bottom, 10px)', letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {quiniela.empresa && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--green-light)',
                border: '1px solid var(--green)', letterSpacing: 0.2,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
                  <path d="M9 21v-5h3v5" />
                  <path d="M8 7h1" />
                  <path d="M12 7h1" />
                  <path d="M8 11h1" />
                  <path d="M12 11h1" />
                  <path d="M3 21h18" />
                </svg>
                {quiniela.empresa}
              </span>
            )}
            {enVivo && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600,
                padding: '3px 9px', borderRadius: 'var(--radius-full)',
                background: 'var(--red-bg-strong)', border: '1px solid var(--red)',
                animation: 'pulse-badge 1.4s ease-in-out infinite',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCA5A5', display: 'inline-block' }} />
                EN VIVO
              </span>
            )}
            {mostrarControlesActualizacion && ultimaAct && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Actualizado {ultimaAct.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {!tienePremio(quiniela) && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--muted)',
                border: '1px dashed var(--border-strong)',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v20" />
                  <path d="m17 5-5 3-5-3" />
                  <path d="m19 12-7 4-7-4" />
                </svg>
                Solo por diversión
              </span>
            )}
            {mostrarControlesActualizacion && <button
              onClick={handleRefresh}
              disabled={actualizando}
              aria-label="Actualizar resultados"
              style={{
                background: actualizando ? 'var(--green-bg)' : 'var(--neutral-bg)',
                border: `1px solid ${actualizando ? 'var(--green)' : 'var(--border-strong)'}`,
                color: actualizando ? 'var(--green)' : 'var(--text)',
                padding: '4px 12px', borderRadius: 'var(--radius-full)', fontSize: 11,
                fontWeight: 700, cursor: actualizando ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'color 0.2s ease, border-color 0.2s ease, background 0.2s ease',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ animation: actualizando ? 'refresh-spin 0.95s linear infinite' : 'none' }}
              >
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 4v6h-6" />
              </svg>
              Actualizar
            </button>}
          </div>
        </div>
      </div>

      <div className="ranking-content" style={{ maxWidth: 480, margin: '0 auto', padding: 'var(--ranking-content-padding, 1.25rem 1rem 3rem)' }}>
        {/* CTA para registrar predicción — solo si la quiniela sigue abierta y este dispositivo aún no envió */}
        {!quinielaCerrada(quiniela) && !yaEnvió && (() => {
          const tr = tiempoRestante(quiniela.cierre)
          // Tono del banner según urgencia
          const border = tr?.nivel === 'critico' ? 'var(--red)' : 'var(--green)'
          return (
            <div className="ranking-entry-card" style={{
              background: 'linear-gradient(135deg, rgba(21,31,50,0.98), rgba(15,23,42,0.96))',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--ranking-entry-card-padding, 16px)', marginBottom: 'var(--ranking-section-gap, 16px)',
              border: `1.5px solid ${border}`, boxShadow: 'var(--shadow-md)',
            }}>
              <CuentaRegresiva cierre={quiniela.cierre} umbralHoras={24 * 365} prefijo="Cierra en" variante="panel" />
              <p style={{ fontSize: 'var(--ranking-entry-text-size, 12px)', color: 'var(--muted)', lineHeight: 1.5, marginTop: 'var(--ranking-entry-text-margin-top, 12px)', marginBottom: 'var(--ranking-entry-text-margin-bottom, 14px)' }}>
                Regístrate antes del cierre para participar.
              </p>
              <a
                href={`/quiniela/${quinielaId}`}
                style={{
                  position: 'relative', overflow: 'hidden',
                  display: 'block', width: '100%', textAlign: 'center',
                  padding: 'var(--ranking-entry-button-padding, 13px 16px)', borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 52%, #20B85A 100%)',
                  color: '#07120A', fontWeight: 800, fontSize: 'var(--ranking-entry-button-size, 14px)', textDecoration: 'none',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(6,78,39,0.14), var(--shadow-green)',
                  letterSpacing: 0.2,
                }}
              >
                <span aria-hidden="true" style={{
                  position: 'absolute', inset: '-20% -35%', pointerEvents: 'none',
                  background: 'linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.20) 46%, rgba(255,255,255,0.48) 50%, rgba(255,255,255,0.18) 56%, transparent 66%)',
                  animation: 'cta-button-shine 9.5s ease-in-out infinite',
                }} />
                <span style={{ position: 'relative' }}>Entrar a la quiniela →</span>
              </a>
            </div>
          )
        })()}
        <RankingTable quiniela={quiniela} predicciones={predicciones} liveScores={liveScores} liveStats={liveStats} liveEventos={liveEventos} />
        <Footer />
      </div>
    </div>
  )
}
