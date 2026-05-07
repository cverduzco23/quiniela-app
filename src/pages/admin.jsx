import { useState } from 'react'
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const partidosIniciales = [
  { local: '', visitante: '', hora: '' },
]

export default function Admin() {
  const [tab, setTab] = useState('crear')
  const [nombreQuiniela, setNombreQuiniela] = useState('')
  const [cierre, setCierre] = useState('')
  const [partidos, setPartidos] = useState(partidosIniciales)
  const [resultados, setResultados] = useState({})
  const [guardado, setGuardado] = useState(false)
  const [quinielaId, setQuinielaId] = useState(null)

  const actualizarPartido = (i, campo, valor) => {
    setPartidos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))
  }

  const agregarPartido = () => {
    setPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])
  }

  const guardarQuiniela = async () => {
    if (!nombreQuiniela.trim()) return alert('Ponle un nombre a la quiniela')
    try {
      const ref = await addDoc(collection(db, 'quinielas'), {
        nombre: nombreQuiniela,
        cierre,
        partidos,
        creada: new Date().toISOString(),
        cerrada: false,
      })
      setQuinielaId(ref.id)
      setTab('compartir')
    } catch (e) {
      console.error(e)
      alert('Error al guardar')
    }
  }

  const guardarResultados = async () => {
    if (!quinielaId) return alert('Primero crea una quiniela')
    try {
      await updateDoc(doc(db, 'quinielas', quinielaId), { resultados })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch (e) {
      console.error(e)
      alert('Error al guardar resultados')
    }
  }

  const copiar = (texto) => navigator.clipboard.writeText(texto)

  const linkJugadores = quinielaId ? `${window.location.origin}/?q=${quinielaId}` : '— guarda primero la quiniela —'
  const linkRanking = quinielaId ? `${window.location.origin}/ranking?q=${quinielaId}` : '— guarda primero la quiniela —'

  const tabStyle = (t) => ({
    flex: 1, padding: '8px', fontSize: 13, fontWeight: 500,
    border: tab === t ? '0.5px solid #e5e5e5' : 'none',
    background: tab === t ? 'white' : 'transparent',
    borderRadius: 6, cursor: 'pointer',
    color: tab === t ? '#111' : '#888',
  })

  const btnStyle = (color) => ({
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: color, color: 'white', fontSize: 13,
    fontWeight: 500, cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ marginBottom: 20 }}>Panel de admin</h2>

      <div style={{ display: 'flex', gap: 4, background: '#f5f5f5', borderRadius: 8, padding: 4, marginBottom: 24 }}>
        {['crear', 'resultados', 'compartir'].map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {t === 'crear' ? 'Crear quiniela' : t === 'resultados' ? 'Resultados' : 'Compartir'}
          </button>
        ))}
      </div>

      {tab === 'crear' && (
        <div>
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
            <p style={{ fontWeight: 500, marginBottom: 16 }}>Datos de la jornada</p>
            <input
              placeholder="Nombre de la quiniela (ej. Jornada 17 — Liga MX)"
              value={nombreQuiniela}
              onChange={e => setNombreQuiniela(e.target.value)}
              style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <input
              type="datetime-local"
              value={cierre}
              onChange={e => setCierre(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
            <p style={{ fontWeight: 500, marginBottom: 16 }}>Partidos</p>
            {partidos.map((p, i) => (
              <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < partidos.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input placeholder="Equipo local" value={p.local} onChange={e => actualizarPartido(i, 'local', e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                  <span style={{ color: '#999', fontSize: 13 }}>vs</span>
                  <input placeholder="Equipo visitante" value={p.visitante} onChange={e => actualizarPartido(i, 'visitante', e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <input
                  type="datetime-local"
                  value={p.hora}
                  onChange={e => actualizarPartido(i, 'hora', e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <button onClick={agregarPartido} style={{ width: '100%', padding: 9, border: '1px dashed #ccc', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: '#666', fontSize: 13 }}>
              + Agregar partido
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={{ ...btnStyle('#185FA5') }} onClick={guardarQuiniela}>
              Guardar y continuar →
            </button>
          </div>
        </div>
      )}

      {tab === 'resultados' && (
        <div>
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
            <p style={{ fontWeight: 500, marginBottom: 16 }}>Registrar resultados</p>
            {partidos.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: i < partidos.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <span style={{ fontSize: 13 }}>{p.local || `Local ${i + 1}`}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" placeholder="–"
                    value={resultados[i]?.local ?? ''}
                    onChange={e => setResultados(prev => ({ ...prev, [i]: { ...prev[i], local: e.target.value } }))}
                    style={{ width: 38, textAlign: 'center', padding: 5 }}
                  />
                  <span style={{ color: '#999' }}>–</span>
                  <input type="number" min="0" placeholder="–"
                    value={resultados[i]?.visitante ?? ''}
                    onChange={e => setResultados(prev => ({ ...prev, [i]: { ...prev[i], visitante: e.target.value } }))}
                    style={{ width: 38, textAlign: 'center', padding: 5 }}
                  />
                </div>
                <span style={{ fontSize: 13, textAlign: 'right' }}>{p.visitante || `Visitante ${i + 1}`}</span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: resultados[i]?.local !== undefined ? '#EAF3DE' : '#f5f5f5', color: resultados[i]?.local !== undefined ? '#3B6D11' : '#999' }}>
                  {resultados[i]?.local !== undefined ? '✓ Listo' : 'Pendiente'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {guardado && <span style={{ fontSize: 13, color: '#1D9E75' }}>✓ Ranking actualizado</span>}
            <button style={{ ...btnStyle('#185FA5'), marginLeft: 'auto' }} onClick={guardarResultados}>
              Guardar resultados
            </button>
          </div>
        </div>
      )}

      {tab === 'compartir' && (
        <div>
          {[
            { label: 'Link para jugadores', link: linkJugadores },
            { label: 'Link del ranking', link: linkRanking },
          ].map(({ label, link }) => (
            <div key={label} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>{label}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f5f5', borderRadius: 8, padding: '8px 12px' }}>
                <span style={{ fontSize: 12, color: '#666', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{link}</span>
                <button onClick={() => copiar(link)} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  Copiar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}