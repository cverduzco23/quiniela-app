import { useEffect, useRef, useState } from 'react'
import { useStreamPresence } from '../hooks/useStreamPresence'
import {
  esIOS,
  esDispositivoMovil,
  obtenerStreamFuentes,
  resolverStreamFuente,
} from '../utils/streaming'

// Reproductor de la transmisión embebido en el ranking de escritorio.
// Comparte con /stream las utilidades de fuentes y el contador de espectadores,
// pero tiene su propio marco (16/9 con la barra de controles encima del video)
// porque vive dentro de la columna del partido, no en una pantalla completa.
// Quien lo monta le pasa `key={partidoIdx}`: al cambiar de partido en el
// carrusel se remonta en limpio, sin arrastrar la señal del anterior.
export function RankingLivePlayer({ quinielaId, partidoIdx, partido }) {
  const fuentes = obtenerStreamFuentes(partido)
  const [opcionIdx, setOpcionIdx] = useState(0)
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeCargado, setIframeCargado] = useState(false)
  const [streamTardando, setStreamTardando] = useState(false)
  const [reproduciendo, setReproduciendo] = useState(false)
  const playerRef = useRef(null)
  const dispositivoIOS = esIOS()
  const dispositivoMovil = esDispositivoMovil()

  const fuente = fuentes[Math.min(opcionIdx, fuentes.length - 1)] ?? null
  // StreamX sirve dos reproductores; en iOS solo el automático arranca solo.
  const modo = fuente?.esStreamX ? (dispositivoIOS ? 'live2' : 'live1') : 'directo'
  const streamUrl = resolverStreamFuente(fuente, modo)

  useEffect(() => {
    if (!streamUrl || !reproduciendo) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIframeCargado(false)
    setStreamTardando(false)
    const timer = setTimeout(() => setStreamTardando(true), 12 * 1000)
    return () => clearTimeout(timer)
  }, [streamUrl, iframeKey, reproduciendo])

  const espectadores = useStreamPresence(
    reproduciendo ? quinielaId : null,
    reproduciendo ? partidoIdx : null,
    opcionIdx + 1,
  )

  if (!streamUrl) return null

  const pantallaCompleta = () => {
    const elemento = playerRef.current
    const solicitar = elemento?.requestFullscreen ?? elemento?.webkitRequestFullscreen
    if (!solicitar) return
    const promesa = solicitar.call(elemento)
    promesa?.catch?.(() => {})
  }

  return (
    <div className="ranking-live-player" ref={playerRef}>
      {reproduciendo && (
        <iframe
          key={`${streamUrl}-${iframeKey}`}
          src={streamUrl}
          title={`Transmisión de ${partido.local} vs ${partido.visitante}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; storage-access"
          allowFullScreen
          referrerPolicy={dispositivoMovil ? 'strict-origin-when-cross-origin' : 'no-referrer'}
          onLoad={() => { setIframeCargado(true); setStreamTardando(false) }}
        />
      )}

      {!reproduciendo && (
        <button
          type="button"
          className="ranking-live-player-overlay"
          onClick={() => setReproduciendo(true)}
        >
          <span className="ranking-live-play" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="m8 5 11 7-11 7V5Z" />
            </svg>
          </span>
          <strong>Ver la transmisión aquí</strong>
          <span className="rk-hint">Se reproduce dentro del ranking, sin abrir otra pestaña</span>
        </button>
      )}

      {reproduciendo && !iframeCargado && (
        <div className="ranking-live-player-loading">
          <strong>{streamTardando ? 'La señal está tardando…' : 'Cargando transmisión…'}</strong>
          {streamTardando && (
            <button type="button" onClick={() => setIframeKey(k => k + 1)}>Reintentar</button>
          )}
        </div>
      )}

      <div className="ranking-live-player-bar">
        <span className="rk-src">
          {fuentes.length > 1 && fuentes.map((item, idx) => (
            <button
              type="button"
              key={idx}
              className={`ranking-live-source${idx === opcionIdx ? ' is-active' : ''}`}
              onClick={() => { setOpcionIdx(idx); setIframeKey(k => k + 1) }}
            >
              {item.nombre || `Señal ${idx + 1}`}
            </button>
          ))}
        </span>
        <span className="rk-live-player-tools">
          {reproduciendo && (
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
          )}
          {reproduciendo && (
            <button
              type="button"
              className="ranking-live-player-icon"
              onClick={() => setIframeKey(k => k + 1)}
              aria-label="Recargar transmisión"
              title="Recargar transmisión"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0 2 5.5" />
                <path d="M20 4v7h-7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="ranking-live-player-icon"
            onClick={pantallaCompleta}
            aria-label="Pantalla completa"
            title="Pantalla completa"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H3v5" /><path d="m3 3 6 6" />
              <path d="M16 3h5v5" /><path d="m21 3-6 6" />
              <path d="M8 21H3v-5" /><path d="m3 21 6-6" />
              <path d="M16 21h5v-5" /><path d="m21 21-6-6" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  )
}
