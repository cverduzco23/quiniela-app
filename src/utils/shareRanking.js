import { cierreToDate, quinielaCerrada } from './cierre'
import { formatearMXN } from './premios'
import { normalizarNombre } from './nombres'
import { goalsToResultado } from './scoring'

const W = 1080
const H = 1350
const SCALE = 3
const PAD = 64

const COLORS = {
  bg0: '#08111F',
  bg1: '#0B1220',
  bg2: '#0E1526',
  card: '#131C2E',
  card2: '#151F32',
  border: 'rgba(255,255,255,0.08)',
  border2: 'rgba(255,255,255,0.16)',
  text: '#F9FAFB',
  strong: '#FFFFFF',
  muted: '#9CA3AF',
  dim: '#6B7280',
  green: '#22C55E',
  greenLight: '#86EFAC',
  yellow: '#FACC15',
  yellowLight: '#FDE68A',
  red: '#EF4444',
  redLight: '#FCA5A5',
  purple: '#A855F7',
  purpleLight: '#C084FC',
}

function setupCanvas(height = H) {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

async function waitFonts() {
  if (!document.fonts) return
  try {
    // `document.fonts.ready` puede resolver antes de que una fuente usada solo
    // por canvas haya sido solicitada. La cargamos explícitamente para que la
    // primera imagen también salga con la tipografía correcta.
    await Promise.all([
      document.fonts.load('900 32px Inter'),
      document.fonts.load('700 120px Rajdhani'),
    ])
    await document.fonts.ready
  } catch { /* el canvas conserva sus fallbacks si la red no está disponible */ }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function fillRound(ctx, x, y, w, h, r, fill, stroke = null) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function truncate(ctx, text, maxWidth) {
  const s = String(text || '')
  if (ctx.measureText(s).width <= maxWidth) return s
  let lo = 0, hi = s.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const trial = `${s.slice(0, mid)}...`
    if (ctx.measureText(trial).width <= maxWidth) lo = mid + 1
    else hi = mid
  }
  return `${s.slice(0, Math.max(0, lo - 1))}...`
}

function textWidthWithTracking(ctx, text, tracking) {
  const s = String(text || '')
  if (s.length <= 1) return ctx.measureText(s).width
  return ctx.measureText(s).width + tracking * (s.length - 1)
}

function truncateTracked(ctx, text, maxWidth, tracking) {
  const s = String(text || '')
  if (textWidthWithTracking(ctx, s, tracking) <= maxWidth) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const trial = `${s.slice(0, mid)}...`
    if (textWidthWithTracking(ctx, trial, tracking) <= maxWidth) lo = mid + 1
    else hi = mid
  }
  return `${s.slice(0, Math.max(0, lo - 1))}...`
}

function drawCenteredTrackedText(ctx, text, cx, y, tracking) {
  ctx.save()
  ctx.textAlign = 'left'
  const s = String(text || '')
  let x = cx - textWidthWithTracking(ctx, s, tracking) / 2
  for (const ch of s) {
    ctx.fillText(ch, x, y)
    x += ctx.measureText(ch).width + tracking
  }
  ctx.restore()
}

function drawCenteredRichText(ctx, parts, cx, y) {
  ctx.save()
  ctx.textAlign = 'left'
  const total = parts.reduce((sum, part) => {
    ctx.font = part.font
    return sum + ctx.measureText(part.text).width
  }, 0)
  let x = cx - total / 2
  parts.forEach(part => {
    ctx.font = part.font
    ctx.fillStyle = part.color
    ctx.fillText(part.text, x, y)
    x += ctx.measureText(part.text).width
  })
  ctx.restore()
}

function drawBackground(ctx, theme = 'green', height = H) {
  const g = ctx.createLinearGradient(0, 0, W, height)
  g.addColorStop(0, COLORS.bg0)
  g.addColorStop(0.46, COLORS.bg1)
  g.addColorStop(1, COLORS.bg2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, height)

  const glowA = theme === 'purple'
    ? 'rgba(168,85,247,0.25)'
    : theme === 'gold'
      ? 'rgba(250,204,21,0.24)'
      : 'rgba(34,197,94,0.20)'
  const glowB = theme === 'purple'
    ? 'rgba(168,85,247,0.13)'
    : theme === 'gold'
      ? 'rgba(34,197,94,0.10)'
      : 'rgba(250,204,21,0.12)'
  const glowAX = theme === 'gold' ? W / 2 : 0
  let rg = ctx.createRadialGradient(glowAX, 0, 0, glowAX, 0, theme === 'gold' ? 660 : 560)
  rg.addColorStop(0, glowA)
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, height)
  const glowBX = theme === 'gold' ? 0 : W
  rg = ctx.createRadialGradient(glowBX, 0, 0, glowBX, 0, 470)
  rg.addColorStop(0, glowB)
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, height)
}

function drawBrandMark(ctx, x, y, size) {
  fillRound(ctx, x, y, size, size, size * 0.22, '#0B1220', 'rgba(255,255,255,0.07)')
  const cx = x + size / 2
  const cy = y + size / 2
  ctx.lineCap = 'round'
  ctx.lineWidth = size * 0.095
  ctx.strokeStyle = COLORS.green
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.29, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = size * 0.075
  ctx.strokeStyle = COLORS.yellow
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.145, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = COLORS.green
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.052, 0, Math.PI * 2)
  ctx.fill()
}

function drawBrand(ctx, x, y, size = 42) {
  ctx.save()
  drawBrandMark(ctx, x, y, size)
  ctx.font = `900 ${Math.round(size * 0.54)}px Inter`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.strong
  const tx = x + size + 14
  const ty = y + size / 2 + 1
  ctx.fillText('Quiniel', tx, ty)
  ctx.fillStyle = COLORS.green
  ctx.fillText('App', tx + ctx.measureText('Quiniel').width, ty)
  ctx.restore()
}

function drawLiveBadge(ctx, x, y, text = 'EN VIVO', theme = 'red') {
  const accent = theme === 'purple' ? COLORS.purpleLight : COLORS.redLight
  const bg = theme === 'purple' ? 'rgba(168,85,247,0.18)' : 'rgba(239,68,68,0.18)'
  ctx.font = '900 16px Inter'
  const w = ctx.measureText(text).width + 58
  fillRound(ctx, x - w, y, w, 40, 999, bg)
  ctx.fillStyle = theme === 'purple' ? COLORS.purple : COLORS.red
  ctx.beginPath()
  ctx.arc(x - w + 22, y + 20, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = accent
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x - w + 38, y + 21)
  return w
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const tokens = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]]
  return tokens.map(t => t[0]).join('').slice(0, 2).toUpperCase()
}

function shortName(name, max = 2) {
  return String(name || '').trim().split(/\s+/).slice(0, max).join(' ')
}

function drawAvatar(ctx, x, y, size, name, color, bg = 'rgba(255,255,255,0.05)') {
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `900 ${Math.round(size * 0.34)}px Inter`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials(name), x, y + 1)
  ctx.textAlign = 'left'
}

