import { useState, useEffect, useRef, Fragment } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, addDoc, collection, getDocs, query, where, getCountFromServer } from 'firebase/firestore'
import { db, track } from '../firebase'
import { registrarVisita, registrarVisitaQuiniela, registrarEnvio } from '../utils/analytics'
import { cierreToDate, quinielaCerrada, quinielaFinalizada, tiempoRestante } from '../utils/cierre'
import { tienePremio, tieneCuota, descripcionRegla, calcularBote, desglosePremio, TIPO_PREMIO, formatearMXN } from '../utils/premios'
import { contieneEmoji, normalizarNombre, quitarEmojis, tieneNombreYApellido } from '../utils/nombres'
import { recordarMiQuiniela } from '../utils/misQuinielas'
import { CuentaRegresiva } from '../components/CuentaRegresiva'
import { Footer } from '../components/Footer'
import { useDialog } from '../components/Dialogs'
import { BrandMark, BrandWordmark } from '../components/Brand'
import { ProgresoPasos } from '../components/ProgresoPasos'

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function pickValido(pick) {
  if (!pick) return false
  const l = pick.local, v = pick.visitante
  return l !== '' && l !== undefined && v !== '' && v !== undefined &&
    !isNaN(Number(l)) && !isNaN(Number(v))
}

function getPickResultado(pick) {
  if (!pickValido(pick)) return null
  const l = Number(pick.local), v = Number(pick.visitante)
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const resultadoInfo = (res, local, visitante) => ({
  home:  { label: `${local} gana`,     bg: 'var(--green-bg)',  color: 'var(--green)' },
  draw:  { label: 'Empate',            bg: 'var(--neutral-bg)', color: 'var(--muted)' },
  away:  { label: `${visitante} gana`, bg: 'var(--yellow-bg)', color: 'var(--yellow)' },
}[res])

const ctaPrimary = (disabled) => ({
  position: 'relative', overflow: 'hidden',
  width: '100%', padding: 'var(--pred-cta-padding, 15px)', borderRadius: 'var(--radius-md)', border: 'none',
  background: disabled ? 'var(--card-light)' : 'linear-gradient(135deg, #22C55E 0%, #4ADE80 52%, #20B85A 100%)',
  color: disabled ? 'var(--muted)' : '#07120A', fontSize: 'var(--pred-cta-size, 15px)', fontWeight: 800, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(6,78,39,0.14), var(--shadow-green)',
})

const card = {
  background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
  borderRadius: 14,
  padding: 'var(--pred-card-padding, 1.1rem 1.25rem)', marginBottom: 'var(--pred-card-gap, 10px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)',
}

const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }

