import { useEffect, useState } from 'react'

// Ancho a partir del cual el ranking usa el layout de escritorio (dos columnas,
// carrusel de partidos y transmisión embebida). Debe coincidir con el
// `@media (min-width: 1024px)` de index.css: el marcado nuevo solo se monta
// arriba de este ancho, así que móvil y tablet quedan exactamente como estaban.
export const ANCHO_ESCRITORIO = 1024

// `matchMedia` se evalúa contra el viewport real, igual que el media query CSS.
export function useEscritorio(ancho = ANCHO_ESCRITORIO) {
  const consulta = `(min-width: ${ancho}px)`
  const [esEscritorio, setEsEscritorio] = useState(
    () => globalThis.matchMedia?.(consulta).matches ?? false,
  )

  useEffect(() => {
    const mq = globalThis.matchMedia?.(consulta)
    if (!mq) return
    const alCambiar = e => setEsEscritorio(e.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [consulta])

  return esEscritorio
}