// Carga un escudo/bandera para dibujarlo en el canvas. Los logos de ESPN
// sirven CORS abierto (Access-Control-Allow-Origin: *), así que se pueden
// dibujar sin "manchar" el canvas y seguir generando el PNG con toBlob.
// Si la imagen falla o tarda, resolvemos null y el llamador cae a iniciales.
function loadImageSafe(url, timeoutMs = 3500) {
  return new Promise(resolve => {
    if (!url) { resolve(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let done = false
    const finish = (result) => { if (done) return; done = true; resolve(result) }
    const timer = setTimeout(() => finish(null), timeoutMs)
    img.onload = () => { clearTimeout(timer); finish(img) }
    img.onerror = () => { clearTimeout(timer); finish(null) }
    img.src = url
  })
}

// Círculo con el escudo del equipo (recortado, "contain" para no deformar
// logos rectangulares); si no hay imagen cargada, cae al avatar de iniciales.
function drawCrestOrAvatar(ctx, x, y, size, img, name, color, bg = 'rgba(255,255,255,0.05)') {
  if (!img) { drawAvatar(ctx, x, y, size, name, color, bg); return }
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.clip()
  const inner = size * 0.72
  const scale = Math.min(inner / img.width, inner / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
  ctx.restore()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.stroke()
}

function drawFooter(ctx, quiniela, theme = 'green', height = H) {
  const accent = theme === 'purple' ? COLORS.purpleLight : COLORS.greenLight
  ctx.textAlign = 'left'
  ctx.font = '900 15px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textBaseline = 'middle'
  ctx.fillText('CÓDIGO', PAD, height - 84)
  const code = String(quiniela?.codigoAcceso || quiniela?.id || 'QUINIELA').toUpperCase()
  const pillX = PAD + 84
  const brandX = W - PAD - 138
  const maxPillW = brandX - pillX - 24
  const codeMaxW = maxPillW - 42
  const footerCodeSize = fitFont(ctx, code, {
    weight: 700, size: 32, min: 16, family: 'Rajdhani', maxWidth: codeMaxW,
  })
  ctx.font = `700 ${footerCodeSize}px Rajdhani`
  const shownCode = truncate(ctx, code, codeMaxW)
  const w = Math.max(172, Math.min(maxPillW, ctx.measureText(shownCode).width + 42))
  fillRound(ctx, pillX, height - 112, w, 56, 10, theme === 'purple' ? 'rgba(168,85,247,0.16)' : 'rgba(34,197,94,0.16)', theme === 'purple' ? 'rgba(192,132,252,0.45)' : 'rgba(34,197,94,0.45)')
  ctx.fillStyle = accent
  ctx.fillText(shownCode, pillX + 21, height - 84)

  drawBrandMark(ctx, W - PAD - 138, height - 102, 28)
  ctx.font = '900 17px Inter'
  ctx.fillStyle = COLORS.strong
  ctx.fillText('Quiniel', W - PAD - 100, height - 88)
  ctx.fillStyle = COLORS.green
  ctx.fillText('App', W - PAD - 100 + ctx.measureText('Quiniel').width, height - 88)
  ctx.font = '500 13px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText('quinielapp.fun', W - PAD - 100, height - 68)
}

function blobFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen')), 'image/png')
  })
}

function drawTrophy(ctx, x, y, size, color = COLORS.yellowLight) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, size / 11)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(size * 0.32, size * 0.2)
  ctx.lineTo(size * 0.68, size * 0.2)
  ctx.lineTo(size * 0.68, size * 0.43)
  ctx.quadraticCurveTo(size * 0.68, size * 0.68, size * 0.5, size * 0.68)
  ctx.quadraticCurveTo(size * 0.32, size * 0.68, size * 0.32, size * 0.43)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(size * 0.32, size * 0.28)
  ctx.lineTo(size * 0.16, size * 0.28)
  ctx.quadraticCurveTo(size * 0.16, size * 0.5, size * 0.32, size * 0.52)
  ctx.moveTo(size * 0.68, size * 0.28)
  ctx.lineTo(size * 0.84, size * 0.28)
  ctx.quadraticCurveTo(size * 0.84, size * 0.5, size * 0.68, size * 0.52)
  ctx.moveTo(size * 0.5, size * 0.68)
  ctx.lineTo(size * 0.5, size * 0.86)
  ctx.moveTo(size * 0.34, size * 0.88)
  ctx.lineTo(size * 0.66, size * 0.88)
  ctx.stroke()
  ctx.restore()
}

function positionsByPoints(jugadores) {
  const pos = []
  jugadores.forEach((j, i) => {
    if (i === 0) pos.push(1)
    else pos.push(j.puntos === jugadores[i - 1].puntos ? pos[i - 1] : i + 1)
  })
  return jugadores.map((j, i) => ({ ...j, _pos: pos[i] }))
}

function finalRankingData(jugadores) {
  const sorted = [...jugadores].sort((a, b) =>
    (Number(b.puntos) || 0) - (Number(a.puntos) || 0) ||
    (Number(b.exactos) || 0) - (Number(a.exactos) || 0) ||
    (Number(b.aciertos) || 0) - (Number(a.aciertos) || 0)
  )
  const ranked = positionsByPoints(sorted)
  const topPoints = ranked[0]?.puntos ?? 0
  const champions = ranked.filter(j => j.puntos === topPoints)
  const rest = ranked.filter(j => j.puntos !== topPoints)
  return { ranked, champions, rest, topPoints }
}

function drawFinalPrizePill(ctx, { label, amount, suffix = '', y }) {
  ctx.font = '900 15px Inter'
  const labelW = ctx.measureText(label).width
  ctx.font = '700 42px Rajdhani'
  const amountW = ctx.measureText(amount).width
  ctx.font = '800 15px Inter'
  const suffixW = suffix ? ctx.measureText(suffix).width : 0
  const gap = 16
  const w = Math.min(W - PAD * 2 - 96, labelW + amountW + suffixW + gap * (suffix ? 3 : 2) + 52)
  const x = (W - w) / 2
  const grad = ctx.createLinearGradient(x, y, x + w, y + 76)
  grad.addColorStop(0, COLORS.yellow)
  grad.addColorStop(1, COLORS.yellowLight)
  ctx.shadowColor = 'rgba(250,204,21,0.28)'
  ctx.shadowBlur = 28
  fillRound(ctx, x, y, w, 76, 14, grad)
  ctx.shadowBlur = 0

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let tx = x + 26
  ctx.font = '900 15px Inter'
  ctx.fillStyle = '#3A2E05'
  ctx.fillText(label, tx, y + 39)
  tx += labelW + gap
  ctx.font = '700 42px Rajdhani'
  ctx.fillStyle = '#1A1503'
  ctx.fillText(amount, tx, y + 39)
  if (suffix) {
    tx += amountW + gap
    ctx.font = '800 15px Inter'
    ctx.fillText(suffix, tx, y + 39)
  }
}

