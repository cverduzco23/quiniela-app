import { useState } from 'react'
import { formatearDuracion, olvidarResumen } from '../utils/resumenPartido'

// Resumen en video de un partido terminado, en el mismo marco 16/9 que ocupa
// la transmisión cuando el partido está en curso.
//
// `preload="none"` es importante: algunos clips de ESPN pesan más de 100 MB
// porque publican el master de emisión en vez de una copia web. Con la portada
// puesta y la carga diferida no se baja un solo byte hasta que alguien le da
// play, y el navegador solo pide el trozo que va viendo.
export function ResumenPartido({ partido, resumen }) {
  const [fallo, setFallo] = useState(false)
  if (!resumen?.mp4 || fallo) return null

  const duracion = formatearDuracion(resumen.duracion)

  return (
    <figure className="rk-live-recap">
      <div className="ranking-live-player">
        <video
          key={resumen.mp4}
          poster={resumen.poster || undefined}
          controls
          playsInline
          preload="none"
          title={resumen.titulo || `Resumen de ${partido.local} vs ${partido.visitante}`}
          onError={() => {
            // Los clips caducan cerca de un mes después del partido: si este ya
            // no existe, lo olvidamos y la columna vuelve al enlace a ESPN.
            olvidarResumen(partido.ligaId, partido.espnId)
            setFallo(true)
          }}
        >
          {resumen.hls && <source src={resumen.hls} type="application/vnd.apple.mpegurl" />}
          <source src={resumen.mp4} type="video/mp4" />
        </video>
      </div>
      <figcaption className="rk-live-recap-pie">
        <span className="rk-live-recap-kicker">
          Resumen{duracion ? ` · ${duracion}` : ''}
          <span className="rk-live-recap-fuente">ESPN</span>
        </span>
        {resumen.titulo && <span className="rk-live-recap-titulo">{resumen.titulo}</span>}
      </figcaption>
    </figure>
  )
}

// Respaldo cuando ESPN no publicó clip: el video que la Cloud Function
// encontró en un canal oficial de YouTube. Aquí sí es un embed normal, con el
// reproductor de YouTube, así que las vistas y los anuncios le llegan al canal
// como debe ser. `-nocookie` evita el rastreo hasta que le den play.
export function ResumenYoutube({ partido, video }) {
  if (!video?.videoId) return null
  return (
    <figure className="rk-live-recap">
      <div className="ranking-live-player">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?rel=0`}
          title={video.titulo || `Resumen de ${partido.local} vs ${partido.visitante}`}
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <figcaption className="rk-live-recap-pie">
        <span className="rk-live-recap-kicker">
          Resumen
          <span className="rk-live-recap-fuente">{video.canal || 'YouTube'}</span>
        </span>
        {video.titulo && <span className="rk-live-recap-titulo">{video.titulo}</span>}
      </figcaption>
    </figure>
  )
}
