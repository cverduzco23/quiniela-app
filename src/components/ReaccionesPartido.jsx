import { useState, useEffect } from 'react'
import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'

// Reacciones por partido en el ranking. Una reacción por persona por partido,
// recordada en este dispositivo; los conteos viven en la subcolección
// quinielas/{id}/reacciones/{idxPartido} y se refrescan con el mismo polling
// puntual del ranking (sin listeners, consistente con el fix de iOS).
// Las claves son ASCII porque los emojis no son field paths seguros.
const REACCIONES = [
  { key: 'gol',      emoji: '⚽',     label: 'Golazo' },
  { key: 'fuego',    emoji: '\u{1F525}',  label: 'Encendido' },
  { key: 'tristeza', emoji: '\u{1F62D}',  label: 'Dolor' },
  { key: 'sorpresa', emoji: '\u{1F631}',  label: 'Sorpresa' },
]

function storageKey(quinielaId, partidoIdx) {
  return `quiniela-${quinielaId}-reaccion-${partidoIdx}`
}

export function ReaccionesPartido({ quinielaId, partidoIdx, conteos }) {
  const [miReaccion, setMiReaccion] = useState(() => {
    try { return localStorage.getItem(storageKey(quinielaId, partidoIdx)) } catch { return null }
  })
  // Ajuste optimista sobre los conteos del servidor: el tap se refleja al
  // instante y el siguiente polling reconcilia con la verdad del servidor.
  const [delta, setDelta] = useState({})
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDelta({}) }, [conteos])

  const reaccionar = (key) => {
    const cambios = {}
    let siguiente
    if (miReaccion === key) {
      cambios[key] = increment(-1)
      siguiente = null
    } else {
      cambios[key] = increment(1)
      if (miReaccion) cambios[miReaccion] = increment(-1)
      siguiente = key
    }
    setDelta(prev => {
      const d = { ...prev }
      if (miReaccion) d[miReaccion] = (d[miReaccion] ?? 0) - 1
      if (siguiente) d[siguiente] = (d[siguiente] ?? 0) + 1
      return d
    })
    setMiReaccion(siguiente)
    try {
      if (siguiente) localStorage.setItem(storageKey(quinielaId, partidoIdx), siguiente)
      else localStorage.removeItem(storageKey(quinielaId, partidoIdx))
    } catch { /* localStorage no disponible */ }
    // Silencioso: si la escritura falla (sin red, conteo en cero), el polling
    // siguiente corrige la vista. No interrumpimos el partido por una reacción.
    setDoc(doc(db, 'quinielas', quinielaId, 'reacciones', String(partidoIdx)), cambios, { merge: true })
      .catch(() => {})
  }

  return (
    <div className="ranking-reactions" onClick={e => e.stopPropagation()}>
      {REACCIONES.map(r => {
        const n = Math.max(0, (conteos?.[r.key] ?? 0) + (delta[r.key] ?? 0))
        const activa = miReaccion === r.key
        return (
          <button
            key={r.key}
            type="button"
            className={`ranking-reaction-chip${activa ? ' is-active' : ''}`}
            onClick={() => reaccionar(r.key)}
            aria-pressed={activa}
            aria-label={`Reaccionar: ${r.label}`}
            title={r.label}
          >
            <span aria-hidden="true">{r.emoji}</span>
            {n > 0 && <span className="ranking-reaction-count">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
