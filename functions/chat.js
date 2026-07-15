// Moderación del chat por quiniela. Se dispara con cada comentario nuevo y:
//
//   1. Borra comentarios con lenguaje vetado que hayan evadido el filtro del
//      cliente (src/utils/moderacion.js: misma lista, mantener en sync).
//   2. Silencia temporalmente (chatMuted) a quien publica demasiado rápido.
//   3. Alerta al super admin en su campana si una quiniela supera el umbral
//      de comentarios por ventana (posible spam, con cooldown de alertas).
//   4. Freno de emergencia: si una quiniela supera el tope diario, apaga su
//      chat (chatHabilitado: false) y avisa. Eso ya no es un grupo emocionado.
//
// Los umbrales viven en el doc config/chat y se pueden ajustar al momento
// sin redesplegar. También notifica al super admin y al organizador cuando
// un comentario es reportado por primera vez.

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue, FieldPath, Timestamp } from 'firebase-admin/firestore'

const SUPER_ADMIN_UIDS = ['w6uc7cHowgM4Pmsya4bUHt1G3Pu2']

// Umbrales por default; cualquier campo en config/chat los sobreescribe.
const DEFAULTS = {
  ventanaAlertaSeg: 300,   // ventana para la alerta de spam
  alertaMax: 100,          // comentarios por ventana que disparan la alerta
  cooldownAlertaMin: 60,   // no alertar de la misma quiniela más de 1 vez/hora
  frenoDiaMax: 5000,       // tope diario: se apaga el chat de esa quiniela
  muteVentanaSeg: 60,      // ventana del throttle por nombre
  muteMax: 6,              // comentarios por ventana antes de silenciar
  muteMinutos: 2,          // duración del silencio
}

// Copia de src/utils/moderacion.js (functions solo empaca esta carpeta).
const TERMINOS_VETADOS = [
  'pendejo', 'pendeja', 'pendejada', 'puto', 'puta', 'puto el', 'hijo de puta',
  'hija de puta', 'chinga tu', 'chingada madre', 'chingas a tu', 'vete a la verga',
  'verga', 'mamaverga', 'culero', 'culera', 'mierda', 'pinche', 'cabron', 'cabrona',
  'joto', 'maricon', 'marica', 'zorra', 'perra', 'malparido', 'pito', 'polla',
  'gilipollas', 'idiota', 'imbecil', 'estupido', 'estupida', 'naco de mierda',
  'mamon', 'mamona', 'ojete', 'cagada', 'chingadera', 'putiza', 'a la verga',
  'nazi', 'matate', 'suicidate', 'te voy a matar', 'los voy a matar',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'motherfucker', 'nigger',
  'faggot', 'cunt', 'whore',
]

function normalizarTextoModeracion(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function contieneLenguajeVetado(texto) {
  const normalizado = ` ${normalizarTextoModeracion(texto)} `
  if (!normalizado.trim()) return false
  return TERMINOS_VETADOS.some(term => normalizado.includes(` ${term} `) || normalizado.includes(` ${term}s `))
}

async function leerConfig(db) {
  try {
    const snap = await db.doc('config/chat').get()
    return { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) }
  } catch {
    return DEFAULTS
  }
}

// Notificación a la campana (misma forma que functions/notifications.js).
function notificar(batchOrDb, destinatarioUid, { titulo, mensaje, link }) {
  const db = batchOrDb
  const ref = db.collection('notificacionesAdmin').doc()
  return ref.set({
    avisoId: null,
    destinatarioUid,
    tipo: 'chat_alerta',
    origen: 'sistema',
    titulo,
    mensaje,
    prioridad: 'importante',
    link: link ?? null,
    vence: null,
    creada: FieldValue.serverTimestamp(),
    leida: false,
    leidaEn: null,
  })
}

