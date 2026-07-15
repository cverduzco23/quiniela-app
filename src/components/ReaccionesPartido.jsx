import { useState, useEffect } from 'react'
import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'

// Reacciones por partido en el ranking. Una reacción por persona por partido,
// recordada en este dispositivo; los conteos viven en la subcolección
// quinielas/{id}/reacciones/{idxPartido} y se refrescan con el mismo polling
// puntual del ranking (sin listeners, consistente con el fix de iOS).
// Las claves son ASCII porque los emojis no son field paths seguros.
const REACCIONES = [
  { key: 'gol',      emoji: '\u2764\uFE0F', label: 'Me encanta' },
  { key: 'fuego',    emoji: '\u{1F621}',  label: 'Enojo' },
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
    <div className="ranking-reactions">
      {REACCIONES.map(r => {
        const activa = miReaccion === r.key
        // La selección local puede persistir antes de que el conteo remoto se
        // actualice (o durante un polling atrasado). Si es la reacción propia,
        // nunca debe verse activa sin contabilizar al menos ese voto.
        const n = Math.max(activa ? 1 : 0, (conteos?.[r.key] ?? 0) + (delta[r.key] ?? 0))
        return (
          <button
            key={r.key}
            type="button"
            className={`ranking-reaction-chip${activa ? ' is-active' : ''}`}
            onClick={e => {
              e.stopPropagation()
              reaccionar(r.key)
            }}
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
