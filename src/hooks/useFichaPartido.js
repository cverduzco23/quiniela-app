import { useEffect, useState } from 'react'
import { obtenerFichaPartido } from '../utils/resumenPartido'

// La ficha completa se pide únicamente para el partido abierto de escritorio.
// Antes y durante el juego la renovamos con baja frecuencia para incorporar
// sede, árbitro y alineaciones apenas ESPN los publique.
export function useFichaPartido(partido, activo, actualizar = false) {
  const ligaId = partido?.ligaId
  const espnId = partido?.espnId
  const clave = activo && ligaId && espnId ? `${ligaId}:${espnId}` : null
  const [resuelto, setResuelto] = useState(null)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    const cargar = refrescar => {
      obtenerFichaPartido(ligaId, espnId, { refrescar })
        .then(ficha => { if (vivo) setResuelto({ clave, ficha }) })
        .catch(() => { if (vivo) setResuelto({ clave, ficha: null }) })
    }
    cargar(false)
    const intervalo = actualizar
      ? window.setInterval(() => cargar(true), 5 * 60 * 1000)
      : null
    return () => {
      vivo = false
      if (intervalo) window.clearInterval(intervalo)
    }
  }, [actualizar, clave, ligaId, espnId])

  return resuelto?.clave === clave ? resuelto.ficha : null
}