function PredIcon({ name, size = 16, style }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0, ...style },
    'aria-hidden': 'true',
  }
  if (name === 'arrow-left') {
    return (
      <svg {...common}>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    )
  }
  if (name === 'warning') {
    return (
      <svg {...common}>
        <path d="M10.3 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (name === 'lock') {
    return (
      <svg {...common}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    )
  }
  if (name === 'building') {
    return (
      <svg {...common}>
        <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-5h3v5" />
        <path d="M8 7h1" />
        <path d="M12 7h1" />
        <path d="M8 11h1" />
        <path d="M12 11h1" />
        <path d="M3 21h18" />
      </svg>
    )
  }
  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    )
  }
  if (name === 'ball') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" />
        <path d="M12 7V3" />
        <path d="m16 10 4-1.5" />
        <path d="m14.5 15 2.5 3.5" />
        <path d="m9.5 15-2.5 3.5" />
        <path d="M8 10 4 8.5" />
      </svg>
    )
  }
  if (name === 'globe') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </svg>
    )
  }
  if (name === 'money') {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 9v.01" />
        <path d="M18 15v.01" />
      </svg>
    )
  }
  if (name === 'party') {
    return (
      <svg {...common}>
        <path d="m5 19 4-12 8 8-12 4Z" />
        <path d="m9 7 8 8" />
        <path d="M14 5h.01" />
        <path d="M18 3v3" />
        <path d="M20 4.5h-4" />
      </svg>
    )
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m20 6-11 11-5-5" />
      </svg>
    )
  }
  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
      </svg>
    )
  }
  if (name === 'trophy') {
    return (
      <svg {...common}>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3" />
        <path d="M17 6h3v1a3 3 0 0 1-3 3" />
      </svg>
    )
  }
  if (name === 'ranking') {
    return (
      <svg {...common}>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function BackHomeButton({ onBack, label = 'Ir a inicio', title = 'Inicio' }) {
  if (onBack) {
    return (
      <button type="button" onClick={onBack} className="app-back-button" aria-label={label} title={title}>
        <PredIcon name="arrow-left" size={15} />
      </button>
    )
  }
  return (
    <a href="/" className="app-back-button" aria-label="Ir a inicio" title="Inicio">
      <PredIcon name="arrow-left" size={15} />
    </a>
  )
}

export default function Predicciones() {
  const { alerta } = useDialog()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: idDeRuta } = useParams()
  // Acepta /quiniela/<id> (ruta nueva) y /?q=<id> (links viejos ya compartidos).
  const quinielaId = idDeRuta || searchParams.get('q')

  const [quiniela, setQuiniela]           = useState(null)
  const [cargando, setCargando]           = useState(true)
  const [error, setError]                 = useState(null)
  const [nombre, setNombre]               = useState('')
  // Roster de temporada: si la quiniela pertenece a una temporada, el jugador
  // elige su nombre de la lista (evita variantes tipo "Juanjo"/"Juan José"
  // que partirían su acumulado en la tabla general). "Soy nuevo" permite
  // escribirlo libre, como siempre.
  const [rosterTemporada, setRosterTemporada]     = useState([])
  const [nombreModoNuevo, setNombreModoNuevo]     = useState(false)
  const [picks, setPicks]                 = useState({})
  const [enviado, setEnviado]             = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [nombreError, setNombreError]     = useState('')
  const [mostrarResumen, setMostrarResumen] = useState(false)
  const [celebrando, setCelebrando]       = useState(false)
  const [confirmadoRegla, setConfirmadoRegla] = useState(false)
  const [totalPredicciones, setTotalPredicciones] = useState(0)
  // Igual que en el panel: total por agregación menos los ocultos por el admin.
  const ocultosIds = quiniela?.ocultos ?? []
  const conteoParticipantes = Math.max(0, totalPredicciones - ocultosIds.length)

  // Gate de código de acceso (quinielas privadas)
  const [accesoOk, setAccesoOk]         = useState(false)
  const [codigoInput, setCodigoInput]   = useState('')
  const [codigoError, setCodigoError]   = useState('')
  const [validandoCodigo, setValidandoCodigo] = useState(false)

  // Evitar reenvío desde el mismo dispositivo (mitigación anti-duplicado)
  const [yaEnviadoAntes, setYaEnviadoAntes] = useState(null)

  const visitanteRefs = useRef([])
  const localRefs = useRef([])
  const progresoPrevRef = useRef(0)
  const restauradoRef = useRef(false)
  const lsKey = quinielaId ? `quiniela-${quinielaId}-progreso` : null
  const lsAccesoKey = quinielaId ? `quiniela-${quinielaId}-acceso` : null
  const lsEnviadoKey = quinielaId ? `quiniela-${quinielaId}-enviada` : null

  // Al pasar de un "paso" a otro dentro de esta misma pantalla (código → pago →
  // formulario → resumen → enviado) subimos al inicio, como si fuera pantalla nueva.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [accesoOk, confirmadoRegla, mostrarResumen, enviado])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!quinielaId) { setCargando(false); setError('no-id'); return }
    getDoc(doc(db, 'quinielas', quinielaId))
      .then(snap => {
        if (!snap.exists()) setError('not-found')
        else setQuiniela({ id: snap.id, ...snap.data() })
      })
      .catch(() => setError('error'))
      .finally(() => setCargando(false))
    // Conteo por AGREGACIÓN: 1 lectura en vez de descargar todas las
    // predicciones de la quiniela en cada visita (hallazgo H1 de la auditoría).
    getCountFromServer(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId)))
      .then(c => setTotalPredicciones(c.data().count))
      .catch(() => {})
    // Analítica: cuenta la visita (una vez por sesión).
    registrarVisita()
    registrarVisitaQuiniela(quinielaId)
  }, [quinielaId])

  const partidos   = quiniela?.partidos ?? []
  const cerrada    = quinielaCerrada(quiniela)
  const finalizada = quinielaFinalizada(quiniela)
  const progreso   = partidos.filter((_, i) => pickValido(picks[i])).length
  const completado = nombre.trim().length > 0 && progreso === partidos.length

  // Acceso: si la quiniela no requiere código, accesoOk inmediato.
  // Si requiere código, checar si ya está guardado en localStorage de un acceso previo.
  useEffect(() => {
    if (!quiniela) return
    const codigoReq = (quiniela.codigoAcceso ?? '').trim()
    if (!codigoReq) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccesoOk(true)
      return
    }
    try {
      const guardado = lsAccesoKey ? localStorage.getItem(lsAccesoKey) : null
      if (guardado && guardado === codigoReq) {
        setAccesoOk(true)
      }
    } catch { /* localStorage no disponible */ }
  }, [quiniela, lsAccesoKey])

  const validarCodigo = () => {
    if (validandoCodigo) return
    const codigoReq = (quiniela?.codigoAcceso ?? '').trim()
    const ingresado = codigoInput.trim()
    if (!ingresado) {
      setCodigoError('Ingresa el código que te compartió el organizador.')
      return
    }
    setValidandoCodigo(true)
    // Pequeño delay cosmético + comparación case-insensitive
    setTimeout(() => {
      if (ingresado.toLowerCase() === codigoReq.toLowerCase()) {
        recordarMiQuiniela({ id: quinielaId, codigoAcceso: codigoReq, nombre: quiniela?.nombre ?? '' })
        track('codigo_correcto', { quinielaId })
        setAccesoOk(true)
        setCodigoError('')
      } else {
        track('codigo_incorrecto', { quinielaId })
        setCodigoError('Código incorrecto. Verifica con quien te invitó.')
      }
      setValidandoCodigo(false)
    }, 200)
  }

  // Detectar si ya se envió una predicción para esta quiniela desde este dispositivo.
  // Antes de bloquear, verificamos en el servidor que la predicción SIGA existiendo:
  // si el organizador ya la borró (para que el jugador re-capture sus picks), limpiamos
  // la marca local sola: así puede volver a registrarse en el mismo navegador, sin
  // incógnito ni borrar caché. Si no existe nada, no hay nada que bloquear.
  useEffect(() => {
    if (!quiniela || cerrada || !lsEnviadoKey) return
    let data
    try {
      const raw = localStorage.getItem(lsEnviadoKey)
      if (!raw) return
      data = JSON.parse(raw)
    } catch { return /* corrupto, ignorar */ }
    if (!data?.nombre) return

    let cancelado = false
    const objetivo = normalizarNombre(data.nombre)
    ;(async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'predicciones'),
          where('quinielaId', '==', quinielaId),
        ))
        if (cancelado) return
        const sigueExistiendo = snap.docs.some(d => normalizarNombre(d.data().nombre) === objetivo)
        if (sigueExistiendo) {
          setYaEnviadoAntes(data.nombre)
        } else {
          // El organizador la borró: liberamos este dispositivo para re-capturar.
          try { localStorage.removeItem(lsEnviadoKey) } catch { /* noop */ }
        }
      } catch {
        // Sin conexión / error: mantenemos el bloqueo por precaución.
        if (!cancelado) setYaEnviadoAntes(data.nombre)
      }
    })()

    return () => { cancelado = true }
  }, [quiniela, cerrada, lsEnviadoKey, quinielaId])

  // Restaurar progreso desde localStorage cuando se carga la quiniela (si no está cerrada)
  // En quinielas tipo "bote" NO restauramos confirmadoRegla: forzamos reconfirmación cada vez
  useEffect(() => {
    if (!quiniela || cerrada || restauradoRef.current || !lsKey) return
    restauradoRef.current = true
    try {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return
      const data = JSON.parse(raw)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (data?.nombre && typeof data.nombre === 'string') setNombre(data.nombre)
      if (data?.picks && typeof data.picks === 'object') setPicks(data.picks)
      if (data?.confirmadoRegla === true && !tieneCuota(quiniela)) setConfirmadoRegla(true)
    } catch { /* corrupto, ignorar */ }
  }, [quiniela, cerrada, lsKey])

  // Roster de temporada: nombres con puntos acumulados en la tabla general.
  // Una sola lectura puntual; si falla o no hay temporada, el formulario
  // funciona exactamente como siempre (input libre).
  useEffect(() => {
    const tid = quiniela?.temporadaId
    if (!tid) return undefined
    let vivo = true
    getDoc(doc(db, 'temporadas', tid))
      .then(snap => {
        if (!vivo || !snap.exists()) return
        const nombres = (snap.data().tabla ?? []).map(j => j?.nombre).filter(Boolean)
        setRosterTemporada([...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es')))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [quiniela?.temporadaId])

  // Persistir progreso en localStorage en cada cambio
  // En quinielas tipo "bote" NO persistimos confirmadoRegla
  useEffect(() => {
    if (!lsKey || enviado || cerrada || !restauradoRef.current) return
    if (!nombre.trim() && Object.keys(picks).length === 0 && !confirmadoRegla) return
    try {
      const persistirConfirmacion = !tieneCuota(quiniela) && confirmadoRegla
      localStorage.setItem(lsKey, JSON.stringify({ nombre, picks, confirmadoRegla: persistirConfirmacion }))
    } catch { /* sin espacio o deshabilitado */ }
  }, [nombre, picks, confirmadoRegla, lsKey, enviado, cerrada, quiniela])

  // Celebración al completar todos los picks (transición: < total → === total)
  useEffect(() => {
    const total = partidos.length
    if (total === 0 || cerrada || enviado) return
    const prev = progresoPrevRef.current
    progresoPrevRef.current = progreso
    if (progreso === total && prev < total) {
      navigator.vibrate?.(200)
      setCelebrando(true)
      const t = setTimeout(() => setCelebrando(false), 1500)
      return () => clearTimeout(t)
    }
  }, [progreso, partidos.length, cerrada, enviado])

  // Mantener el badge de cierre actualizado.
  // - Si faltan >24h: solo programa un timeout al momento exacto del cierre.
  // - Si faltan ≤24h: refresca cada minuto para que el contador "Cierra en X" baje.
  useEffect(() => {
    if (!quiniela?.cierre || quinielaCerrada(quiniela)) return
    const d = cierreToDate(quiniela.cierre)
    if (!d) return
    const ms = d.getTime() - Date.now()
    if (ms <= 0) return
    if (ms > 24 * 60 * 60 * 1000) {
      const t = setTimeout(() => setQuiniela(q => ({ ...q })), ms)
      return () => clearTimeout(t)
    }
    const i = setInterval(() => setQuiniela(q => ({ ...q })), 60 * 1000)
    return () => clearInterval(i)
  }, [quiniela])


  const setPick = (i, campo, valor) =>
    setPicks(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), [campo]: valor } }))

  const actualizarNombre = (valor) => {
    const sinEmojis = quitarEmojis(valor)
    setNombre(sinEmojis)
    setNombreError(sinEmojis !== valor ? 'No se permiten emojis en el nombre.' : '')
  }

  const enviar = async () => {
    if (enviando) return
    if (!completado) return
    if (quinielaCerrada(quiniela)) {
      setQuiniela(q => ({ ...q }))
      return
    }
    setEnviando(true)
    setNombreError('')
    try {
      const nombreSinEmojis = quitarEmojis(nombre)
      if (contieneEmoji(nombre)) {
        setNombre(nombreSinEmojis)
        setNombreError('No se permiten emojis en el nombre.')
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      const nombreNormalizado = normalizarNombre(nombreSinEmojis)
      if (!nombreNormalizado) {
        setNombreError('Escribe tu nombre.')
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      // Siempre pedimos nombre completo (nombre + apellido) antes de tocar Firestore.
      if (!tieneNombreYApellido(nombreNormalizado)) {
        setNombreError('Pon tu nombre completo: nombre y al menos un apellido (ej. María González).')
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      const snap = await getDocs(query(
        collection(db, 'predicciones'),
        where('quinielaId', '==', quinielaId)
      ))
      const existe = snap.docs.some(d => normalizarNombre(d.data().nombre) === nombreNormalizado)
      if (existe) {
        setNombreError(`Ya hay alguien registrado como "${nombreNormalizado}". Usa un nombre diferente o añade tu apellido.`)
        setMostrarResumen(false)
        setEnviando(false)
        return
      }
      const docPred = {
        quinielaId,
        nombre: nombreNormalizado,
        picks,
        fecha: new Date().toISOString(),
      }
      // Si la quiniela requiere código, incluirlo para que las reglas lo validen
      const codigoReq = (quiniela?.codigoAcceso ?? '').trim()
      if (codigoReq) docPred.codigoAcceso = codigoReq
      await addDoc(collection(db, 'predicciones'), docPred)
      try { if (lsKey) localStorage.removeItem(lsKey) } catch { /* noop */ }
      // Marcar este dispositivo como "ya envió" para mitigar duplicados accidentales.
      try {
        if (lsEnviadoKey) localStorage.setItem(lsEnviadoKey, JSON.stringify({
          nombre: nombreNormalizado,
          fecha: new Date().toISOString(),
        }))
      } catch { /* noop */ }
      track('prediccion_enviada', { quinielaId })
      registrarEnvio()
      setEnviado(true)
    } catch (err) {
      console.error('Firestore error:', err)
      alerta(`Error al guardar (${err?.code ?? err?.message ?? 'unknown'}). Intenta de nuevo.`)
      setEnviando(false)
    }
  }

  // Estados

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#070d18', color: 'var(--muted)', fontSize: 14 }}>
      Cargando quiniela…
    </div>
  )

  if (error) return (
      <div style={{ minHeight: '100vh', background: '#070d18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ display: 'inline-flex', color: 'var(--yellow)', marginBottom: 20 }}>
          <PredIcon name="warning" size={52} />
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          {error === 'not-found' ? 'Quiniela no encontrada' : 'Error de conexión'}
        </p>
        <p style={{ fontSize: 14, marginBottom: 24 }}>Contacta al organizador para obtener el enlace correcto.</p>
        <a href="/" style={{
          display: 'inline-block', padding: '11px 24px', borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--green), var(--green-light))',
          color: '#07120A', fontWeight: 800, fontSize: 14, textDecoration: 'none',
          boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
        }}>
          ← Ver quinielas abiertas
        </a>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', background: '#070d18', position: 'relative', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="pred-gate-bg-fade" aria-hidden="true" />
      <div className="hero-pad pred-hero-pad" style={{ color: 'var(--text)' }}>
        <div className="pred-brand-row" style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackHomeButton />
          <a className="pred-brand-link" href="/" style={{ textDecoration: 'none' }}>
            <BrandWordmark markSize={24} fontSize={20} />
          </a>
        </div>
      </div>
      <div className="pred-content" style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: 'var(--pred-content-padding, 1.5rem 1rem 6px)', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--green), var(--green-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: '#07120A',
            boxShadow: 'var(--shadow-green)',
          }}>
            <PredIcon name="check" size={36} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, marginBottom: 8, color: 'var(--text-strong)' }}>¡Listo, {nombre}!</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Tus predicciones fueron registradas.</p>
        </div>

        {/* Resumen de picks */}
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 'var(--pred-large-card-padding, 1.25rem)', marginBottom: 12, border: '1px solid var(--green)', boxShadow: 'var(--shadow-md)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Tu quiniela · {quiniela.nombre}
          </p>
          <div style={{ display: 'grid', gap: 'var(--pred-review-gap, 10px)', maxWidth: 'var(--pred-review-max-width, 420px)', margin: '0 auto' }}>
            {partidos.map((p, i) => {
              const pick = picks[i]
              const res  = getPickResultado(pick)
              const info = res ? resultadoInfo(res, p.local, p.visitante) : null
              return (
                <Fragment key={i}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 'var(--pred-review-column-gap, 10px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--pred-review-team-gap, 5px)', minWidth: 0 }}>
                      {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 'var(--pred-review-crest-size, 18px)', height: 'var(--pred-review-crest-size, 18px)', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                      <span style={{ fontSize: 'var(--pred-review-team-size, 13px)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--pred-review-center-gap, 5px)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-review-score-size, 18px)', fontWeight: 700, color: 'var(--text-strong)', padding: 'var(--pred-review-score-padding, 2px 12px)', minWidth: 'var(--pred-review-score-min-width, 58px)', textAlign: 'center', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)' }}>
                        {pick?.local ?? '?'}-{pick?.visitante ?? '?'}
                      </span>
                      <span style={{ fontSize: 'var(--pred-review-badge-size, 10px)', fontWeight: 700, padding: 'var(--pred-review-badge-padding, 2px 8px)', borderRadius: 'var(--radius-full)', background: info?.bg ?? 'transparent', color: info?.color ?? 'transparent', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {info?.label ?? ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pred-review-team-gap, 5px)', minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--pred-review-team-size, 13px)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                      {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 'var(--pred-review-crest-size, 18px)', height: 'var(--pred-review-crest-size, 18px)', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    </div>
                  </div>
                  {i < partidos.length - 1 && <div style={{ borderBottom: '1px solid var(--border)' }} />}
                </Fragment>
              )
            })}
          </div>
        </div>

        {navigator.share ? (
          <button
            onClick={() => navigator.share?.({
              text: `Te invito a participar en la quiniela "${quiniela.nombre}". Registra tus predicciones aquí: ${window.location.origin}/quiniela/${quinielaId}`,
            }).catch(() => {})}
            style={{ ...ctaPrimary(false), marginBottom: 10 }}
          >
            Invitar amigos
          </button>
        ) : (
          <button
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/quiniela/${quinielaId}`).catch(() => {})}
            style={{ ...ctaPrimary(false), marginBottom: 10 }}
          >
            Copiar enlace de invitación
          </button>
        )}

        <a
          href={`/ranking/${quinielaId}`}
          style={{
            display: 'block', textAlign: 'center', padding: 'var(--home-secondary-cta-padding, 12px)', borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.14), rgba(34,197,94,0.06))',
            border: '1px solid rgba(34,197,94,0.42)',
            color: 'var(--green-light)', fontWeight: 700, fontSize: 'var(--home-secondary-cta-size, 14px)', textDecoration: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(34,197,94,0.04)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <PredIcon name="ranking" size={15} />
            Ver ranking
          </span>
        </a>

        <div className="app-footer-slot">
          <Footer />
        </div>
      </div>
    </div>
  )

  const pct = partidos.length > 0 ? (progreso / partidos.length) * 100 : 0
  const pantallaArmonia = !cerrada && !yaEnviadoAntes

  // "Back" por pasos: en vez de salir siempre a Home, retrocede al paso previo
  // dentro de esta pantalla (resumen → formulario → gate de premio/pago). Solo
  // cuando ya no hay paso anterior salimos a la pantalla previa del historial.
  const retroceder = () => {
    if (mostrarResumen) { setMostrarResumen(false); return }
    if (confirmadoRegla && tienePremio(quiniela)) { setConfirmadoRegla(false); return }
    navigate(-1)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070d18', position: 'relative', zIndex: 0, overflow: celebrando ? 'hidden' : 'visible', display: 'flex', flexDirection: 'column' }}>
      <div className="pred-gate-bg-fade" aria-hidden="true" />
      {celebrando && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '2px solid var(--green)', borderRadius: 'var(--radius-md)',
            padding: '14px 22px', boxShadow: 'var(--shadow-green)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--green)',
            animation: 'pop 0.5s ease-out',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <PredIcon name="party" size={19} />
            Picks completos
          </div>
          {Array.from({ length: 28 }).map((_, k) => {
            const colors = ['var(--green)', 'var(--green-light)', 'var(--yellow)', '#FCA5A5']
            const left = (k * 3.7) % 100
            const delay = (k % 7) * 0.08
            const size = 6 + (k % 5) * 2
            return (
              <span key={k} style={{
                position: 'absolute', top: '-20px', left: `${left}%`,
                width: size, height: size, background: colors[k % colors.length],
                borderRadius: k % 2 === 0 ? '50%' : 2,
                animation: `confetti 1.5s ease-in ${delay}s forwards`,
              }} />
            )
          })}
        </div>
      )}

      {/* Hero */}
      <div className="hero-pad pred-hero-pad" style={{ color: 'var(--text)', paddingBottom: pantallaArmonia ? '0.5rem' : undefined }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="pred-brand-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: (cerrada || pantallaArmonia) ? 'var(--ranking-brand-margin-bottom, 16px)' : 8 }}>
            <BackHomeButton onBack={retroceder} label="Volver" title="Volver" />
            {cerrada ? (
              <a href="/" className="ranking-brand-link" aria-label="QuinielApp">
                <BrandMark size={22} />
                <span className="ranking-brand-name">
                  Quiniel<span style={{ color: 'var(--green)' }}>App</span>
                </span>
              </a>
            ) : (
              <a className="pred-brand-link" href="/" style={{ textDecoration: 'none' }}>
                <BrandWordmark markSize={24} fontSize={20} />
              </a>
            )}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-title-size, 24px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 'var(--pred-title-gap, 10px)', letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {quiniela.empresa && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--green-light)',
                border: '1px solid var(--green)', letterSpacing: 0.2,
              }}>
                <PredIcon name="building" size={12} />
                {quiniela.empresa}
              </span>
            )}
            {!pantallaArmonia && quiniela.cierre && (() => {
              // Si ya cerro, el estado se muestra solo en la barra de progreso.
              // Mientras sigue abierta, usamos el timer en vivo.
              // A más de 24h → fecha de cierre.
              if (cerrada) return null
              // tiempoRestante devuelve null si falta más de 24h (caso ya cerrado
              // lo cubre el bloque de arriba); si hay valor, estamos dentro de 24h.
              const tr = tiempoRestante(quiniela.cierre)
              if (tr) return <CuentaRegresiva cierre={quiniela.cierre} />
              return (
                <span style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 600,
                  padding: '4px 12px', borderRadius: 'var(--radius-full)',
                  background: 'var(--neutral-bg)', color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <PredIcon name="clock" size={12} />
                    Cierre: {formatFecha(quiniela.cierre)}
                  </span>
                </span>
              )
            })()}
          </div>
          {cerrada && <ProgresoPasos etapa={finalizada ? 'final' : 'enjuego'} />}
          {pantallaArmonia && <ProgresoPasos etapa="abierta" />}
          {pantallaArmonia && quiniela.cierre && (
            <div style={{
              marginTop: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '8px 12px',
            }}>
              <CuentaRegresiva
                cierre={quiniela.cierre}
                umbralHoras={24 * 365}
                variante="linea"
                prefijo="Cierra en"
              />
            </div>
          )}
        </div>
      </div>

      <div className="pred-content" style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: pantallaArmonia ? 'var(--pred-content-padding-armonia, 0.5rem 1rem 6px)' : 'var(--pred-content-padding, 1.25rem 1rem 6px)', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>

        {/* Quiniela cerrada */}
        {cerrada ? (
          <div style={{ textAlign: 'center', padding: 'var(--pred-closed-padding, 3rem 1.5rem)', maxWidth: 440, margin: '0 auto', width: '100%' }}>
            <span className="pred-live-ball-wrap" aria-hidden="true">
              <span className="pred-live-ball-shadow" />
              <span className="pred-live-ball-icon">
                <PredIcon name="ball" size={56} />
              </span>
            </span>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
              {finalizada ? '¡La quiniela ya terminó!' : '¡Los partidos están en juego!'}
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 28 }}>
              El tiempo para registrar predicciones ya cerró.<br />
              {finalizada ? 'Consulta los resultados finales en el ranking.' : 'Sigue los resultados en el ranking en tiempo real.'}
            </p>
            <a href={`/ranking/${quinielaId}`} style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--green), var(--green-light))',
              color: '#07120A', fontWeight: 800, fontSize: 15, textDecoration: 'none',
              boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
            }}>
              Ver ranking →
            </a>
          </div>

        ) : !accesoOk ? (
          /* Gate: código de acceso (quinielas privadas) */
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
              borderRadius: 14,
              padding: 'var(--pred-large-card-padding, 1.75rem 1.5rem)', marginBottom: 'var(--pred-large-card-gap, 14px)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)',
              textAlign: 'center',
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--muted)', marginBottom: 12,
              }}>
                <PredIcon name="lock" size={26} />
              </div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-card-title-size, 20px)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                Quiniela privada
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
                Escribe el código que te compartió el organizador para registrar tus predicciones.
              </p>
              <label htmlFor="codigo-acceso" style={{ ...lbl, textAlign: 'left', display: 'block' }}>Código de acceso</label>
              <div className="public-code-input-wrap" style={{ position: 'relative', marginBottom: codigoError ? 8 : 14 }}>
                <input
                  id="codigo-acceso"
                  type="text"
                  placeholder="ACME2026"
                  value={codigoInput}
                  autoCapitalize="characters"
                  onChange={e => { setCodigoInput(e.target.value.toUpperCase()); setCodigoError('') }}
                  onKeyDown={e => e.key === 'Enter' && validarCodigo()}
                  autoFocus
                  style={{
                    width: '100%', minHeight: 56,
                    background: 'rgba(6,12,24,0.55)',
                    borderRadius: 10,
                    border: codigoError ? '1px solid var(--red)' : '1px solid rgba(134,239,172,0.36)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 3px rgba(34,197,94,0.14)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 20,
                    textAlign: 'center', letterSpacing: 5, fontWeight: 700,
                  }}
                />
                <span className="public-code-caret" aria-hidden="true" />
              </div>
              {codigoError && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#FCA5A5', marginBottom: 12, textAlign: 'left' }}>
                  <PredIcon name="warning" size={13} />
                  {codigoError}
                </p>
              )}
              <button
                onClick={validarCodigo}
                disabled={validandoCodigo}
                style={ctaPrimary(validandoCodigo)}
              >
                {validandoCodigo ? 'Validando…' : 'Entrar a la quiniela →'}
              </button>
              <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: 'var(--muted-soft)', marginTop: 12 }}>
                <PredIcon name="check" size={12} />
                Sin cuenta ni registro · solo tu nombre
              </p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Solo ver el{' '}
              <a
                href={`/ranking/${quinielaId}`}
                style={{ color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}
              >
                ranking
              </a>
            </p>
          </div>

        ) : yaEnviadoAntes ? (
          /* Ya envió desde este dispositivo (mitigación duplicados) */
          <div>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              padding: 'var(--pred-large-card-padding, 1.75rem 1.5rem)', marginBottom: 'var(--pred-large-card-gap, 14px)',
              border: '1.5px solid var(--green)', boxShadow: 'var(--shadow-md)', textAlign: 'center',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--green), var(--green-light))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px', color: '#07120A',
                boxShadow: 'var(--shadow-green)',
              }}>
                <PredIcon name="check" size={30} />
              </div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-card-title-size, 20px)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                Ya enviaste tu predicción
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
                Quedó registrada como <strong style={{ color: 'var(--text)' }}>{yaEnviadoAntes}</strong>.<br />
                Si necesitas cambiar algo, contacta al organizador.
              </p>
              <a
                href={`/ranking/${quinielaId}`}
                style={{
                  display: 'block', textAlign: 'center', padding: '12px 28px', borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, var(--green), var(--green-light))',
                  color: '#07120A', fontWeight: 800, fontSize: 15, textDecoration: 'none',
                  boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
                }}
              >
                Ver ranking →
              </a>
            </div>
          </div>

        ) : (tienePremio(quiniela) && !confirmadoRegla) ? (
          /* Banner de premio + confirmación */
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
              borderRadius: 14,
              padding: 'var(--pred-large-card-padding, 1.75rem 1.5rem)', marginBottom: 'var(--pred-large-card-gap, 14px)',
              border: '1px solid rgba(134,239,172,0.36)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32), 0 0 0 3px rgba(34,197,94,0.10)',
              textAlign: 'center',
            }}>
              <div style={{ display: 'inline-flex', color: 'var(--yellow)', marginBottom: 8 }}>
                <PredIcon name="money" size={40} />
              </div>
              {(() => {
                const desglose = desglosePremio(quiniela, conteoParticipantes)
                const boteTotal = calcularBote(quiniela, conteoParticipantes)
                const cuotaNum = Number(quiniela.cuota) || 0
                const esPrimero = conteoParticipantes === 0

                const PillPrimero = () => (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: 'rgba(6,12,24,0.6)', borderRadius: 'var(--radius-full)',
                    padding: '6px 18px 6px 6px', margin: '2px 0 12px',
                  }}>
                    <span style={{
                      width: 34, height: 34, borderRadius: '50%',
                      border: '1.5px dashed rgba(134,239,172,0.55)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--green)', flexShrink: 0,
                    }}>
                      <PredIcon name="target" size={15} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                      Sé el primero en entrar
                    </span>
                  </div>
                )

                const AVATAR_TONOS = ['#3B4A63', '#3F4A2E', '#4A3B52']
                const PillParticipantes = () => (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: 'rgba(6,12,24,0.6)', borderRadius: 'var(--radius-full)',
                    padding: '6px 18px 6px 6px', margin: '2px 0 12px',
                  }}>
                    <span style={{ display: 'inline-flex' }}>
                      {AVATAR_TONOS.map((bg, idx) => (
                        <span key={idx} aria-hidden="true" style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: bg, border: '2px solid #151F32',
                          marginLeft: idx === 0 ? 0 : -10, flexShrink: 0,
                        }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                      {conteoParticipantes} ya {conteoParticipantes === 1 ? 'va' : 'van'} dentro
                    </span>
                  </div>
                )

                if (desglose) {
                  const esFijoPuro = cuotaNum === 0
                  return (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                        {cuotaNum > 0 ? 'Cuota para participar' : 'Premio de esta quiniela'}
                      </p>
                      <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-amount-size, 34px)', fontWeight: 800, color: 'var(--yellow)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                        {formatearMXN(cuotaNum > 0 ? cuotaNum : boteTotal)}
                      </p>
                      {esPrimero ? <PillPrimero /> : (esFijoPuro && <PillParticipantes />)}
                      {desglose.fijo > 0 && desglose.cuota > 0 && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontStyle: 'italic' }}>
                          <span style={{ fontFamily: 'var(--font-display)' }}>{formatearMXN(desglose.fijo)}</span> fijo + <span style={{ fontFamily: 'var(--font-display)' }}>{formatearMXN(desglose.deCuotas)}</span> de cuotas
                        </p>
                      )}
                      {cuotaNum > 0 && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic' }}>
                          Bote actual <span style={{ fontFamily: 'var(--font-display)' }}>{formatearMXN(boteTotal)}</span>
                          {!esPrimero && <> ({conteoParticipantes} {conteoParticipantes === 1 ? 'participante' : 'participantes'})</>}
                          {' '}· crece <span style={{ fontFamily: 'var(--font-display)' }}>{formatearMXN(cuotaNum)}</span> por participante.
                        </p>
                      )}
                    </>
                  )
                }
                return (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                      {quiniela.tipoPremio === TIPO_PREMIO.BOTE ? 'Cuota para participar' : 'Premio de esta quiniela'}
                    </p>
                    {quiniela.tipoPremio === TIPO_PREMIO.BOTE && (
                      <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-amount-size, 34px)', fontWeight: 800, color: 'var(--yellow)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                        {formatearMXN(Number(quiniela.cuota) || 0)}
                      </p>
                    )}
                    {quiniela.tipoPremio === TIPO_PREMIO.BOTE && esPrimero && <PillPrimero />}
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: quiniela.tipoPremio === TIPO_PREMIO.BOTE ? 20 : 34, fontWeight: 800, color: 'var(--yellow)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                      {formatearMXN(boteTotal)}
                    </p>
                    {quiniela.tipoPremio !== TIPO_PREMIO.BOTE && (esPrimero ? <PillPrimero /> : <PillParticipantes />)}
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      {quiniela.tipoPremio === TIPO_PREMIO.BOTE
                        ? (esPrimero ? 'Bote actual' : <>Bote actual (<span style={{ fontFamily: 'var(--font-display)' }}>{conteoParticipantes}</span> {conteoParticipantes === 1 ? 'participante' : 'participantes'})</>)
                        : 'Premio fijo otorgado por el organizador'}
                    </p>
                  </>
                )
              })()}
              <div style={{
                background: 'rgba(6,12,24,0.55)', borderRadius: 10,
                padding: 'var(--pred-info-box-padding, 12px 14px)', marginTop: 'var(--pred-info-box-gap, 14px)', marginBottom: 4,
                border: '1px solid rgba(255,255,255,0.07)', textAlign: 'left',
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Cómo se reparte
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(134,239,172,0.35)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)',
                  }}>
                    <PredIcon name="trophy" size={16} />
                  </span>
                  <p style={{ fontSize: 'var(--pred-info-size, 13px)', color: 'var(--text)', lineHeight: 1.5 }}>
                    {(() => {
                      const texto = descripcionRegla(quiniela)
                      const corte = texto.indexOf('. ')
                      if (corte === -1) return texto
                      return (
                        <>
                          <strong style={{ color: 'var(--green-light)' }}>{texto.slice(0, corte + 1)}</strong>{texto.slice(corte + 1)}
                        </>
                      )
                    })()}
                  </p>
                </div>
              </div>
            </div>
            {tieneCuota(quiniela) && (
              <p style={{
                fontSize: 'var(--pred-body-size, 12px)', color: 'var(--yellow-soft)', lineHeight: 1.5,
                background: 'var(--yellow-bg)', border: '1px solid rgba(250,204,21,0.35)',
                borderRadius: 10, padding: 'var(--pred-warning-padding, 10px 12px)', marginBottom: 'var(--pred-card-gap, 12px)',
                textAlign: 'center',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PredIcon name="warning" size={14} />
                  <span>Al continuar declaras que <strong>ya realizaste tu pago</strong>.</span>
                </span>
              </p>
            )}
            <button
              onClick={() => setConfirmadoRegla(true)}
              style={ctaPrimary(false)}
            >
              {tieneCuota(quiniela) ? 'Confirmo que ya pagué →' : 'Entendido, continuar →'}
            </button>
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>
              Solo ver el{' '}
              <a
                href={`/ranking/${quinielaId}`}
                style={{ color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}
              >
                ranking
              </a>
            </p>
          </div>
        ) : (
          <>
            {/* Banner "Solo por diversión" para quinielas sin premio */}
            {!tienePremio(quiniela) && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
                borderRadius: 12,
                padding: '12px 14px', marginBottom: 12,
                border: '1px dashed rgba(255,255,255,0.16)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ display: 'inline-flex', color: 'var(--green-light)', flexShrink: 0 }} aria-hidden="true">
                  <PredIcon name="party" size={24} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                    Solo por diversión
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
                    Esta quiniela no tiene premio en dinero ni cuota. ¡Juega por la gloria y el ranking!
                  </p>
                </div>
              </div>
            )}

            {/* Pantalla de resumen */}
            {mostrarResumen ? (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
              borderRadius: 14, padding: 'var(--pred-large-card-padding, 1.5rem)', marginBottom: 10,
              border: '1px solid rgba(134,239,172,0.36)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32), 0 0 0 3px rgba(34,197,94,0.10)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Revisa tus picks
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 16 }}>{nombre}</p>

              <div style={{ display: 'grid', gap: 'var(--pred-review-gap, 10px)', maxWidth: 'var(--pred-review-max-width, 420px)', margin: '0 auto' }}>
                {partidos.map((p, i) => {
                  const pick = picks[i]
                  const res  = getPickResultado(pick)
                  const info = res ? resultadoInfo(res, p.local, p.visitante) : null
                  return (
                    <Fragment key={i}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 'var(--pred-review-column-gap, 10px)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--pred-review-team-gap, 5px)', minWidth: 0 }}>
                          {p.escudoLocal && (
                            <img src={p.escudoLocal} alt="" style={{ width: 'var(--pred-review-crest-size, 18px)', height: 'var(--pred-review-crest-size, 18px)', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                          )}
                          <span style={{ fontSize: 'var(--pred-review-team-size, 13px)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--pred-review-center-gap, 5px)' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-review-score-size, 20px)', fontWeight: 700, color: 'var(--text-strong)', padding: 'var(--pred-review-score-padding, 2px 14px)', minWidth: 'var(--pred-review-score-min-width, 64px)', textAlign: 'center', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)' }}>
                            {pick?.local ?? '?'} - {pick?.visitante ?? '?'}
                          </span>
                          <span style={{ fontSize: 'var(--pred-review-badge-size, 10px)', fontWeight: 700, padding: 'var(--pred-review-badge-padding, 2px 8px)', borderRadius: 'var(--radius-full)', background: info?.bg ?? 'transparent', color: info?.color ?? 'transparent', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {info?.label ?? ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pred-review-team-gap, 5px)', minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--pred-review-team-size, 13px)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                          {p.escudoVisitante && (
                            <img src={p.escudoVisitante} alt="" style={{ width: 'var(--pred-review-crest-size, 18px)', height: 'var(--pred-review-crest-size, 18px)', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                          )}
                        </div>
                      </div>
                      {i < partidos.length - 1 && <div style={{ borderBottom: '1px solid var(--border)' }} />}
                    </Fragment>
                  )
                })}
              </div>
            </div>

            {nombreError && (
              <div style={{
                marginBottom: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--red-bg)', border: '1px solid var(--red)',
                fontSize: 13, color: '#FCA5A5', lineHeight: 1.5,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PredIcon name="warning" size={14} />
                  <span>{nombreError}</span>
                </span>
              </div>
            )}

            <button onClick={enviar} disabled={enviando} className={enviando ? undefined : 'green-shine-button'} style={{ ...ctaPrimary(enviando), marginBottom: 10 }}>
              <span style={{ position: 'relative', zIndex: 1 }}>
                {enviando ? 'Enviando…' : 'Enviar predicciones ahora →'}
              </span>
            </button>
            <p className="legal-note" style={{ margin: '0 0 12px' }}>
              Al enviar aceptas los <a href="/terminos">Términos</a> y el <a href="/privacidad">Aviso de Privacidad</a>.
              Tu nombre y predicciones serán públicos en el ranking.
            </p>
            <button
              onClick={() => setMostrarResumen(false)}
              disabled={enviando}
              style={{
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)',
                background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Editar picks
            </button>
          </div>

            /* Formulario principal */
            ) : (
          <>
            {/* Nombre. Con temporada: selector del roster para que los puntos
                se acumulen bajo el mismo nombre; "Soy nuevo" da el input libre. */}
            {(() => {
              const mostrarRoster = rosterTemporada.length > 0 && !nombreModoNuevo &&
                (nombre === '' || rosterTemporada.includes(nombre))
              const similarRoster = nombreModoNuevo && rosterTemporada.length > 0 && nombre.trim().length >= 3
                ? rosterTemporada.find(n => {
                    const tokN = n.toLocaleLowerCase('es-MX').split(' ')[0]
                    const tokE = nombre.trim().toLocaleLowerCase('es-MX').split(' ')[0]
                    return n.toLocaleLowerCase('es-MX') !== nombre.trim().toLocaleLowerCase('es-MX') && tokN === tokE
                  })
                : null
              return (
            <div style={card}>
              {mostrarRoster ? (
                <>
                  <label htmlFor="jugador-roster" style={lbl}>
                    ¿Quién eres?
                  </label>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    Esta quiniela es parte de una temporada: elige tu nombre y tus puntos se suman a la tabla general.
                  </p>
                  <select
                    id="jugador-roster"
                    value={rosterTemporada.includes(nombre) ? nombre : ''}
                    onChange={e => actualizarNombre(e.target.value)}
                    style={{ fontSize: 'var(--pred-input-size, 15px)', padding: 'var(--pred-input-padding, 10px 12px)', marginBottom: 0 }}
                  >
                    <option value="" disabled>Selecciona tu nombre</option>
                    {rosterTemporada.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setNombreModoNuevo(true); actualizarNombre('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 10 }}
                  >
                    Soy nuevo en la temporada
                  </button>
                </>
              ) : (
                <>
                  <label htmlFor="jugador-nombre" style={lbl}>
                    Tu nombre completo
                  </label>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    Nombre y al menos un apellido (ej. María González).
                  </p>
                  <input
                    id="jugador-nombre"
                    type="text"
                    placeholder="Ej. María González"
                    value={nombre}
                    maxLength={40}
                    onChange={e => actualizarNombre(e.target.value)}
                    style={{ fontSize: 'var(--pred-input-size, 15px)', padding: 'var(--pred-input-padding, 10px 12px)', borderColor: nombreError ? 'var(--red)' : undefined }}
                  />
                  {similarRoster && (
                    <p style={{ fontSize: 12, color: 'var(--yellow-soft, #FDE68A)', marginTop: 8, lineHeight: 1.5 }}>
                      Ya existe <strong style={{ color: 'var(--text)' }}>{similarRoster}</strong> en esta temporada. ¿Eres tú?{' '}
                      <button
                        type="button"
                        onClick={() => { setNombreModoNuevo(false); actualizarNombre(similarRoster) }}
                        style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Usar ese nombre
                      </button>
                    </p>
                  )}
                  {rosterTemporada.length > 0 && nombreModoNuevo && (
                    <button
                      type="button"
                      onClick={() => { setNombreModoNuevo(false); actualizarNombre('') }}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 10 }}
                    >
                      Mejor elegir mi nombre de la lista
                    </button>
                  )}
                </>
              )}
              {nombreError && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{nombreError}</p>
              )}
            </div>
              )
            })()}

            {/* Partidos */}
            {/* Reglas de puntos */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--pred-rules-margin-bottom, 16px)', flexWrap: 'nowrap' }}>
              {[
                { pts: '1 pt', desc: 'resultado', icon: 'check', color: 'var(--green)' },
                { pts: '+2 pts', desc: 'exacto', icon: 'target', color: 'var(--green-light)' },
              ].map(r => (
                <div key={r.desc} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'rgba(6,12,24,0.55)', borderRadius: 10, padding: 'var(--pred-rule-padding, 6px 10px)',
                  border: '1px solid rgba(255,255,255,0.07)', flex: '1 1 auto', minWidth: 0, textAlign: 'center',
                }}>
                  <span style={{ display: 'inline-flex', color: r.color, flexShrink: 0 }}>
                    <PredIcon name={r.icon} size={13} />
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pred-rule-points-size, 13px)', fontWeight: 700, color: 'var(--text-strong)', flexShrink: 0 }}>{r.pts}</span>
                  <span style={{ fontSize: 'var(--pred-rule-desc-size, 11.5px)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginBottom: 12, lineHeight: 1.5 }}>
              El resultado se toma del marcador al final del partido (incluye tiempo extra si lo hay). <strong style={{ color: 'var(--text)' }}>No cuentan los goles de tanda de penales.</strong>
            </p>

            {partidos.map((p, i) => {
              const pick = picks[i]
              const res  = getPickResultado(pick)
              const info = res ? resultadoInfo(res, p.local, p.visitante) : null

              return (
                <div key={i} style={{ ...card, paddingBottom: 'var(--pred-match-card-padding-bottom, 0.85rem)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--pred-match-header-gap, 16px)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Partido {i + 1}
                    </span>
                    {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatFecha(p.hora)}</span>}
                  </div>

                  {/* Score inputs */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--pred-score-gap, 12px)' }}>
                    {/* Local */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 'var(--pred-team-crest-size, 36px)', height: 'var(--pred-team-crest-size, 36px)', objectFit: 'contain', display: 'block', margin: '0 auto var(--pred-team-crest-gap, 4px)' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 'var(--pred-team-name-size, 12px)', fontWeight: 700, color: 'var(--text)', marginBottom: 'var(--pred-team-name-gap, 6px)', maxWidth: 'var(--pred-team-name-width, 80px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.local}
                      </span>
                      <input
                        ref={el => { localRefs.current[i] = el }}
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.local ?? ''}
                        onChange={e => {
                          const eraVacio = (pick?.local ?? '') === ''
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                          const norm = v === '' ? '' : String(Number(v))
                          setPick(i, 'local', norm)
                          if (eraVacio && v.length === 1) visitanteRefs.current[i]?.focus()
                        }}
                        placeholder="-"
                        style={{
                          width: 'var(--pred-score-input-width, 68px)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--pred-score-input-size, 30px)', fontWeight: 700,
                          padding: 'var(--pred-score-input-padding, 10px 4px)', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: pick?.local, visitante: '0' }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.local !== undefined && pick?.local !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: 'var(--pred-score-separator-size, 22px)', color: 'var(--muted-dim)', fontWeight: 700, paddingBottom: 'var(--pred-score-separator-pad, 12px)' }}>-</span>

                    {/* Visitante */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 'var(--pred-team-crest-size, 36px)', height: 'var(--pred-team-crest-size, 36px)', objectFit: 'contain', display: 'block', margin: '0 auto var(--pred-team-crest-gap, 4px)' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 'var(--pred-team-name-size, 12px)', fontWeight: 700, color: 'var(--text)', marginBottom: 'var(--pred-team-name-gap, 6px)', maxWidth: 'var(--pred-team-name-width, 80px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.visitante}
                      </span>
                      <input
                        ref={el => { visitanteRefs.current[i] = el }}
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.visitante ?? ''}
                        onChange={e => {
                          const eraVacio = (pick?.visitante ?? '') === ''
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                          setPick(i, 'visitante', v === '' ? '' : String(Number(v)))
                          if (eraVacio && v.length === 1) localRefs.current[i + 1]?.focus()
                        }}
                        placeholder="-"
                        style={{
                          width: 'var(--pred-score-input-width, 68px)', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--pred-score-input-size, 30px)', fontWeight: 700,
                          padding: 'var(--pred-score-input-padding, 10px 4px)', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: '0', visitante: pick?.visitante }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.visitante !== undefined && pick?.visitante !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Resultado derivado */}
                  <div style={{ textAlign: 'center', marginTop: info ? 'var(--pred-result-margin-top, 12px)' : 0, minHeight: info ? 'var(--pred-result-min-height, 24px)' : 0 }}>
                    {info && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 'var(--pred-progress-margin, 14px 0)' }}>
              <div style={{ flex: 1, height: 5, background: 'var(--card-light)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 'var(--radius-full)', background: 'linear-gradient(90deg, var(--green), var(--green-light))', width: `${pct}%`, transition: 'width 0.25s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {progreso}/{partidos.length} partidos
              </span>
            </div>

            {/* Botón revisar */}
            <button
              onClick={() => { if (completado) setMostrarResumen(true) }}
              disabled={!completado}
              style={ctaPrimary(!completado)}
            >
              Revisar predicciones →
            </button>
            {!completado && (
              <p style={{ fontSize: 'var(--pred-helper-size, 12px)', color: 'var(--muted)', textAlign: 'center', marginTop: 'var(--pred-helper-margin-top, 8px)' }}>
                {!nombre.trim() && progreso < partidos.length
                  ? `Falta tu nombre y ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''}`
                  : !nombre.trim()
                    ? 'Falta tu nombre'
                    : `Falta${partidos.length - progreso !== 1 ? 'n' : ''} ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''} por completar`
                }
              </p>
            )}
          </>
            )}
          </>
        )}
        <div className="app-footer-slot">
          <Footer />
        </div>
      </div>
    </div>
  )
}