function drawFinalTable(ctx, rows, y, maxHeight, emptyLabel) {
  const x = PAD
  const w = W - PAD * 2
  const headerH = 54
  const rowH = 56
  const overflowH = 36
  const emptyH = 86
  const availableRows = Math.max(1, Math.floor((maxHeight - headerH - overflowH) / rowH))
  const hasOverflow = rows.length > availableRows
  const shown = rows.slice(0, hasOverflow ? availableRows : Math.floor((maxHeight - headerH) / rowH))
  const hidden = rows.length - shown.length
  const contentH = rows.length === 0 ? emptyH : shown.length * rowH + (hidden > 0 ? overflowH : 0)
  const h = Math.min(maxHeight, headerH + contentH)
  fillRound(ctx, x, y, w, h, 14, 'rgba(19,28,46,0.94)', COLORS.border2)

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = '900 13px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText('TABLA FINAL', x + 28, y + headerH / 2 + 1)
  ctx.textAlign = 'right'
  ctx.fillText('PTS', x + w - 28, y + headerH / 2 + 1)

  if (rows.length === 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(x + 24, y + headerH)
    ctx.lineTo(x + w - 24, y + headerH)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '600 18px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText(emptyLabel, W / 2, y + headerH + emptyH / 2)
    ctx.textAlign = 'left'
    return h
  }

  let rowY = y + headerH
  shown.forEach(row => {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(x + 24, rowY)
    ctx.lineTo(x + w - 24, rowY)
    ctx.stroke()
    const cy = rowY + rowH / 2 + 1
    ctx.textAlign = 'center'
    ctx.font = '700 25px Rajdhani'
    ctx.fillStyle = COLORS.dim
    ctx.fillText(String(row._pos), x + 54, cy)
    ctx.textAlign = 'left'
    ctx.font = '600 24px Inter'
    ctx.fillStyle = '#D1D5DB'
    ctx.fillText(truncate(ctx, row.nombre, w - 230), x + 96, cy)
    ctx.textAlign = 'right'
    ctx.font = '700 32px Rajdhani'
    ctx.fillStyle = COLORS.strong
    ctx.fillText(String(row.puntos ?? 0), x + w - 28, cy)
    rowY += rowH
  })
  if (hidden > 0) {
    ctx.textAlign = 'center'
    ctx.font = '800 14px Inter'
    ctx.fillStyle = COLORS.dim
    ctx.fillText(`y ${hidden} participante${hidden === 1 ? '' : 's'} más`, W / 2, rowY + overflowH / 2 + 1)
    ctx.textAlign = 'left'
  }
  return h
}

function fitFont(ctx, text, { weight = 700, size = 62, min = 32, family = 'Rajdhani', maxWidth }) {
  let fitted = size
  while (fitted > min) {
    ctx.font = `${weight} ${fitted}px ${family}`
    if (ctx.measureText(String(text || '')).width <= maxWidth) return fitted
    fitted -= 2
  }
  ctx.font = `${weight} ${min}px ${family}`
  return min
}

function formatOpenClose(cierre) {
  const d = cierreToDate(cierre)
  if (!d) return 'Cierre por confirmar'
  const clean = value => value
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+de\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const fecha = clean(new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(d))
  const hora = clean(new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)).replace(/\s*a\s*m$/i, ' am').replace(/\s*p\s*m$/i, ' pm')
  return `Cierra ${fecha} · ${hora}`
}

function drawPrizeCard(ctx, y, bote, nota) {
  const x = PAD
  const w = W - PAD * 2
  const h = 104
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, 'rgba(30,41,59,0.94)')
  grad.addColorStop(1, 'rgba(15,24,40,0.97)')
  fillRound(ctx, x, y, w, h, 14, grad, 'rgba(250,204,21,0.34)')
  fillRound(ctx, x + 24, y + 24, 56, 56, 11, 'rgba(250,204,21,0.15)', 'rgba(250,204,21,0.28)')
  drawTrophy(ctx, x + 35, y + 34, 34, COLORS.yellowLight)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.yellowLight
  ctx.fillText('BOTE EN JUEGO', x + 102, y + 44)
  ctx.font = '500 15px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText(nota, x + 102, y + 70)
  ctx.textAlign = 'right'
  ctx.font = '700 54px Rajdhani'
  ctx.fillStyle = COLORS.strong
  ctx.fillText(formatearMXN(bote), x + w - 28, y + 69)
  ctx.textAlign = 'left'
}

function drawOpenPlayersCard(ctx, jugadores, y) {
  const x = PAD
  const w = W - PAD * 2
  ctx.textAlign = 'left'
  const names = jugadores.map(j => normalizarNombre(j?.nombre)).filter(Boolean)
  const maxVisible = 12
  const visible = names.slice(0, maxVisible)
  const overflow = Math.max(0, names.length - visible.length)
  const cols = 2
  const rows = Math.max(1, Math.ceil(visible.length / cols))
  const rowH = 48
  const headerH = 48
  const overflowH = overflow > 0 ? 34 : 0
  const h = headerH + rows * rowH + overflowH + 10
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, 'rgba(30,41,59,0.92)')
  grad.addColorStop(1, 'rgba(15,24,40,0.96)')
  fillRound(ctx, x, y, w, h, 14, grad, COLORS.border)

  ctx.font = '900 13px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textBaseline = 'middle'
  ctx.fillText('YA INSCRITOS', x + 28, y + 27)
  const colW = (w - 56 - 34) / 2

  if (visible.length === 0) {
    ctx.font = '600 20px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText('Sé el primero en unirte', x + 28, y + headerH + rowH / 2)
  } else {
    visible.forEach((name, index) => {
      // Se llena por filas para que el orden de lectura sea izquierda-derecha.
      const col = index % cols
      const row = Math.floor(index / cols)
      const cellX = x + 28 + col * (colW + 34)
      const cellY = y + headerH + row * rowH
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.moveTo(cellX, cellY)
      ctx.lineTo(cellX + colW, cellY)
      ctx.stroke()
      ctx.font = '600 20px Inter'
      ctx.fillStyle = COLORS.text
      ctx.textBaseline = 'middle'
      ctx.fillText(truncate(ctx, name, colW - 90), cellX, cellY + rowH / 2 + 1)
      ctx.font = '700 14px Inter'
      ctx.fillStyle = COLORS.greenLight
      ctx.textAlign = 'right'
      ctx.fillText('✓ Listo', cellX + colW, cellY + rowH / 2 + 1)
      ctx.textAlign = 'left'
    })
  }

  if (overflow > 0) {
    ctx.font = '700 14px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.textAlign = 'center'
    ctx.fillText(`y ${overflow} inscrito${overflow === 1 ? '' : 's'} más`, W / 2, y + headerH + rows * rowH + 18)
    ctx.textAlign = 'left'
  }
}

