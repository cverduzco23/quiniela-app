import { formatearMXN } from './premios'

const COLORS = {
  bg: '#0B1220',
  card: '#151F32',
  cardLight: '#1E293B',
  border: 'rgba(255,255,255,0.10)',
  text: '#F9FAFB',
  textStrong: '#FFFFFF',
  muted: '#9CA3AF',
  green: '#22C55E',
  greenSoft: 'rgba(34,197,94,0.14)',
  yellow: '#FACC15',
  yellowSoft: 'rgba(250,204,21,0.14)',
  red: '#EF4444',
  redSoft: 'rgba(239,68,68,0.14)',
}

const W = 800
const PAD = 40
const ROW_H = 68
const SCALE = 2

const MAX_FILAS_DETALLE = 15
const MAX_FILAS_TOP = 10

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const trial = text.slice(0, mid) + '…'
    if (ctx.measureText(trial).width <= maxWidth) lo = mid + 1
    else hi = mid
  }
  return text.slice(0, Math.max(0, lo - 1)) + '…'
}

function formatearFechaCorta() {
  return new Date().toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })
}

function calcularLayout(jugadores) {
  const filas = jugadores.length <= MAX_FILAS_DETALLE
    ? jugadores
    : jugadores.slice(0, MAX_FILAS_TOP)
  const mostradosExtra = jugadores.length - filas.length
  return { filas, mostradosExtra }
}

function calcularAltura({ filas, mostradosExtra, banner }) {
  let h = PAD + 110 // título + estado
  if (banner) h += 96
  h += 50 // header tabla
  h += filas.length * ROW_H + 12
  if (mostradosExtra > 0) h += 36
  h += 50 + PAD // footer
  return h
}

function dibujarBadge(ctx, x, y, texto, bgColor, textColor) {
  ctx.font = '700 14px Inter'
  const w = Math.max(ctx.measureText(texto).width + 22, 0)
  ctx.fillStyle = bgColor
  roundRect(ctx, x, y, w, 26, 13)
  ctx.fill()
  ctx.fillStyle = textColor
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, x + 11, y + 14)
  return w
}