export const moderarComentario = onDocumentCreated('quinielas/{quinielaId}/comentarios/{comentarioId}', async (event) => {
  const snap = event.data
  if (!snap) return
  const db = getFirestore()
  const { quinielaId } = event.params
  const data = snap.data() ?? {}

  // 1. Lenguaje vetado: borrar sin más (el cliente ya avisó en su capa).
  if (contieneLenguajeVetado(data.texto)) {
    await snap.ref.delete().catch(() => {})
    logger.info(`Comentario borrado por lenguaje en ${quinielaId}`)
    return
  }

  const cfg = await leerConfig(db)
  const ahora = Date.now()
  const col = db.collection('quinielas').doc(quinielaId).collection('comentarios')
  const quinielaRef = db.collection('quinielas').doc(quinielaId)

  try {
    // 2. Throttle por nombre: respaldo server-side del throttle del cliente.
    if (data.nombre) {
      const desdeMute = Timestamp.fromMillis(ahora - cfg.muteVentanaSeg * 1000)
      const propios = await col
        .where('nombre', '==', data.nombre)
        .where('fecha', '>', desdeMute)
        .count().get()
      if (propios.data().count > cfg.muteMax) {
        await quinielaRef.update(
          new FieldPath('chatMuted', data.nombre),
          Timestamp.fromMillis(ahora + cfg.muteMinutos * 60 * 1000),
        )
        logger.info(`Silenciado temporal de "${data.nombre}" en ${quinielaId}`)
      }
    }

    // 3 y 4. Volumen de la quiniela: alerta por ventana y freno diario.
    const desdeVentana = Timestamp.fromMillis(ahora - cfg.ventanaAlertaSeg * 1000)
    const inicioDia = new Date()
    inicioDia.setHours(0, 0, 0, 0)
    const [enVentana, enDia, quinielaSnap] = await Promise.all([
      col.where('fecha', '>', desdeVentana).count().get(),
      col.where('fecha', '>', Timestamp.fromMillis(inicioDia.getTime())).count().get(),
      quinielaRef.get(),
    ])
    const q = quinielaSnap.data() ?? {}
    const nombreQ = q.nombre || quinielaId
    const totalVentana = enVentana.data().count
    const totalDia = enDia.data().count

    if (totalDia > cfg.frenoDiaMax && q.chatHabilitado !== false) {
      await quinielaRef.update({ chatHabilitado: false })
      await Promise.all(SUPER_ADMIN_UIDS.map(uid => notificar(db, uid, {
        titulo: 'Chat apagado por volumen extremo',
        mensaje: `"${nombreQ}" superó ${cfg.frenoDiaMax} comentarios hoy (${totalDia}). Se desactivó su chat en automático; puedes reactivarlo desde el panel.`,
        link: `/ranking/${quinielaId}`,
      })))
      logger.warn(`Freno de chat en ${quinielaId}: ${totalDia} comentarios hoy`)
      return
    }

    if (totalVentana > cfg.alertaMax) {
      const ultimaAlerta = q.chatUltimaAlerta?.toMillis?.() ?? 0
      if (ahora - ultimaAlerta > cfg.cooldownAlertaMin * 60 * 1000) {
        await quinielaRef.update({ chatUltimaAlerta: FieldValue.serverTimestamp() })
        await Promise.all(SUPER_ADMIN_UIDS.map(uid => notificar(db, uid, {
          titulo: 'Actividad inusual en un chat',
          mensaje: `"${nombreQ}" lleva ${totalVentana} comentarios en ${Math.round(cfg.ventanaAlertaSeg / 60)} min. Revisa si es spam o solo un partido intenso.`,
          link: `/ranking/${quinielaId}`,
        })))
        logger.info(`Alerta de volumen de chat en ${quinielaId}: ${totalVentana}`)
      }
    }
  } catch (err) {
    logger.error('moderarComentario falló', err)
  }
})

// Reporte de comentario: al primer reporte se avisa al super admin y al
// organizador de la quiniela (si es distinto) para que revisen y decidan.
export const avisarComentarioReportado = onDocumentUpdated('quinielas/{quinielaId}/comentarios/{comentarioId}', async (event) => {
  const antes = event.data?.before?.data() ?? {}
  const despues = event.data?.after?.data() ?? {}
  const reportesAntes = antes.reportes ?? 0
  const reportesDespues = despues.reportes ?? 0
  if (!(reportesAntes === 0 && reportesDespues >= 1)) return

  const db = getFirestore()
  const { quinielaId } = event.params
  try {
    const quinielaSnap = await db.collection('quinielas').doc(quinielaId).get()
    const q = quinielaSnap.data() ?? {}
    const extracto = String(despues.texto ?? '').slice(0, 80)
    const aviso = {
      titulo: 'Comentario reportado',
      mensaje: `En "${q.nombre || quinielaId}", un comentario de "${despues.nombre}" fue reportado: "${extracto}". Puedes borrarlo desde el ranking o apagar el chat.`,
      link: `/ranking/${quinielaId}`,
    }
    const destinatarios = new Set(SUPER_ADMIN_UIDS)
    if (q.ownerUid) destinatarios.add(q.ownerUid)
    await Promise.all([...destinatarios].map(uid => notificar(db, uid, aviso)))
  } catch (err) {
    logger.error('avisarComentarioReportado falló', err)
  }
})
