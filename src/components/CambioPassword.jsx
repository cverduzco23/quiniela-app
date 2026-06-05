import { useState } from 'react'
import { updatePassword, signOut } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

/**
 * Pantalla de cambio de contraseña OBLIGATORIO en el primer ingreso.
 *
 * Se muestra cuando el doc admins/{uid} tiene `debeCambiarPassword === true`.
 * El cliente no puede llegar al panel sin establecer una contraseña propia.
 *
 * Flujo:
 *  1. updatePassword() cambia la credencial en Firebase Auth.
 *  2. Se apaga el flag debeCambiarPassword en su doc admins/{uid}.
 *  3. onListo() refresca el estado del panel para dejarlo pasar.
 *
 * Nota de seguridad: updatePassword exige sesión "reciente". Como el cliente
 * acaba de iniciar sesión con su contraseña temporal, normalmente está dentro
 * de la ventana válida. Si Firebase pide re-login, se le indica volver a entrar.
 */
const wrap = {
  minHeight: '100vh', background: 'var(--bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const card = {
  background: 'var(--card)', borderRadius: 'var(--radius-md)',
  padding: '1.1rem 1.25rem', border: '1px solid var(--border)',
}
const lbl = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: 1, display: 'block', marginBottom: 8,
}

export function CambioPassword({ uid, onListo }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const guardar = async () => {
    setError('')
    if (p1.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (p1 !== p2)     { setError('Las contraseñas no coinciden.'); return }
    if (!auth.currentUser) { setError('Tu sesión expiró. Vuelve a iniciar sesión.'); return }

    setCargando(true)
    try {
      await updatePassword(auth.currentUser, p1)
      if (uid) {
        try { await updateDoc(doc(db, 'admins', uid), { debeCambiarPassword: false }) }
        catch { /* el cambio de contraseña ya surtió efecto; el flag se reintenta luego */ }
      }
      onListo?.()
    } catch (e) {
      if (e?.code === 'auth/requires-recent-login') {
        setError('Por seguridad, vuelve a iniciar sesión y cambia tu contraseña de inmediato.')
      } else if (e?.code === 'auth/weak-password') {
        setError('Esa contraseña es muy débil. Usa al menos 6 caracteres.')
      } else {
        setError('No se pudo cambiar la contraseña. Intenta de nuevo.')
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
            Crea tu contraseña
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            Por seguridad, cambia la contraseña temporal por una tuya antes de continuar.
          </p>
        </div>

        <div style={card}>
          <label htmlFor="np1" style={lbl}>Nueva contraseña</label>
          <input
            id="np1"
            type="password" placeholder="Mínimo 6 caracteres" value={p1}
            onChange={e => { setP1(e.target.value); setError('') }}
            style={{ marginBottom: 12, borderColor: error ? 'var(--red)' : undefined }}
          />
          <label htmlFor="np2" style={lbl}>Confirmar contraseña</label>
          <input
            id="np2"
            type="password" placeholder="Repite tu contraseña" value={p2}
            onChange={e => { setP2(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && guardar()}
            style={{ marginBottom: 10, borderColor: error ? 'var(--red)' : undefined }}
          />
          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
          <button
            onClick={guardar}
            disabled={cargando}
            style={{
              width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: cargando ? 'var(--card-light)' : 'linear-gradient(135deg, var(--green), var(--green-light))',
              color: cargando ? 'var(--muted)' : '#07120A',
              fontSize: 13, fontWeight: 800, cursor: cargando ? 'not-allowed' : 'pointer',
              letterSpacing: 0.2, boxShadow: cargando ? 'none' : 'var(--shadow-green)',
            }}
          >
            {cargando ? 'Guardando…' : 'Guardar y continuar →'}
          </button>
          <button
            onClick={() => signOut(auth)}
            style={{
              width: '100%', marginTop: 10, padding: '10px', background: 'transparent',
              border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancelar y cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
