import { useEffect, useState } from 'react'
import { collection, doc, getCountFromServer, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'

function viewerIdDispositivo() {
  const key = 'quinielapp-stream-viewer-id'
  try {
    const existente = localStorage.getItem(key)
    if (existente) return existente
    const nuevo = globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, nuevo)
    return nuevo
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

// Contador de espectadores de una transmisión. Lo comparten la pantalla
// /stream y el reproductor embebido en el ranking, para que ambos cuenten
// sobre la misma subcolección y el número sea el mismo en las dos vistas.
export function useStreamPresence(quinielaId, partidoIdx, opcion) {
  const [conteo, setConteo] = useState(0)

  useEffect(() => {
    if (!quinielaId || !Number.isInteger(partidoIdx) || partidoIdx < 0) return
    let activo = true
    let interval = null
    const viewerId = viewerIdDispositivo()
    const activosRef = collection(
      db, 'quinielas', quinielaId, 'streamViewers', String(partidoIdx), 'streamActivos',
    )
    const miRef = doc(activosRef, viewerId)

    const tick = async () => {
      try {
        const ahora = Date.now()
        await setDoc(miRef, {
          ultimaActividad: serverTimestamp(),
          expira: Timestamp.fromMillis(ahora + 5 * 60 * 1000),
          opcion,
        })
        const desde = Timestamp.fromMillis(ahora - 250 * 1000)
        const snap = await getCountFromServer(query(activosRef, where('ultimaActividad', '>=', desde)))
        if (activo) setConteo(snap.data().count)
      } catch {
        // El video sigue funcionando aunque el contador no esté disponible.
      }
    }
    const iniciar = () => {
      if (interval || document.hidden) return
      tick()
      interval = setInterval(tick, 2 * 60 * 1000)
    }
    const detener = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const alCambiarVisibilidad = () => document.hidden ? detener() : iniciar()

    iniciar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      activo = false
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [quinielaId, partidoIdx, opcion])

  return conteo
}
