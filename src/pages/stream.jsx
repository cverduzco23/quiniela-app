import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getCountFromServer, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { BrandMark } from '../components/Brand'
import { RankingTable, SvgIcon } from '../components/RankingTable'
import { Footer } from '../components/Footer'
import { miIdentidadEnQuiniela } from '../utils/misQuinielas'
import {
  dispositivoPuedeVerStream,
  esIOS,
  obtenerStreamFuentes,
  resolverStreamFuente,
  streamDisponibleAhora,
} from '../utils/streaming'
import { clasificarEstadoNoFinalESPN } from '../utils/espn'

export default function Stream() {
  const { quinielaId, partidoIdx } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [estado, setEstado] = useState({ tipo: 'cargando' })
  const [liveScores, setLiveScores] = useState({})
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeCargado, setIframeCargado] = useState(false)
  const [streamTardando, setStreamTardando] = useState(false)
  const [reproduccionIniciada, setReproduccionIniciada] = useState(false)
  const playerRef = useRef(null)

  useEffect(() => {
    let activo = true
    const cargar = async () => {
      const idx = Number(partidoIdx)
      if (!quinielaId || !Number.isInteger(idx) || idx < 0) {
        if (activo) setEstado({ tipo: 'no-encontrado' })
        return
      }
      try {
        const nombreLocal = miIdentidadEnQuiniela(quinielaId)
        if (!nombreLocal) {
          if (activo) setEstado({ tipo: 'sin-acceso' })
          return
        }
        const [snapQ, snapP] = await Promise.all([
          getDoc(doc(db, 'quinielas', quinielaId)),
          getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId))),
        ])
        if (!snapQ.exists()) {
          if (activo) setEstado({ tipo: 'no-encontrado' })
          return
        }
        const quiniela = { id: snapQ.id, ...snapQ.data() }
        const predicciones = snapP.docs.map(d => ({ id: d.id, ...d.data() }))
        if (!dispositivoPuedeVerStream(quinielaId, predicciones)) {
          if (activo) setEstado({ tipo: 'sin-acceso' })
          return
        }
        const partido = quiniela.partidos?.[idx]
        if (!partido) {
          if (activo) setEstado({ tipo: 'no-encontrado' })
          return
        }
        if (!streamDisponibleAhora(quiniela, idx)) {
          if (activo) setEstado({ tipo: 'no-disponible', quiniela, partido })
          return
        }
        const fuentes = obtenerStreamFuentes(partido)
        if (!partido || fuentes.length === 0) {
          if (activo) setEstado({ tipo: 'sin-stream', quiniela, partido })
          return
        }
        if (activo) setEstado({ tipo: 'listo', quiniela, partido, fuentes, nombreLocal, predicciones })
      } catch {
        if (activo) setEstado({ tipo: 'error' })
      }
    }
    cargar()
    return () => { activo = false }
  }, [quinielaId, partidoIdx])

  const rankingHref = `/ranking/${quinielaId}`
  const partido = estado.partido

  useEffect(() => {
    if (!partido) return
    document.title = `${partido.local} vs ${partido.visitante} · QuinielApp`
    return () => { document.title = 'QuinielApp' }
  }, [partido])

  useEffect(() => {
    if (estado.tipo !== 'listo') return
    let activo = true
    let interval = null
    const tick = async () => {
      const scores = await obtenerMarcadoresEnVivo(estado.quiniela)
      if (activo) setLiveScores(scores)
    }
    const iniciar = () => {
      if (interval) return
      tick()
      interval = setInterval(tick, 60 * 1000)
    }
    const detener = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const alCambiarVisibilidad = () => document.hidden ? detener() : iniciar()
    iniciar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      activo = false
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [estado.tipo, estado.quiniela])

  const opcionPedida = Math.max(1, Number(searchParams.get('opcion')) || 1)
  const opcionIdx = estado.tipo === 'listo'
    ? Math.min(opcionPedida - 1, estado.fuentes.length - 1)
    : 0
  const fuente = estado.tipo === 'listo' ? estado.fuentes[opcionIdx] : null
  const modoPedido = searchParams.get('modo')
  const modo = fuente?.esStreamX
    ? (modoPedido === 'live1' || modoPedido === 'live2'
        ? modoPedido
        : (esIOS() ? 'live2' : 'live1'))
    : 'directo'
  const streamUrl = resolverStreamFuente(fuente, modo)

  useEffect(() => {
    if (estado.tipo !== 'listo' || !streamUrl || !reproduccionIniciada) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIframeCargado(false)
    setStreamTardando(false)
    const timer = setTimeout(() => setStreamTardando(true), 12 * 1000)
    return () => clearTimeout(timer)
  }, [estado.tipo, streamUrl, iframeKey, reproduccionIniciada])

  const espectadores = useStreamPresence(
    estado.tipo === 'listo' && reproduccionIniciada ? quinielaId : null,
    estado.tipo === 'listo' && reproduccionIniciada ? Number(partidoIdx) : null,
    opcionIdx + 1,
  )

  useScreenWakeLock(estado.tipo === 'listo' && reproduccionIniciada)

  if (estado.tipo === 'cargando') {
    return <StreamMessage texto="Preparando transmisión…" />
  }

  if (estado.tipo !== 'listo') {
    const mensajes = {
      'sin-acceso': 'Esta transmisión está disponible únicamente en el dispositivo desde el que registraste tu predicción.',
      'sin-stream': 'Este partido todavía no tiene una transmisión configurada.',
      'no-disponible': 'La transmisión estará disponible cuando comience el partido y se cerrará al guardar el resultado final.',
      'no-encontrado': 'No encontramos este partido.',
      error: 'No pudimos cargar la transmisión. Inténtalo de nuevo.',
    }
    return <StreamMessage texto={mensajes[estado.tipo]} rankingHref={rankingHref} />
  }

  return (
    <div className="stream-page">
      <header className="stream-header">
        <div className="stream-header-inner">
          <a href={rankingHref} className="app-back-button stream-back-link" aria-label="Volver al ranking" title="Volver al ranking">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </a>
          <a href="/" className="ranking-brand-link" aria-label="QuinielApp Transmisión">
            <BrandMark size={22} />
            <span className="ranking-brand-name">
              Quiniel<span style={{ color: 'var(--green)' }}>App</span>
            </span>
            <span className="ranking-brand-dot" aria-hidden="true" />
            <span className="ranking-brand-label">Transmisión</span>
          </a>
        </div>
      </header>
      <main className="stream-main">
        <section className="stream-video-section">
          <div className="stream-match-heading">
            <div>
              <span className="stream-live-meta">
                <span className="stream-live-label"><i /> Partido en vivo</span>
                <span
                  className="stream-viewers-badge"
                  aria-label={`${espectadores} ${espectadores === 1 ? 'persona viendo' : 'personas viendo'}`}
                  title={`${espectadores} ${espectadores === 1 ? 'persona viendo' : 'personas viendo'}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {espectadores}
                </span>
              </span>
              <h1>{partido.local} <small>vs</small> {partido.visitante}</h1>
            </div>
            <a href={rankingHref} className="stream-ranking-button">
              <SvgIcon name="trophy" size={14} />
              Ranking completo
            </a>
          </div>
          <div className="stream-player-shell" ref={playerRef}>
            {reproduccionIniciada && (
              <iframe
                key={`${streamUrl}-${iframeKey}`}
                src={streamUrl}
                title={`Transmisión de ${partido.local} vs ${partido.visitante}`}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                onLoad={() => {
                  setIframeCargado(true)
                  setStreamTardando(false)
                }}
              />
            )}
            {!reproduccionIniciada && (
              <div className="stream-start-overlay">
                <span className="stream-start-icon" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m8 5 11 7-11 7V5Z" />
                  </svg>
                </span>
                <strong>La señal está lista</strong>
                <p>Iníciala con un toque para mejorar la compatibilidad en tu dispositivo.</p>
                <button type="button" onClick={() => setReproduccionIniciada(true)}>
                  Reproducir transmisión
                </button>
              </div>
            )}
            {reproduccionIniciada && !iframeCargado && (
              <div className="stream-loading-overlay">
                <span />
                <strong>{streamTardando ? 'La señal está tardando…' : 'Cargando transmisión…'}</strong>
                {streamTardando && (
                  <button type="button" onClick={() => setIframeKey(k => k + 1)}>Reintentar</button>
                )}
              </div>
            )}
          </div>
          <div className="stream-player-actions" aria-label="Controles de transmisión">
            {fuente?.esStreamX && (
              <div className="stream-mode-options">
                <span>Reproductor</span>
                {[
                  ['live2', 'Automático'],
                  ['live1', 'Manual'],
                ].map(([valor, etiqueta]) => (
                  <button
                    type="button"
                    key={valor}
                    className={modo === valor ? 'is-active' : ''}
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('modo', valor)
                      setSearchParams(next, { replace: true })
                    }}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            )}
            <div className="stream-utility-actions">
              <button
                type="button"
                disabled={!reproduccionIniciada}
                onClick={() => setIframeKey(k => k + 1)}
              >
                <SvgIcon name="refresh" size={13} />
                Recargar
              </button>
              <button
                type="button"
                onClick={() => {
                  const elemento = playerRef.current
                  const solicitar = elemento?.requestFullscreen ?? elemento?.webkitRequestFullscreen
                  if (solicitar) {
                    const promesa = solicitar.call(elemento)
                    promesa?.catch?.(() => {})
                  }
                }}
              >
                <SvgIcon name="maximize" size={13} />
                Pantalla completa
              </button>
            </div>
          </div>
          {estado.fuentes.length > 1 && (
            <div className="stream-source-options" aria-label="Opciones de transmisión">
              <span>¿Problemas con la señal?</span>
              {estado.fuentes.map((item, idx) => (
                <button
                  type="button"
                  key={idx}
                  className={idx === opcionIdx ? 'is-active' : ''}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.set('opcion', String(idx + 1))
                    if (!item.esStreamX) next.delete('modo')
                    setSearchParams(next, { replace: true })
                  }}
                >
                  {item.nombre || `Opción ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="stream-ranking-section">
          <div className="stream-ranking-heading">
            <div>
              <span className="stream-section-kicker">Actualización automática</span>
              <h2>Ranking en vivo</h2>
            </div>
            <a href={rankingHref}>Ver ranking completo →</a>
          </div>
          <div className="stream-ranking-embed">
            <RankingTable
              quiniela={estado.quiniela}
              predicciones={estado.predicciones}
              liveScores={liveScores}
              modoStream
            />
          </div>
        </section>
        <div className="app-footer-slot stream-footer">
          <Footer maxWidth="720px" />
        </div>
      </main>
    </div>
  )
}

function StreamMessage({ texto, rankingHref = '/' }) {
  return (
    <div className="stream-message-page">
      <BrandMark size={34} />
      <h1>{texto}</h1>
      <a href={rankingHref}>← Volver al ranking</a>
    </div>
  )
}

function viewerIdDispositivo() {
  const key = 'quinielapp-stream-viewer-id'
  try {
    const existente = localStorage.getItem(key)
    if (existente) return existente
    const nuevo = globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, nuevo)
    return nuevo
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function useStreamPresence(quinielaId, partidoIdx, opcion) {
  const [conteo, setConteo] = useState(0)

  useEffect(() => {
    if (!quinielaId || !Number.isInteger(partidoIdx) || partidoIdx < 0) return
    let activo = true
    let interval = null
    const viewerId = viewerIdDispositivo()
    const activosRef = collection(
      db, 'quinielas', quinielaId, 'streamViewers', String(partidoIdx), 'streamActivos',
    )
    const miRef = doc(activosRef, viewerId)

    const tick = async () => {
      try {
        const ahora = Date.now()
        await setDoc(miRef, {
          ultimaActividad: serverTimestamp(),
          expira: Timestamp.fromMillis(ahora + 5 * 60 * 1000),
          opcion,
        })
        const desde = Timestamp.fromMillis(ahora - 250 * 1000)
        const snap = await getCountFromServer(query(activosRef, where('ultimaActividad', '>=', desde)))
        if (activo) setConteo(snap.data().count)
      } catch {
        // El video sigue funcionando aunque el contador no esté disponible.
      }
    }
    const iniciar = () => {
      if (interval || document.hidden) return
      tick()
      interval = setInterval(tick, 2 * 60 * 1000)
    }
    const detener = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const alCambiarVisibilidad = () => document.hidden ? detener() : iniciar()

    iniciar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      activo = false
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [quinielaId, partidoIdx, opcion])

  return conteo
}

function useScreenWakeLock(activo) {
  useEffect(() => {
    if (!activo || !('wakeLock' in navigator)) return
    let lock = null
    let montado = true
    const solicitar = async () => {
      if (document.hidden || lock) return
      try {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => { lock = null })
      } catch {
        // Navegadores sin permiso o soporte continúan sin bloquear la pantalla.
      }
    }
    const alCambiarVisibilidad = () => {
      if (montado && !document.hidden) solicitar()
    }
    solicitar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      montado = false
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      lock?.release().catch(() => {})
      lock = null
    }
  }, [activo])
}

async function obtenerMarcadoresEnVivo(quiniela) {
  const partidos = quiniela?.partidos ?? []
  const porLiga = {}
  partidos.forEach(p => {
    if (!p.espnId || !p.ligaId) return
    ;(porLiga[p.ligaId] ||= []).push(p)
  })
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
  const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000)
  const rango = `${fmt(ayer)}-${fmt(manana)}`
  const scores = {}

  await Promise.all(Object.entries(porLiga).map(async ([ligaId, lista]) => {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${rango}`)
      const data = await res.json()
      lista.forEach(partido => {
        const evento = (data.events ?? []).find(e => String(e.id) === String(partido.espnId))
        if (!evento) return
        const competidores = evento.competitions?.[0]?.competitors ?? []
        const local = competidores.find(c => c.homeAway === 'home')
        const visitante = competidores.find(c => c.homeAway === 'away')
        const estadoNoFinal = clasificarEstadoNoFinalESPN(evento)
        scores[partido.espnId] = {
          state: evento.status?.type?.state,
          clock: evento.status?.displayClock ?? '',
          local: local?.score ?? '',
          visitante: visitante?.score ?? '',
          noFinal: estadoNoFinal !== null,
          suspendido: estadoNoFinal === 'suspendido',
          cancelado: estadoNoFinal === 'cancelado',
        }
      })
    } catch {
      // El siguiente polling vuelve a intentar sin interrumpir el video.
    }
  }))
  return scores
}