function drawOpenImage(ctx, datos) {
  const { quiniela = {}, jugadores = [], bote = 0, conPremio = false } = datos
  drawBackground(ctx)
  drawBrand(ctx, PAD, 60, 46)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const badgeY = 151
  ctx.fillStyle = COLORS.green
  ctx.shadowColor = 'rgba(34,197,94,0.9)'
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(PAD + 6, badgeY, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.font = '900 15px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText('INSCRIPCIONES ABIERTAS', PAD + 24, badgeY + 1)

  const title = quiniela?.nombre || 'Quiniela'
  const titleMaxW = W - PAD * 2
  const titleSize = fitFont(ctx, title, { weight: 700, size: 62, min: 26, family: 'Rajdhani', maxWidth: titleMaxW })
  ctx.font = `700 ${titleSize}px Rajdhani`
  const shownTitle = truncate(ctx, title, titleMaxW)
  ctx.fillStyle = COLORS.strong
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(shownTitle, PAD, 226)

  const inscritosLabel = `${jugadores.length} inscrito${jugadores.length === 1 ? '' : 's'}`
  ctx.font = '500 22px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText(`${formatOpenClose(quiniela?.cierre)} · ${inscritosLabel}`, PAD, 272)

  // El código es el héroe de la imagen abierta.
  const heroY = 306
  const heroH = 280
  const heroGrad = ctx.createLinearGradient(PAD, heroY, W - PAD, heroY + heroH)
  heroGrad.addColorStop(0, 'rgba(34,197,94,0.15)')
  heroGrad.addColorStop(0.58, 'rgba(15,45,48,0.72)')
  heroGrad.addColorStop(1, 'rgba(15,24,40,0.72)')
  ctx.shadowColor = 'rgba(34,197,94,0.12)'
  ctx.shadowBlur = 52
  fillRound(ctx, PAD, heroY, W - PAD * 2, heroH, 18, heroGrad, 'rgba(34,197,94,0.46)')
  ctx.shadowBlur = 0
  ctx.textAlign = 'center'
  ctx.font = '900 16px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText('ÚNETE CON EL CÓDIGO', W / 2, heroY + 58)
  const code = String(quiniela?.codigoAcceso || quiniela?.id || 'QUINIELA').toUpperCase()
  const codeTracking = code.length <= 10 ? 6 : 1
  const heroCodeMaxW = W - PAD * 2 - 76
  const codeSize = fitFont(ctx, code, {
    weight: 700,
    size: 120,
    min: 18,
    family: 'Rajdhani',
    maxWidth: heroCodeMaxW - codeTracking * Math.max(0, code.length - 1),
  })
  ctx.font = `700 ${codeSize}px Rajdhani`
  ctx.fillStyle = COLORS.strong
  ctx.textBaseline = 'middle'
  const shownHeroCode = truncateTracked(ctx, code, heroCodeMaxW, codeTracking)
  drawCenteredTrackedText(ctx, shownHeroCode, W / 2, heroY + 145, codeTracking)
  drawCenteredRichText(ctx, [
    { text: 'Entra a ', font: '500 22px Inter', color: COLORS.muted },
    { text: 'quinielapp.fun', font: '700 22px Inter', color: COLORS.greenLight },
    { text: ' y haz tu pronóstico', font: '500 22px Inter', color: COLORS.muted },
  ], W / 2, heroY + 232)

  const showPrize = conPremio && Number(bote) > 0
  const prizeY = heroY + heroH + 24
  if (showPrize) drawPrizeCard(ctx, prizeY, bote, 'Gana quien acumule más puntos')
  drawOpenPlayersCard(ctx, jugadores, showPrize ? prizeY + 128 : prizeY)
  drawFooter(ctx, quiniela)
}

function buildPlayingRows(jugadores, miNombre, budget, hasMeaningfulLeader) {
  const ranked = positionsByPoints(jugadores).map(j => ({
    ...j,
    _leader: hasMeaningfulLeader && j._pos === 1,
  }))
  if (ranked.length === 0) return []

  const rowHeight = row => row?._separator ? 38 : row?._leader ? 78 : 68
  const totalHeight = ranked.reduce((sum, row) => sum + rowHeight(row), 0)
  if (totalHeight <= budget) return ranked

  const separator = hiddenRows => ({
    _separator: true,
    hidden: hiddenRows.length,
    hiddenLeaders: hiddenRows.filter(row => row._leader).length,
  })
  const separatorH = rowHeight(separator([]))
  const miNombreNorm = miNombre ? normalizarNombre(miNombre) : null
  const miIndex = miNombreNorm ? ranked.findIndex(j => normalizarNombre(j.nombre) === miNombreNorm) : -1

  // Primero calculamos cuántas filas superiores caben dejando el resumen final.
  const top = []
  let used = 0
  for (const row of ranked) {
    const h = rowHeight(row)
    if (used + h + separatorH > budget) break
    top.push(row)
    used += h
  }

  // El botón de esta pantalla es "Compartir mi posición". Si la persona está
  // fuera del tramo visible, reservamos una fila para ella en vez de perderla.
  if (miIndex >= top.length) {
    const mine = ranked[miIndex]
    const mineH = rowHeight(mine)
    const withMine = []
    used = 0
    for (const row of ranked) {
      if (row === mine) break
      const h = rowHeight(row)
      if (used + h + separatorH + mineH > budget) break
      withMine.push(row)
      used += h
    }
    return [
      ...withMine,
      separator(ranked.filter((_, index) => index >= withMine.length && index !== miIndex)),
      { ...mine, _mine: true },
    ]
  }

  return [...top, separator(ranked.slice(top.length))]
}

function drawPlayingTable(ctx, datos, y, maxHeight) {
  const { jugadores = [], terminados = 0, enVivo = false, miNombre = null } = datos
  const x = PAD
  const w = W - PAD * 2
  const headerH = 56
  const bottomPad = 12
  const rankingStarted = terminados > 0 || enVivo
  const hasMeaningfulLeader = jugadores.length > 0 && jugadores[0].puntos > 0 && rankingStarted
  const rows = buildPlayingRows(jugadores, miNombre, maxHeight - headerH - bottomPad, hasMeaningfulLeader)
  const rowHeight = row => row?._separator ? 38 : row?._leader ? 78 : 68
  const contentH = rows.length > 0
    ? rows.reduce((sum, row) => sum + rowHeight(row), 0)
    : 96
  const h = Math.min(maxHeight, headerH + contentH + bottomPad)
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, 'rgba(30,41,59,0.92)')
  grad.addColorStop(1, 'rgba(15,24,40,0.96)')
  fillRound(ctx, x, y, w, h, 14, grad, COLORS.border)

  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  roundRect(ctx, x, y, w, headerH, 14)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(x, y + headerH)
  ctx.lineTo(x + w, y + headerH)
  ctx.stroke()
  ctx.font = '900 13px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('#', x + 58, y + headerH / 2 + 1)
  ctx.textAlign = 'left'
  ctx.fillText('JUGADOR', x + 104, y + headerH / 2 + 1)
  ctx.textAlign = 'right'
  ctx.fillText('PTS', x + w - 32, y + headerH / 2 + 1)

  if (rows.length === 0) {
    ctx.textAlign = 'center'
    ctx.font = '600 21px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText('Aún no hay participantes en el ranking', W / 2, y + headerH + 48)
    ctx.textAlign = 'left'
    return
  }

  let rowY = y + headerH
  for (const row of rows) {
    const rowH = rowHeight(row)
    if (row._separator) {
      ctx.font = '700 14px Inter'
      ctx.fillStyle = COLORS.dim
      ctx.textAlign = 'center'
      const allHiddenAreLeaders = row.hidden > 0 && row.hiddenLeaders === row.hidden
      const noun = allHiddenAreLeaders
        ? `líder${row.hidden === 1 ? '' : 'es'}`
        : `participante${row.hidden === 1 ? '' : 's'}`
      const label = row.hidden > 0
        ? `···  ${row.hidden} ${noun} más  ···`
        : '···'
      ctx.fillText(label, W / 2, rowY + rowH / 2)
      ctx.textAlign = 'left'
      rowY += rowH
      continue
    }

    if (row._leader) {
      const leaderGrad = ctx.createLinearGradient(x + 12, rowY, x + w - 12, rowY + rowH)
      leaderGrad.addColorStop(0, 'rgba(34,197,94,0.15)')
      leaderGrad.addColorStop(1, 'rgba(34,197,94,0.035)')
      ctx.shadowColor = 'rgba(34,197,94,0.13)'
      ctx.shadowBlur = 28
      fillRound(ctx, x + 12, rowY + 7, w - 24, rowH - 10, 11, leaderGrad, 'rgba(34,197,94,0.44)')
      ctx.shadowBlur = 0
    } else if (row._mine) {
      fillRound(ctx, x + 12, rowY + 6, w - 24, rowH - 8, 10, 'rgba(255,255,255,0.035)', 'rgba(134,239,172,0.18)')
    }

    if (!row._leader && !row._mine) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.moveTo(x + 24, rowY)
      ctx.lineTo(x + w - 24, rowY)
      ctx.stroke()
    }

    const cy = rowY + rowH / 2 + 1
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 28px Rajdhani'
    ctx.fillStyle = row._leader ? COLORS.green : COLORS.dim
    ctx.fillText(rankingStarted ? String(row._pos) : 'N/D', x + 58, cy)

    const nameX = x + 104
    const badgeW = 72
    const badgeGap = 12
    const nameRight = x + w - 118
    ctx.textAlign = 'left'
    ctx.font = `700 ${row._leader ? 28 : 26}px Inter`
    ctx.fillStyle = row._leader ? COLORS.strong : COLORS.text
    const nameMax = nameRight - nameX - (row._leader ? badgeW + badgeGap : 0)
    const shownName = truncate(ctx, row.nombre, nameMax)
    ctx.fillText(shownName, nameX, cy)

    if (row._leader) {
      const badgeX = Math.min(nameX + ctx.measureText(shownName).width + badgeGap, nameRight - badgeW)
      fillRound(ctx, badgeX, cy - 15, badgeW, 30, 7, 'rgba(34,197,94,0.17)', 'rgba(34,197,94,0.40)')
      ctx.font = '900 12px Inter'
      ctx.fillStyle = COLORS.greenLight
      ctx.textAlign = 'center'
      ctx.fillText('LÍDER', badgeX + badgeW / 2, cy + 1)
    }

    ctx.textAlign = 'right'
    ctx.font = `700 ${row._leader ? 42 : 38}px Rajdhani`
    ctx.fillStyle = row._leader ? COLORS.green : COLORS.strong
    ctx.fillText(String(row.puntos ?? 0), x + w - 32, cy + 1)
    rowY += rowH
  }
  ctx.textAlign = 'left'
}

