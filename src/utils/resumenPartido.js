// Resumen en video de un partido terminado.
//
// La misma API de ESPN que ya nos da marcadores y estadísticas expone, en el
// endpoint `summary`, los clips que publica de cada partido. Hay un detalle
// que no es obvio: los clips solo vienen si se pide en español; el mismo
// partido en inglés devuelve la lista vacía.
//
// Solo se consulta para partidos que ya terminaron y a los que ESPN dejó de
// mandarles estadísticas, y únicamente cuando el usuario tiene ese partido
// abierto en la columna de escritorio: es una llamada por partido visto, no
// parte del polling.

const CACHE = new Map()

// Prefiere la copia liviana. ESPN suele publicar `href` a 360p/1464k y `HD` a
// 720p/2896k, pero a veces todas las claves apuntan al master de emisión (más
// de 100 MB por un clip de minuto y medio). Cuando hay una copia con el
// bitrate en el nombre, esa gana; el master queda de último recurso.
function elegirRendicion(source) {
  if (!source) return ''
  const candidatas = ['href', 'HD', 'full', 'flash', 'mezzanine']
    .map(k => (typeof source[k] === 'string' ? source[k] : source[k]?.href))
    .filter(u => typeof u === 'string' && u.startsWith('https://') && u.endsWith('.mp4'))
  if (candidatas.length === 0) return ''
  const conBitrate = candidatas
    .map(u => ({ url: u, kbps: Number(u.match(/_(\d+)k\.mp4$/)?.[1]) || 0 }))
    .filter(c => c.kbps > 0)
    .sort((a, b) => a.kbps - b.kbps)
  return conBitrate[0]?.url ?? candidatas[0]
}

// De todos los clips del partido, el que más se parece a un resumen: primero
// los marcados como highlight, y entre esos el más largo (los demás suelen ser
// jugadas sueltas o análisis de estudio).
function elegirClip(videos) {
  const puntaje = v => {
    const texto = `${v?.headline ?? ''} ${JSON.stringify(v?.links?.source ?? '')}`.toLowerCase()
    return /highlight|_hl_|resumen/.test(texto) ? 1 : 0
  }
  return [...videos]
    .filter(v => elegirRendicion(v?.links?.source))
    .sort((a, b) => puntaje(b) - puntaje(a) || (b?.duration ?? 0) - (a?.duration ?? 0))[0] ?? null
}

function urlHls(source) {
  const h = typeof source?.HLS === 'string' ? source.HLS : source?.HLS?.href
  return typeof h === 'string' && h.startsWith('https://') ? h : ''
}

export function normalizarResumen(datos) {
  const videos = Array.isArray(datos?.videos) ? datos.videos : []
  const clip = elegirClip(videos)
  if (!clip) return null
  const mp4 = elegirRendicion(clip.links?.source)
  if (!mp4) return null
  return {
    mp4,
    // HLS va primero en el <video>: Safari lo reproduce nativo y baja solo la
    // calidad que necesita. Chrome no sabe leerlo y salta al MP4 solo.
    hls: urlHls(clip.links?.source),
    poster: typeof clip.thumbnail === 'string' ? clip.thumbnail : '',
    titulo: String(clip.headline ?? '').trim(),
    duracion: Number(clip.duration) || 0,
    web: clip.links?.web?.href ?? '',
  }
}

export async function obtenerResumenPartido(ligaId, espnId) {
  if (!ligaId || !espnId) return null
  const clave = `${ligaId}:${espnId}`
  if (CACHE.has(clave)) return CACHE.get(clave)
  const promesa = (async () => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(ligaId)}/summary?event=${encodeURIComponent(espnId)}&lang=es&region=mx`
    const res = await fetch(url)
    if (!res.ok) return null
    return normalizarResumen(await res.json())
  })().catch(() => null)
  CACHE.set(clave, promesa)
  return promesa
}

// Los clips de ESPN caducan cerca de un mes después del partido. Si el video
// truena dejamos de ofrecerlo para que la columna caiga al enlace de siempre.
export function olvidarResumen(ligaId, espnId) {
  CACHE.delete(`${ligaId}:${espnId}`)
}

export function formatearDuracion(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0))
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
