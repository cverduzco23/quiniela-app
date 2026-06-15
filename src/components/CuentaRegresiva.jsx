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
 *   - prefijo:     texto antes del contador (default "⏳ Cierra en").
 *   - estilo:      estilos extra para el contenedor.
 */
const UMBRAL_HORAS_DEFAULT = 24

function partes(ms) {
  const totalSeg = Math.floor(ms / 1000)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  const pad = n => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function CuentaRegresiva({ cierre, umbralHoras = UMBRAL_HORAS_DEFAULT, prefijo = '⏳ Cierra en', estilo }) {
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
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
        padding: '4px 10px', borderRadius: 'var(--radius-full)',
        background: critico ? 'var(--red-bg-strong)' : 'var(--yellow-bg)',
        color: critico ? '#FCA5A5' : 'var(--yellow)',
        border: `1px solid ${critico ? 'var(--red)' : 'var(--yellow-soft)'}`,
        fontVariantNumeric: 'tabular-nums',
        ...estilo,
      }}
    >
      {prefijo} {partes(ms)}
    </span>
  )
}
