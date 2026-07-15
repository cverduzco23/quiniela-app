import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, limit, where, getDocs, addDoc, deleteDoc,
  updateDoc, doc, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import { miIdentidadEnQuiniela, asignarAliasQuiniela } from '../utils/misQuinielas'
import { contieneLenguajeVetado } from '../utils/moderacion'
import { quinielaCerrada } from '../utils/cierre'

// Comentarios por quiniela. Decisiones de diseño (2026-07-14):
// - Lecturas puntuales con polling de 60s (sin onSnapshot, consistente con el
//   fix de conexiones de iOS del ranking). El refresco incremental pide solo
//   comentarios nuevos, así que cada tick cuesta 1 lectura si no hay nada.
// - La identidad es el nombre guardado en este dispositivo (envío de
//   predicción o alias elegido); no se puede cambiar desde el chat.
// - Los usuarios no editan ni borran; el organizador (y super admin) borra.
// - `uid` viaja null hoy: queda sembrado para el Auth normal (fase 2).
const SUPER_ADMIN_UID = 'w6uc7cHowgM4Pmsya4bUHt1G3Pu2'
const MAX_TEXTO = 300
const INTERVALO_MS = 60000
const PAGINA_INICIAL = 50
const COOLDOWN_MS = 5000
const BLOQUEOS_MS = [60000, 300000, 900000]

function fechaMs(f) {
  if (!f) return 0
  if (typeof f.toMillis === 'function') return f.toMillis()
  if (f instanceof Date) return f.getTime()
  return 0
}

function horaCorta(f) {
  const ms = fechaMs(f)
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
}

function leerJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function guardarJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin storage */ }
}

