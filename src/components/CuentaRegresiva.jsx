import { useState, useEffect } from 'react'
import { cierreToDate } from '../utils/cierre'

/**
 * Contador en vivo (horas:minutos:segundos) hasta el cierre de una quiniela.
 *
 * Solo se muestra cuando faltan menos de `umbralHoras` para el cierre (por
 * defecto 12h). Fuera de ese rango, o si ya cerró/no tiene cierre, devuelve null
 * para que el caller muestre su contenido normal (ej. "Cierra: fecha").
 *
 * Props:
 *   - cierre:      valor de cierre de la quiniela (Timestamp | ISO | null).
 *   - umbralHoras: a partir de cuántas horas antes empieza a verse (default 12).
 *   - prefijo:     texto antes del contador (default "Cierra en").
 *   - estilo:      estilos extra para el contenedor.
 *   - mostrarIcono: muestra/oculta el icono del contador en la variante pill.
 */
const UMBRAL_HORAS_DEFAULT = 24

function TimerIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M5 3 2 6" />
      <path d="m22 6-3-3" />
      <path d="M8 21h8" />
    </svg>
  )
}

function partes(ms) {
  const totalSeg = Math.floor(ms / 1000)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  const pad = n => String(n).padStart(2, '0')
  return { h: pad(h), m: pad(m), s: pad(s), texto: `${pad(h)}:${pad(m)}:${pad(s)}` }
}

// Igual que partes(), pero separa los días completos cuando faltan 24h o más
// (ej. "1d 02:37:01" en vez de "26:37:01").
function partesConDias(ms) {
  const totalSeg = Math.floor(ms / 1000)
  const dias = Math.floor(totalSeg / 86400)
  const h = Math.floor((totalSeg % 86400) / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  const pad = n => String(n).padStart(2, '0')
  return { dias, h: pad(h), m: pad(m), s: pad(s) }
}

function PanelTimeBlock({ val, label, color }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <span style={{ display: 'inline-block', minWidth: '2ch', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--timer-panel-number-size, 34px)', fontWeight: 800, color, letterSpacing: 0, lineHeight: 0.95 }}>
        {val}
      </span>
      <span style={{ marginTop: 'var(--timer-panel-label-gap, 7px)', color: 'var(--muted)', fontSize: 'var(--timer-panel-unit-size, 9px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </span>
    </span>
  )
}

function PanelSeparator() {
  return (
    <span aria-hidden="true" style={{ width: 6, height: 'var(--timer-panel-separator-height, 32px)', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--timer-panel-separator-gap, 7px)', flexShrink: 0 }}>
      <span style={{ width: 'var(--timer-panel-dot-size, 3.5px)', height: 'var(--timer-panel-dot-size, 3.5px)', borderRadius: '50%', background: 'rgba(148,163,184,0.78)' }} />
      <span style={{ width: 'var(--timer-panel-dot-size, 3.5px)', height: 'var(--timer-panel-dot-size, 3.5px)', borderRadius: '50%', background: 'rgba(148,163,184,0.78)' }} />
    </span>
  )
}

export function CuentaRegresiva({ cierre, umbralHoras = UMBRAL_HORAS_DEFAULT, prefijo = 'Cierra en', estilo, variante = 'pill', mostrarIcono = true }) {
  // Tick cada segundo para refrescar el contador.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const i = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const d = cierreToDate(cierre)
  if (!d) return null
  const ms = d.getTime() - ahora
  if (ms <= 0) return null
  if (ms > umbralHoras * 60 * 60 * 1000) return null

  // Tono según urgencia: rojo en la última hora, amarillo antes.
  const critico = ms < 60 * 60 * 1000
  const p = partes(ms)
  if (variante === 'linea') {
    const pd = partesConDias(ms)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontVariantNumeric: 'tabular-nums', ...estilo }}>
        {mostrarIcono && <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><TimerIcon size={13} /></span>}
        {prefijo && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {prefijo}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
          {pd.dias > 0 && <span style={{ color: 'var(--yellow)' }}>{pd.dias}d </span>}
          <span style={{ color: 'var(--text-strong)' }}>{pd.h}</span>
          <span style={{ color: 'var(--muted)' }}>:</span>
          <span style={{ color: 'var(--text-strong)' }}>{pd.m}</span>
          <span style={{ color: 'var(--muted)' }}>:</span>
          <span style={{ color: critico ? '#FCA5A5' : 'var(--yellow)' }}>{pd.s}</span>
        </span>
      </span>
    )
  }

  if (variante === 'panel') {
    return (
      <div style={{ ...estilo }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 'var(--timer-panel-title-size, 10px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.3, marginBottom: 'var(--timer-panel-title-gap, 8px)' }}>
          <TimerIcon size={13} />
          {prefijo}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 6px auto 6px auto', alignItems: 'start', columnGap: 'var(--timer-panel-column-gap, 7px)', width: 'fit-content', fontVariantNumeric: 'tabular-nums' }}>
          <PanelTimeBlock val={p.h} label="Hrs" color="var(--text-strong)" />
          <PanelSeparator />
          <PanelTimeBlock val={p.m} label="Min" color="var(--text-strong)" />
          <PanelSeparator />
          <PanelTimeBlock val={p.s} label="Seg" color={critico ? '#FCA5A5' : 'var(--yellow)'} />
        </div>
      </div>
    )
  }

  const accent = critico ? '#FCA5A5' : 'var(--yellow)'
  const simplePill = !prefijo && !mostrarIcono
  if (simplePill) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center',
          fontVariantNumeric: 'tabular-nums',
          ...estilo,
        }}
      >
        {p.texto}
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 800, letterSpacing: 0.2,
        padding: '5px 11px', borderRadius: 'var(--radius-full)',
        background: critico
          ? 'linear-gradient(135deg, rgba(127,29,29,0.28), rgba(15,23,42,0.62))'
          : 'linear-gradient(135deg, rgba(15,23,42,0.86), rgba(30,41,59,0.62))',
        color: accent,
        border: `1px solid ${critico ? 'rgba(248,113,113,0.65)' : 'rgba(250,204,21,0.58)'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        fontVariantNumeric: 'tabular-nums',
        ...estilo,
      }}
    >
      {mostrarIcono && <span style={{ display: 'inline-flex', color: accent }}><TimerIcon size={13} /></span>}
      {prefijo && <span style={{ color: 'var(--muted)', fontWeight: 800 }}>{prefijo}</span>}
      <span style={{ color: accent, fontWeight: 900 }}>{p.texto}</span>
    </span>
  )
}
