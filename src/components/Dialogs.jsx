import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

/**
 * Sistema de diálogos con diseño propio para reemplazar los alert/confirm/prompt
 * nativos del navegador (que se ven "feos" y no respetan la marca).
 *
 * API basada en promesas, pensada para sustituir las llamadas nativas casi 1:1:
 *   await alerta('mensaje')                         // como alert()  → undefined
 *   if (!(await confirmar('¿seguro?'))) return      // como confirm() → boolean
 *   const txt = await pedirTexto('label', 'def')    // como prompt()  → string | null
 *
 * Las tres aceptan un objeto de opciones final: { titulo, confirmar, cancelar, peligro }.
 */

const DialogContext = createContext(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog debe usarse dentro de <DialogProvider>')
  return ctx
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, animation: 'qpDialogFade 0.12s ease-out',
}

const panelStyle = {
  background: 'var(--card)', borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
  width: '100%', maxWidth: 380, padding: '1.4rem 1.5rem',
  animation: 'qpDialogPop 0.14s ease-out',
}

const titleStyle = { fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }
const msgStyle = { fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: 18 }
const rowStyle = { display: 'flex', gap: 8, justifyContent: 'flex-end' }

const btnBase = {
  padding: '9px 16px', borderRadius: 'var(--radius-sm)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
}
const btnCancel = { ...btnBase, background: 'var(--neutral-bg)', border: '1px solid var(--border-strong)', color: 'var(--text)' }
const btnOk = { ...btnBase, background: 'var(--green)', color: '#07120A' }
const btnDanger = { ...btnBase, background: 'var(--red)', color: '#fff' }

const inputStyle = {
  width: '100%', padding: '10px 12px', marginBottom: 18,
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
  background: 'var(--bg-soft)', color: 'var(--text)', fontSize: 14,
}

export function DialogProvider({ children }) {
  // Cola de diálogos: se muestra el primero; al resolverse, avanza al siguiente.
  const [cola, setCola] = useState([])
  const [valor, setValor] = useState('')
  const inputRef = useRef(null)
  const actual = cola[0] ?? null

  const encolar = useCallback((cfg) => new Promise((resolve) => {
    setCola(prev => [...prev, { ...cfg, resolve }])
    // Inicializa el valor del input aquí (en un manejador, no en un effect)
    // para que el prompt aparezca con su texto por defecto sin renders en cascada.
    if (cfg.tipo === 'prompt') setValor(cfg.valorInicial ?? '')
  }), [])

  const alerta = useCallback((mensaje, opts = {}) =>
    encolar({ tipo: 'alert', mensaje, ...opts }), [encolar])
  const confirmar = useCallback((mensaje, opts = {}) =>
    encolar({ tipo: 'confirm', mensaje, ...opts }), [encolar])
  const pedirTexto = useCallback((mensaje, valorInicial = '', opts = {}) =>
    encolar({ tipo: 'prompt', mensaje, valorInicial, ...opts }), [encolar])

  // Cuando aparece un prompt, enfoca y selecciona el input (sin tocar estado).
  useEffect(() => {
    if (actual?.tipo === 'prompt') {
      const t = setTimeout(() => inputRef.current?.select(), 0)
      return () => clearTimeout(t)
    }
  }, [actual])

  const cerrar = useCallback((resultado) => {
    setCola(prev => {
      const [primero, ...resto] = prev
      primero?.resolve(resultado)
      return resto
    })
  }, [])

  const onAceptar = () => {
    if (!actual) return
    if (actual.tipo === 'prompt') cerrar(valor)
    else if (actual.tipo === 'confirm') cerrar(true)
    else cerrar(undefined)
  }
  const onCancelar = () => {
    if (!actual) return
    cerrar(actual.tipo === 'prompt' ? null : false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && actual?.tipo !== 'prompt') { e.preventDefault(); onAceptar() }
    else if (e.key === 'Enter' && actual?.tipo === 'prompt') { e.preventDefault(); onAceptar() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancelar() }
  }

  return (
    <DialogContext.Provider value={{ alerta, confirmar, pedirTexto }}>
      {children}
      {actual && (
        <div
          style={overlayStyle}
          onMouseDown={(e) => { if (e.target === e.currentTarget && actual.tipo !== 'prompt') onCancelar() }}
          onKeyDown={onKeyDown}
          role="dialog" aria-modal="true"
        >
          <div style={panelStyle}>
            {actual.titulo && <p style={titleStyle}>{actual.titulo}</p>}
            <p style={msgStyle}>{actual.mensaje}</p>

            {actual.tipo === 'prompt' && (
              <input
                ref={inputRef}
                type="text"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                style={inputStyle}
              />
            )}

            <div style={rowStyle}>
              {actual.tipo !== 'alert' && (
                <button type="button" onClick={onCancelar} style={btnCancel}>
                  {actual.cancelar ?? 'Cancelar'}
                </button>
              )}
              <button
                type="button"
                onClick={onAceptar}
                autoFocus={actual.tipo !== 'prompt'}
                style={actual.peligro ? btnDanger : btnOk}
              >
                {actual.confirmar ?? (actual.tipo === 'alert' ? 'Entendido' : 'Aceptar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
