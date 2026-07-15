// Temporadas: tabla acumulada de un grupo de quinielas del mismo organizador.
//
// La tabla general se recalcula COMPLETA (idempotente) cada vez que cambia
// algo relevante de una quiniela con temporada: finaliza, se corrigen
// resultados, entra o sale de la temporada, se oculta un participante o el
// organizador renombra a alguien. Ver la tabla cuesta 1 lectura (el doc de
// la temporada ya trae todo).
//
// Identidad: el nombre del participante (agrupado sin distinguir mayúsculas
// ni espacios extra). El formulario de predicciones ofrece elegir el nombre
// del roster de la temporada para que no haya variantes; si aun así las hay,
// el organizador renombra al participante en la quiniela y este recálculo
// las une retroactivamente.

import { onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Scoring mínimo (copia de src/utils/scoring.js: 1 pt resultado, +2 exacto;
// cancelados no cuentan). Solo se usa sobre resultados guardados, sin live.
function goalsToResultado(local, visitante) {
  const l = Number(local), v = Number(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

function getResultado(r) {
  if (!r) return null
  if (r.resultado) return r.resultado
  return goalsToResultado(r.local, r.visitante)
}

function getPickResultado(pick) {
  if (!pick) return null
  if (typeof pick === 'object') return goalsToResultado(pick.local, pick.visitante)
  return pick
}

function calcularPuntos(picks, resultados, partidos) {
  let puntos = 0, aciertos = 0, exactos = 0
  ;(partidos ?? []).forEach((p, i) => {
    const res = resultados?.[i] ?? resultados?.[String(i)] ?? null
    if (!res || res.cancelado) return
    const pick = picks?.[i] ?? picks?.[String(i)]
    if (!pick) return
    const resR = getResultado(res)
    const pickR = getPickResultado(pick)
    if (!resR || !pickR) return
    if (resR === pickR) {
      puntos += 1; aciertos++
      if (typeof pick === 'object' && pick !== null &&
          Number(res.local) === Number(pick.local) &&
          Number(res.visitante) === Number(pick.visitante)) {
        puntos += 2; exactos++
      }
    }
  })
  return { puntos, aciertos, exactos }
}

function claveNombre(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX')
}

async function recalcularTemporada(db, temporadaId) {
  if (!temporadaId) return
  const temporadaRef = db.collection('temporadas').doc(temporadaId)
  const temporadaSnap = await temporadaRef.get()
  if (!temporadaSnap.exists) return

  const quinielasSnap = await db.collection('quinielas')
    .where('temporadaId', '==', temporadaId)
    .get()

  const acumulado = new Map()
  let jornadasJugadas = 0
  const jornadas = []

  for (const qDoc of quinielasSnap.docs) {
    const q = qDoc.data()
    jornadas.push({ id: qDoc.id, nombre: q.nombre ?? '', finalizada: q.finalizada === true })
    if (q.finalizada !== true) continue
    jornadasJugadas++

    const predsSnap = await db.collection('predicciones')
      .where('quinielaId', '==', qDoc.id)
      .get()
    const ocultos = q.ocultos ?? []
    predsSnap.docs.forEach(pDoc => {
      if (ocultos.includes(pDoc.id)) return
      const pred = pDoc.data()
      const clave = claveNombre(pred.nombre)
      if (!clave) return
      const pts = calcularPuntos(pred.picks, q.resultados ?? {}, q.partidos ?? [])
      const previo = acumulado.get(clave) ?? { nombre: String(pred.nombre ?? '').trim(), puntos: 0, aciertos: 0, exactos: 0, jornadas: 0 }
      previo.puntos += pts.puntos
      previo.aciertos += pts.aciertos
      previo.exactos += pts.exactos
      previo.jornadas += 1
      acumulado.set(clave, previo)
    })
  }

  const tabla = [...acumulado.values()].sort((a, b) =>
    b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos || a.nombre.localeCompare(b.nombre, 'es'))

  await temporadaRef.update({
    tabla,
    jornadas,
    jornadasJugadas,
    totalQuinielas: quinielasSnap.size,
    actualizada: FieldValue.serverTimestamp(),
  })
  logger.info(`Temporada ${temporadaId} recalculada: ${tabla.length} jugadores, ${jornadasJugadas} jornadas`)
}

// Cambios en una quiniela: recalcular su(s) temporada(s) cuando lo que cambió
// afecta la tabla. Si la quiniela cambió de temporada, se recalculan ambas.
export const actualizarTemporada = onDocumentUpdated('quinielas/{quinielaId}', async (event) => {
  const antes = event.data?.before?.data() ?? {}
  const despues = event.data?.after?.data() ?? {}
  const tAntes = antes.temporadaId ?? null
  const tDespues = despues.temporadaId ?? null
  if (!tAntes && !tDespues) return

  const relevante =
    tAntes !== tDespues ||
    antes.finalizada !== despues.finalizada ||
    JSON.stringify(antes.resultados ?? {}) !== JSON.stringify(despues.resultados ?? {}) ||
    JSON.stringify(antes.ocultos ?? []) !== JSON.stringify(despues.ocultos ?? []) ||
    antes.nombre !== despues.nombre
  if (!relevante) return

  const db = getFirestore()
  try {
    const afectadas = new Set([tAntes, tDespues].filter(Boolean))
    for (const tid of afectadas) await recalcularTemporada(db, tid)
  } catch (err) {
    logger.error('actualizarTemporada falló', err)
  }
})

// Quiniela eliminada: sacar sus puntos de la tabla de su temporada.
export const temporadaAlEliminarQuiniela = onDocumentDeleted('quinielas/{quinielaId}', async (event) => {
  const data = event.data?.data() ?? {}
  if (!data.temporadaId) return
  const db = getFirestore()
  try {
    await recalcularTemporada(db, data.temporadaId)
  } catch (err) {
    logger.error('temporadaAlEliminarQuiniela falló', err)
  }
})

// Participante renombrado por el organizador: si su quiniela pertenece a una
// temporada ya finalizada, unificar retroactivamente en la tabla general.
export const temporadaAlRenombrar = onDocumentUpdated('predicciones/{prediccionId}', async (event) => {
  const antes = event.data?.before?.data() ?? {}
  const despues = event.data?.after?.data() ?? {}
  if (antes.nombre === despues.nombre || !despues.quinielaId) return
  const db = getFirestore()
  try {
    const qSnap = await db.collection('quinielas').doc(despues.quinielaId).get()
    const q = qSnap.data() ?? {}
    if (q.temporadaId && q.finalizada === true) await recalcularTemporada(db, q.temporadaId)
  } catch (err) {
    logger.error('temporadaAlRenombrar falló', err)
  }
})
