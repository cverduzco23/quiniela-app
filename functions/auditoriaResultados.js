import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { cambiosResultados, indicesParaReconciliar, marcadorFinalSummary, decidirReconciliacion } from './reconciliacion.js'

// El ID del evento hace idempotentes los reintentos, sin modificar la quiniela.
export const auditarResultados = onDocumentWrittenWithAuthContext({
  document: 'quinielas/{quinielaId}', region: 'us-central1', retry: false,
}, async event => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const cambios = cambiosResultados(before?.resultados, after?.resultados)
  if (!cambios.length) return
  const registro = {
    fecha: event.time, actor: event.authId ?? null, tipoActor: event.authType ?? 'unknown',
    cambios, partidos: cambios.map(c => ({ indice: c.indice,
      partido: after?.partidos?.[c.indice] ?? before?.partidos?.[c.indice] ?? null })),
  }
  logger.info('Cambio de resultados', { quinielaId: event.params.quinielaId, ...registro })
  await getFirestore().collection('quinielas').doc(event.params.quinielaId)
    .collection('historialResultados').doc(event.id).set(registro)
})

// Sigue revisando siete días después de cada partido aunque la quiniela terminó.
// Dos consultas separadas confirman una discrepancia antes de cambiar puntos.
export const reconciliarResultados = onSchedule({
  schedule: 'every 30 minutes', timeZone: 'America/Mexico_City', region: 'us-central1',
  timeoutSeconds: 300, memory: '256MiB', maxInstances: 1, retryCount: 0,
}, async () => {
  const db = getFirestore()
  const snap = await db.collection('quinielas').get()
  const cache = new Map()
  for (const doc of snap.docs) {
    const q = doc.data()
    for (const i of indicesParaReconciliar(q)) {
      const partido = q.partidos[i]
      const key = `${partido.ligaId}/${partido.espnId}`
      try {
        if (!cache.has(key)) {
          cache.set(key, fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${partido.ligaId}/summary?event=${partido.espnId}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'curl/8.7.1' }, signal: AbortSignal.timeout(15000),
          }).then(async r => {
            if (!r.ok) throw new Error(`ESPN ${r.status}`)
            return marcadorFinalSummary(await r.json(), partido.espnId)
          }))
        }
        const oficial = await cache.get(key)
        if (!oficial) continue
        const revisionRef = doc.ref.collection('revisionResultados').doc(String(i))
        const accion = await db.runTransaction(async tx => {
          const actual = await tx.get(doc.ref)
          const rev = await tx.get(revisionRef)
          if (!actual.exists) return 'ignorar'
          const fresh = actual.data()
          if (fresh.partidos?.[i]?.espnId !== partido.espnId || fresh.partidos?.[i]?.ligaId !== partido.ligaId) return 'ignorar'
          const guardado = fresh.resultados?.[i]
          const pendiente = rev.data()
          const previo = pendiente?.espnId === partido.espnId ? pendiente : null
          const decision = decidirReconciliacion(guardado, oficial, previo)
          const fecha = new Date().toISOString()
          if (decision === 'verificar' || decision === 'corregir') {
            if (decision === 'corregir' || !guardado.verificadoEn) {
              tx.update(doc.ref, { [`resultados.${i}`]: { ...guardado, ...oficial, fuente: 'espn', verificadoEn: fecha } })
            }
            if (rev.exists) tx.delete(revisionRef)
          } else if (decision === 'confirmar' || decision === 'revisar') {
            tx.set(revisionRef, { espnId: partido.espnId, anterior: guardado, propuesto: oficial,
              primeraVez: fecha, estado: decision })
          }
          return decision
        })
        if (accion === 'corregir' || accion === 'revisar') {
          logger.warn('Revisión de marcador final', { quinielaId: doc.id, indice: i, espnId: partido.espnId, accion, oficial })
        }
      } catch (error) {
        logger.error('No se pudo reconciliar marcador', { quinielaId: doc.id, indice: i, error: error.message })
      }
    }
  }
})
