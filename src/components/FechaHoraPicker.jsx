import { useEffect, useMemo, useRef, useState } from 'react'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function dos(n) {
  return String(n).padStart(2, '0')
}

function partes(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '')
  if (!match) return null
  return {
    year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]),
  }
}

function valorLocal({ year, month, day, hour, minute }) {
  return `${year}-${dos(month + 1)}-${dos(day)}T${dos(hour)}:${dos(minute)}`
}

function etiqueta(value) {
  const p = partes(value)
  if (!p) return 'Elige fecha y hora'
  const fecha = new Date(p.year, p.month, p.day, p.hour, p.minute)
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(fecha)
}

function mismoDia(a, b) {
  return a && b && a.year === b.year && a.month === b.month && a.day === b.day
}

export function FechaHoraPicker({ id, value, onChange, required = false }) {
  const [abierto, setAbierto] = useState(false)
  const inicial = partes(value)
  const hoy = useMemo(() => new Date(), [])
  const [vista, setVista] = useState(() => ({
    year: inicial?.year ?? hoy.getFullYear(),
    month: inicial?.month ?? hoy.getMonth(),
  }))
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = e => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    const tecla = e => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const seleccion = partes(value)
  const diasMes = new Date(vista.year, vista.month + 1, 0).getDate()
  const inicioLunes = (new Date(vista.year, vista.month, 1).getDay() + 6) % 7
  const celdas = Array.from({ length: inicioLunes + diasMes }, (_, i) => i < inicioLunes ? null : i - inicioLunes + 1)
  const base = seleccion ?? {
    year: vista.year, month: vista.month, day: 1,
    hour: 12, minute: 0,
  }

  const cambiarMes = delta => {
    const nueva = new Date(vista.year, vista.month + delta, 1)
    setVista({ year: nueva.getFullYear(), month: nueva.getMonth() })
  }

  const elegirDia = day => {
    onChange(valorLocal({ ...base, year: vista.year, month: vista.month, day }))
  }

  const cambiarHora = cambios => {
    const p = seleccion ?? {
      year: vista.year, month: vista.month, day: Math.min(hoy.getDate(), diasMes),
      hour: 12, minute: 0,
    }
    onChange(valorLocal({ ...p, ...cambios }))
  }

  const hora12 = (base.hour % 12) || 12
  const periodo = base.hour >= 12 ? 'p.m.' : 'a.m.'

  return (
    <div className={`fecha-hora-picker${abierto ? ' is-open' : ''}`} ref={ref}>
      <button
        id={id}
        type="button"
        className={`fecha-hora-trigger${!value && required ? ' is-required' : ''}`}
        onClick={() => {
          if (!abierto) {
            const p = partes(value)
            if (p) setVista({ year: p.year, month: p.month })
          }
          setAbierto(a => !a)
        }}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        <span className={!value ? 'is-placeholder' : ''}>{etiqueta(value)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></svg>
      </button>

      {abierto && (
        <div className="fecha-hora-popover" role="dialog" aria-label="Elegir fecha y hora de cierre">
          <div className="fecha-hora-calendar-head">
            <strong>{MESES[vista.month]} <span>{vista.year}</span></strong>
            <div>
              <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">‹</button>
              <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">›</button>
            </div>
          </div>

          <div className="fecha-hora-weekdays" aria-hidden="true">
            {DIAS.map((dia, i) => <span key={`${dia}-${i}`}>{dia}</span>)}
          </div>
          <div className="fecha-hora-days">
            {celdas.map((day, i) => {
              if (!day) return <span key={`empty-${i}`} />
              const fecha = { year: vista.year, month: vista.month, day }
              const seleccionado = mismoDia(fecha, seleccion)
              const esHoy = mismoDia(fecha, { year: hoy.getFullYear(), month: hoy.getMonth(), day: hoy.getDate() })
              return (
                <button
                  key={day}
                  type="button"
                  className={`${seleccionado ? 'is-selected' : ''}${esHoy ? ' is-today' : ''}`}
                  onClick={() => elegirDia(day)}
                  aria-pressed={seleccionado}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="fecha-hora-time">
            <span>Hora de cierre</span>
            <div>
              <select
                aria-label="Hora"
                value={hora12}
                onChange={e => {
                  const h = Number(e.target.value) % 12
                  cambiarHora({ hour: periodo === 'p.m.' ? h + 12 : h })
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h}>{dos(h)}</option>)}
              </select>
              <span>:</span>
              <select aria-label="Minutos" value={base.minute} onChange={e => cambiarHora({ minute: Number(e.target.value) })}>
                {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{dos(i)}</option>)}
              </select>
              <select
                aria-label="Periodo"
                value={periodo}
                onChange={e => cambiarHora({ hour: e.target.value === 'p.m.' ? (base.hour % 12) + 12 : base.hour % 12 })}
              >
                <option>a.m.</option>
                <option>p.m.</option>
              </select>
            </div>
          </div>

          <div className="fecha-hora-actions">
            <button type="button" onClick={() => {
              const ahora = new Date()
              const nuevo = { year: ahora.getFullYear(), month: ahora.getMonth(), day: ahora.getDate(), hour: base.hour, minute: base.minute }
              onChange(valorLocal(nuevo))
              setVista({ year: nuevo.year, month: nuevo.month })
            }}>Hoy</button>
            <button type="button" className="is-primary" onClick={() => setAbierto(false)} disabled={!value}>Listo</button>
          </div>
        </div>
      )}
    </div>
  )
}
