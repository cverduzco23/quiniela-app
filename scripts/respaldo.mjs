// Respaldo manual de Firestore a JSON (hallazgo H6 de la auditoría).
//
// Uso (requiere Node 18+, sin dependencias):
//   node scripts/respaldo.mjs             → respalda TODO (pide cuenta de super admin)
//   node scripts/respaldo.mjs --publico   → solo colecciones públicas, sin login
//
// Deja los archivos en respaldos/<fecha>/<coleccion>.json (carpeta ignorada
// por git). Correrlo mínimo antes de cada quiniela grande o cambio riesgoso.
//
// Nota: si algún día App Check se pone en modo ENFORCE para Firestore, estas
// llamadas REST necesitarían un token de App Check; en ese caso usar la
// exportación oficial (gcloud firestore export) o ajustar este script.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline'

const PROJECT_ID = 'quiniela-app-24896'
const API_KEY = 'AIzaSyCF6AEc1nXs_cu6rXUqoQILl-kkAg2ThBQ' // pública (misma que src/firebase.js)
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

const COLECCIONES_PUBLICAS = ['quinielas', 'predicciones', 'config']
const COLECCIONES_PRIVADAS = ['admins', 'bloqueados', 'movimientos', 'donativos', 'analytics']

// Convierte un valor del formato REST de Firestore a JSON plano legible.
function decodeValue(v) {
  if (v == null) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return v.timestampValue
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {})
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('referenceValue' in v) return v.referenceValue
  if ('geoPointValue' in v) return v.geoPointValue
  return v
}

function decodeFields(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v)
  return out
}

function preguntar(pregunta, oculto = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (oculto) {
      // No hacer eco de la contraseña en la terminal.
      rl._writeToOutput = s => { if (s.includes('\n') || s.includes(pregunta)) rl.output.write(s) }
    }
    rl.question(pregunta, respuesta => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(respuesta.trim()) })
  })
}

async function login() {
  const email = process.env.QUINIELAPP_EMAIL || await preguntar('Correo del super admin: ')
  const password = process.env.QUINIELAPP_PASSWORD || await preguntar('Contraseña: ', true)
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(`Login falló: ${d?.error?.message ?? r.status}`)
  return d.idToken
}

async function descargarColeccion(nombre, idToken) {
  const docs = []
  let pageToken = ''
  do {
    const url = `${BASE}/${nombre}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const r = await fetch(url, { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    for (const doc of d.documents ?? []) {
      docs.push({ id: doc.name.split('/').pop(), data: decodeFields(doc.fields ?? {}) })
    }
    pageToken = d.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function main() {
  const soloPublico = process.argv.includes('--publico')
  let idToken = null
  if (!soloPublico) {
    idToken = await login()
    console.log('Sesión iniciada ✓')
  }

  const fecha = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
  const carpeta = join('respaldos', fecha)
  mkdirSync(carpeta, { recursive: true })

  const colecciones = soloPublico ? COLECCIONES_PUBLICAS : [...COLECCIONES_PUBLICAS, ...COLECCIONES_PRIVADAS]
  let total = 0
  for (const col of colecciones) {
    try {
      const docs = await descargarColeccion(col, idToken)
      writeFileSync(join(carpeta, `${col}.json`), JSON.stringify(docs, null, 2))
      console.log(`  ${col}: ${docs.length} documento(s)`)
      total += docs.length
    } catch (err) {
      console.error(`  ${col}: ERROR (${err.message}). Se omite`)
    }
  }
  console.log(`\nRespaldo listo: ${carpeta} (${total} documentos en total)`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
