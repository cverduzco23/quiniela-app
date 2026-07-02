import { cierreToDate, quinielaCerrada } from './cierre'
import { formatearMXN } from './premios'
import { normalizarNombre } from './nombres'

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

const medal = [
  { fg: '#FACC15', light: '#FDE68A', dark: '#5B4A12', h: 172 },
  { fg: '#E5E7EB', light: '#F8FAFC', dark: '#334155', h: 124 },
  { fg: '#E0A870', light: '#FCD9B6', dark: '#472B20', h: 102 },
]

function setupCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'
  return { canvas, ctx }
}

async function waitFonts() {
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* noop */ }
  }
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

function drawTableIcon(ctx, name, cx, cy, size = 18, color = COLORS.dim) {
  ctx.save()
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (name === 'check') {
    ctx.beginPath()
    ctx.moveTo(size * 0.18, size * 0.52)
    ctx.lineTo(size * 0.42, size * 0.76)
    ctx.lineTo(size * 0.84, size * 0.24)
    ctx.stroke()
  } else if (name === 'target') {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.15, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(size / 2, 0)
    ctx.lineTo(size / 2, size * 0.18)
    ctx.moveTo(size / 2, size * 0.82)
    ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size * 0.18, size / 2)
    ctx.moveTo(size * 0.82, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawBackground(ctx, theme = 'green') {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, COLORS.bg0)
  g.addColorStop(0.46, COLORS.bg1)
  g.addColorStop(1, COLORS.bg2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const glowA = theme === 'purple' ? 'rgba(168,85,247,0.25)' : 'rgba(34,197,94,0.20)'
  const glowB = theme === 'purple' ? 'rgba(168,85,247,0.13)' : 'rgba(250,204,21,0.12)'
  let rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 560)
  rg.addColorStop(0, glowA)
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)
  rg = ctx.createRadialGradient(W, 0, 0, W, 0, 470)
  rg.addColorStop(0, glowB)
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)
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

