import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { notificacionVigente } from '../utils/notificaciones'

function BellIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function formatFecha(value) {
  const fecha = value?.toDate?.() ?? (value ? new Date(value) : null)
  if (!fecha || Number.isNaN(fecha.getTime())) return 'Ahora'
  return fecha.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function linkSeguro(value) {
  const link = String(value ?? '').trim()
  return link.startsWith('/') && !link.startsWith('//') ? link : ''
}

export function NotificationBell({ uid, variant = 'sidebar' }) {
  const [abierto, setAbierto] = useState(false)
  const [notificaciones, setNotificaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [marcando, setMarcando] = useState(false)

  useEffect(() => {
    if (!uid) return undefined
    let vivo = true
    const cargar = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'notificacionesAdmin'),
          where('destinatarioUid', '==', uid),
          orderBy('creada', 'desc'),
          limit(50),
        ))
        if (!vivo) return
        const ahora = Date.now()
        setNotificaciones(snap.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .filter(item => notificacionVigente(item, ahora)))
        setError(false)
      } catch {
        if (vivo) setError(true)
      } finally {
        if (vivo) setCargando(false)
      }
    }
    cargar()
    const onVisible = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [uid, abierto])

  useEffect(() => {
    if (!abierto) return undefined
    const onKey = event => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto])

  const noLeidas = useMemo(() => notificaciones.filter(item => !item.leida), [notificaciones])

  const marcarLeida = async (item) => {
    if (item.leida) return
    try {
      await updateDoc(doc(db, 'notificacionesAdmin', item.id), {
        leida: true,
        leidaEn: serverTimestamp(),
      })
      setNotificaciones(actual => actual.map(aviso => aviso.id === item.id ? { ...aviso, leida: true } : aviso))
    } catch { /* La escucha conservará el estado real si falla. */ }
  }

  const marcarTodas = async () => {
    if (!noLeidas.length || marcando) return
    setMarcando(true)
    try {
      const batch = writeBatch(db)
      noLeidas.forEach(item => {
        batch.update(doc(db, 'notificacionesAdmin', item.id), {
          leida: true,
          leidaEn: serverTimestamp(),
        })
      })
      await batch.commit()
      const leidas = new Set(noLeidas.map(item => item.id))
      setNotificaciones(actual => actual.map(item => leidas.has(item.id) ? { ...item, leida: true } : item))
    } finally {
      setMarcando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`notification-bell is-${variant}`}
        onClick={() => setAbierto(true)}
        aria-label={noLeidas.length ? `Notificaciones, ${noLeidas.length} sin leer` : 'Notificaciones'}
        title="Notificaciones"
      >
        <BellIcon size={variant === 'mobile' ? 21 : 18} />
        {variant === 'sidebar-action' && <span className="notification-bell-label">Avisos</span>}
        {noLeidas.length > 0 && (
          <span className="notification-bell-badge">{noLeidas.length > 99 ? '99+' : noLeidas.length}</span>
        )}
      </button>

      {abierto && (
        <div className="notification-overlay" role="dialog" aria-modal="true" aria-labelledby="notification-title" onMouseDown={event => {
          if (event.target === event.currentTarget) setAbierto(false)
        }}>
          <section className="notification-panel">
            <header className="notification-panel-header">
              <div>
                <h2 id="notification-title">Notificaciones</h2>
                <p>{noLeidas.length ? `${noLeidas.length} sin leer` : 'Estás al día'}</p>
              </div>
              <button type="button" className="notification-close" onClick={() => setAbierto(false)} aria-label="Cerrar notificaciones">
                <CloseIcon />
              </button>
            </header>

            {noLeidas.length > 0 && (
              <button type="button" className="notification-read-all" onClick={marcarTodas} disabled={marcando}>
                {marcando ? 'Marcando…' : 'Marcar todas como leídas'}
              </button>
            )}

            <div className="notification-list">
              {cargando && <p className="notification-empty">Cargando avisos…</p>}
              {!cargando && error && <p className="notification-empty is-error">No pudimos cargar tus avisos. Intenta nuevamente.</p>}
              {!cargando && !error && notificaciones.length === 0 && (
                <div className="notification-empty-state">
                  <span><BellIcon size={25} /></span>
                  <h3>No tienes avisos</h3>
                  <p>Cuando haya algo importante para tu cuenta, aparecerá aquí.</p>
                </div>
              )}
              {!cargando && !error && notificaciones.map(item => {
                const link = linkSeguro(item.link)
                const contenido = (
                  <>
                    <span className={`notification-priority is-${item.prioridad || 'info'}`} aria-hidden="true" />
                    <span className="notification-copy">
                      <span className="notification-item-top">
                        <strong>{item.titulo}</strong>
                        {!item.leida && <span className="notification-unread-dot" aria-label="Sin leer" />}
                      </span>
                      <span className="notification-message">{item.mensaje}</span>
                      <span className="notification-date">{formatFecha(item.creada)}</span>
                    </span>
                  </>
                )
                return link ? (
                  <a key={item.id} href={link} className={`notification-item${item.leida ? '' : ' is-unread'}`} onClick={() => marcarLeida(item)}>
                    {contenido}
                  </a>
                ) : (
                  <button key={item.id} type="button" className={`notification-item${item.leida ? '' : ' is-unread'}`} onClick={() => marcarLeida(item)}>
                    {contenido}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
