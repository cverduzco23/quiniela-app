import { useEffect, useState } from 'react'
import { obtenerResumenPartido } from '../utils/resumenPartido'

// Busca el resumen en video de un partido, solo cuando `activo` lo pide (es
// decir, cuando el usuario tiene ese partido abierto y ya no hay estadísticas
// que mostrar). El resultado se guarda por partido, así que ir y venir entre
// tarjetas del carrusel no vuelve a pedirlo.
export function useResumenPartido(partido, activo) {
  const ligaId = partido?.ligaId
  const espnId = partido?.espnId
  const clave = activo && ligaId && espnId ? `${ligaId}:${espnId}` : null
  // El estado guarda la clave con la que se resolvió: si no coincide con la
  // actual, es que todavía estamos pidiendo la del partido nuevo.
  const [resuelto, setResuelto] = useState(null)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    obtenerResumenPartido(ligaId, espnId)
      .then(resumen => { if (vivo) setResuelto({ clave, resumen }) })
      .catch(() => { if (vivo) setResuelto({ clave, resumen: null }) })
    return () => { vivo = false }
  }, [clave, ligaId, espnId])

  const listo = !!clave && resuelto?.clave === clave
  return {
    cargando: !!clave && !listo,
    resumen: listo ? resuelto.resumen : null,
  }
}
