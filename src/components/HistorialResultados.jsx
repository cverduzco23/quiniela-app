import { useState } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

const marcador = r => !r ? 'Sin resultado' : r.cancelado ? 'Cancelado' : `${r.local}–${r.visitante}`

export function HistorialResultados({ quiniela }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const cargar = async () => {
    setCargando(true)
    setError('')
    try {
      const base = collection(db, 'quinielas', quiniela.id, 'historialResultados')
      const [historial, revisiones] = await Promise.all([
        getDocs(query(base, orderBy('fecha', 'desc'), limit(20))),
        getDocs(collection(db, 'quinielas', quiniela.id, 'revisionResultados')),
      ])
      setDatos({ historial: historial.docs.map(d => ({ id: d.id, ...d.data() })),
        revisiones: revisiones.docs.map(d => ({ id: d.id, ...d.data() })) })
    } catch {
      setError('No se pudo cargar el historial. Intenta de nuevo.')
    } finally { setCargando(false) }
  }
  return (
    <section style={{ marginTop: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>
      <button type="button" onClick={cargar} disabled={cargando} className="btn-secondary">
        {cargando ? 'Cargando historial…' : datos ? 'Actualizar historial de marcadores' : 'Ver historial de marcadores'}
      </button>
      {error && <p role="alert">{error}</p>}
      {datos && <>
        {datos.revisiones.map(r => {
          const p = quiniela.partidos?.[r.id]
          return <p key={r.id} style={{ color: 'var(--yellow)', marginTop: 12 }}>
            {p?.local} vs {p?.visitante}: guardado {marcador(r.anterior)}, ESPN {marcador(r.propuesto)}.
            {' '}{r.estado === 'revisar' ? 'Requiere revisión del organizador: no conocemos el origen del marcador guardado.' : 'Esperando una segunda confirmación antes de corregirlo.'}
          </p>
        })}
        <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 12 }}>
          Últimos 20 registros. Los cambios anteriores a la activación del historial pueden no estar disponibles.
        </p>
        {datos.historial.length === 0 && <p>No hay cambios registrados todavía.</p>}
        {datos.historial.map(e => <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <time dateTime={e.fecha}>{new Date(e.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} (CDMX)</time>
          {(e.cambios ?? [e]).map(c => {
            const p = e.partidos?.find(p => String(p.indice) === String(c.indice))?.partido ?? quiniela.partidos?.[c.indice]
            return <p key={c.indice}>{p?.local ?? 'Partido'} vs {p?.visitante ?? ''}: <strong>{marcador(c.anterior)} → {marcador(c.nuevo)}</strong></p>
          })}
          {e.motivo && <p style={{ color: 'var(--muted)', fontSize: 12 }}>{e.motivo}</p>}
        </div>)}
      </>}
    </section>
  )
}