function drawPlayingImage(ctx, datos) {
  const {
    quiniela = {}, jugadores = [], bote = 0, terminados = 0,
    totalPartidos = 0, enVivo = false, conPremio = false,
  } = datos
  drawBackground(ctx)
  drawBrand(ctx, PAD, 60, 46)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const badgeY = 151
  ctx.fillStyle = COLORS.green
  ctx.shadowColor = 'rgba(34,197,94,0.9)'
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(PAD + 6, badgeY, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.font = '900 15px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText(enVivo ? 'EN JUEGO · EN VIVO' : 'QUINIELA EN JUEGO', PAD + 24, badgeY + 1)

  const title = quiniela?.nombre || 'Quiniela'
  const titleMaxW = W - PAD * 2
  const titleSize = fitFont(ctx, title, { weight: 700, size: 62, min: 26, family: 'Rajdhani', maxWidth: titleMaxW })
  ctx.font = `700 ${titleSize}px Rajdhani`
  const shownTitle = truncate(ctx, title, titleMaxW)
  ctx.fillStyle = COLORS.strong
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(shownTitle, PAD, 226)
  ctx.font = '500 22px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText(`${terminados} de ${totalPartidos} partidos definidos · resultados parciales`, PAD, 272)

  const showPrize = conPremio && Number(bote) > 0
  const prizeY = 306
  if (showPrize) {
    drawPrizeCard(ctx, prizeY, bote, 'Todo puede cambiar en los próximos partidos')
  }
  const tableY = showPrize ? prizeY + 128 : prizeY
  const tableBottom = H - 150
  drawPlayingTable(ctx, { ...datos, jugadores }, tableY, tableBottom - tableY)
  drawFooter(ctx, quiniela)
}

function drawRankingImage(ctx, datos) {
  const {
    quiniela = {}, jugadores = [], bote = 0, conPremio = false,
    premioPorNombre = {},
  } = datos
  drawBackground(ctx, 'gold')
  drawBrand(ctx, PAD, 60, 46)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 15px Inter'
  ctx.fillStyle = COLORS.yellowLight
  ctx.fillText('QUINIELA FINALIZADA', W / 2, 156)

  const { ranked, champions, rest, topPoints } = finalRankingData(jugadores)
  const multi = champions.length > 1
  const hasEntries = ranked.length > 0
  // La lógica de premios vigente no entrega dinero si nadie sumó puntos.
  // En quinielas sin premio sí conservamos el empate deportivo en 1° lugar.
  const noPrizeWinner = hasEntries && conPremio && Number(topPoints) <= 0
  const hasChampion = hasEntries && !noPrizeWinner
  const awardActive = hasChampion && conPremio && Number(bote) > 0 &&
    Number(topPoints) > 0 && !quiniela?.boteDevuelto
  const isPodiumPrize = quiniela?.modeloPremio === 'podio'

  // Con muchos empates no caben todos los nombres en un lienzo fijo. Mostramos
  // tres y una línea-resumen; la tabla omite siempre a todos los campeones.
  const shownChampions = multi && champions.length > 4 ? champions.slice(0, 3) : champions.slice(0, 4)
  const hiddenChampions = Math.max(0, champions.length - shownChampions.length)
  const championRows = hasChampion ? shownChampions.length + (hiddenChampions > 0 ? 1 : 0) : 1

  const heroY = 190
  const nameStartY = multi ? heroY + 214 : heroY + 250
  const lastNameY = multi ? nameStartY + (championRows - 1) * 50 : nameStartY
  const statsY = multi ? lastNameY + 56 : heroY + 310
  const prizeY = statsY + 32
  const heroBottom = awardActive ? prizeY + 76 + 30 : statsY + 50
  const heroH = Math.max(400, heroBottom - heroY)
  const heroGrad = ctx.createLinearGradient(PAD, heroY, W - PAD, heroY + heroH)
  heroGrad.addColorStop(0, 'rgba(250,204,21,0.20)')
  heroGrad.addColorStop(0.55, 'rgba(250,204,21,0.055)')
  heroGrad.addColorStop(1, 'rgba(15,24,40,0.72)')
  ctx.shadowColor = 'rgba(250,204,21,0.16)'
  ctx.shadowBlur = 70
  fillRound(ctx, PAD, heroY, W - PAD * 2, heroH, 22, heroGrad, 'rgba(250,204,21,0.58)')
  ctx.shadowBlur = 0

  const trophyCx = W / 2
  const trophyCy = heroY + 80
  const trophyGlow = ctx.createRadialGradient(trophyCx, trophyCy - 10, 4, trophyCx, trophyCy, 52)
  trophyGlow.addColorStop(0, 'rgba(250,204,21,0.30)')
  trophyGlow.addColorStop(1, 'rgba(250,204,21,0.055)')
  ctx.beginPath()
  ctx.arc(trophyCx, trophyCy, 48, 0, Math.PI * 2)
  ctx.fillStyle = trophyGlow
  ctx.fill()
  ctx.strokeStyle = 'rgba(250,204,21,0.58)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  drawTrophy(ctx, trophyCx - 27, trophyCy - 29, 54, COLORS.yellow)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 17px Inter'
  ctx.fillStyle = COLORS.yellowLight
  const heroLabel = hasChampion
    ? (multi ? 'GANADORES' : 'GANADOR')
    : noPrizeWinner
      ? 'SIN GANADOR'
      : 'SIN PARTICIPANTES'
  ctx.fillText(heroLabel, W / 2, heroY + 164)

  if (hasChampion) {
    if (multi) {
      shownChampions.forEach((winner, i) => {
        const maxNameW = W - PAD * 2 - 126
        const nameSize = fitFont(ctx, winner.nombre, {
          weight: 700, size: 52, min: 28, family: 'Rajdhani', maxWidth: maxNameW,
        })
        ctx.font = `700 ${nameSize}px Rajdhani`
        ctx.fillStyle = COLORS.strong
        ctx.fillText(truncate(ctx, winner.nombre, maxNameW), W / 2, nameStartY + i * 50)
      })
      if (hiddenChampions > 0) {
        ctx.font = '700 26px Rajdhani'
        ctx.fillStyle = COLORS.yellowLight
        ctx.fillText(`y ${hiddenChampions} ganador${hiddenChampions === 1 ? '' : 'es'} más`, W / 2, lastNameY)
      }
    } else {
      const winner = champions[0]
      const maxNameW = W - PAD * 2 - 116
      const nameSize = fitFont(ctx, winner.nombre, {
        weight: 700, size: 76, min: 34, family: 'Rajdhani', maxWidth: maxNameW,
      })
      ctx.font = `700 ${nameSize}px Rajdhani`
      ctx.fillStyle = COLORS.strong
      ctx.fillText(truncate(ctx, winner.nombre, maxNameW), W / 2, nameStartY)
    }

    const principal = champions[0]
    const pointsText = `${topPoints} PTS`
    if (multi) {
      drawCenteredRichText(ctx, [
        { text: pointsText, font: '700 30px Rajdhani', color: COLORS.yellow },
        { text: '  ·  empate en el 1er lugar', font: '500 20px Inter', color: '#D6C79A' },
      ], W / 2, statsY)
    } else {
      const exactos = Number(principal.exactos) || 0
      const aciertos = Number(principal.aciertos) || 0
      drawCenteredRichText(ctx, [
        { text: pointsText, font: '700 30px Rajdhani', color: COLORS.yellow },
        { text: `  ·  ${exactos} exacto${exactos === 1 ? '' : 's'}  ·  ${aciertos} acierto${aciertos === 1 ? '' : 's'}`, font: '500 20px Inter', color: '#D6C79A' },
      ], W / 2, statsY)
    }

    if (awardActive) {
      let awardLabel
      let awardAmount
      let awardSuffix = ''
      if (isPodiumPrize) {
        const fallback = Number(bote) * 0.7 / champions.length
        const firstPrize = Number(premioPorNombre[champions[0]?.nombre]) || fallback
        awardLabel = 'PREMIO DEL 1° LUGAR'
        awardAmount = formatearMXN(firstPrize)
        if (multi) awardSuffix = 'C/U'
      } else {
        awardLabel = multi ? 'SE REPARTEN EL BOTE' : 'SE LLEVA EL BOTE'
        awardAmount = formatearMXN(bote)
      }
      drawFinalPrizePill(ctx, { label: awardLabel, amount: awardAmount, suffix: awardSuffix, y: prizeY })
    }
  } else if (noPrizeWinner) {
    ctx.font = '700 48px Rajdhani'
    ctx.fillStyle = COLORS.strong
    ctx.fillText('Nadie sumó puntos', W / 2, nameStartY)
    ctx.font = '500 20px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText('El premio no se entrega.', W / 2, statsY)
  } else {
    ctx.font = '700 48px Rajdhani'
    ctx.fillStyle = COLORS.strong
    ctx.fillText('No hubo registros', W / 2, nameStartY)
    ctx.font = '500 20px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText('La quiniela terminó sin participantes.', W / 2, statsY)
  }

  const tableY = heroY + heroH + 22
  const tableBottom = H - 150
  const tableRows = noPrizeWinner ? ranked : rest
  const emptyLabel = !hasEntries
    ? 'Sin participantes registrados'
    : multi
      ? 'Todos compartieron el 1er lugar'
      : 'No hubo más participantes'
  drawFinalTable(ctx, tableRows, tableY, Math.max(120, tableBottom - tableY), emptyLabel)
  drawFooter(ctx, quiniela)
}

function escenarioLabel(ctx, esc, partido, maxWidth) {
  if (esc.tipo === 'exacto') return `${esc.local}-${esc.visitante}`
  if (esc.resultado === 'draw') return 'Empate'
  const equipo = esc.resultado === 'home' ? partido.local : partido.visitante
  return truncate(ctx, `${shortName(equipo, 2)} gana`, maxWidth)
}

// La fila "actual" es la que de verdad coincide con el marcador en vivo
// (exacto si hay uno pronosticado con ese marcador; si no, el genérico
// Local/Empate/Visitante). Sin partido en vivo, ninguna fila se resalta.
function isCurrentEscenario(esc, live) {
  const { enVivo, curL, curV, curRes, hayExactaActual } = live
  if (!enVivo) return false
  if (esc.tipo === 'exacto') return esc.local === curL && esc.visitante === curV
  return !hayExactaActual && esc.resultado === curRes
}

function drawScenarioRow(ctx, fila, y, rowH, partido, current) {
  if (current) {
    ctx.fillStyle = 'rgba(239,68,68,0.14)'
    ctx.fillRect(PAD, y, W - PAD * 2, rowH)
  }
  const pillH = Math.min(40, rowH - 20)
  const midY = y + rowH / 2
  fillRound(ctx, PAD + 30, midY - pillH / 2, 300, pillH, 8, current ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.05)', current ? 'rgba(239,68,68,0.75)' : COLORS.border2)
  ctx.font = '600 18px Inter'
  ctx.fillStyle = current ? COLORS.redLight : COLORS.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(escenarioLabel(ctx, fila.esc, partido, 260), PAD + 180, midY)
  ctx.textAlign = 'left'
  // Ancho disponible para "quién gana": hasta el borde derecho, dejando
  // hueco para el badge "Ahora" en la fila resaltada.
  const rightLimit = current ? (W - PAD - 126 - 10) : (W - PAD - 30)
  const maxWinnerWidth = rightLimit - (PAD + 345)
  ctx.font = '600 27px Inter'
  ctx.fillStyle = COLORS.purpleLight
  const winnerText = fila.lideres.map(n => shortName(n, 2)).join(' + ')
  const winnerDisplay = truncate(ctx, winnerText, Math.max(40, maxWinnerWidth))
  ctx.fillText(winnerDisplay, PAD + 345, midY)
  if (current) {
    fillRound(ctx, W - PAD - 126, midY - 18, 96, 36, 999, 'rgba(239,68,68,0.22)')
    ctx.font = '800 14px Inter'
    ctx.fillStyle = COLORS.redLight
    ctx.textAlign = 'center'
    ctx.fillText('Ahora', W - PAD - 78, midY)
    ctx.textAlign = 'left'
  }
  ctx.textBaseline = 'alphabetic'
}

// Geometría de la tabla de escenarios, compartida entre el cálculo de altura
// del lienzo (antes de crearlo) y el dibujo (después). El lienzo del oráculo
// no tiene una altura fija: crece para mostrar TODOS los marcadores sin
// esconder ninguno, así la imagen es un "screenshot" fiel de la web.
const ORACLE_TABLE_Y = 454
const ORACLE_HEADER_H = 60
const ORACLE_DIVIDER_H = 46
const ORACLE_ROW_H = 78
const ORACLE_FOOTER_GAP = 90
const ORACLE_FOOTER_BLOCK_H = 150

function oracleRowCounts(simulacion) {
  const filas = simulacion?.filas ?? []
  return {
    exactas: filas.filter(f => f.esc.tipo === 'exacto').length,
    genericas: filas.filter(f => f.esc.tipo === 'generico').length,
  }
}

function computeOracleCanvasHeight(simulacion) {
  const { exactas, genericas } = oracleRowCounts(simulacion)
  const tableH = ORACLE_HEADER_H + exactas * ORACLE_ROW_H + ORACLE_DIVIDER_H + genericas * ORACLE_ROW_H
  const noteY = ORACLE_TABLE_Y + tableH + 44
  return Math.round(noteY + ORACLE_FOOTER_GAP + ORACLE_FOOTER_BLOCK_H)
}

function drawOracleImage(ctx, datos, assets = {}) {
  const { quiniela, simulacion, bote = 0, liveScores = {}, conPremio = true } = datos
  const { escudoLocal = null, escudoVisitante = null, height = H } = assets
  const partido = simulacion?.partido ?? {}

  // Marcador real del partido en vivo (mismo criterio que la tarjeta en la
  // web): solo así sabemos qué fila de la tabla es la que está pasando ahora.
  const live = partido.espnId ? liveScores?.[partido.espnId] : null
  const enVivo = live?.state === 'in' && live.local !== '' && live.visitante !== '' &&
    live.local != null && live.visitante != null
  const curL = enVivo ? Number(live.local) : null
  const curV = enVivo ? Number(live.visitante) : null
  const curRes = enVivo ? goalsToResultado(curL, curV) : null
  const exactasAll = (simulacion?.filas ?? []).filter(f => f.esc.tipo === 'exacto')
  const hayExactaActual = enVivo && exactasAll.some(f => f.esc.local === curL && f.esc.visitante === curV)

  drawBackground(ctx, 'purple', height)
  drawBrand(ctx, PAD, 64, 42)
  if (enVivo) drawLiveBadge(ctx, W - PAD, 66, 'EN VIVO')

  fillRound(ctx, PAD, 144, 64, 64, 12, 'rgba(168,85,247,0.22)', 'rgba(192,132,252,0.45)')
  ctx.font = '900 38px Inter'
  ctx.fillStyle = COLORS.purpleLight
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', PAD + 32, 178)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '900 16px Inter'
  ctx.fillText('ORACULO · ESCENARIOS DE CIERRE', PAD + 84, 154)
  ctx.font = '700 52px Rajdhani'
  ctx.fillStyle = COLORS.strong
  ctx.fillText('¿Quién gana?', PAD + 84, 206)
  ctx.font = '500 22px Inter'
  ctx.fillStyle = COLORS.muted
  if (conPremio) {
    const botePrefix = 'Todo depende del último partido. Así cambia quién se lleva los '
    ctx.fillText(botePrefix, PAD, 250)
    const botePrefixW = ctx.measureText(botePrefix).width
    ctx.font = '800 22px Inter'
    ctx.fillStyle = COLORS.greenLight
    const boteText = formatearMXN(bote)
    ctx.fillText(boteText, PAD + botePrefixW, 250)
    const boteTextW = ctx.measureText(boteText).width
    ctx.font = '500 22px Inter'
    ctx.fillStyle = COLORS.muted
    ctx.fillText(':', PAD + botePrefixW + boteTextW, 250)
  } else {
    ctx.fillText('Todo depende del último partido. Así cambia quién queda en 1° lugar:', PAD, 250)
  }

  fillRound(ctx, PAD, 288, W - PAD * 2, 136, 16, 'rgba(168,85,247,0.14)', 'rgba(192,132,252,0.40)')
  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.purpleLight
  ctx.fillText('FALTA POR JUGARSE', PAD + 30, 328)
  ctx.font = '700 18px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.textAlign = 'right'
  ctx.fillText(formatMatchTime(partido.hora), W - PAD - 30, 328)
  // Los nombres se anclan hacia afuera de cada escudo (en vez de un punto fijo)
  // para que equipos con nombres largos ("Colombia", "Corea del Sur") no se
  // encimen con el círculo de iniciales.
  const avatarR = 27
  const homeAvatarX = W / 2 - 58
  const awayAvatarX = W / 2 + 58
  const nameGap = 16
  ctx.font = '700 24px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textAlign = 'center'
  ctx.fillText('VS', W / 2, 384)

  ctx.font = '700 34px Inter'
  ctx.fillStyle = COLORS.strong
  ctx.textAlign = 'right'
  const homeNameMax = homeAvatarX - avatarR - nameGap - (PAD + 30)
  ctx.fillText(truncate(ctx, partido.local, homeNameMax), homeAvatarX - avatarR - nameGap, 384)
  ctx.textAlign = 'left'
  const awayNameMax = (W - PAD - 30) - (awayAvatarX + avatarR + nameGap)
  ctx.fillText(truncate(ctx, partido.visitante, awayNameMax), awayAvatarX + avatarR + nameGap, 384)

  drawCrestOrAvatar(ctx, homeAvatarX, 374, avatarR * 2, escudoLocal, partido.local, COLORS.text, 'rgba(255,255,255,0.08)')
  drawCrestOrAvatar(ctx, awayAvatarX, 374, avatarR * 2, escudoVisitante, partido.visitante, COLORS.text, 'rgba(255,255,255,0.08)')

  // Tabla de escenarios: los 3 genéricos (Local/Empate/Visitante) SIEMPRE
  // aparecen, en su propia subsección "Cualquier otro marcador": igual que
  // en la web. Antes se recortaba a las primeras 6 filas de la lista y, si
  // había 6+ marcadores exactos distintos entre los jugadores, los genéricos
  // se quedaban fuera de la imagen.
  const genericas = (simulacion?.filas ?? []).filter(f => f.esc.tipo === 'generico')
  const liveCtx = { enVivo, curL, curV, curRes, hayExactaActual }

  // Se muestran TODOS los marcadores, sin recortar: la imagen es un
  // "screenshot" fiel de lo que ya se ve en el oráculo de la web. El lienzo
  // (computeOracleCanvasHeight) se calculó con esta misma geometría antes de
  // crear el canvas, así que aquí solo hace falta dibujar.
  const tableY = ORACLE_TABLE_Y
  const headerH = ORACLE_HEADER_H
  const dividerH = ORACLE_DIVIDER_H
  const rowH = ORACLE_ROW_H
  const tableH = headerH + exactasAll.length * rowH + dividerH + genericas.length * rowH
  fillRound(ctx, PAD, tableY, W - PAD * 2, tableH, 16, 'rgba(10,15,30,0.72)', COLORS.border2)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  roundRect(ctx, PAD, tableY, W - PAD * 2, headerH, 16)
  ctx.fill()
  ctx.font = '800 14px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText('SI TERMINA', PAD + 30, tableY + 37)
  ctx.fillText('QUIÉN GANA', PAD + 345, tableY + 37)

  let rowY = tableY + headerH
  exactasAll.forEach(fila => {
    drawScenarioRow(ctx, fila, rowY, rowH, partido, isCurrentEscenario(fila.esc, liveCtx))
    rowY += rowH
  })

  // Divisor "Cualquier otro marcador" (igual que el de la web) antes de los
  // 3 escenarios genéricos, que siempre se muestran completos.
  ctx.font = '800 12px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.textBaseline = 'middle'
  const dividerLabel = 'CUALQUIER OTRO MARCADOR'
  ctx.fillText(dividerLabel, PAD + 30, rowY + dividerH / 2)
  const dividerLabelW = ctx.measureText(dividerLabel).width
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD + 30 + dividerLabelW + 14, rowY + dividerH / 2)
  ctx.lineTo(W - PAD - 30, rowY + dividerH / 2)
  ctx.stroke()
  ctx.textBaseline = 'alphabetic'
  rowY += dividerH

  genericas.forEach(fila => {
    drawScenarioRow(ctx, fila, rowY, rowH, partido, isCurrentEscenario(fila.esc, liveCtx))
    rowY += rowH
  })

  // Mismo texto que ya usa la tarjeta en la web (sin mencionar el premio ni
  // una hora fija: antes decía "esta noche" sin importar cuándo fuera el
  // partido).
  const numJugadores = simulacion?.numJugadores ?? 0
  ctx.font = '500 18px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText(`Con los ${numJugadores} participantes. En empate de puntos, comparten el 1° lugar.`, PAD, tableY + tableH + 44)
  drawFooter(ctx, quiniela, 'purple', height)
}