export function ComentariosQuiniela({ quiniela, nombres = [] }) {
  const quinielaId = quiniela?.id
  const chatApagado = quiniela?.chatHabilitado === false
  const quinielaAbierta = !quinielaCerrada(quiniela)
  const [abierto, setAbierto] = useState(false)
  const [comentarios, setComentarios] = useState([])
  const [cargado, setCargado] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [miNombre, setMiNombre] = useState(() => (quinielaId ? miIdentidadEnQuiniela(quinielaId) : null))
  const [vistoMs, setVistoMs] = useState(() => Number(leerJSON(`quiniela-${quinielaId}-chat-visto`, 0)) || 0)
  const [reportados, setReportados] = useState(() => leerJSON(`quiniela-${quinielaId}-chat-reportados`, []))
  const ultimoMsRef = useRef(0)
  const listaRef = useRef(null)

  const user = auth.currentUser
  const esModerador = !!user && (user.uid === quiniela?.ownerUid || user.uid === SUPER_ADMIN_UID)

  // Carga inicial (últimos 50) + refresco incremental cada 60s con la pestaña
  // visible. El incremental pide solo lo posterior al último recibido.
  useEffect(() => {
    if (!quinielaId) return undefined
    let vivo = true
    const col = collection(db, 'quinielas', quinielaId, 'comentarios')

    const cargar = async () => {
      try {
        if (!ultimoMsRef.current) {
          const snap = await getDocs(query(col, orderBy('fecha', 'desc'), limit(PAGINA_INICIAL)))
          if (!vivo) return
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse()
          ultimoMsRef.current = docs.length ? fechaMs(docs[docs.length - 1].fecha) : 1
          setComentarios(docs)
        } else {
          const snap = await getDocs(query(
            col,
            where('fecha', '>', Timestamp.fromMillis(ultimoMsRef.current)),
            orderBy('fecha', 'asc'),
            limit(100),
          ))
          if (!vivo || snap.empty) return
          const nuevos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          ultimoMsRef.current = fechaMs(nuevos[nuevos.length - 1].fecha) || ultimoMsRef.current
          setComentarios(prev => {
            const ids = new Set(prev.map(c => c.id))
            return [...prev, ...nuevos.filter(c => !ids.has(c.id))]
          })
        }
      } catch { /* silencioso: el siguiente tick reintenta */ } finally {
        if (vivo) setCargado(true)
      }
    }

    cargar()
    let intervalo = null
    const start = () => { if (!intervalo) intervalo = setInterval(cargar, INTERVALO_MS) }
    const stop = () => { if (intervalo) { clearInterval(intervalo); intervalo = null } }
    const onVisibility = () => { if (document.hidden) stop(); else { cargar(); start() } }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { vivo = false; stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [quinielaId])

  // No leídos: comentarios de otros posteriores a la última vez que se abrió
  // el panel. Con el panel abierto, todo lo que llega se marca visto.
  const noLeidos = comentarios.filter(c => fechaMs(c.fecha) > vistoMs && c.nombre !== miNombre).length
  const marcarVisto = () => {
    const ultimo = comentarios.length ? fechaMs(comentarios[comentarios.length - 1].fecha) : Date.now()
    const ms = Math.max(ultimo, Date.now())
    setVistoMs(ms)
    guardarJSON(`quiniela-${quinielaId}-chat-visto`, ms)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (abierto && noLeidos > 0) marcarVisto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, comentarios.length])

  // Autoscroll al fondo cuando el panel está abierto y llegan mensajes.
  useEffect(() => {
    if (abierto && listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight
  }, [abierto, comentarios.length])

  const elegirNombre = (nombre) => {
    if (!nombre) return
    asignarAliasQuiniela(quinielaId, nombre)
    setMiNombre(miIdentidadEnQuiniela(quinielaId))
  }

  const enviar = async () => {
    const limpio = texto.trim()
    if (!limpio || enviando || !miNombre) return
    if (limpio.length > MAX_TEXTO) {
      setAviso(`Máximo ${MAX_TEXTO} caracteres.`)
      return
    }
    if (contieneLenguajeVetado(limpio)) {
      setAviso('Cuida el lenguaje: ese comentario no se puede publicar.')
      return
    }
    // Throttle local: 1 comentario cada 5s; reincidir escala el bloqueo
    // (1, 5 y 15 minutos). La Cloud Function respalda esto del lado servidor.
    const key = `quiniela-${quinielaId}-chat-envios`
    const ctl = leerJSON(key, { lastAt: 0, strikes: 0, blockedUntil: 0 })
    const ahora = Date.now()
    if (ctl.blockedUntil > ahora) {
      const seg = Math.ceil((ctl.blockedUntil - ahora) / 1000)
      setAviso(`Vas muy rápido. Espera ${seg >= 60 ? `${Math.ceil(seg / 60)} min` : `${seg} s`} para volver a comentar.`)
      return
    }
    if (ahora - ctl.lastAt < COOLDOWN_MS) {
      const strikes = Math.min(ctl.strikes + 1, BLOQUEOS_MS.length)
      const blockedUntil = ctl.strikes >= 1 ? ahora + BLOQUEOS_MS[Math.min(ctl.strikes - 1, BLOQUEOS_MS.length - 1)] : 0
      guardarJSON(key, { ...ctl, strikes, blockedUntil })
      setAviso('Vas muy rápido. Espera unos segundos entre comentarios.')
      return
    }
    setEnviando(true)
    setAviso(null)
    try {
      const ref = await addDoc(collection(db, 'quinielas', quinielaId, 'comentarios'), {
        nombre: miNombre,
        texto: limpio,
        fecha: serverTimestamp(),
        uid: user?.uid ?? null,
      })
      guardarJSON(key, { lastAt: ahora, strikes: Math.max(0, ctl.strikes - 1), blockedUntil: 0 })
      setComentarios(prev => [...prev, { id: ref.id, nombre: miNombre, texto: limpio, fecha: new Date() }])
      setTexto('')
      marcarVisto()
    } catch {
      setAviso('No se pudo enviar. Revisa tu conexión o inténtalo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  const borrar = async (c) => {
    try {
      await deleteDoc(doc(db, 'quinielas', quinielaId, 'comentarios', c.id))
      setComentarios(prev => prev.filter(x => x.id !== c.id))
    } catch { /* sin permiso o sin red */ }
  }

  const reportar = async (c) => {
    if (reportados.includes(c.id)) return
    const siguientes = [...reportados, c.id].slice(-100)
    setReportados(siguientes)
    guardarJSON(`quiniela-${quinielaId}-chat-reportados`, siguientes)
    try {
      await updateDoc(doc(db, 'quinielas', quinielaId, 'comentarios', c.id), { reportes: increment(1) })
    } catch { /* silencioso */ }
  }

  if (!quinielaId) return null

  return (
    <section className={`ranking-panel ranking-chat-panel${abierto ? ' is-open' : ''}`} aria-label="Comentarios de la quiniela">
      <button
        type="button"
        className="ranking-chat-header"
        onClick={() => { setAbierto(v => !v); if (!abierto) marcarVisto() }}
        aria-expanded={abierto}
      >
        <span className="ranking-chat-title">
          <span className="ranking-chat-title-icon" aria-hidden="true">
            💬
          </span>
          Comentarios
          {cargado && comentarios.length > 0 && (
            <span className="ranking-chat-count-wrap">
              <span className="ranking-chat-count">{comentarios.length}</span>
              {!abierto && noLeidos > 0 && <span className="ranking-chat-new-dot" aria-label="Hay comentarios nuevos" />}
            </span>
          )}
        </span>
        <span className="ranking-chat-header-side">
          <span className="ranking-chat-chevron" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </span>
      </button>

      <div className={`ranking-chat-collapse${abierto ? ' is-open' : ''}`} aria-hidden={!abierto}>
        <div className="ranking-chat-collapse-inner">
        <div className="ranking-chat-body">
          {!cargado ? (
            <p className="ranking-chat-empty">Cargando comentarios…</p>
          ) : comentarios.length === 0 && miNombre ? (
            <p className="ranking-chat-empty">Nadie ha comentado todavía. Rompe el hielo.</p>
          ) : comentarios.length > 0 ? (
            <div className="ranking-chat-list" ref={listaRef}>
              {comentarios.map(c => (
                <div key={c.id} className={`ranking-chat-msg${c.nombre === miNombre ? ' is-mine' : ''}`}>
                  <div className="ranking-chat-msg-head">
                    <span className="ranking-chat-msg-nombre">{c.nombre}</span>
                    <span className="ranking-chat-msg-hora">{horaCorta(c.fecha)}</span>
                    <span className="ranking-chat-msg-actions">
                      {esModerador && (
                        <button type="button" className="ranking-chat-msg-action" onClick={() => borrar(c)} aria-label="Borrar comentario" title="Borrar comentario">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                      {c.nombre !== miNombre && (
                        reportados.includes(c.id) ? (
                          <span className="ranking-chat-msg-reportado">Reportado</span>
                        ) : (
                          <button type="button" className="ranking-chat-msg-action" onClick={() => reportar(c)} aria-label="Reportar comentario" title="Reportar comentario">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                            </svg>
                          </button>
                        )
                      )}
                    </span>
                  </div>
                  <p className="ranking-chat-msg-texto">{c.texto}</p>
                </div>
              ))}
            </div>
          ) : null}

          {chatApagado ? (
            <p className="ranking-chat-nota">El organizador desactivó los comentarios de esta quiniela.</p>
          ) : miNombre ? (
            <div className="ranking-chat-composer">
              <input
                type="text"
                value={texto}
                maxLength={MAX_TEXTO}
                onChange={e => { setTexto(e.target.value); if (aviso) setAviso(null) }}
                onKeyDown={e => { if (e.key === 'Enter') enviar() }}
                placeholder={`Comenta como ${miNombre}...`}
                aria-label="Escribe un comentario"
              />
              <button
                type="button"
                className="ranking-chat-send"
                onClick={enviar}
                disabled={enviando || !texto.trim()}
                aria-label="Enviar comentario"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
          ) : nombres.length > 0 ? (
            <div className="ranking-chat-identidad">
              <div className="ranking-chat-identidad-prompt">
                <label htmlFor="chat-quien-eres">¿Quién eres? Elige tu nombre para comentar</label>
                {quinielaAbierta && (
                  <>
                    <span> o </span>
                    <a href={`/quiniela/${quinielaId}`}>regístrate en la quiniela</a>
                  </>
                )}
              </div>
              <select id="chat-quien-eres" defaultValue="" onChange={e => elegirNombre(e.target.value)}>
                <option value="" disabled>Selecciona tu nombre</option>
                {[...nombres].sort((a, b) => a.localeCompare(b, 'es')).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ) : (
            <p className="ranking-chat-nota">Envía tu predicción para poder comentar.</p>
          )}
          {aviso && <p className="ranking-chat-aviso" role="status">{aviso}</p>}
        </div>
        </div>
      </div>
    </section>
  )
}
