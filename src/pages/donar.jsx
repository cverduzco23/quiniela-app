import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { track } from '../firebase'
import { Footer } from '../components/Footer'
import { BrandWordmark } from '../components/Brand'

// URL de la Cloud Function que crea la sesión de Stripe Checkout. No es
// secreta (equivalente a la URL de cualquier endpoint público de la API),
// igual que firebaseConfig en src/firebase.js.
//
// En dev (`npm run dev`) apunta al emulador local de Firebase Functions
// (`firebase emulators:start --only functions,firestore`) para poder probar
// el flujo completo con una clave de Stripe de PRUEBA sin tocar producción.
const FUNCTIONS_BASE = import.meta.env.DEV
  ? 'http://127.0.0.1:5001/quiniela-app-24896/us-central1'
  : 'https://us-central1-quiniela-app-24896.cloudfunctions.net'

const MONTOS_PRESET = [50, 100, 200, 500]

function DonarIcon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0 },
    'aria-hidden': 'true',
  }
  if (name === 'heart') return <svg {...common}><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" /></svg>
  if (name === 'check') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></svg>
  if (name === 'arrow-left') return <svg {...common}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
  return null
}

function DonarGracias() {
  return (
    <div className="donar-card donar-gracias">
      <span className="donar-gracias-icon">
        <DonarIcon name="check" size={28} />
      </span>
      <h1 className="donar-title">¡Gracias por tu apoyo!</h1>
      <p className="donar-subtitle">
        Tu donativo nos ayuda a mantener QuinielApp gratis y sin anuncios.
      </p>
      <Link to="/" className="donar-submit-btn" style={{ textDecoration: 'none' }}>
        Volver al inicio
      </Link>
    </div>
  )
}

export default function Donar() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const yaPago = searchParams.has('session_id')
  // Back = pantalla previa; si se llegó por link directo (sin historial), a Home.
  const volver = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const [monto, setMonto] = useState(100)
  const [montoCustom, setMontoCustom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const montoFinal = montoCustom !== '' ? Number(montoCustom) : monto
  const montoValido = Number.isInteger(montoFinal) && montoFinal >= 10 && montoFinal <= 50000

  async function donar() {
    if (!montoValido || enviando) return
    setEnviando(true)
    setError('')
    track('donar_click', { monto: montoFinal })
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/crearSesionDonativo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: montoFinal }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo iniciar el pago')
      window.location.href = data.url
    } catch {
      setError('No se pudo iniciar el pago. Intenta de nuevo en un momento.')
      setEnviando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070d18', position: 'relative', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="public-home-bg-fade" aria-hidden="true" />
      <div className="hero-pad donar-hero-pad" style={{ color: 'var(--text)' }}>
        <div className="donar-brand-row" style={{ maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={volver} className="app-back-button" aria-label="Volver" title="Volver">
            <DonarIcon name="arrow-left" size={15} />
          </button>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <BrandWordmark markSize={24} fontSize={20} />
          </Link>
        </div>
      </div>
      <div className="donar-shell">
        {yaPago ? (
          <DonarGracias />
        ) : (
          <div className="donar-card">
            <span className="donar-icon">
              <DonarIcon name="heart" size={24} />
            </span>
            <h1 className="donar-title">Apoya el proyecto</h1>
            <p className="donar-subtitle">
              QuinielApp es gratis y sin anuncios. Un donativo nos ayuda a mantenerlo vivo.
            </p>

            <div className="donar-amount-grid">
              {MONTOS_PRESET.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`donar-amount-btn${montoCustom === '' && monto === m ? ' is-active' : ''}`}
                  onClick={() => { setMonto(m); setMontoCustom('') }}
                >
                  ${m}
                </button>
              ))}
            </div>

            <label className="donar-custom-label">
              Otro monto (MXN)
              <input
                type="number"
                min="10"
                max="50000"
                step="1"
                placeholder="Ej. 150"
                value={montoCustom}
                onChange={(e) => setMontoCustom(e.target.value)}
                className="donar-custom-input"
              />
            </label>

            {error && <p className="donar-error">{error}</p>}

            <button
              type="button"
              className="donar-submit-btn"
              disabled={!montoValido || enviando}
              onClick={donar}
            >
              {enviando ? 'Redirigiendo…' : montoValido ? `Donar $${montoFinal} MXN` : 'Donar MXN'}
            </button>
            <p className="legal-note">
              Donativo voluntario, no reembolsable y no deducible.<br />
              Procesado por Stripe.
            </p>
          </div>
        )}
        <Footer variant="simple" />
      </div>
    </div>
  )
}
