import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const resultadosReales = {
  0: 'away',  // América ganó
  1: 'draw',  // Empate Pumas-Tigres
  2: null,    // Pendiente
  3: null,    // Pendiente
}

const partidos = [
  { id: 0, local: 'Chivas', visitante: 'América' },
  { id: 1, local: 'Pumas', visitante: 'Tigres' },
  { id: 2, local: 'Monterrey', visitante: 'Toluca' },
  { id: 3, local: 'Cruz Azul', visitante: 'Atlas' },
]

function calcularPuntos(picks) {
  let puntos = 0
  Object.entries(picks).forEach(([id, pick]) => {
    if (resultadosReales[id] && resultadosReales[id] === pick) {
      puntos += 3
    }
  })
  return puntos
}

export default function Ranking() {
  const [jugadores, setJugadores] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const snapshot = await getDocs(collection(db, 'predicciones'))
      const data = snapshot.docs.map(doc => {
        const d = doc.data()
        return {
          nombre: d.nombre,
          picks: d.picks,
          puntos: calcularPuntos(d.picks),
        }
      })
      data.sort((a, b) => b.puntos - a.puntos)
      setJugadores(data)
      setCargando(false)
    }
    cargar()
  }, [])

  const terminados = Object.values(resultadosReales).filter(r => r !== null).length

  if (cargando) return <p style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</p>

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ marginBottom: 4 }}>Ranking — Jornada 17</h2>
      <p style={{ color: '#666', marginBottom: 24 }}>
        {terminados} de {partidos.length} partidos terminados
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { val: jugadores.length, label: 'Participantes' },
          { val: `${terminados}/${partidos.length}`, label: 'Partidos listos' },
          { val: jugadores[0]?.puntos ?? 0, label: 'Puntaje líder' },
        ].map(s => (
          <div key={s.label} style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 500, display: 'block' }}>{s.val}</span>
            <span style={{ fontSize: 12, color: '#666' }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 60px', padding: '8px 16px', borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
          <span style={{ fontSize: 12, color: '#999' }}>#</span>
          <span style={{ fontSize: 12, color: '#999' }}>Jugador</span>
          <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>Aciertos</span>
          <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>Pts</span>
        </div>

        {jugadores.map((j, i) => {
          const aciertos = Object.entries(j.picks).filter(([id, pick]) => resultadosReales[id] === pick).length
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 80px 60px',
                padding: '12px 16px',
                borderBottom: i < jugadores.length - 1 ? '1px solid #e5e5e5' : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, color: i < 3 ? '#BA7517' : '#999', fontWeight: 500 }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{j.nombre}</span>
              <span style={{ fontSize: 13, color: '#666', textAlign: 'center' }}>{aciertos}</span>
              <span style={{ fontSize: 15, fontWeight: 500, textAlign: 'center' }}>{j.puntos}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}