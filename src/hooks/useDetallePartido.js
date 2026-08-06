import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Detalles archivados de un partido: las estadísticas, los eventos y el
// resumen en video que la Cloud Function guardó cuando el partido terminó.
//
// Solo se pide cuando ESPN ya no los devuelve (pasados un par de días) y para
// el partido que el usuario tiene abierto en la columna de escritorio: es una
// lectura por partido visto, no por visita al ranking. El resultado se guarda
// en un caché de módulo para que ir y venir por el carrusel no vuelva a pedirlo.
const CACHE = new Map()

function leerArchivo(quinielaId, idx) {
  const clave = `${quinielaId}:${idx}`
  if (CACHE.has(clave)) return CACHE.get(clave)
  const promesa = getDoc(doc(db, 'quinielas', quinielaId, 'detalles', String(idx)))
    .then(snap => (snap.exists() ? snap.data() : null))
    .catch(() => null)
  CACHE.set(clave, promesa)
  return promesa
}

export function useDetallePartido(quinielaId, idx, activo) {
  const clave = activo && quinielaId && Number.isInteger(idx) ? `${quinielaId}:${idx}` : null
  const [resuelto, setResuelto] = useState(null)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    leerArchivo(quinielaId, idx).then(datos => { if (vivo) setResuelto({ clave, datos }) })
    return () => { vivo = false }
  }, [clave, quinielaId, idx])

  const listo = !!clave && resuelto?.clave === clave
  return {
    cargando: !!clave && !listo,
    detalle: listo ? resuelto.datos : null,
  }
}