export async function generarImagenRanking({
  quiniela,
  jugadores,
  premioPorNombre = {},
  bote = 0,
  finalizada = false,
  enVivo = false,
  terminados = 0,
  totalPartidos = 0,
  conPremio = false,
}) {
  // Asegurar que las fonts estén cargadas para no obtener fallback
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* noop */ }
  }

  const { filas, mostradosExtra } = calcularLayout(jugadores)
  const boteDevuelto = !!quiniela?.boteDevuelto
  const ganadoresNombres = conPremio && !boteDevuelto
    ? jugadores.filter(j => premioPorNombre[j.nombre] !== undefined).map(j => j.nombre)
    : []
  const banner = conPremio && (finalizada || ganadoresNombres.length > 0 || bote > 0 || boteDevuelto)

  const H = calcularAltura({ filas, mostradosExtra, banner })

  const canvas = document.createElement('canvas')
  canvas.width  = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // ── Fondo
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // Gradientes radiales suaves (sin línea de corte)
  const gradVerde = ctx.createRadialGradient(0, 0, 0, 0, 0, 520)
  gradVerde.addColorStop(0, 'rgba(34,197,94,0.18)')
  gradVerde.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = gradVerde
  ctx.fillRect(0, 0, W, H)

  const gradAmarillo = ctx.createRadialGradient(W, 0, 0, W, 0, 420)
  gradAmarillo.addColorStop(0, 'rgba(250,204,21,0.12)')
  gradAmarillo.addColorStop(1, 'rgba(250,204,21,0)')
  ctx.fillStyle = gradAmarillo
  ctx.fillRect(0, 0, W, H)

  let y = PAD

  // ── Header: nombre + estado
  ctx.fillStyle = COLORS.green
  ctx.font = '700 13px Inter'
  ctx.textBaseline = 'top'
  ctx.fillText('⚽ QUINIELAPP', PAD, y)
  y += 22

  ctx.fillStyle = COLORS.textStrong
  ctx.font = '700 34px Rajdhani'
  const nombreLine = truncate(ctx, quiniela.nombre || 'Quiniela', W - PAD * 2)
  ctx.fillText(nombreLine, PAD, y)
  y += 44

  // Badges de estado
  const badgeTexto = enVivo ? '🔴 EN VIVO' : finalizada ? '🏆 FINALIZADA' : 'EN CURSO'
  const badgeBg    = enVivo ? COLORS.redSoft : finalizada ? COLORS.yellowSoft : COLORS.greenSoft
  const badgeFg    = enVivo ? COLORS.red     : finalizada ? COLORS.yellow     : COLORS.green
  const badgeW     = dibujarBadge(ctx, PAD, y, badgeTexto, badgeBg, badgeFg)

  ctx.fillStyle = COLORS.muted
  ctx.font = '600 13px Inter'
  ctx.textBaseline = 'middle'
  const meta = `${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'} · ${terminados}/${totalPartidos} partidos`
  ctx.fillText(meta, PAD + badgeW + 12, y + 13)
  y += 38

  // ── Banner de premio (si aplica)
  if (banner) {
    const banY = y
    const colorAcento = boteDevuelto ? COLORS.muted : COLORS.green
    const fillAcento  = boteDevuelto ? 'rgba(255,255,255,0.04)' : COLORS.greenSoft
    ctx.fillStyle = fillAcento
    roundRect(ctx, PAD, banY, W - PAD * 2, 80, 14)
    ctx.fill()
    ctx.strokeStyle = colorAcento
    ctx.lineWidth = 1
    roundRect(ctx, PAD, banY, W - PAD * 2, 80, 14)
    ctx.stroke()

    ctx.fillStyle = COLORS.muted
    ctx.font = '700 11px Inter'
    ctx.textBaseline = 'top'
    ctx.fillText('BOTE', PAD + 16, banY + 14)

    ctx.fillStyle = colorAcento
    ctx.font = '800 28px Rajdhani'
    ctx.fillText(formatearMXN(bote), PAD + 16, banY + 30)

    const tituloDer = boteDevuelto ? '💸 BOTE DEVUELTO' : finalizada ? '🏆 GANADORES' : '📊 SI TERMINARA AHORA'
    ctx.fillStyle = COLORS.muted
    ctx.font = '700 11px Inter'
    ctx.textAlign = 'right'
    ctx.fillText(tituloDer, W - PAD - 16, banY + 14)

    if (boteDevuelto) {
      ctx.fillStyle = COLORS.textStrong
      ctx.font = '600 13px Inter'
      ctx.fillText('Devuelto a participantes', W - PAD - 16, banY + 38)
    } else {
      const ganadores = ganadoresNombres.slice(0, 2).join(', ') + (ganadoresNombres.length > 2 ? `, +${ganadoresNombres.length - 2}` : '')
      ctx.fillStyle = COLORS.textStrong
      ctx.font = '700 16px Inter'
      const ganTexto = ganadores ? truncate(ctx, ganadores, W - PAD * 2 - 220) : '—'
      ctx.fillText(ganTexto, W - PAD - 16, banY + 36)
    }

    ctx.textAlign = 'left'
    y += 96
  }

  // ── Header de tabla
  ctx.fillStyle = COLORS.cardLight
  roundRect(ctx, PAD, y, W - PAD * 2, 40, 10)
  ctx.fill()

  ctx.fillStyle = COLORS.muted
  ctx.font = '700 11px Inter'
  ctx.textBaseline = 'middle'

  const colNum = PAD + 18
  const colNom = PAD + 70
  const colAci = W - PAD - 260
  const colEx  = W - PAD - 180
  const colPts = W - PAD - 100
  const colPre = W - PAD - 18

  ctx.fillText('#', colNum, y + 20)
  ctx.fillText('JUGADOR', colNom, y + 20)
  ctx.textAlign = 'center'
  ctx.fillText('RES.', colAci, y + 20)
  ctx.fillText('EX.', colEx, y + 20)
  ctx.fillText('PTS', colPts, y + 20)
  if (conPremio) {
    ctx.textAlign = 'right'
    ctx.fillText('PREMIO', colPre, y + 20)
  }
  ctx.textAlign = 'left'
  y += 50

  // ── Filas — ranking olímpico (empates comparten posición)
  const medals = ['🥇', '🥈', '🥉']
  const posiciones = []
  filas.forEach((j, i) => {
    if (i === 0) { posiciones.push(1); return }
    const prev = filas[i - 1]
    posiciones.push(prev.puntos === j.puntos ? posiciones[i - 1] : i + 1)
  })

  filas.forEach((j, i) => {
    const pos = posiciones[i]
    const esLider = pos === 1 && (terminados > 0 || enVivo)
    const medalla = pos <= 3 ? medals[pos - 1] : null
    if (esLider) {
      const ling = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
      ling.addColorStop(0, 'rgba(34,197,94,0.16)')
      ling.addColorStop(0.6, 'rgba(34,197,94,0.03)')
      ling.addColorStop(1, 'rgba(34,197,94,0)')
      ctx.fillStyle = ling
      roundRect(ctx, PAD, y, W - PAD * 2, ROW_H - 8, 10)
      ctx.fill()
    }

    // Borde inferior
    ctx.strokeStyle = COLORS.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD + 12, y + ROW_H - 8)
    ctx.lineTo(W - PAD - 12, y + ROW_H - 8)
    ctx.stroke()

    // Posición / medalla
    ctx.textBaseline = 'middle'
    if (medalla) {
      ctx.fillStyle = COLORS.textStrong  // resetear tras el gradiente para que el emoji renderice en color
      ctx.font = '700 28px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(medalla, colNum + 4, y + 30)
    } else {
      ctx.fillStyle = COLORS.muted
      ctx.font = '700 17px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(`${pos}`, colNum + 4, y + 30)
    }

    // Nombre
    ctx.textAlign = 'left'
    ctx.fillStyle = COLORS.textStrong
    ctx.font = esLider ? '700 17px Inter' : '600 16px Inter'
    const maxNombreW = (colAci - 40) - colNom
    ctx.fillText(truncate(ctx, j.nombre, maxNombreW), colNom, y + 30)

    // Aciertos (resultados correctos)
    ctx.fillStyle = COLORS.muted
    ctx.font = '600 15px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(String(j.aciertos ?? 0), colAci, y + 30)

    // Exactos
    ctx.fillText(String(j.exactos ?? 0), colEx, y + 30)

    // Puntos
    ctx.fillStyle = esLider ? COLORS.yellow : COLORS.green
    ctx.font = '800 22px Rajdhani'
    ctx.fillText(String(j.puntos ?? 0), colPts, y + 30)

    // Premio
    if (conPremio) {
      ctx.textAlign = 'right'
      if (premioPorNombre[j.nombre] !== undefined) {
        ctx.fillStyle = COLORS.green
        ctx.font = '800 15px Inter'
        ctx.fillText(formatearMXN(premioPorNombre[j.nombre]), colPre, y + 30)
      } else {
        ctx.fillStyle = COLORS.muted
        ctx.font = '600 14px Inter'
        ctx.fillText('—', colPre, y + 30)
      }
    }

    ctx.textAlign = 'left'
    y += ROW_H
  })

  // ── Texto "+N más" si se truncó
  if (mostradosExtra > 0) {
    ctx.fillStyle = COLORS.muted
    ctx.font = '600 13px Inter'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`+ ${mostradosExtra} jugador${mostradosExtra !== 1 ? 'es' : ''} más en quinielapp.fun`, W / 2, y + 4)
    y += 28
  }

  // ── Footer
  y = H - PAD - 30
  ctx.fillStyle = COLORS.green
  ctx.font = '700 14px Inter'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('quinielapp.fun', PAD, y + 14)

  ctx.fillStyle = COLORS.muted
  ctx.font = '500 12px Inter'
  ctx.textAlign = 'right'
  ctx.fillText(formatearFechaCorta(), W - PAD, y + 14)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob falló')), 'image/png')
  })
}

export async function compartirRanking(datos) {
  const blob = await generarImagenRanking(datos)
  const file = new File([blob], 'quiniela-ranking.png', { type: 'image/png' })

  const esMovil = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // Móvil: Share API con solo el archivo (sin text/title para evitar que pegue texto extra)
  if (esMovil && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { compartido: true }
    } catch (err) {
      if (err?.name === 'AbortError') return { compartido: false, cancelado: true }
      // si falla, caemos al siguiente método
    }
  }

  // Desktop: copiar imagen al portapapeles (limpio, sin texto ni links extras)
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return { copiado: true }
    } catch { /* fallback a descarga */ }
  }

  // Fallback final: descargar
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quiniela-${(datos.quiniela.nombre || 'ranking').replace(/[^\w-]+/g, '-').toLowerCase()}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { compartido: false, descargado: true }
}
