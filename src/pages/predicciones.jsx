import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { doc, getDoc, addDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db, track } from '../firebase'
import { cierreToDate, quinielaCerrada, tiempoRestante } from '../utils/cierre'
import { tienePremio, tieneCuota, descripcionRegla, calcularBote, desglosePremio, TIPO_PREMIO, formatearMXN } from '../utils/premios'
import { normalizarNombre, tieneNombreYApellido } from '../utils/nombres'
import { PromoCTA } from '../components/PromoCTA'
import { CuentaRegresiva } from '../components/CuentaRegresiva'
import { Footer } from '../components/Footer'
import { useDialog } from '../components/Dialogs'

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
  width: '100%', padding: '15px', borderRadius: 'var(--radius-md)', border: 'none',
  background: disabled ? 'var(--card-light)' : 'linear-gradient(135deg, var(--green), var(--green-light))',
  color: disabled ? 'var(--muted)' : '#07120A', fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : 'var(--shadow-green)',
})

const card = {
  background: 'var(--card)', borderRadius: 'var(--radius-md)',
  padding: '1.1rem 1.25rem', marginBottom: 10,
  border: '1px solid var(--border)',
}

const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }

export default function Predicciones() {
  const { alerta } = useDialog()
  const [searchParams] = useSearchParams()
  const { id: idDeRuta } = useParams()
  // Acepta /quiniela/<id> (ruta nueva) y /?q=<id> (links viejos ya compartidos).
  const quinielaId = idDeRuta || searchParams.get('q')

  const [quiniela, setQuiniela]           = useState(null)
  const [cargando, setCargando]           = useState(true)
  const [error, setError]                 = useState(null)
  const [nombre, setNombre]               = useState('')
  const [picks, setPicks]                 = useState({})
  const [enviado, setEnviado]             = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [nombreError, setNombreError]     = useState('')
  const [mostrarResumen, setMostrarResumen] = useState(false)
  const [celebrando, setCelebrando]       = useState(false)
  const [confirmadoRegla, setConfirmadoRegla] = useState(false)
  const [conteoParticipantes, setConteoParticipantes] = useState(0)

  // Gate de código de acceso (quinielas privadas)
  const [accesoOk, setAccesoOk]         = useState(false)
  const [codigoInput, setCodigoInput]   = useState('')
  const [codigoError, setCodigoError]   = useState('')
  const [validandoCodigo, setValidandoCodigo] = useState(false)

  // Evitar reenvío desde el mismo dispositivo (mitigación anti-duplicado)
  const [yaEnviadoAntes, setYaEnviadoAntes] = useState(null)

  const visitanteRefs = useRef([])
  const progresoPrevRef = useRef(0)
  const restauradoRef = useRef(false)
  const lsKey = quinielaId ? `quiniela-${quinielaId}-progreso` : null
  const lsAccesoKey = quinielaId ? `quiniela-${quinielaId}-acceso` : null
  const lsEnviadoKey = quinielaId ? `quiniela-${quinielaId}-enviada` : null

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
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId)))
      .then(snap => setConteoParticipantes(snap.size))
      .catch(() => {})
  }, [quinielaId])

  const partidos   = quiniela?.partidos ?? []
  const cerrada    = quinielaCerrada(quiniela)
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        try { if (lsAccesoKey) localStorage.setItem(lsAccesoKey, codigoReq) } catch { /* noop */ }
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
  // (Mitigación anti-duplicado — bypaseable con incógnito/otro navegador, pero cubre
  // el caso honesto de gente que reabre el link sin querer.)
  useEffect(() => {
    if (!quiniela || cerrada || !lsEnviadoKey) return
    try {
      const raw = localStorage.getItem(lsEnviadoKey)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data?.nombre) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setYaEnviadoAntes(data.nombre)
      }
    } catch { /* corrupto, ignorar */ }
  }, [quiniela, cerrada, lsEnviadoKey])

  // Restaurar progreso desde localStorage cuando se carga la quiniela (si no está cerrada)
  // En quinielas tipo "bote" NO restauramos confirmadoRegla — forzamos reconfirmación cada vez
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
      const nombreNormalizado = normalizarNombre(nombre)
      // Si la quiniela requiere nombre completo, validar antes de tocar Firestore
      if (quiniela?.requiereApellido && !tieneNombreYApellido(nombreNormalizado)) {
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
      setEnviado(true)
    } catch (err) {
      console.error('Firestore error:', err)
      alerta(`Error al guardar (${err?.code ?? err?.message ?? 'unknown'}). Intenta de nuevo.`)
      setEnviando(false)
    }
  }

  // ── Estados ─────────────────────────────────────────────────

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando quiniela…
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⚠️</div>
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
          ← Ver quinielas activas
        </a>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp</a>
          <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }} aria-label="Volver a inicio">← Inicio</a>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--green), var(--green-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 36, color: '#07120A',
            boxShadow: 'var(--shadow-green)',
          }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, marginBottom: 8, color: 'var(--text-strong)' }}>¡Listo, {nombre}!</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Tus predicciones fueron registradas.</p>
        </div>

        {/* Resumen de picks */}
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: 12, border: '1px solid var(--green)', boxShadow: 'var(--shadow-md)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Tu quiniela · {quiniela.nombre}
          </p>
          {partidos.map((p, i) => {
            const pick = picks[i]
            const res  = getPickResultado(pick)
            const info = res ? resultadoInfo(res, p.local, p.visitante) : null
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                  {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', padding: '2px 12px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                  {pick?.local ?? '?'}–{pick?.visitante ?? '?'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{p.visitante}</span>
                  {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                </div>
                {info && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color, flexShrink: 0 }}>{info.label}</span>}
              </div>
            )
          })}
        </div>

        {navigator.share ? (
          <button
            onClick={() => navigator.share?.({
              title: `Quiniela ${quiniela.nombre}`,
              text: `Te invito a participar en la quiniela "${quiniela.nombre}". Registra tus predicciones aquí:`,
              url: `${window.location.origin}/quiniela/${quinielaId}`,
            }).catch(() => {})}
            style={{ ...ctaPrimary(false), marginBottom: 10 }}
          >
            Compartir quiniela
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
            display: 'block', textAlign: 'center', padding: '12px 28px', borderRadius: 'var(--radius-md)',
            background: 'var(--card-light)', color: 'var(--muted)',
            fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '1px solid var(--border-strong)',
          }}
        >
          Ver ranking →
        </a>

        <PromoCTA />
        <Footer />
      </div>
    </div>
  )

  const pct = partidos.length > 0 ? (progreso / partidos.length) * 100 : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: celebrando ? 'hidden' : 'visible' }}>
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
            🎉 ¡Picks completos!
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
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', fontWeight: 700, textDecoration: 'none' }}>⚽ QuinielApp</a>
            <a href="/" style={{ background: 'var(--neutral-bg)', color: 'var(--text)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)' }}>← Inicio</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 10, letterSpacing: '-0.01em' }}>{quiniela.nombre}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {quiniela.empresa && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--neutral-bg)', color: 'var(--green-light)',
                border: '1px solid var(--green)', letterSpacing: 0.2,
              }}>
                🏢 {quiniela.empresa}
              </span>
            )}
            {quiniela.cierre && (() => {
              // Cerrada → badge fijo. Dentro de 24h → timer en vivo (mismo que
              // ranking/home). A más de 24h → fecha de cierre.
              if (cerrada) {
                return (
                  <span style={{
                    display: 'inline-block', fontSize: 12, fontWeight: 700,
                    padding: '4px 12px', borderRadius: 'var(--radius-full)',
                    background: 'var(--red-bg-strong)', color: '#FCA5A5',
                    border: '1px solid var(--red)',
                  }}>
                    🔒 Quiniela cerrada
                  </span>
                )
              }
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
                  ⏳ Cierre: {formatFecha(quiniela.cierre)}
                </span>
              )
            })()}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* ── Quiniela cerrada ────────────────────────────────────────── */}
        {cerrada ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚽</div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
              ¡Los partidos están en juego!
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 28 }}>
              El tiempo para registrar predicciones ya cerró.<br />
              Sigue los resultados en el ranking en tiempo real.
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
          /* ── Gate: código de acceso (quinielas privadas) ─────────────── */
          <div>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              padding: '1.75rem 1.5rem', marginBottom: 14,
              border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-md)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                Quiniela privada
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
                {quiniela?.empresa
                  ? <>Esta quiniela es exclusiva de <strong style={{ color: 'var(--text)' }}>{quiniela.empresa}</strong>. Ingresa el código que te compartieron.</>
                  : 'Ingresa el código de acceso que te compartió el organizador.'}
              </p>
              <label htmlFor="codigo-acceso" style={{ ...lbl, textAlign: 'left', display: 'block' }}>Código de acceso</label>
              <input
                id="codigo-acceso"
                type="text"
                placeholder="Ej. ACME2026"
                value={codigoInput}
                onChange={e => { setCodigoInput(e.target.value); setCodigoError('') }}
                onKeyDown={e => e.key === 'Enter' && validarCodigo()}
                autoFocus
                style={{
                  fontSize: 15, marginBottom: codigoError ? 8 : 14,
                  textAlign: 'center', letterSpacing: 2, fontWeight: 700,
                  borderColor: codigoError ? 'var(--red)' : undefined,
                }}
              />
              {codigoError && (
                <p style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 12, textAlign: 'left' }}>
                  ⚠️ {codigoError}
                </p>
              )}
              <button
                onClick={validarCodigo}
                disabled={validandoCodigo}
                style={ctaPrimary(validandoCodigo)}
              >
                {validandoCodigo ? 'Validando…' : 'Entrar →'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 6 }}>
              ¿Solo quieres ver el ranking?{' '}
              <a
                href={`/ranking/${quinielaId}`}
                style={{ color: 'var(--green-light)', fontWeight: 700, textDecoration: 'underline' }}
              >
                Entrar al ranking
              </a>
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
              ¿No tienes el código? Pídelo al organizador de la quiniela.
            </p>
          </div>

        ) : yaEnviadoAntes ? (
          /* ── Ya envió desde este dispositivo (mitigación duplicados) ─── */
          <div>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              padding: '1.75rem 1.5rem', marginBottom: 14,
              border: '1.5px solid var(--green)', boxShadow: 'var(--shadow-md)', textAlign: 'center',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--green), var(--green-light))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px', fontSize: 30, color: '#07120A',
                boxShadow: 'var(--shadow-green)',
              }}>✓</div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
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
            <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
              ¿No eres tú?{' '}
              <button
                onClick={() => {
                  try { if (lsEnviadoKey) localStorage.removeItem(lsEnviadoKey) } catch { /* noop */ }
                  setYaEnviadoAntes(null)
                }}
                style={{
                  background: 'none', border: 'none', color: 'var(--green-light)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Registrar a otra persona
              </button>
            </p>
          </div>

        ) : (tienePremio(quiniela) && !confirmadoRegla) ? (
          /* ── Banner de premio + confirmación ─────────────────────────── */
          <div>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              padding: '1.75rem 1.5rem', marginBottom: 14,
              border: '1.5px solid var(--green)', boxShadow: 'var(--shadow-md)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
              {(() => {
                const desglose = desglosePremio(quiniela, conteoParticipantes)
                const boteTotal = calcularBote(quiniela, conteoParticipantes)
                const cuotaNum = Number(quiniela.cuota) || 0
                if (desglose) {
                  return (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                        {cuotaNum > 0 ? 'Cuota para participar' : 'Premio de esta quiniela'}
                      </p>
                      {cuotaNum > 0 && (
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800, color: 'var(--green)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                          {formatearMXN(cuotaNum)}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.5 }}>
                        Premio total: <strong style={{ color: 'var(--text)' }}>{formatearMXN(boteTotal)}</strong> ({conteoParticipantes} {conteoParticipantes === 1 ? 'participante' : 'participantes'})
                      </p>
                      {desglose.fijo > 0 && desglose.cuota > 0 && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontStyle: 'italic' }}>
                          {formatearMXN(desglose.fijo)} fijo + {formatearMXN(desglose.deCuotas)} de cuotas
                        </p>
                      )}
                      {cuotaNum > 0 && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic' }}>
                          El bote crece {formatearMXN(cuotaNum)} por cada nuevo participante.
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
                      <p style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800, color: 'var(--green)', marginBottom: 6, letterSpacing: '-0.01em' }}>
                        {formatearMXN(Number(quiniela.cuota) || 0)}
                      </p>
                    )}
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: quiniela.tipoPremio === TIPO_PREMIO.BOTE ? 20 : 34, fontWeight: 800, color: 'var(--green)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                      {formatearMXN(boteTotal)}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      {quiniela.tipoPremio === TIPO_PREMIO.BOTE
                        ? `Bote actual (${conteoParticipantes} ${conteoParticipantes === 1 ? 'participante' : 'participantes'})`
                        : 'Premio fijo otorgado por el organizador'}
                    </p>
                  </>
                )
              })()}
              <div style={{
                background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)',
                padding: '12px 14px', marginTop: 14, marginBottom: 4,
                border: '1px solid var(--border)', textAlign: 'left',
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Cómo se reparte
                </p>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                  {descripcionRegla(quiniela)}
                </p>
              </div>
            </div>
            {tieneCuota(quiniela) && (
              <p style={{
                fontSize: 12, color: 'var(--yellow-soft)', lineHeight: 1.5,
                background: 'var(--yellow-bg)', border: '1px solid var(--yellow-soft)',
                borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12,
              }}>
                ⚠️ <strong>Realiza tu pago primero.</strong> Al continuar declaras que <strong>ya realizaste tu pago</strong> (transferencia o efectivo). Toda predicción sin pago confirmado se elimina automáticamente.
              </p>
            )}
            <button
              onClick={() => setConfirmadoRegla(true)}
              style={ctaPrimary(false)}
            >
              {tieneCuota(quiniela) ? 'Confirmo que ya pagué →' : 'Entendido, continuar →'}
            </button>
          </div>
        ) : (
          <>
            {/* Banner "Solo por diversión" para quinielas sin premio */}
            {!tienePremio(quiniela) && (
              <div style={{
                background: 'var(--card)', borderRadius: 'var(--radius-md)',
                padding: '12px 14px', marginBottom: 12,
                border: '1px dashed var(--border-strong)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">🎉</span>
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

            {/* Reglas de puntos */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { pts: '1 pt',   desc: 'Resultado correcto' },
                { pts: '+2 pts', desc: 'Marcador exacto' },
              ].map(r => (
                <div key={r.desc} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--card)', borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                  border: '1px solid var(--border)', flex: '1 1 auto',
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{r.pts}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</span>
                </div>
              ))}
            </div>

            {/* ── Pantalla de resumen ─────────────────────────────────── */}
            {mostrarResumen ? (
          <div>
            <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: 10, border: '1px solid var(--green)', boxShadow: 'var(--shadow-md)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Revisa tus picks
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 16 }}>{nombre}</p>

              {partidos.map((p, i) => {
                const pick = picks[i]
                const res  = getPickResultado(pick)
                const info = res ? resultadoInfo(res, p.local, p.visitante) : null
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', padding: '2px 14px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
                      {pick?.local ?? '?'} – {pick?.visitante ?? '?'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{p.visitante}</span>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                    </div>
                    {info && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: info.bg, color: info.color, flexShrink: 0 }}>
                        {info.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {nombreError && (
              <div style={{
                marginBottom: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--red-bg)', border: '1px solid var(--red)',
                fontSize: 13, color: '#FCA5A5', lineHeight: 1.5,
              }}>
                ⚠️ {nombreError}
              </div>
            )}

            <button onClick={enviar} disabled={enviando} style={{ ...ctaPrimary(enviando), marginBottom: 10 }}>
              {enviando ? 'Enviando…' : 'Confirmar y enviar →'}
            </button>
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

            /* ── Formulario principal ─────────────────────────────── */
            ) : (
          <>
            {/* Nombre */}
            <div style={card}>
              <label htmlFor="jugador-nombre" style={lbl}>
                {quiniela?.requiereApellido ? 'Tu nombre completo' : 'Tu nombre'}
              </label>
              {quiniela?.requiereApellido && (
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Nombre y al menos un apellido (ej. María González).
                </p>
              )}
              <input
                id="jugador-nombre"
                type="text"
                placeholder={quiniela?.requiereApellido ? 'Ej. María González' : '¿Cómo te llamas?'}
                value={nombre}
                onChange={e => { setNombre(e.target.value); setNombreError('') }}
                style={{ fontSize: 15, borderColor: nombreError ? 'var(--red)' : undefined }}
              />
              {nombreError && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{nombreError}</p>
              )}
            </div>

            {/* Partidos */}
            {partidos.map((p, i) => {
              const pick = picks[i]
              const res  = getPickResultado(pick)
              const info = res ? resultadoInfo(res, p.local, p.visitante) : null

              return (
                <div key={i} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Partido {i + 1}
                    </span>
                    {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatFecha(p.hora)}</span>}
                  </div>

                  {/* Score inputs */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 }}>
                    {/* Local */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoLocal && (
                        <img src={p.escudoLocal} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.local}
                      </span>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.local ?? ''}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                          const norm = v === '' ? '' : String(Number(v))
                          setPick(i, 'local', norm)
                        }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700,
                          padding: '10px 4px', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: pick?.local, visitante: '0' }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.local !== undefined && pick?.local !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>

                    <span style={{ fontSize: 22, color: 'var(--muted-dim)', fontWeight: 700, paddingBottom: 12 }}>–</span>

                    {/* Visitante */}
                    <div style={{ textAlign: 'center' }}>
                      {p.escudoVisitante && (
                        <img src={p.escudoVisitante} alt="" style={{ width: 36, height: 36, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.visitante}
                      </span>
                      <input
                        ref={el => { visitanteRefs.current[i] = el }}
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={pick?.visitante ?? ''}
                        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2); setPick(i, 'visitante', v === '' ? '' : String(Number(v))) }}
                        placeholder="–"
                        style={{
                          width: 68, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700,
                          padding: '10px 4px', borderRadius: 'var(--radius-md)',
                          border: pickValido({ local: '0', visitante: pick?.visitante }) ? '2px solid var(--green)' : '1.5px solid var(--border)',
                          background: pick?.visitante !== undefined && pick?.visitante !== '' ? 'var(--green-bg)' : 'var(--card-light)',
                          color: 'var(--text-strong)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Resultado derivado */}
                  <div style={{ textAlign: 'center', marginTop: 12, minHeight: 24 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
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
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
                {!nombre.trim() && progreso < partidos.length
                  ? `Falta tu nombre y ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''}`
                  : !nombre.trim()
                    ? 'Falta tu nombre'
                    : `Falta${partidos.length - progreso !== 1 ? 'n' : ''} ${partidos.length - progreso} partido${partidos.length - progreso !== 1 ? 's' : ''} por completar`
                }
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>
              ¿Solo quieres ver el ranking?{' '}
              <a
                href={`/ranking/${quinielaId}`}
                style={{ color: 'var(--green-light)', fontWeight: 700, textDecoration: 'underline' }}
              >
                Entrar al ranking
              </a>
            </p>
          </>
            )}
          </>
        )}
        <Footer />
      </div>
    </div>
  )
}
