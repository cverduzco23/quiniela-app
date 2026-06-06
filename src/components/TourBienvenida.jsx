/**
 * Tour de bienvenida para administradores (primer ingreso).
 * Modal de 4 pasos, ligero y orientado a la acción. Se muestra una sola vez
 * (el estado "visto" se guarda en localStorage desde admin.jsx).
 *
 * Es distinto de ComoFunciona.jsx (guía de referencia completa, siempre
 * accesible con ❓ Ayuda). Este solo orienta al recién llegado.
 */
import { useState } from 'react'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1100,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '1rem',
}
const modal = {
  background: 'var(--card)', borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
  maxWidth: 440, width: '100%', padding: '1.5rem',
  display: 'flex', flexDirection: 'column',
}

const PASOS = [
  {
    emoji: '👋',
    titulo: '¡Bienvenido a tu panel!',
    texto: 'Aquí creas y administras tus quinielas. Te explicamos lo básico en 4 pasos rápidos.',
  },
  {
    emoji: '⚽',
    titulo: '1. Crea tu quiniela',
    texto: 'Ponle un nombre y una fecha de cierre. Usa el buscador de partidos para traerlos con un clic: llegan con sus escudos y los resultados se sincronizan solos.',
  },
  {
    emoji: '📤',
    titulo: '2. Compártela con tu gente',
    texto: 'Cada quiniela tiene un enlace y un código de acceso. Mándalos por WhatsApp desde la pestaña Compartir; solo quien los tenga puede participar.',
  },
  {
    emoji: '🏆',
    titulo: '3. Resultados y ganador',
    texto: 'Cuando terminen los partidos, entra a ⚡ Sincronizar resultados. El ranking se arma solo y aparece el ganador. ¿Más dudas? El botón ❓ Ayuda tiene la guía completa.',
  },
]

export function TourBienvenida({ onClose }) {
  const [paso, setPaso] = useState(0)
  const actual = PASOS[paso]
  const esUltimo = paso === PASOS.length - 1

  return (
    <div style={overlay}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 4px' }}
          >
            Saltar
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '0.5rem 0.5rem 1rem' }}>
          <div style={{ fontSize: 44, marginBottom: 12, lineHeight: 1 }} aria-hidden="true">{actual.emoji}</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 10 }}>
            {actual.titulo}
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            {actual.texto}
          </p>
        </div>

        {/* Indicadores de paso */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 18 }}>
          {PASOS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                width: i === paso ? 22 : 7, height: 7, borderRadius: 99,
                background: i === paso ? 'var(--green)' : 'var(--border-strong)',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {paso > 0 && (
            <button
              onClick={() => setPaso(p => p - 1)}
              style={{ padding: '11px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Atrás
            </button>
          )}
          <button
            onClick={() => (esUltimo ? onClose() : setPaso(p => p + 1))}
            style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg, var(--green), var(--green-light))', color: '#07120A', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >
            {esUltimo ? 'Empezar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
