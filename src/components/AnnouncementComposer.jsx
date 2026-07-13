import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { adminsActivos, esLinkInternoSeguro } from '../utils/notificaciones'

const MAX_TITULO = 80
const MAX_MENSAJE = 600

function fechaCorta(value) {
  const fecha = value?.toDate?.() ?? null
  if (!fecha) return 'Enviando…'
  return fecha.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function etiquetaPrioridad(value) {
  if (value === 'urgente') return 'Urgente'
  if (value === 'importante') return 'Importante'
  return 'Informativo'
}

function mensajeError(error) {
  if (error?.code === 'functions/permission-denied') return 'Tu sesión no tiene permiso para enviar anuncios.'
  if (error?.code === 'functions/unauthenticated') return 'Tu sesión venció. Vuelve a iniciar sesión.'
  if (error?.code === 'functions/failed-precondition') return error.message || 'No hay destinatarios disponibles.'
  return 'No se pudo enviar el anuncio. Revisa tu conexión e intenta nuevamente.'
}

export function AnnouncementComposer({ admins = [], compact = false }) {
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [prioridad, setPrioridad] = useState('info')
  const [audiencia, setAudiencia] = useState('todos')
  const [seleccionados, setSeleccionados] = useState([])
  const [link, setLink] = useState('')
  const [vigenciaDias, setVigenciaDias] = useState('30')
  const [enviando, setEnviando] = useState(false)
  const [modoConfirmacion, setModoConfirmacion] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [historialError, setHistorialError] = useState(false)

  const activos = useMemo(() => adminsActivos(admins), [admins])
  const idsActivos = useMemo(() => new Set(activos.map(admin => admin.id)), [activos])
  const destinatarios = audiencia === 'todos'
    ? activos.map(admin => admin.id)
    : seleccionados.filter(uid => idsActivos.has(uid))

  const cargarHistorial = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'avisosAdmin'), orderBy('creada', 'desc'), limit(12)))
      setHistorial(snap.docs.map(item => ({ id: item.id, ...item.data() })))
      setHistorialError(false)
    } catch {
      setHistorialError(true)
    }
  }, [])

  useEffect(() => {
    const consulta = query(collection(db, 'avisosAdmin'), orderBy('creada', 'desc'), limit(12))
    getDocs(consulta)
      .then(snap => {
        setHistorial(snap.docs.map(item => ({ id: item.id, ...item.data() })))
        setHistorialError(false)
      })
      .catch(() => setHistorialError(true))
  }, [])

  const tituloLimpio = titulo.trim()
  const mensajeLimpio = mensaje.trim()
  const linkLimpio = link.trim()
  const linkValido = esLinkInternoSeguro(linkLimpio)
  const contenidoListo = tituloLimpio.length >= 3 && mensajeLimpio.length >= 3 && linkValido
  const listo = contenidoListo && destinatarios.length > 0

  const alternarAdmin = (uid) => {
    setSeleccionados(actual => actual.includes(uid)
      ? actual.filter(item => item !== uid)
      : [...actual, uid])
    setResultado(null)
  }

  const limpiar = () => {
    setTitulo('')
    setMensaje('')
    setPrioridad('info')
    setAudiencia('todos')
    setSeleccionados([])
    setLink('')
    setVigenciaDias('30')
  }

  const enviar = async () => {
    const esPrueba = modoConfirmacion === 'prueba'
    if ((!esPrueba && !listo) || (esPrueba && !contenidoListo) || enviando) return
    setModoConfirmacion(null)
    setEnviando(true)
    setResultado(null)
    try {
      const llamar = httpsCallable(functions, 'enviarAvisoAdmins')
      const respuesta = await llamar({
        titulo: tituloLimpio,
        mensaje: mensajeLimpio,
        prioridad,
        audiencia: esPrueba ? 'solo_super' : audiencia,
        destinatarios: esPrueba || audiencia === 'todos' ? [] : destinatarios,
        link: linkLimpio || null,
        vigenciaDias: vigenciaDias ? Number(vigenciaDias) : null,
      })
      const total = respuesta.data?.enviados ?? destinatarios.length
      setResultado({
        tipo: 'ok',
        texto: esPrueba
          ? 'Prueba enviada únicamente a tu bandeja.'
          : `Anuncio enviado a ${total} ${total === 1 ? 'admin' : 'admins'}.`,
      })
      limpiar()
      cargarHistorial()
    } catch (error) {
      setResultado({ tipo: 'error', texto: mensajeError(error) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className={`announcement-console${compact ? ' is-compact' : ''}`} aria-labelledby="announcement-console-title">
      <div className="announcement-heading">
        <div>
          <span className="announcement-eyebrow">Súper admin</span>
          <h3 id="announcement-console-title">Anuncios para admins</h3>
          <p>Crea avisos internos que aparecerán en la campana de los organizadores.</p>
        </div>
        <span className="announcement-audience-count">{activos.length} activos</span>
      </div>

      <div className="announcement-form">
        <label className="announcement-field">
          <span>Título <small>{titulo.length}/{MAX_TITULO}</small></span>
          <input value={titulo} maxLength={MAX_TITULO} placeholder="Ej. Mantenimiento programado" onChange={event => { setTitulo(event.target.value); setResultado(null) }} />
        </label>

        <label className="announcement-field">
          <span>Mensaje <small>{mensaje.length}/{MAX_MENSAJE}</small></span>
          <textarea value={mensaje} maxLength={MAX_MENSAJE} rows={compact ? 4 : 5} placeholder="Escribe el aviso que recibirán los admins…" onChange={event => { setMensaje(event.target.value); setResultado(null) }} />
        </label>

        <div className="announcement-grid">
          <label className="announcement-field">
            <span>Prioridad</span>
            <select value={prioridad} onChange={event => setPrioridad(event.target.value)}>
              <option value="info">Informativo</option>
              <option value="importante">Importante</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label className="announcement-field">
            <span>Vigencia</span>
            <select value={vigenciaDias} onChange={event => setVigenciaDias(event.target.value)}>
              <option value="7">7 días</option>
              <option value="30">30 días</option>
              <option value="90">90 días</option>
              <option value="">Sin vencimiento</option>
            </select>
          </label>
        </div>

        <fieldset className="announcement-audience">
          <legend>Destinatarios</legend>
          <div className="announcement-segmented">
            <button type="button" className={audiencia === 'todos' ? 'is-active' : ''} onClick={() => { setAudiencia('todos'); setResultado(null) }}>Todos los activos</button>
            <button type="button" className={audiencia === 'seleccion' ? 'is-active' : ''} onClick={() => { setAudiencia('seleccion'); setResultado(null) }}>Elegir admins</button>
          </div>
          {audiencia === 'seleccion' && (
            <div className="announcement-admin-list">
              {activos.length === 0 && <p>No hay admins activos disponibles.</p>}
              {activos.map(admin => (
                <label key={admin.id} className="announcement-admin-option">
                  <input type="checkbox" checked={seleccionados.includes(admin.id)} onChange={() => alternarAdmin(admin.id)} />
                  <span>
                    <strong>{admin.nombre || admin.email || 'Admin'}</strong>
                    {admin.nombre && admin.email && <small>{admin.email}</small>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="announcement-recipient-summary">
            {destinatarios.length} {destinatarios.length === 1 ? 'destinatario' : 'destinatarios'}
          </p>
        </fieldset>

        <label className="announcement-field">
          <span>Enlace dentro de la app <em>Opcional</em></span>
          <input value={link} maxLength={200} placeholder="Ej. /admin" onChange={event => { setLink(event.target.value); setResultado(null) }} />
          {!linkValido && <small className="announcement-field-error">Debe comenzar con / y ser una ruta interna.</small>}
        </label>

        {resultado && <p className={`announcement-result is-${resultado.tipo}`}>{resultado.texto}</p>}

        <button type="button" className="announcement-send" disabled={!listo || enviando} onClick={() => setModoConfirmacion('audiencia')}>
          {enviando ? 'Enviando…' : `Revisar y enviar${destinatarios.length ? ` (${destinatarios.length})` : ''}`}
        </button>
        <button type="button" className="announcement-test-send" disabled={!contenidoListo || enviando} onClick={() => setModoConfirmacion('prueba')}>
          Enviar prueba solo para mí
        </button>
        <p className="announcement-test-note">La prueba aparecerá en tu campana y ningún admin será notificado.</p>
      </div>

      <div className="announcement-history">
        <div className="announcement-history-title">
          <h4>Enviados recientemente</h4>
          <span>{historial.length}</span>
        </div>
        {historialError && <p className="announcement-history-empty">No se pudo cargar el historial.</p>}
        {!historialError && historial.length === 0 && <p className="announcement-history-empty">Todavía no has enviado anuncios.</p>}
        {!historialError && historial.map(item => (
          <article key={item.id} className="announcement-history-item">
            <span className={`announcement-history-dot is-${item.prioridad || 'info'}`} />
            <div>
              <strong>{item.titulo}</strong>
              <p>{item.mensaje}</p>
              <small>{fechaCorta(item.creada)} · {item.audiencia === 'solo_super' ? 'Solo tú · Prueba' : `${item.totalDestinatarios || 0} destinatarios`} · {etiquetaPrioridad(item.prioridad)}</small>
            </div>
          </article>
        ))}
      </div>

      {modoConfirmacion && (
        <div className="announcement-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="announcement-confirm-title" onMouseDown={event => {
          if (event.target === event.currentTarget) setModoConfirmacion(null)
        }}>
          <div className="announcement-confirm">
            <span className={`announcement-confirm-priority is-${prioridad}`}>{etiquetaPrioridad(prioridad)}</span>
            <h3 id="announcement-confirm-title">{modoConfirmacion === 'prueba' ? '¿Enviarte esta prueba?' : '¿Enviar este anuncio?'}</h3>
            <strong>{tituloLimpio}</strong>
            <p>{mensajeLimpio}</p>
            <small>{modoConfirmacion === 'prueba'
              ? 'Aparecerá únicamente en tu bandeja. Ningún admin será notificado.'
              : `Lo recibirán ${destinatarios.length} ${destinatarios.length === 1 ? 'admin' : 'admins'} y no se puede retirar de sus bandejas.`}</small>
            <div>
              <button type="button" onClick={() => setModoConfirmacion(null)}>Seguir editando</button>
              <button type="button" className="is-primary" onClick={enviar}>{modoConfirmacion === 'prueba' ? 'Enviar prueba' : 'Enviar ahora'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
