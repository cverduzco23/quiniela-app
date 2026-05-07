import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase'

const partidos = [
  { id: 0, local: 'Chivas', visitante: 'América', hora: 'Sáb 10 may · 19:00' },
  { id: 1, local: 'Pumas', visitante: 'Tigres', hora: 'Sáb 10 may · 21:00' },
  { id: 2, local: 'Monterrey', visitante: 'Toluca', hora: 'Dom 11 may · 18:00' },
  { id: 3, local: 'Cruz Azul', visitante: 'Atlas', hora: 'Dom 11 may · 20:00' },
]

export default function Predicciones() {
  const [nombre, setNombre] = useState('')
  const [picks, setPicks] = useState({})
  const [enviado, setEnviado] = useState(false)

  const seleccionar = (id, opcion) => {
    setPicks(prev => ({ ...prev, [id]: opcion }))
  }

  const listoParaEnviar = nombre.trim().length > 0 && Object.keys(picks).length === partidos.length

  const enviar = async () => {
  if (!listoParaEnviar) return
  try {
    await addDoc(collection(db, 'predicciones'), {
      nombre,
      picks,
      fecha: new Date().toISOString(),
    })
    setEnviado(true)
  } catch (error) {
    console.error('Error al guardar:', error)
    alert('Hubo un error al guardar. Intenta de nuevo.')
  }
}

  if (enviado) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p style={{ fontSize: 48 }}>✓</p>
        <h2>¡Listo, {nombre}!</h2>
        <p style={{ color: '#666' }}>Tus predicciones fueron registradas.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ marginBottom: 4 }}>Jornada 17 — Liga MX</h2>
      <p style={{ color: '#666', marginBottom: 24 }}>Cierre: sábado 10 mayo, 12:00 pm</p>

      <input
        type="text"
        placeholder="Tu nombre"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        style={{ width: '100%', marginBottom: 20, padding: 10, fontSize: 14, boxSizing: 'border-box' }}
      />

      {partidos.map(p => (
        <div key={p.id} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '1rem', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#999' }}>Liga MX</span>
            <span style={{ fontSize: 12, color: '#999' }}>{p.hora}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: 14, gap: 8 }}>
            <span style={{ textAlign: 'center', fontWeight: 500 }}>{p.local}</span>
            <span style={{ color: '#999', fontSize: 13 }}>vs</span>
            <span style={{ textAlign: 'center', fontWeight: 500 }}>{p.visitante}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['home', 'draw', 'away'].map(opcion => (
              <button
                key={opcion}
                onClick={() => seleccionar(p.id, opcion)}
                style={{
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: picks[p.id] === opcion ? '2px solid #185FA5' : '1px solid #e5e5e5',
                  background: picks[p.id] === opcion ? '#E6F1FB' : 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: picks[p.id] === opcion ? 500 : 400,
                  color: picks[p.id] === opcion ? '#185FA5' : '#333',
                }}
              >
                <span style={{ display: 'block', fontSize: 11, color: '#999', marginBottom: 2 }}>
                  {opcion === 'home' ? 'Local' : opcion === 'draw' ? 'Empate' : 'Visitante'}
                </span>
                {opcion === 'home' ? p.local : opcion === 'draw' ? 'X' : p.visitante}
              </button>
            ))}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 13, color: '#999', margin: '12px 0' }}>
        {Object.keys(picks).length} de {partidos.length} partidos predichos
      </p>

      <button
        onClick={() => enviar()}
        disabled={!listoParaEnviar}
        style={{
          width: '100%',
          padding: 12,
          borderRadius: 8,
          border: 'none',
          background: listoParaEnviar ? '#185FA5' : '#ccc',
          color: 'white',
          fontSize: 14,
          fontWeight: 500,
          cursor: listoParaEnviar ? 'pointer' : 'not-allowed',
        }}
      >
        Enviar predicciones
      </button>
    </div>
  )
}