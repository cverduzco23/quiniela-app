// Generador de predicciones de prueba para cargar una quiniela con N usuarios falsos.
//
// USO:
//   node scripts/generar-predicciones.mjs <quinielaId> [codigoAcceso] [cantidad]
//   node scripts/generar-predicciones.mjs <quinielaId> --limpiar
//
// Ejemplos:
//   node scripts/generar-predicciones.mjs aBcD123 1234 100   # 100 predicciones
//   node scripts/generar-predicciones.mjs aBcD123 --limpiar  # borra todas
//
// El script usa el SDK web (mismo cliente que un usuario real), por lo que
// pasa por las reglas de Firestore — si las reglas rechazan algo, lo verás
// como error y sabrás que en producción también fallaría.

import { initializeApp } from 'firebase/app'
import {
  getFirestore, doc, getDoc, addDoc, collection,
  getDocs, query, where, deleteDoc,
} from 'firebase/firestore'

// Misma config pública que la app
const firebaseConfig = {
  apiKey: 'AIzaSyCF6AEc1nXs_cu6rXUqoQILl-kkAg2ThBQ',
  authDomain: 'quiniela-app-24896.firebaseapp.com',
  projectId: 'quiniela-app-24896',
  storageBucket: 'quiniela-app-24896.firebasestorage.app',
  messagingSenderId: '411488784610',
  appId: '1:411488784610:web:bc65b7f1ca87258e3a0ebb',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Pool grande de nombres y apellidos mexicanos comunes — suficiente para >200 únicos
const NOMBRES = [
  'Carlos','María','José','Ana','Juan','Luis','Sofía','Miguel','Laura','Pedro',
  'Diego','Elena','Roberto','Patricia','Fernando','Andrea','Javier','Gabriela','Alberto','Isabel',
  'Manuel','Carmen','Daniel','Lucía','Antonio','Mariana','Ricardo','Verónica','Eduardo','Adriana',
  'Sergio','Mónica','Arturo','Claudia','Raúl','Beatriz','Rodrigo','Paola','Alejandro','Karen',
  'Hugo','Daniela','Pablo','Sandra','Óscar','Rosa','Mauricio','Diana','Jorge','Alejandra',
  'Iván','Susana','Andrés','Brenda','Esteban','Yolanda','Felipe','Cristina','Gerardo','Norma',
  'Adrián','Leticia','Joaquín','Estela','Rubén','Silvia','Tomás','Margarita','Vicente','Lupita',
]

const APELLIDOS = [
  'González','Rodríguez','García','Hernández','López','Martínez','Sánchez','Pérez','Ramírez','Cruz',
  'Torres','Flores','Rivera','Vargas','Reyes','Gómez','Díaz','Jiménez','Romero','Vega',
  'Mendoza','Ortiz','Castillo','Morales','Aguilar','Ríos','Ruiz','Álvarez','Castro','Núñez',
  'Medina','Guerrero','Herrera','Acosta','Cortez','Delgado','Estrada','Fuentes','Salazar','Soto',
  'Velázquez','Espinoza','Padilla','Valdez','Cabrera','Navarro','Domínguez','Peña','Carrillo','Maldonado',
]

const argv = process.argv.slice(2)
const quinielaId = argv[0]
const arg2 = argv[1]
const arg3 = argv[2]

if (!quinielaId) {
  console.error('Uso: node scripts/generar-predicciones.mjs <quinielaId> [codigoAcceso] [cantidad=100]')
  console.error('     node scripts/generar-predicciones.mjs <quinielaId> --limpiar')
  process.exit(1)
}

async function limpiar() {
  console.log(`🗑  Buscando predicciones de la quiniela ${quinielaId}…`)
  const snap = await getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId)))
  console.log(`Encontradas: ${snap.size}`)
  if (snap.size === 0) {
    console.log('Nada que borrar.')
    return
  }
  let borradas = 0, fallos = 0
  // Borrar en lotes paralelos para ir rápido
  const docs = [...snap.docs]
  const batchSize = 20
  for (let i = 0; i < docs.length; i += batchSize) {
    const lote = docs.slice(i, i + batchSize)
    await Promise.all(lote.map(d =>
      deleteDoc(doc(db, 'predicciones', d.id))
        .then(() => borradas++)
        .catch(e => { fallos++; if (fallos <= 3) console.error('  Error:', e.message) })
    ))
    process.stdout.write(`\r  Progreso: ${borradas + fallos}/${snap.size}`)
  }
  console.log(`\n✓ Listo. Borradas: ${borradas}. Errores: ${fallos}.`)
  console.log('NOTA: si hay errores, probablemente sea por reglas — solo super-admin o owner pueden borrar.')
}

