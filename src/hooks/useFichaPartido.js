import { useEffect, useState } from 'react'
import { obtenerFichaPartido } from '../utils/resumenPartido'

// La ficha completa se pide únicamente para el partido abierto de escritorio.
// Así obtenemos sede, árbitro y alineaciones sin sumar llamadas al polling.
export function useFichaPartido(partido, activo) {
  const ligaId = partido?.ligaId
  const espnId = partido?.espnId
  const clave = activo && ligaId && espnId ? `${ligaId}:${espnId}` : null
  const [resuelto, setResuelto] = useState(null)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    obtenerFichaPartido(ligaId, espnId)
      .then(ficha => { if (vivo) setResuelto({ clave, ficha }) })
      .catch(() => { if (vivo) setResuelto({ clave, ficha: null }) })
    return () => { vivo = false }
  }, [clave, ligaId, espnId])

  return resuelto?.clave === clave ? resuelto.ficha : null
}