function brandWidth(ctx, size = 42) {
  ctx.save()
  ctx.font = `900 ${Math.round(size * 0.54)}px Inter`
  const width = size + 14 + ctx.measureText('Quiniel').width + ctx.measureText('App').width
  ctx.restore()
  return width
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

function drawFooter(ctx, quiniela, theme = 'green') {
  const accent = theme === 'purple' ? COLORS.purpleLight : COLORS.greenLight
  ctx.font = '900 15px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textBaseline = 'middle'
  ctx.fillText('CÓDIGO', PAD, H - 84)
  const code = String(quiniela?.codigoAcceso || quiniela?.id || 'QUINIELA').toUpperCase()
  ctx.font = '700 32px Rajdhani'
  const w = Math.max(172, ctx.measureText(code).width + 42)
  fillRound(ctx, PAD + 84, H - 112, w, 56, 10, theme === 'purple' ? 'rgba(168,85,247,0.16)' : 'rgba(34,197,94,0.16)', theme === 'purple' ? 'rgba(192,132,252,0.45)' : 'rgba(34,197,94,0.45)')
  ctx.fillStyle = accent
  ctx.fillText(code, PAD + 105, H - 84)

  drawBrandMark(ctx, W - PAD - 138, H - 102, 28)
  ctx.font = '900 17px Inter'
  ctx.fillStyle = COLORS.strong
  ctx.fillText('Quiniel', W - PAD - 100, H - 88)
  ctx.fillStyle = COLORS.green
  ctx.fillText('App', W - PAD - 100 + ctx.measureText('Quiniel').width, H - 88)
  ctx.font = '500 13px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText('quinielapp.fun', W - PAD - 100, H - 68)
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

function drawStar(ctx, cx, cy, outer, inner, color) {
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5
    const r = i % 2 === 0 ? outer : inner
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
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

function podiumGroups(jugadores) {
  const groups = []
  for (const j of jugadores) {
    const last = groups[groups.length - 1]
    if (last && last.puntos === j.puntos) last.jugadores.push(j)
    else groups.push({ puntos: j.puntos, jugadores: [j] })
    if (groups.length >= 3 && groups[groups.length - 1].jugadores.length >= 3) break
  }
  return [groups[0], groups[1], groups[2]].filter(Boolean)
}

function drawPodiumStep(ctx, group, place, cx, baseY, width, miNombreNorm) {
  const cfg = medal[place - 1]
  const shown = (group?.jugadores ?? []).slice(0, group.jugadores.length > 1 ? 2 : 1)
  const avatarSize = place === 1 && shown.length === 1 ? 104 : shown.length > 1 ? 70 : 86
  const avatarGap = shown.length > 1 ? 18 : 0
  const startX = cx - ((shown.length - 1) * (avatarSize + avatarGap)) / 2
  const avY = baseY - cfg.h - (place === 1 ? 92 : 84)
  const nameY = baseY - cfg.h + (place === 1 ? 12 : 8)
  const pointsY = nameY + (place === 1 ? 36 : 34)

  if (place === 1) {
    drawStar(ctx, cx, avY - avatarSize / 2 - 22, 15, 6, COLORS.yellow)
  }

  shown.forEach((j, i) => drawAvatar(ctx, startX + i * (avatarSize + avatarGap), avY, avatarSize, j.nombre, cfg.fg, `${cfg.dark}99`))

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `900 ${place === 1 ? 30 : 27}px Inter`
  ctx.fillStyle = COLORS.strong
  const label = shown.length > 1 ? `Empate x${group.jugadores.length}` : shortName(shown[0]?.nombre)
  ctx.fillText(truncate(ctx, label, width - 14), cx, nameY)
  if (shown.some(j => miNombreNorm && j.nombre === miNombreNorm)) {
    ctx.font = '900 13px Inter'
    const nameW = ctx.measureText(label).width
    fillRound(ctx, cx + nameW / 2 + 10, nameY - 24, 42, 24, 999, COLORS.green)
    ctx.fillStyle = '#052E16'
    ctx.textBaseline = 'middle'
    ctx.fillText('TU', cx + nameW / 2 + 31, nameY - 12)
  }
  ctx.font = `900 ${place === 1 ? 24 : 21}px Rajdhani`
  ctx.fillStyle = place === 1 ? COLORS.yellowLight : COLORS.muted
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${group.puntos} pts`, cx, pointsY)

  const pedestalY = baseY - cfg.h + 68
  const grad = ctx.createLinearGradient(cx, pedestalY, cx, pedestalY + cfg.h)
  grad.addColorStop(0, `${cfg.dark}E6`)
  grad.addColorStop(1, 'rgba(19,28,46,0.2)')
  fillRound(ctx, cx - width / 2, pedestalY, width, cfg.h, 16, grad, `${cfg.fg}55`)
  ctx.font = `900 ${place === 1 ? 82 : 58}px Rajdhani`
  ctx.fillStyle = cfg.fg
  ctx.textBaseline = 'middle'
  ctx.fillText(String(place), cx, pedestalY + cfg.h / 2)
  ctx.textAlign = 'left'
}

function drawRankingRows(ctx, jugadores, startY, miNombreNorm) {
  const y0 = startY
  const tableX = PAD
  const tableW = W - PAD * 2
  const tableH = 320
  const rowH = 54
  const sepH = 30
  fillRound(ctx, tableX, y0, tableW, tableH, 16, COLORS.card, COLORS.border)
  ctx.fillStyle = '#18243A'
  roundRect(ctx, tableX, y0, tableW, 50, 16)
  ctx.fill()

  ctx.font = '900 12px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.textBaseline = 'middle'
  ctx.fillText('#', tableX + 54, y0 + 26)
  ctx.fillText('JUGADOR', tableX + 104, y0 + 26)
  ctx.textAlign = 'center'
  drawTableIcon(ctx, 'target', tableX + tableW - 270, y0 + 26, 18)
  drawTableIcon(ctx, 'check', tableX + tableW - 180, y0 + 26, 18)
  ctx.fillText('PTS', tableX + tableW - 48, y0 + 26)
  ctx.textAlign = 'left'

  const ranked = positionsByPoints(jugadores)
  const candidates = ranked.filter(j => j._pos > 3)
  const wantsCutLine = candidates.length > 4
  const topRows = candidates.slice(0, wantsCutLine ? 4 : 5)
  let rows = topRows
  const miIdx = miNombreNorm ? ranked.findIndex(j => j.nombre === miNombreNorm) : -1
  const miEnRows = miIdx >= 0 && rows.some(j => j.nombre === miNombreNorm)
  const miEnPodio = miIdx >= 0 && ranked[miIdx]._pos <= 3
  const extra = miIdx >= 0 && !miEnRows && !miEnPodio ? ranked[miIdx] : null
  if (extra && rows.length >= 5) rows = rows.slice(0, 4)

  let y = y0 + 50
  rows.forEach((j) => {
    drawRankingRow(ctx, j, tableX, y, tableW, miNombreNorm)
    y += rowH
  })

  const hidden = Math.max(0, ranked.length - 3 - rows.length - (extra ? 1 : 0))
  if (hidden > 0 && y + sepH <= y0 + tableH) {
    ctx.font = '800 15px Inter'
    ctx.fillStyle = COLORS.dim
    ctx.textAlign = 'center'
    ctx.fillText(`y ${hidden} jugador${hidden === 1 ? '' : 'es'} más`, W / 2, y + 21)
    ctx.textAlign = 'left'
    y += sepH
  }
  if (extra && y + rowH <= y0 + tableH) drawRankingRow(ctx, extra, tableX, y, tableW, miNombreNorm)
}

function drawRankingRow(ctx, j, x, y, w, miNombreNorm) {
  const esTu = miNombreNorm && j.nombre === miNombreNorm
  if (esTu) fillRound(ctx, x + 16, y + 6, w - 32, 50, 10, 'rgba(34,197,94,0.14)', 'rgba(34,197,94,0.38)')
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(x + 16, y)
  ctx.lineTo(x + w - 16, y)
  ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.font = '900 20px Inter'
  ctx.fillStyle = esTu ? COLORS.greenLight : COLORS.dim
  ctx.textAlign = 'center'
  ctx.fillText(String(j._pos), x + 58, y + 29)
  ctx.textAlign = 'left'
  ctx.font = '700 21px Inter'
  ctx.fillStyle = COLORS.text
  const name = truncate(ctx, shortName(j.nombre, 3), w - 435)
  ctx.fillText(name, x + 104, y + 29)
  if (esTu) {
    const nameW = ctx.measureText(name).width
    ctx.font = '900 12px Inter'
    fillRound(ctx, x + 112 + nameW, y + 16, 38, 22, 999, COLORS.green)
    ctx.fillStyle = '#052E16'
    ctx.textAlign = 'center'
    ctx.fillText('TU', x + 131 + nameW, y + 27)
    ctx.textAlign = 'left'
  }
  ctx.font = '500 20px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.textAlign = 'center'
  ctx.fillText(String(j.exactos ?? 0), x + w - 270, y + 29)
  ctx.fillText(String(j.aciertos ?? 0), x + w - 180, y + 29)
  ctx.font = '900 31px Rajdhani'
  ctx.fillStyle = COLORS.text
  ctx.fillText(String(j.puntos ?? 0), x + w - 48, y + 29)
  ctx.textAlign = 'left'
}

function countdownParts(cierre) {
  const d = cierreToDate(cierre)
  const ms = Math.max(0, (d?.getTime() ?? Date.now()) - Date.now())
  const minTotal = Math.floor(ms / 60000)
  const dias = Math.floor(minTotal / 1440)
  const horas = Math.floor((minTotal % 1440) / 60)
  const mins = minTotal % 60
  return [dias, horas, mins].map(n => String(n).padStart(2, '0'))
}

function drawOpenImage(ctx, quiniela, jugadores) {
  drawBackground(ctx)
  ctx.textAlign = 'center'
  const openBrandSize = 38
  drawBrand(ctx, W / 2 - brandWidth(ctx, openBrandSize) / 2, 72, openBrandSize)
  fillRound(ctx, W / 2 - 124, 154, 248, 40, 999, 'rgba(34,197,94,0.16)', 'rgba(34,197,94,0.48)')
  ctx.font = '900 13px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.textBaseline = 'middle'
  const badgeText = 'REGISTRO ABIERTO'
  const dotR = 5
  const dotGap = 10
  const badgeGroupW = dotR * 2 + dotGap + ctx.measureText(badgeText).width
  const badgeGroupX = W / 2 - badgeGroupW / 2
  ctx.fillStyle = COLORS.green
  ctx.beginPath()
  ctx.arc(badgeGroupX + dotR, 174, dotR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.greenLight
  ctx.textAlign = 'left'
  ctx.fillText(badgeText, badgeGroupX + dotR * 2 + dotGap, 175)
  ctx.textAlign = 'center'

  ctx.font = '700 68px Rajdhani'
  ctx.fillStyle = COLORS.strong
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncate(ctx, quiniela?.nombre || 'Quiniela', W - 170), W / 2, 276)
  ctx.font = '500 23px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText('Aún puedes entrar - haz tus pronósticos antes de que', W / 2, 326)
  ctx.fillText('empiece la quiniela.', W / 2, 358)

  ctx.font = '900 16px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText('CIERRA EL REGISTRO EN', W / 2, 424)

  const parts = countdownParts(quiniela?.cierre)
  const labels = ['DÍAS', 'HORAS', 'MIN']
  const boxW = 172
  const gap = 58
  const totalW = boxW * 3 + gap * 2
  let x = (W - totalW) / 2
  for (let i = 0; i < 3; i++) {
    const hi = i === 2
    fillRound(ctx, x, 452, boxW, 172, 20, hi ? 'rgba(34,197,94,0.14)' : '#141F33', hi ? 'rgba(34,197,94,0.55)' : 'rgba(255,255,255,0.08)')
    ctx.font = '700 96px Rajdhani'
    ctx.fillStyle = hi ? COLORS.greenLight : COLORS.strong
    ctx.textBaseline = 'middle'
    ctx.fillText(parts[i], x + boxW / 2, 540)
    ctx.font = '900 16px Inter'
    ctx.fillStyle = COLORS.dim
    ctx.fillText(labels[i], x + boxW / 2, 672)
    if (i < 2) {
      ctx.font = '900 56px Rajdhani'
      ctx.fillStyle = '#334155'
      ctx.fillText(':', x + boxW + gap / 2, 535)
    }
    x += boxW + gap
  }

  const countText = `${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'} ya están dentro`
  ctx.font = '800 20px Inter'
  const pillW = Math.max(470, ctx.measureText(countText).width + 188)
  fillRound(ctx, W / 2 - pillW / 2, 724, pillW, 66, 999, '#141F33', COLORS.border2)
  const avs = jugadores.slice(0, 4)
  avs.forEach((j, i) => drawAvatar(ctx, W / 2 - pillW / 2 + 42 + i * 31, 757, 40, j.nombre, i === 3 && jugadores.length > 4 ? COLORS.greenLight : COLORS.muted, '#233047'))
  if (jugadores.length > 4) {
    ctx.font = '900 14px Inter'
    ctx.fillStyle = COLORS.greenLight
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(`+${jugadores.length - 3}`, W / 2 - pillW / 2 + 135, 758)
  }
  ctx.font = '800 20px Inter'
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.text
  ctx.textBaseline = 'middle'
  ctx.fillText(countText, W / 2 - pillW / 2 + 168, 758)

  const ctaY = 1038
  const ctaH = 224
  const ctaGrad = ctx.createLinearGradient(PAD, ctaY, W - PAD, ctaY + ctaH)
  ctaGrad.addColorStop(0, 'rgba(18,79,69,0.88)')
  ctaGrad.addColorStop(0.45, 'rgba(17,45,57,0.86)')
  ctaGrad.addColorStop(1, 'rgba(20,31,51,0.92)')
  fillRound(ctx, PAD, ctaY, W - PAD * 2, ctaH, 18, ctaGrad, 'rgba(34,197,94,0.58)')
  ctx.textAlign = 'center'
  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText('ENTRA CON EL CÓDIGO', W / 2, ctaY + 52)
  ctx.font = '700 70px Rajdhani'
  ctx.fillStyle = COLORS.strong
  drawCenteredTrackedText(ctx, String(quiniela?.codigoAcceso || quiniela?.id || 'QUINIELA').toUpperCase(), W / 2, ctaY + 110, 1.5)
  drawCenteredRichText(ctx, [
    { text: 'Ábrelo en ', font: '500 16px Inter', color: COLORS.muted },
    { text: 'quinielapp.fun', font: '800 16px Inter', color: COLORS.text },
    { text: ' y únete gratis', font: '500 16px Inter', color: COLORS.muted },
  ], W / 2, ctaY + 172)
  ctx.textAlign = 'left'
}

function drawRankingImage(ctx, datos) {
  const { quiniela, jugadores = [], bote = 0, terminados = 0, totalPartidos = 0, finalizada = false, enVivo = false, miNombre = null } = datos
  drawBackground(ctx)
  drawBrand(ctx, PAD, 64, 42)
  if (enVivo || !finalizada) drawLiveBadge(ctx, W - PAD, 66, finalizada ? 'FINAL' : 'EN VIVO')

  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.greenLight
  ctx.fillText(`RANKING · ${finalizada ? 'FINALIZADA' : 'JUGÁNDOSE'}`, PAD, 154)
  ctx.font = '700 64px Rajdhani'
  ctx.fillStyle = COLORS.strong
  ctx.fillText(truncate(ctx, quiniela?.nombre || 'Quiniela', W - PAD * 2), PAD, 222)
  ctx.font = '500 21px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText(`${terminados} de ${totalPartidos} partidos definidos · ${jugadores.length} participante${jugadores.length === 1 ? '' : 's'}`, PAD, 270)

  fillRound(ctx, PAD, 306, W - PAD * 2, 76, 13, 'rgba(250,204,21,0.08)', 'rgba(250,204,21,0.38)')
  fillRound(ctx, PAD + 30, 324, 46, 46, 9, 'rgba(250,204,21,0.17)')
  drawTrophy(ctx, PAD + 39, 332, 30)
  ctx.font = '900 12px Inter'
  ctx.fillStyle = COLORS.yellowLight
  ctx.fillText('BOTE EN JUEGO', PAD + 102, 340)
  ctx.font = '500 13px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText('Gana quien acumule más puntos', PAD + 102, 360)
  ctx.font = '700 38px Rajdhani'
  ctx.fillStyle = COLORS.strong
  ctx.textAlign = 'right'
  ctx.fillText(formatearMXN(bote), W - PAD - 28, 354)
  ctx.textAlign = 'left'

  const miNombreNorm = miNombre ? normalizarNombre(miNombre) : null
  const groups = podiumGroups(jugadores)
  const baseY = 786
  if (groups[1]) drawPodiumStep(ctx, groups[1], 2, 228, baseY, 280, miNombreNorm)
  if (groups[0]) drawPodiumStep(ctx, groups[0], 1, W / 2, baseY, 300, miNombreNorm)
  if (groups[2]) drawPodiumStep(ctx, groups[2], 3, W - 228, baseY, 280, miNombreNorm)

  drawRankingRows(ctx, jugadores, 870, miNombreNorm)
  drawFooter(ctx, quiniela)
}

function escenarioLabel(esc, partido) {
  if (esc.tipo === 'exacto') return `${esc.local}-${esc.visitante}`
  if (esc.resultado === 'draw') return 'Empate'
  return `${esc.resultado === 'home' ? initials(partido.local) : initials(partido.visitante)} gana`
}

function drawOracleImage(ctx, datos) {
  const { quiniela, simulacion, bote = 0 } = datos
  const partido = simulacion?.partido ?? {}
  drawBackground(ctx, 'purple')
  drawBrand(ctx, PAD, 64, 42)
  drawLiveBadge(ctx, W - PAD, 66, 'EN VIVO')

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
  ctx.fillText('¿Quién gana el bote?', PAD + 84, 206)
  ctx.font = '500 22px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText(`Todo depende del último partido. Así cambia el ganador de los ${formatearMXN(bote)}:`, PAD, 250)

  fillRound(ctx, PAD, 288, W - PAD * 2, 136, 16, 'rgba(168,85,247,0.14)', 'rgba(192,132,252,0.40)')
  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.purpleLight
  ctx.fillText('FALTA POR JUGARSE', PAD + 30, 328)
  ctx.font = '700 18px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.textAlign = 'right'
  ctx.fillText(formatMatchTime(partido.hora), W - PAD - 30, 328)
  ctx.textAlign = 'center'
  ctx.font = '900 34px Inter'
  ctx.fillStyle = COLORS.strong
  ctx.fillText(shortName(partido.local, 2), W / 2 - 170, 384)
  drawAvatar(ctx, W / 2 - 56, 374, 54, partido.local, COLORS.text, 'rgba(255,255,255,0.08)')
  ctx.font = '900 24px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText('VS', W / 2, 384)
  drawAvatar(ctx, W / 2 + 56, 374, 54, partido.visitante, COLORS.text, 'rgba(255,255,255,0.08)')
  ctx.font = '900 34px Inter'
  ctx.fillStyle = COLORS.strong
  ctx.fillText(shortName(partido.visitante, 2), W / 2 + 190, 384)
  ctx.textAlign = 'left'

  const rows = (simulacion?.filas ?? []).slice(0, 6)
  const tableY = 454
  fillRound(ctx, PAD, tableY, W - PAD * 2, 352, 16, 'rgba(10,15,30,0.72)', COLORS.border2)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  roundRect(ctx, PAD, tableY, W - PAD * 2, 56, 16)
  ctx.fill()
  ctx.font = '900 14px Inter'
  ctx.fillStyle = COLORS.muted
  ctx.fillText('SI TERMINA', PAD + 30, tableY + 34)
  ctx.fillText('GANA EL BOTE', PAD + 345, tableY + 34)

  rows.forEach((fila, i) => {
    const y = tableY + 56 + i * 48
    const current = i === 0
    if (current) {
      ctx.fillStyle = 'rgba(239,68,68,0.16)'
      ctx.fillRect(PAD, y, W - PAD * 2, 48)
    }
    fillRound(ctx, PAD + 30, y + 9, 300, 30, 8, current ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.05)', current ? 'rgba(239,68,68,0.8)' : COLORS.border2)
    ctx.font = '900 18px Inter'
    ctx.fillStyle = current ? COLORS.redLight : COLORS.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(escenarioLabel(fila.esc, partido), PAD + 180, y + 25)
    ctx.textAlign = 'left'
    ctx.font = '900 28px Inter'
    ctx.fillStyle = COLORS.purpleLight
    const winnerText = fila.lideres.map(n => shortName(n, 2)).join(' + ')
    ctx.fillText(truncate(ctx, winnerText, 470), PAD + 345, y + 31)
    if (fila.empate) {
      ctx.font = '800 19px Inter'
      ctx.fillStyle = COLORS.muted
      ctx.fillText('(empate)', PAD + 345 + Math.min(470, ctx.measureText(winnerText).width) + 10, y + 31)
    }
    if (current) {
      fillRound(ctx, W - PAD - 116, y + 10, 86, 28, 999, 'rgba(239,68,68,0.24)')
      ctx.font = '900 13px Inter'
      ctx.fillStyle = COLORS.redLight
      ctx.textAlign = 'center'
      ctx.fillText('Ahora', W - PAD - 73, y + 25)
      ctx.textAlign = 'left'
    }
    ctx.textBaseline = 'alphabetic'
  })

  ctx.font = '500 18px Inter'
  ctx.fillStyle = COLORS.dim
  ctx.fillText('Ganar suma más puntos; el empate reparte el bote. Todo se define esta noche.', PAD, 848)
  drawFooter(ctx, quiniela, 'purple')
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
  if (abierta) drawOpenImage(ctx, datos.quiniela, datos.jugadores ?? [])
  else drawRankingImage(ctx, datos)
  return blobFromCanvas(canvas)
}

export async function generarImagenOraculo(datos) {
  await waitFonts()
  const { canvas, ctx } = setupCanvas()
  drawOracleImage(ctx, datos)
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