function formatMatchTime(value) {
  const d = cierreToDate(value)
  if (!d) return 'Por definirse'
  return d.toLocaleString('es-MX', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

async function shareBlob(blob, filename, baseName) {
  const file = new File([blob], filename, { type: 'image/png' })
  const esMovil = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (esMovil && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { compartido: true }
    } catch (err) {
      if (err?.name === 'AbortError') return { compartido: false, cancelado: true }
    }
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return { copiado: true }
    } catch { /* fallback */ }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { descargado: true }
}

function slug(text) {
  return String(text || 'quiniela').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'quiniela'
}

export async function generarImagenRanking(datos) {
  await waitFonts()
  const { canvas, ctx } = setupCanvas()
  const abierta = !quinielaCerrada(datos.quiniela) && !datos.enVivo && (datos.terminados ?? 0) === 0
  if (abierta) drawOpenImage(ctx, datos)
  else if (!datos.finalizada) drawPlayingImage(ctx, datos)
  else drawRankingImage(ctx, datos)
  return blobFromCanvas(canvas)
}

export async function generarImagenOraculo(datos) {
  await waitFonts()
  const partido = datos.simulacion?.partido ?? {}
  const [escudoLocal, escudoVisitante] = await Promise.all([
    loadImageSafe(partido.escudoLocal),
    loadImageSafe(partido.escudoVisitante),
  ])
  // El lienzo crece según cuántos marcadores haya que mostrar: sin esto se
  // recortarían filas o quedaría un hueco vacío si son pocas.
  const height = computeOracleCanvasHeight(datos.simulacion)
  const { canvas, ctx } = setupCanvas(height)
  drawOracleImage(ctx, datos, { escudoLocal, escudoVisitante, height })
  return blobFromCanvas(canvas)
}

export async function compartirRanking(datos) {
  const blob = await generarImagenRanking(datos)
  const name = slug(datos.quiniela?.nombre)
  return shareBlob(blob, `quiniela-${name}.png`, `quiniela-${name}`)
}

export async function compartirOraculo(datos) {
  const blob = await generarImagenOraculo(datos)
  const name = slug(datos.quiniela?.nombre)
  return shareBlob(blob, `quiniela-oraculo-${name}.png`, `quiniela-oraculo-${name}`)
}