function nombreAleatorio(usados, requiereDosApellidos) {
  for (let intento = 0; intento < 5000; intento++) {
    const n  = NOMBRES[Math.floor(Math.random() * NOMBRES.length)]
    const a1 = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]
    const a2 = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)]
    const full = requiereDosApellidos ? `${n} ${a1} ${a2}` : `${n} ${a1}`
    if (a1 !== a2 && !usados.has(full)) {
      usados.add(full)
      return full
    }
  }
  throw new Error('No pude generar suficientes nombres únicos. Aumenta el pool.')
}

function picksAleatorios(numPartidos) {
  // Distribución más realista: la mayoría de los marcadores son 0-3 goles
  const picks = {}
  for (let i = 0; i < numPartidos; i++) {
    picks[i] = {
      local:     String(Math.floor(Math.random() * 4)),
      visitante: String(Math.floor(Math.random() * 4)),
    }
  }
  return picks
}

async function generar() {
  const codigoAcceso = arg2 && !arg2.startsWith('--') ? arg2 : null
  const cantidad     = parseInt(arg3 ?? '100', 10)

  // Cargar la quiniela para saber cuántos partidos tiene
  const qSnap = await getDoc(doc(db, 'quinielas', quinielaId))
  if (!qSnap.exists()) {
    console.error(`❌ Quiniela no encontrada: ${quinielaId}`)
    process.exit(1)
  }
  const quiniela = qSnap.data()
  const numPartidos = (quiniela.partidos ?? []).length
  const requiereCodigo = !!(quiniela.codigoAcceso ?? '').trim()

  console.log(`📋 Quiniela: ${quiniela.nombre}`)
  console.log(`   Partidos: ${numPartidos}`)
  console.log(`   Requiere código: ${requiereCodigo ? 'sí' : 'no'}`)
  console.log(`   Requiere apellido: ${quiniela.requiereApellido ? 'sí' : 'no'}`)
  console.log(`   Cerrada: ${quiniela.cerrada || quiniela.finalizada ? 'sí (inserts van a fallar)' : 'no'}`)

  if (requiereCodigo && !codigoAcceso) {
    console.error(`❌ Esta quiniela requiere código. Pásalo como segundo argumento.`)
    process.exit(1)
  }

  console.log(`\n🚀 Generando ${cantidad} predicciones…`)

  const usados = new Set()
  // Cargar nombres existentes para no chocar
  try {
    const existentes = await getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId)))
    existentes.docs.forEach(d => usados.add(d.data().nombre))
    if (usados.size > 0) console.log(`(ya hay ${usados.size} predicciones; los nombres no se repetirán)`)
  } catch { /* noop */ }

  let ok = 0, fail = 0
  const errores = []
  const batchSize = 10
  for (let i = 0; i < cantidad; i += batchSize) {
    const lote = []
    for (let j = 0; j < batchSize && i + j < cantidad; j++) {
      const nombre = nombreAleatorio(usados, quiniela.requiereApellido)
      const picks  = picksAleatorios(numPartidos)
      const docPred = { quinielaId, nombre, picks, fecha: new Date().toISOString() }
      if (codigoAcceso) docPred.codigoAcceso = codigoAcceso
      lote.push(
        addDoc(collection(db, 'predicciones'), docPred)
          .then(() => ok++)
          .catch(e => { fail++; if (errores.length < 5) errores.push(e.message) })
      )
    }
    await Promise.all(lote)
    process.stdout.write(`\r  Progreso: ${ok}/${cantidad} (errores: ${fail})  `)
  }
  console.log(`\n✓ Listo. Creadas: ${ok}. Errores: ${fail}.`)
  if (errores.length > 0) {
    console.log('\nPrimeros errores:')
    errores.forEach(e => console.log('  -', e))
  }
}

const main = arg2 === '--limpiar' ? limpiar : generar
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
