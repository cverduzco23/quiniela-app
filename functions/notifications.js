import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const SUPER_ADMIN_UIDS = new Set(['w6uc7cHowgM4Pmsya4bUHt1G3Pu2'])
const PRIORIDADES = new Set(['info', 'importante', 'urgente'])
const MAX_DESTINATARIOS = 200

function texto(value, maximo, nombre) {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${nombre} es obligatorio.`)
  const limpio = value.trim()
  if (limpio.length < 3 || limpio.length > maximo) {
    throw new HttpsError('invalid-argument', `${nombre} debe tener entre 3 y ${maximo} caracteres.`)
  }
  return limpio
}

function linkInterno(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'El enlace no es válido.')
  const limpio = value.trim()
  if (!limpio.startsWith('/') || limpio.startsWith('//') || limpio.length > 200) {
    throw new HttpsError('invalid-argument', 'El enlace debe ser una ruta interna válida.')
  }
  return limpio
}

function vigencia(value) {
  if (value === null || value === undefined || value === '') return null
  if (![7, 30, 90].includes(value)) throw new HttpsError('invalid-argument', 'La vigencia no es válida.')
  return Timestamp.fromMillis(Date.now() + value * 24 * 60 * 60 * 1000)
}

export const enviarAvisoAdmins = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.')
  if (!SUPER_ADMIN_UIDS.has(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Solo el super admin puede enviar anuncios.')
  }

  const data = request.data ?? {}
  const titulo = texto(data.titulo, 80, 'El título')
  const mensaje = texto(data.mensaje, 600, 'El mensaje')
  const prioridad = PRIORIDADES.has(data.prioridad) ? data.prioridad : 'info'
  const audiencia = data.audiencia === 'solo_super'
    ? 'solo_super'
    : data.audiencia === 'seleccion' ? 'seleccion' : 'todos'
  const link = linkInterno(data.link)
  const vence = vigencia(data.vigenciaDias)
  const solicitados = Array.isArray(data.destinatarios)
    ? [...new Set(data.destinatarios.filter(uid => typeof uid === 'string'))]
    : []

  const db = getFirestore()
  const adminsSnap = await db.collection('admins').get()
  const activos = adminsSnap.docs.filter(item => {
    const admin = item.data()
    return admin.activo === true && admin.eliminada !== true
  })
  const activosPorUid = new Map(activos.map(item => [item.id, item]))
  const destinatarios = audiencia === 'solo_super'
    ? []
    : audiencia === 'todos'
      ? activos
      : solicitados.map(uid => activosPorUid.get(uid)).filter(Boolean)

  if (audiencia !== 'solo_super' && destinatarios.length === 0) {
    throw new HttpsError('failed-precondition', 'No hay admins activos entre los destinatarios elegidos.')
  }
  if (destinatarios.length > MAX_DESTINATARIOS) {
    throw new HttpsError('resource-exhausted', `El máximo por envío es ${MAX_DESTINATARIOS}.`)
  }

  const avisoRef = db.collection('avisosAdmin').doc()
  const creada = FieldValue.serverTimestamp()
  const batch = db.batch()
  batch.set(avisoRef, {
    titulo,
    mensaje,
    prioridad,
    audiencia,
    destinatarios: destinatarios.map(item => item.id),
    totalDestinatarios: destinatarios.length,
    link,
    vence,
    creada,
    creadoPorUid: request.auth.uid,
    creadoPorEmail: request.auth.token.email ?? null,
    estado: 'enviado',
    esPrueba: audiencia === 'solo_super',
  })

  destinatarios.forEach(admin => {
    const notificacionRef = db.collection('notificacionesAdmin').doc(`${avisoRef.id}_${admin.id}`)
    batch.set(notificacionRef, {
      avisoId: avisoRef.id,
      destinatarioUid: admin.id,
      tipo: audiencia === 'solo_super' ? 'aviso_prueba' : 'aviso_manual',
      origen: 'super_admin',
      titulo,
      mensaje,
      prioridad,
      link,
      vence,
      creada,
      leida: false,
      leidaEn: null,
    })
  })

  // Copia de experiencia para el super admin: permite revisar exactamente la
  // misma campana, bandeja, prioridad, vigencia y enlace que ven los admins.
  // No se suma a totalDestinatarios porque no forma parte de la audiencia.
  if (!destinatarios.some(admin => admin.id === request.auth.uid)) {
    const copiaRef = db.collection('notificacionesAdmin').doc(`${avisoRef.id}_${request.auth.uid}`)
    batch.set(copiaRef, {
      avisoId: avisoRef.id,
      destinatarioUid: request.auth.uid,
      tipo: audiencia === 'solo_super' ? 'aviso_prueba' : 'aviso_manual',
      origen: 'super_admin',
      titulo,
      mensaje,
      prioridad,
      link,
      vence,
      creada,
      leida: false,
      leidaEn: null,
      esCopiaSuperAdmin: true,
      esPrueba: audiencia === 'solo_super',
    })
  }

  await batch.commit()
  return {
    avisoId: avisoRef.id,
    enviados: audiencia === 'solo_super' ? 1 : destinatarios.length,
    esPrueba: audiencia === 'solo_super',
  }
})
