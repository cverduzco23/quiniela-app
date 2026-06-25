import { useState, useEffect, useMemo } from 'react'
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, deleteDoc, query, orderBy, where, setDoc, serverTimestamp, increment, Timestamp } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updatePassword } from 'firebase/auth'
import { db, auth, crearUsuarioAislado, generarPasswordTemporal } from '../firebase'
import { CambioPassword } from '../components/CambioPassword'
import { useDialog } from '../components/Dialogs'
import { Paywall } from '../components/Paywall'
import { ComoFunciona } from '../components/ComoFunciona'
import { TourBienvenida } from '../components/TourBienvenida'
import { MedidorPassword } from '../components/MedidorPassword'
import { BrandWordmark } from '../components/Brand'
import { evaluarPassword } from '../utils/password'
import { puedeCrearQuiniela, quinielasRestantes, temporadaVigente } from '../utils/entitlements'
import { waLink, MENSAJES_WA } from '../utils/whatsapp'
import { cierreToDate, cierreToInputValue, inputValueACierre, quinielaCerrada, quinielaFinalizada, resultadosCompletos } from '../utils/cierre'
import { TIPO_PREMIO, MODELO_PREMIO, calcularBote, tienePremio, formatearMXN } from '../utils/premios'
import { normalizarNombre } from '../utils/nombres'
import { detectarSimilares } from '../utils/duplicados'
import { findEventByTeamsAndDate } from '../utils/espn'
import { LABELS_SECCIONES_HOME, ordenSeccionesHome } from '../utils/homeSections'
import { EmojiPicker } from '../components/EmojiPicker'

// UIDs con privilegios globales (ver/editar todas las quinielas).
// Mantener sincronizado con `isSuperAdmin()` en firestore.rules.
const SUPER_ADMIN_UIDS = ['w6uc7cHowgM4Pmsya4bUHt1G3Pu2']

// Mostrar el buscador en lista de participantes solo cuando hay suficientes.
// Por debajo, scrollear es más rápido que escribir.
const UMBRAL_BUSQUEDA_PARTICIPANTES = 20
function esSuperAdminUid(uid) {
  return !!uid && SUPER_ADMIN_UIDS.includes(uid)
}

// Slugs verificados contra el scoreboard de ESPN. Los torneos solo devuelven
// partidos cuando están en temporada; fuera de temporada el buscador sale vacío
// (es esperado, no es un error). Orden: lo más seguido por la afición mexicana
// primero (Liga MX, El Tri y torneos donde juegan clubes/selección de México).
const LIGAS = [
  // ── México y selección nacional (El Tri) ──
  { id: 'mex.1',                 nombre: '🇲🇽 Liga MX' },
  { id: 'mex.2',                 nombre: '🇲🇽 Liga de Expansión MX' },
  { id: 'mex.campeon',           nombre: '🇲🇽 Campeón de Campeones' },
  { id: 'fifa.world',            nombre: '🌍 Mundial 2026' },
  { id: 'fifa.worldq.concacaf',  nombre: '🎟️ Eliminatorias CONCACAF' },
  { id: 'concacaf.gold',         nombre: '🏆 Copa Oro' },
  { id: 'concacaf.nations.league', nombre: '🌎 CONCACAF Nations League' },
  { id: 'conmebol.america',      nombre: '🌎 Copa América' },
  // ── Torneos de clubes (Liga MX cruzando fronteras) ──
  { id: 'concacaf.leagues.cup',  nombre: '🤝 Leagues Cup (Liga MX vs MLS)' },
  { id: 'concacaf.champions',    nombre: '🌎 CONCACAF Champions Cup' },
  { id: 'fifa.cwc',              nombre: '🏟️ Mundial de Clubes' },
  { id: 'conmebol.libertadores', nombre: '🏆 Copa Libertadores' },
  { id: 'conmebol.sudamericana', nombre: '🥈 Copa Sudamericana' },
  // ── Europa: clubes ──
  { id: 'uefa.champions',        nombre: '⭐ Champions League' },
  { id: 'uefa.europa',           nombre: '🟠 Europa League' },
  { id: 'uefa.europa.conf',      nombre: '🟢 Conference League' },
  // ── Europa: selecciones ──
  { id: 'uefa.euro',             nombre: '🇪🇺 Eurocopa' },
  { id: 'uefa.nations',          nombre: '🇪🇺 UEFA Nations League' },
  // ── Ligas nacionales ──
  { id: 'eng.1',                 nombre: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { id: 'esp.1',                 nombre: '🇪🇸 La Liga' },
  { id: 'ita.1',                 nombre: '🇮🇹 Serie A' },
  { id: 'ger.1',                 nombre: '🇩🇪 Bundesliga' },
  { id: 'fra.1',                 nombre: '🇫🇷 Ligue 1' },
  { id: 'ned.1',                 nombre: '🇳🇱 Eredivisie' },
  { id: 'por.1',                 nombre: '🇵🇹 Primeira Liga' },
  { id: 'usa.1',                 nombre: '🇺🇸 MLS' },
  { id: 'bra.1',                 nombre: '🇧🇷 Brasileirão' },
  { id: 'arg.1',                 nombre: '🇦🇷 Liga Argentina' },
  // ── Copas nacionales ──
  { id: 'eng.fa',                nombre: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 FA Cup' },
  { id: 'esp.copa_del_rey',      nombre: '🇪🇸 Copa del Rey' },
  // ── Otros ──
  { id: 'fifa.friendly',         nombre: '🌐 Amistosos Internacionales' },
]

// Código de acceso legible y autogenerado (sin caracteres ambiguos: 0/O, 1/I).
// 6 caracteres sobre un alfabeto de 32 = ~1,000 millones de combinaciones:
// hace inviable adivinar uno al azar y deja margen de sobra para no agotarlos.
function generarCodigoAcceso() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)]
  return s
}

// Heurística mínima para advertir (no bloquear) sobre códigos fáciles de adivinar:
// los muy cortos. Los autogenerados (6 chars) nunca caen aquí.
function esCodigoDebil(codigo) {
  const c = (codigo ?? '').trim()
  return c.length > 0 && c.length < 5
}

function goalsToResultado(local, visitante) {
  const l = parseInt(local), v = parseInt(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const esCerradaQ = quinielaCerrada
const esFinalizadaQ = quinielaFinalizada

// iOS (WebKit) deja los <input datetime-local> vacíos sin ningún texto visible
// porque les aplicamos appearance:none (ver index.css). En Chrome de escritorio
// (Blink) sí muestra el "dd/mm/aaaa". Detectamos iOS para superponer nosotros un
// texto-guía solo cuando el campo está vacío, sin afectar al escritorio.
const ES_IOS = typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// Envuelve un <input datetime-local> y, solo en iOS y solo cuando está vacío,
// muestra un texto-guía superpuesto (el nativo se ve en blanco). pointerEvents:
// none deja que el toque llegue al input.
function DateTimeWrap({ vacio, texto = '📅 Elige fecha y hora', children }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      {ES_IOS && vacio && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--muted-soft)', pointerEvents: 'none' }}>
          {texto}
        </span>
      )}
    </div>
  )
}

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return '—'
  return d.toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatFixtureDate(value) {
  const d = cierreToDate(value)
  if (!d) return ''
  return d.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

// Margen de seguridad: el cierre se sugiere unos minutos ANTES del primer partido.
const MARGEN_CIERRE_MIN = 5

// Valida que el cierre no quede DESPUÉS del arranque del primer partido — si así fuera,
// se podrían registrar predicciones con partidos ya empezados/terminados (trampa).
// Solo considera partidos que tengan hora (los manuales pueden no traerla).
// Devuelve { conflicto, primera, sugerencia } donde `sugerencia` es el valor listo
// para el <input datetime-local> (arranque del primer partido menos el margen).
function validarCierreVsPartidos(cierreInput, partidos) {
  const horas = (partidos ?? []).map(p => p?.hora).filter(Boolean).sort()
  const primera = horas[0]
  if (!primera || !cierreInput) return { conflicto: false }
  const dCierre  = new Date(cierreInput)
  const dPrimera = new Date(primera)
  if (isNaN(dCierre.getTime()) || isNaN(dPrimera.getTime())) return { conflicto: false }
  if (dCierre <= dPrimera) return { conflicto: false }
  const sugerida = new Date(dPrimera.getTime() - MARGEN_CIERRE_MIN * 60 * 1000)
  return { conflicto: true, primera, sugerencia: cierreToInputValue(sugerida) }
}

// Hora (ISO) del primer partido con hora definida, o null si ninguno la tiene.
function primeraHoraPartido(partidos) {
  return (partidos ?? []).map(p => p?.hora).filter(Boolean).sort()[0] ?? null
}

// Ordena los partidos por hora, del más próximo al más lejano.
// Los partidos sin hora (agregados a mano) se van al final, conservando su orden.
function ordenarPorHora(partidos) {
  return [...(partidos ?? [])]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ha = a.p?.hora || ''
      const hb = b.p?.hora || ''
      if (!ha && !hb) return a.i - b.i   // ambos sin hora: orden original
      if (!ha) return 1                  // sin hora → al final
      if (!hb) return -1
      return ha < hb ? -1 : ha > hb ? 1 : a.i - b.i
    })
    .map(x => x.p)
}

// Cierre sugerido (valor listo para <input datetime-local>) = primer partido − margen.
// Devuelve '' si ningún partido tiene hora todavía (ej. manuales sin capturar).
function cierreSugerido(partidos) {
  const primera = primeraHoraPartido(partidos)
  if (!primera) return ''
  const d = new Date(primera)
  if (isNaN(d.getTime())) return ''
  return cierreToInputValue(new Date(d.getTime() - MARGEN_CIERRE_MIN * 60 * 1000))
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const card = { background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '1.1rem 1.25rem', marginBottom: 10, border: '1px solid var(--border)' }
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }
const greenCta = 'linear-gradient(135deg, var(--green), var(--green-light))'
const greenCtaStyle = (disabled) => ({
  padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: 'none',
  background: disabled ? 'var(--card-light)' : greenCta,
  color: disabled ? 'var(--muted)' : '#07120A',
  fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.2,
  boxShadow: disabled ? 'none' : 'var(--shadow-green)',
})
// Botón pequeño de acción en las tarjetas de cliente.
const accionBtn = {
  padding: '7px 11px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)', background: 'var(--neutral-bg)',
  color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

export default function Admin() {
  // Diálogos con diseño propio (reemplazan alert/confirm/prompt nativos).
  const { alerta, confirmar, pedirTexto } = useDialog()
  // ─── Autenticación ────────────────────────────────────────────────────────
  const [autenticado, setAutenticado] = useState(false)
  const [authListo, setAuthListo]     = useState(false)
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [loginError, setLoginError]   = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [miUid, setMiUid] = useState(null)
  // Doc admins/{uid}: perfil + derechos del cliente. null para el super admin
  // (que no necesita doc) o si aún no se ha cargado.
  const [adminDoc, setAdminDoc] = useState(null)
  const [resetMsg, setResetMsg] = useState('')
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const [ayudaSyncAbierta, setAyudaSyncAbierta] = useState(false)
  const [tourAbierto, setTourAbierto] = useState(false)
  // Tip contextual en "Nueva quiniela": se cierra y no vuelve a salir (localStorage).
  const [tipNuevaCerrado, setTipNuevaCerrado] = useState(() => {
    try { return localStorage.getItem('tipNuevaVisto') === '1' } catch { return false }
  })
  const cerrarTipNueva = () => {
    try { localStorage.setItem('tipNuevaVisto', '1') } catch { /* noop */ }
    setTipNuevaCerrado(true)
  }

  // ─── "Mi cuenta" (perfil del cliente) ───────────────────────────────────
  const [cuentaNombre, setCuentaNombre]   = useState('')
  const [cuentaEmpresa, setCuentaEmpresa] = useState('')
  const [cuentaTel, setCuentaTel]         = useState('')
  const [guardandoCuenta, setGuardandoCuenta] = useState(false)
  const [cuentaMsg, setCuentaMsg]         = useState(null) // { tipo: 'ok'|'error', texto }
  // Cambio de contraseña dentro de Mi cuenta.
  const [cuentaP1, setCuentaP1]           = useState('')
  const [cuentaP2, setCuentaP2]           = useState('')
  const [cambiandoPass, setCambiandoPass] = useState(false)
  const [cuentaPassMsg, setCuentaPassMsg] = useState(null)
  // La sección de cambio de contraseña va colapsada por default: solo se
  // despliega cuando el usuario realmente la necesita.
  const [seguridadAbierta, setSeguridadAbierta] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setAutenticado(!!user)
      setMiUid(user?.uid ?? null)
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'admins', user.uid))
          setAdminDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        } catch {
          setAdminDoc(null)
        }
      } else {
        setAdminDoc(null)
      }
      setAuthListo(true)
    })
    return unsub
  }, [])
  const soySuper = esSuperAdminUid(miUid)
  // Forzar cambio de contraseña en el primer ingreso (solo clientes con el flag).
  const debeCambiarPassword = !soySuper && adminDoc?.debeCambiarPassword === true
  // ¿Puede crear una quiniela más? El super admin no tiene límite.
  const puedeCrear = soySuper || puedeCrearQuiniela(adminDoc)

  // Tour de bienvenida: solo la primera vez que un cliente-admin entra al panel.
  // El "visto" se guarda en localStorage (sin tocar Firestore ni sus reglas).
  useEffect(() => {
    if (!authListo || !autenticado || soySuper || debeCambiarPassword || !adminDoc) return
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem('tourAdminVisto')) setTourAbierto(true)
    } catch { /* localStorage no disponible: simplemente no se muestra */ }
  }, [authListo, autenticado, soySuper, debeCambiarPassword, adminDoc])
  const cerrarTour = () => {
    try { localStorage.setItem('tourAdminVisto', '1') } catch { /* noop */ }
    setTourAbierto(false)
  }

  // Recarga el doc admins/{uid} propio (tras crear una quiniela, etc.).
  const recargarMiAdminDoc = async () => {
    if (!miUid) return
    try {
      const snap = await getDoc(doc(db, 'admins', miUid))
      setAdminDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    } catch { /* noop */ }
  }

  // Abre "Mi cuenta" precargando el formulario con los datos actuales.
  const abrirMiCuenta = () => {
    setCuentaNombre(adminDoc?.nombre ?? '')
    setCuentaEmpresa(adminDoc?.empresa ?? '')
    setCuentaTel(adminDoc?.telefono ?? '')
    setCuentaMsg(null)
    setCuentaPassMsg(null)
    setCuentaP1(''); setCuentaP2('')
    setVista('cuenta')
  }

  // Guarda nombre/empresa/teléfono (las reglas congelan plan/dinero/correo).
  const guardarMiCuenta = async () => {
    if (!cuentaNombre.trim()) { setCuentaMsg({ tipo: 'error', texto: 'El nombre no puede quedar vacío.' }); return }
    if (!miUid) return
    setGuardandoCuenta(true)
    setCuentaMsg(null)
    const datos = {
      nombre: cuentaNombre.trim(),
      empresa: cuentaEmpresa.trim() || null,
      telefono: cuentaTel.trim() || null,
    }
    try {
      await updateDoc(doc(db, 'admins', miUid), datos)
      setAdminDoc(d => (d ? { ...d, ...datos } : d))
      setCuentaMsg({ tipo: 'ok', texto: 'Datos guardados.' })
    } catch {
      setCuentaMsg({ tipo: 'error', texto: 'No se pudieron guardar los datos. Intenta de nuevo.' })
    } finally {
      setGuardandoCuenta(false)
    }
  }

  // Cambia la contraseña desde Mi cuenta (misma política que el cambio inicial).
  const cambiarMiPassword = async () => {
    setCuentaPassMsg(null)
    const v = evaluarPassword(cuentaP1)
    if (!v.ok)                 { setCuentaPassMsg({ tipo: 'error', texto: v.error }); return }
    if (cuentaP1 !== cuentaP2) { setCuentaPassMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' }); return }
    if (!auth.currentUser)     { setCuentaPassMsg({ tipo: 'error', texto: 'Tu sesión expiró. Vuelve a iniciar sesión.' }); return }
    setCambiandoPass(true)
    try {
      await updatePassword(auth.currentUser, cuentaP1)
      setCuentaP1(''); setCuentaP2('')
      setCuentaPassMsg({ tipo: 'ok', texto: 'Contraseña actualizada.' })
    } catch (e) {
      if (e?.code === 'auth/requires-recent-login') {
        setCuentaPassMsg({ tipo: 'error', texto: 'Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo.' })
      } else {
        setCuentaPassMsg({ tipo: 'error', texto: 'No se pudo cambiar la contraseña. Intenta de nuevo.' })
      }
    } finally {
      setCambiandoPass(false)
    }
  }

  const entrar = async () => {
    if (!email.trim() || !password) return
    setLoginLoading(true)
    setLoginError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch {
      setLoginError('Correo o contraseña incorrectos.')
      setPassword('')
    } finally {
      setLoginLoading(false)
    }
  }

  // Envía el correo de restablecimiento de contraseña de Firebase.
  const recuperarPassword = async () => {
    setLoginError('')
    setResetMsg('')
    const correo = email.trim()
    if (!correo) {
      setLoginError('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".')
      return
    }
    try {
      await sendPasswordResetEmail(auth, correo)
      setResetMsg('Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja (y spam). Si no llega, escríbenos por WhatsApp.')
    } catch {
      // Mensaje neutro: no revelamos si el correo existe o no.
      setResetMsg('Si ese correo tiene una cuenta, te llegará un mensaje para restablecer la contraseña.')
    }
  }

  // ─── Clientes (solo super admin) ──────────────────────────────────────────
  const [clientes, setClientes]               = useState([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [ncEmail, setNcEmail]                 = useState('')
  const [ncNombre, setNcNombre]               = useState('')
  const [ncTel, setNcTel]                     = useState('')
  const [ncEmpresa, setNcEmpresa]             = useState('')
  const [creandoCliente, setCreandoCliente]   = useState(false)
  const [eliminandoCliente, setEliminandoCliente] = useState(null) // id del cliente que se está borrando
  const [errorCliente, setErrorCliente]       = useState('')
  // Datos de la cuenta recién creada para entregar por WhatsApp.
  const [clienteCreado, setClienteCreado]     = useState(null) // { email, password, telefono }

  const cargarClientes = async () => {
    setLoadingClientes(true)
    try {
      const snap = await getDocs(collection(db, 'admins'))
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Más recientes primero (creado puede ser Timestamp o faltar en docs viejos).
      lista.sort((a, b) => {
        const ta = a.creado?.toMillis ? a.creado.toMillis() : 0
        const tb = b.creado?.toMillis ? b.creado.toMillis() : 0
        return tb - ta
      })
      setClientes(lista)
    } catch {
      setClientes([])
    } finally {
      setLoadingClientes(false)
    }
  }

  // Normaliza un teléfono mexicano a formato wa.me (52 + 10 dígitos).
  const telParaWa = (tel) => {
    const d = String(tel ?? '').replace(/\D/g, '')
    if (!d) return ''
    if (d.length === 10) return `52${d}`
    return d
  }

  // Sin emojis a propósito: algunos dispositivos los muestran como "�" en wa.me.
  const mensajeAccesos = (email, password) =>
    `¡Listo! Estos son tus accesos a QuinielApp:\n` +
    `Entrar: https://quinielapp.fun/admin\n` +
    `Correo: ${email}\n` +
    `Contraseña temporal: ${password}\n\n` +
    `Al entrar la primera vez te pedirá cambiar tu contraseña por una tuya. ` +
    `Después creas tu primera quiniela (va por nuestra cuenta). Cualquier duda, aquí estoy.`

  const crearCliente = async () => {
    setErrorCliente('')
    setClienteCreado(null)
    const email = ncEmail.trim().toLowerCase()
    const nombre = ncNombre.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorCliente('Escribe un correo válido.')
      return
    }
    if (nombre.length < 2) {
      setErrorCliente('Escribe el nombre del cliente.')
      return
    }
    setCreandoCliente(true)
    try {
      const password = generarPasswordTemporal()
      // 1) Cuenta de acceso (sin tocar la sesión del super admin).
      const uid = await crearUsuarioAislado(email, password)
      // 2) Doc de derechos con los defaults del plan trial.
      await setDoc(doc(db, 'admins', uid), {
        email,
        nombre,
        empresa: ncEmpresa.trim() || null,
        telefono: ncTel.trim() || null,
        activo: true,
        debeCambiarPassword: true,
        plan: 'trial',
        quinielasPermitidas: 1,
        quinielasCreadas: 0,
        temporadaHasta: null,
        creado: serverTimestamp(),
        notas: null,
      })
      // 3) Mostrar accesos para entregar por WhatsApp.
      setClienteCreado({ email, password, telefono: ncTel.trim() })
      setNcEmail(''); setNcNombre(''); setNcTel(''); setNcEmpresa('')
      cargarClientes()
    } catch (e) {
      console.error('crearCliente error:', e?.code, e?.message, e)
      if (e?.code === 'auth/email-already-in-use') {
        setErrorCliente('Ya existe una cuenta con ese correo.')
      } else if (e?.code === 'auth/operation-not-allowed' || e?.code === 'auth/admin-restricted-operation') {
        setErrorCliente('Firebase tiene bloqueado el registro de cuentas nuevas. Hay que habilitar el alta en Authentication (Email/Password → permitir sign-up).')
      } else if (e?.code === 'auth/weak-password') {
        setErrorCliente('La contraseña generada fue rechazada. Intenta de nuevo.')
      } else if (e?.code === 'permission-denied') {
        setErrorCliente('La cuenta se creó pero Firestore bloqueó guardar su perfil (reglas). Avísame.')
      } else {
        setErrorCliente(`No se pudo crear el cliente. (${e?.code || e?.message || 'error desconocido'})`)
      }
    } finally {
      setCreandoCliente(false)
    }
  }

  const toggleActivoCliente = async (c) => {
    const desactivando = c.activo
    if (desactivando && !(await confirmar(`¿Desactivar a ${c.nombre || c.email}? No podrá crear quinielas hasta reactivarlo.`))) return
    try {
      await updateDoc(doc(db, 'admins', c.id), { activo: !c.activo })
      cargarClientes()
    } catch { alerta('No se pudo actualizar. Intenta de nuevo.') }
  }

  const darQuinielaExtra = async (c) => {
    if (!(await confirmar(`Confirmar pago de $49 y dar 1 quiniela más a ${c.nombre || c.email}?`))) return
    try {
      await updateDoc(doc(db, 'admins', c.id), {
        quinielasPermitidas: increment(1),
        plan: 'por_quiniela',
        activo: true,
      })
      cargarClientes()
    } catch { alerta('No se pudo actualizar. Intenta de nuevo.') }
  }

  const darPaseMundial = async (c) => {
    const def = '2026-07-20'
    const fecha = await pedirTexto(
      `Pase Mundial para ${c.nombre || c.email}: quinielas ilimitadas hasta esta fecha (YYYY-MM-DD).`,
      def
    )
    if (!fecha) return
    const d = new Date(`${fecha}T23:59:59`)
    if (isNaN(d.getTime())) { alerta('Fecha no válida.'); return }
    try {
      await updateDoc(doc(db, 'admins', c.id), {
        temporadaHasta: Timestamp.fromDate(d),
        plan: 'pase_mundial',
        activo: true,
      })
      cargarClientes()
    } catch { alerta('No se pudo actualizar. Intenta de nuevo.') }
  }

  const editarNotasCliente = async (c) => {
    const notas = await pedirTexto(`Notas internas sobre ${c.nombre || c.email}:`, c.notas ?? '')
    if (notas === null) return
    try {
      await updateDoc(doc(db, 'admins', c.id), { notas: notas.trim() || null })
      cargarClientes()
    } catch { alerta('No se pudo guardar la nota.') }
  }

  // Borra al cliente del panel (doc admins/{uid}). Sus quinielas se conservan.
  // OJO: la cuenta de Firebase Auth NO se puede borrar desde aquí (requiere servidor);
  // hay que eliminarla a mano en la consola de Firebase. Se lo recordamos al super admin.
  const eliminarCliente = async (c) => {
    const usadas = c.quinielasCreadas ?? 0
    const aviso =
      `¿Eliminar a ${c.nombre || c.email} del panel?\n\n` +
      `• Desaparecerá de tu lista de clientes.\n` +
      (usadas > 0
        ? `• Sus ${usadas} quiniela(s) ya creadas NO se borran (siguen visibles para sus participantes).\n`
        : '') +
      `• La cuenta de acceso (Firebase Auth) NO se borra automáticamente: debes eliminarla tú en la consola de Firebase → Authentication.\n\n` +
      `Esta acción no se puede deshacer.`
    if (!(await confirmar(aviso, { titulo: 'Eliminar cliente', confirmar: 'Eliminar', peligro: true }))) return
    setEliminandoCliente(c.id)
    try {
      await deleteDoc(doc(db, 'admins', c.id))
      await cargarClientes()
      alerta(
        `Cliente eliminado del panel.\n\n` +
        `Recuerda borrar también su cuenta de acceso en:\n` +
        `Firebase → Authentication → busca "${c.email}" → Eliminar usuario.`
      )
    } catch {
      alerta('No se pudo eliminar al cliente. Intenta de nuevo.')
    } finally {
      setEliminandoCliente(null)
    }
  }

  const salir = async () => {
    if (await confirmar('¿Seguro que quieres cerrar sesión?')) signOut(auth)
  }

  // ─── Estado principal ─────────────────────────────────────────────────────
  const [vista, setVista]                 = useState('lista')
  const [quinielas, setQuinielas]         = useState([])
  const [loadingLista, setLoadingLista]   = useState(true)
  const [quinielaActual, setQuinielaActual] = useState(null)
  const [tab, setTab]                     = useState('resultados')
  const [conteos, setConteos]             = useState({})
  // Qué grupos de la lista están expandidos (clave → bool), para el "Mostrar más".
  const [verTodo, setVerTodo]             = useState({})
  // Admin seleccionado en la sección "Otros admins" para ver sus quinielas.
  const [adminExpandido, setAdminExpandido] = useState(null)

  // ─── Config del inicio (solo super admin) ─────────────────────────────────
  // Qué secciones del home se muestran. Campo ausente = visible (default seguro).
  const [homeConfig, setHomeConfig]       = useState(null)
  const [guardandoHome, setGuardandoHome] = useState(null)

  // Cargar la lista de clientes para el super admin: en el tab Clientes y también
  // en la lista (para etiquetar de quién es cada quiniela de "otros admins").
  useEffect(() => {
    if (autenticado && authListo && soySuper && vista === 'lista') cargarClientes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado, authListo, soySuper, vista])

  // Cargar la config del inicio (qué secciones se muestran) — solo super admin.
  useEffect(() => {
    if (!autenticado || !authListo || !soySuper) return
    getDoc(doc(db, 'config', 'home'))
      .then(s => setHomeConfig(s.exists() ? s.data() : {}))
      .catch(() => setHomeConfig({}))
  }, [autenticado, authListo, soySuper])

  // Activar/desactivar una sección del inicio. `clave` = campo en config/home.
  // Default (campo ausente) = visible, por eso el toggle invierte `!== false`.
  const toggleSeccionHome = async (clave) => {
    const visibleActual = homeConfig?.[clave] !== false
    const nuevoValor = !visibleActual
    setGuardandoHome(clave)
    try {
      await setDoc(doc(db, 'config', 'home'), { [clave]: nuevoValor }, { merge: true })
      setHomeConfig(c => ({ ...(c ?? {}), [clave]: nuevoValor }))
    } catch {
      alerta('No se pudo guardar el cambio. Intenta de nuevo.')
    } finally {
      setGuardandoHome(null)
    }
  }

  // Mover una sección del inicio hacia arriba (dir=-1) o abajo (dir=+1).
  // Guarda el orden completo en config/home.orden.
  const moverSeccionHome = async (clave, dir) => {
    const arr = ordenSeccionesHome(homeConfig)
    const i = arr.indexOf(clave)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setGuardandoHome(clave)
    try {
      await setDoc(doc(db, 'config', 'home'), { orden: arr }, { merge: true })
      setHomeConfig(c => ({ ...(c ?? {}), orden: arr }))
    } catch {
      alerta('No se pudo guardar el orden. Intenta de nuevo.')
    } finally {
      setGuardandoHome(null)
    }
  }

  // ─── Formulario nueva quiniela ────────────────────────────────────────────
  const [nombre, setNombre]     = useState('')
  const [cierre, setCierre]     = useState('')
  const [partidos, setPartidos] = useState([{ local: '', visitante: '', hora: '' }])
  // Índice del partido que se está editando en el formulario de crear (null = ninguno).
  // Los partidos completos se muestran colapsados; este abre uno para editarlo.
  const [editandoPartido, setEditandoPartido] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [premioFijo, setPremioFijo]     = useState('')
  const [cuota, setCuota]               = useState('')
  const [modeloPremio, setModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)
  const [codigoAcceso, setCodigoAcceso] = useState('')
  const [privada, setPrivada]           = useState(false)
  const [empresa, setEmpresa]           = useState('')
  const [requiereApellido, setRequiereApellido] = useState(false)

  // ─── Resultados ───────────────────────────────────────────────────────────
  const [resultados, setResultados]       = useState({})
  const [guardandoRes, setGuardandoRes]   = useState(false)
  const [guardadoRes, setGuardadoRes]     = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincrMsg, setSincrMsg]           = useState('')
  const [confirmacionRes, setConfirmacionRes] = useState(null)
  const [validandoEspn, setValidandoEspn] = useState(false)
  // Cuando ESPN reasigna el ID de un partido, lo buscamos por nombres + día.
  // Si encontramos un único candidato, lo proponemos al admin para confirmar.
  const [sugerenciasIdMismatch, setSugerenciasIdMismatch] = useState([])
  const [aplicandoSugerencia, setAplicandoSugerencia]     = useState(null)

  // ─── Buscador de partidos ESPN ────────────────────────────────────────────
  const [ligaId, setLigaId]               = useState('')
  const [fixtures, setFixtures]           = useState([])
  const [loadingFixtures, setLoadingFixtures] = useState(false)
  const [errorFixtures, setErrorFixtures] = useState(null)
  const [seleccionados, setSeleccionados] = useState([])
  const [buscarPasados, setBuscarPasados] = useState(false)

  // ─── Edición de quiniela existente ───────────────────────────────────────
  const [editNombre, setEditNombre]             = useState('')
  const [editPartidos, setEditPartidos]         = useState([])
  const [editPartidosOriginales, setEditPartidosOriginales] = useState(0)
  const [editandoPartidoEdicion, setEditandoPartidoEdicion] = useState(null)
  const [editCierre, setEditCierre]             = useState('')
  const [editPremioFijo, setEditPremioFijo]     = useState('')
  const [editCuota, setEditCuota]               = useState('')
  const [editModeloPremio, setEditModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)
  const [editCodigoAcceso, setEditCodigoAcceso] = useState('')
  const [editPrivada, setEditPrivada]           = useState(false)
  const [editEmpresa, setEditEmpresa]           = useState('')
  const [editRequiereApellido, setEditRequiereApellido] = useState(false)
  const [conteoPredicciones, setConteoPredicciones] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [deleteConfirm, setDeleteConfirm]       = useState('')
  const [eliminando, setEliminando]             = useState(false)

  // ─── Cerrar / reabrir ─────────────────────────────────────────────────────
  const [toggling, setToggling] = useState(false)

  // ─── Marcar como principal ───────────────────────────────────────────────
  const [destacando, setDestacando] = useState(false)

  // ─── Lista de predicciones individuales ──────────────────────────────────
  const [listaPredicciones, setListaPredicciones]       = useState([])
  const [loadingPredicciones, setLoadingPredicciones]   = useState(false)
  const [eliminandoPred, setEliminandoPred]             = useState(null)
  const [togglingPago, setTogglingPago]                 = useState(null)
  const [togglingCumple, setTogglingCumple]             = useState(null)
  const [busquedaParticipante, setBusquedaParticipante] = useState('')

  // ─── Compartir ───────────────────────────────────────────────────────────
  const [copiado, setCopiado] = useState(null)

  // ─── Caja ─────────────────────────────────────────────────────────────────
  const [cajaNombre, setCajaNombre]                 = useState(null)
  const [movimientos, setMovimientos]               = useState([])
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)
  const [nuevoTipo, setNuevoTipo]                   = useState('premio')
  const [nuevoMonto, setNuevoMonto]                 = useState('')
  const [nuevaNota, setNuevaNota]                   = useState('')
  const [guardandoMov, setGuardandoMov]             = useState(false)
  const [buscarNombreCaja, setBuscarNombreCaja]     = useState('')
  // Orden de la lista de saldos en Caja: 'nombre' (A-Z) o 'monto' (mayor a menor).
  const [cajaOrden, setCajaOrden]                   = useState('monto')

  // Declarado antes de los useEffects que lo usan para evitar la zona muerta temporal
  const cargarQuinielas = async () => {
    setLoadingLista(true)
    try {
      const [qSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc'))),
        getDocs(collection(db, 'predicciones')),
      ])
      const conteoMap = {}
      pSnap.docs.forEach(d => {
        const qId = d.data().quinielaId
        conteoMap[qId] = (conteoMap[qId] ?? 0) + 1
      })
      setConteos(conteoMap)
      setQuinielas(qSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* silent */ }
    finally { setLoadingLista(false) }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (autenticado && authListo) cargarQuinielas() }, [autenticado, authListo])

  useEffect(() => {
    if (tab !== 'participantes' || !quinielaActual) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPredicciones(true)
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      .then(snap => setListaPredicciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setListaPredicciones([]))
      .finally(() => setLoadingPredicciones(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, quinielaActual?.id])

  useEffect(() => {
    if (tab !== 'editar' || !quinielaActual) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditNombre(quinielaActual.nombre ?? '')
    setEditPartidos([...(quinielaActual.partidos ?? [])])
    setEditPartidosOriginales((quinielaActual.partidos ?? []).length)
    setEditCierre(cierreToInputValue(quinielaActual.cierre))
    setEditPremioFijo(quinielaActual.premioFijo != null ? String(quinielaActual.premioFijo) : '')
    setEditCuota(quinielaActual.cuota != null ? String(quinielaActual.cuota) : '')
    setEditModeloPremio(quinielaActual.modeloPremio ?? MODELO_PREMIO.GANADOR_UNICO)
    setEditCodigoAcceso(quinielaActual.codigoAcceso ?? '')
    setEditPrivada(!!quinielaActual.privada)
    setEditEmpresa(quinielaActual.empresa ?? '')
    setEditRequiereApellido(!!quinielaActual.requiereApellido)
    setFixtures([]); setSeleccionados([])
    setEditandoPartidoEdicion(null)
    setConteoPredicciones(null)
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      .then(snap => setConteoPredicciones(snap.size))
      .catch(() => setConteoPredicciones(0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, quinielaActual?.id])

  // ─── Caja: carga ─────────────────────────────────────────────────────────
  const cargarMovimientos = async () => {
    setLoadingMovimientos(true)
    try {
      const snap = await getDocs(query(collection(db, 'movimientos'), orderBy('fecha', 'desc')))
      setMovimientos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* silent */ }
    finally { setLoadingMovimientos(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autenticado && authListo && (vista === 'caja' || (vista === 'lista' && soySuper))) cargarMovimientos() }, [autenticado, authListo, vista, soySuper])

  // ─── CRUD partidos ────────────────────────────────────────────────────────
  const actualizarPartido = (i, campo, valor) =>
    setPartidos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))
  const agregarPartido = () => {
    // El nuevo partido se agrega al final y se abre en modo edición.
    // partidos.length (antes de agregar) == índice del nuevo elemento.
    setEditandoPartido(partidos.length)
    setPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])
  }
  const quitarPartido = (i) => {
    setPartidos(prev => prev.filter((_, idx) => idx !== i))
    setEditandoPartido(null) // evita índices obsoletos tras el reordenamiento
  }
  // ¿Le falta nombre a algún equipo? Un partido incompleto no se puede colapsar.
  const partidoIncompleto = (p) => !(p.local ?? '').trim() || !(p.visitante ?? '').trim()
  // Escudo del equipo, o un círculo con la inicial si es manual (sin logo de ESPN).
  const escudoMini = (url, nombre) => (
    url
      ? <img src={url} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
      : <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--border)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(nombre ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>
  )

  // ─── Buscador ESPN ────────────────────────────────────────────────────────
  const buscarFixtures = async () => {
    setLoadingFixtures(true)
    setErrorFixtures(null)
    setFixtures([])
    setSeleccionados([])

    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
    const hoy = new Date()
    let desde, hasta

    if (buscarPasados) {
      desde = new Date(hoy); desde.setDate(desde.getDate() - 30)
      hasta = hoy
    } else {
      desde = hoy
      hasta = new Date(hoy); hasta.setDate(hasta.getDate() + 60)
    }

    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${fmt(desde)}-${fmt(hasta)}&limit=50`
      )
      const data = await res.json()
      const estado = buscarPasados ? 'post' : 'pre'
      const filtrados = (data.events ?? []).filter(e =>
        e.status?.type?.state === estado || (!buscarPasados && !e.status?.type?.state)
      )
      if (filtrados.length === 0) {
        setErrorFixtures(buscarPasados
          ? 'No hay partidos terminados en los últimos 30 días para esta competición.'
          : 'No hay partidos próximos disponibles para esta competición.')
      } else {
        setFixtures(filtrados)
      }
    } catch {
      setErrorFixtures('Error de conexión.')
    } finally {
      setLoadingFixtures(false)
    }
  }

  const toggleFixture = (f) => {
    setSeleccionados(prev =>
      prev.find(s => s.id === f.id)
        ? prev.filter(s => s.id !== f.id)
        : [...prev, f]
    )
  }

  const fixtureAPartido = (f) => {
    const comps = f.competitions?.[0]?.competitors ?? []
    const toLocalISO = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const homeCmp = comps.find(c => c.homeAway === 'home')
    const awayCmp = comps.find(c => c.homeAway === 'away')
    return {
      local:           homeCmp?.team?.displayName ?? '',
      visitante:       awayCmp?.team?.displayName ?? '',
      escudoLocal:     homeCmp?.team?.logo ?? '',
      escudoVisitante: awayCmp?.team?.logo ?? '',
      hora:            toLocalISO(f.date),
      espnId:          f.id,
      ligaId,
    }
  }

  const filtrarDuplicados = async (existentes, nuevos) => {
    const idsExistentes = new Set(existentes.map(p => p.espnId).filter(Boolean))
    const claveManual   = (p) => `${(p.local ?? '').trim().toLowerCase()}|${(p.visitante ?? '').trim().toLowerCase()}|${p.hora ?? ''}`
    const clavesManuales = new Set(existentes.filter(p => !p.espnId).map(claveManual))

    const aceptados = []
    const duplicadosId = []
    const advertenciasManuales = []

    for (const n of nuevos) {
      if (n.espnId && idsExistentes.has(n.espnId)) {
        duplicadosId.push(`${n.local} vs ${n.visitante}`)
        continue
      }
      if (!n.espnId && clavesManuales.has(claveManual(n))) {
        advertenciasManuales.push(`${n.local} vs ${n.visitante}`)
      }
      aceptados.push(n)
      if (n.espnId) idsExistentes.add(n.espnId)
      else clavesManuales.add(claveManual(n))
    }

    if (duplicadosId.length > 0) {
      alerta(`Estos partidos ya están agregados y se omitirán:\n\n• ${duplicadosId.join('\n• ')}`)
    }
    if (advertenciasManuales.length > 0) {
      const ok = await confirmar(
        `Advertencia: ya hay un partido con la misma combinación local + visitante + hora:\n\n• ${advertenciasManuales.join('\n• ')}\n\n¿Agregarlos de todos modos?`
      )
      if (!ok) {
        return aceptados.filter(n =>
          !advertenciasManuales.includes(`${n.local} vs ${n.visitante}`)
        )
      }
    }
    return aceptados
  }

  const agregarSeleccionados = async () => {
    const nuevos = seleccionados.map(fixtureAPartido)
    const baseExistente = (partidos.length === 1 && !partidos[0].local && !partidos[0].visitante)
      ? []
      : partidos
    const aceptados = await filtrarDuplicados(baseExistente, nuevos)
    if (aceptados.length === 0) {
      setSeleccionados([])
      setFixtures([])
      return
    }
    const lista = ordenarPorHora([...baseExistente, ...aceptados])
    setPartidos(lista)
    // Auto-rellenar el cierre si está vacío: el usuario no debe calcular la fecha.
    if (!cierre) {
      const sug = cierreSugerido(lista)
      if (sug) setCierre(sug)
    }
    setSeleccionados([])
    setFixtures([])
  }

  const agregarSeleccionadosAEdicion = async () => {
    const nuevos = seleccionados.map(fixtureAPartido)
    const aceptados = await filtrarDuplicados(editPartidos, nuevos)
    if (aceptados.length === 0) {
      setSeleccionados([])
      setFixtures([])
      return
    }
    const lista = ordenarPorHora([...editPartidos, ...aceptados])
    setEditPartidos(lista)
    // Auto-rellenar el cierre solo si está vacío (en edición normalmente ya tiene valor).
    if (!editCierre) {
      const sug = cierreSugerido(lista)
      if (sug) setEditCierre(sug)
    }
    setSeleccionados([])
    setFixtures([])
  }

  const actualizarEditPartido = (i, campo, valor) =>
    setEditPartidos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))

  // ─── Edición de quiniela existente ───────────────────────────────────────
  const guardarEdicion = async () => {
    if (!quinielaActual || guardandoEdicion) return
    if (editPartidos.length === 0) return alerta('La quiniela debe tener al menos un partido.')
    if (!editNombre.trim()) return alerta('El nombre no puede estar vacío.')
    if (!editCierre) return alerta('La fecha y hora de cierre es obligatoria.')
    const chkCierre = validarCierreVsPartidos(editCierre, editPartidos)
    if (chkCierre.conflicto) {
      setEditCierre(chkCierre.sugerencia)
      return alerta(
        `El cierre no puede ser después de que arranque el primer partido (${formatFixtureDate(chkCierre.primera)}).\n\n` +
        `Si no, se podrían registrar predicciones con partidos ya empezados.\n\n` +
        `Lo ajusté a ${formatFixtureDate(chkCierre.sugerencia)} (${MARGEN_CIERRE_MIN} min antes). Revísalo y guarda de nuevo.`
      )
    }
    if ((conteoPredicciones ?? 0) > 0 && editPartidos.length < editPartidosOriginales) {
      return alerta('No puedes quitar partidos existentes cuando ya hay predicciones registradas. Solo puedes agregar nuevos al final.')
    }
    const { campos: premioFields } = camposPremio(editPremioFijo, editCuota, editModeloPremio)
    setGuardandoEdicion(true)
    try {
      const cierreTs = inputValueACierre(editCierre)
      const codigoLimpio = editCodigoAcceso.trim()
      const empresaLimpia = editEmpresa.trim()
      // El código es obligatorio para clientes (quiniela privada). El super sí puede vaciarlo.
      if (!soySuper && !codigoLimpio) {
        alerta('Ponle un código de acceso: es la llave para que entren tus jugadores.')
        setGuardandoEdicion(false)
        return
      }
      // Validar unicidad del código de acceso (excluyendo esta misma quiniela).
      // Mensaje neutro: no revelamos info de quinielas ajenas.
      if (codigoLimpio) {
        if (esCodigoDebil(codigoLimpio) && !(await confirmar(
          `El código "${codigoLimpio}" es muy corto y fácil de adivinar. Te recomendamos uno más largo o el autogenerado. ¿Usarlo de todos modos?`,
          { titulo: 'Código fácil de adivinar', confirmar: 'Usar de todos modos' }
        ))) { setGuardandoEdicion(false); return }
        const yaExiste = await codigoYaUsado(codigoLimpio.toLowerCase(), quinielaActual.id)
        if (yaExiste) {
          alerta(`El código "${codigoLimpio}" no está disponible. Prueba con otro (puedes agregar el año, iniciales o un número).`)
          setGuardandoEdicion(false)
          return
        }
      }
      const patch = {
        nombre:   editNombre.trim(),
        partidos: editPartidos,
        cierre:   cierreTs,
        codigoAcceso: codigoLimpio || null,
        codigoAccesoLower: codigoLimpio ? codigoLimpio.toLowerCase() : null,
        privada: soySuper ? !!editPrivada : true,
        empresa: empresaLimpia || null,
        requiereApellido: !!editRequiereApellido,
        ...premioFields,
      }
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
      const actualizado = { ...quinielaActual, ...patch }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
      setTab('resultados')
    } catch {
      alerta('Error al guardar cambios.')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  // ─── Cerrar / reabrir quiniela ───────────────────────────────────────────
  const toggleCerrar = async () => {
    if (!quinielaActual || toggling) return
    const estaCerrada = esCerradaQ(quinielaActual)
    // Reabrir es delicado: puede permitir entradas tardías y descuadrar el ranking.
    if (estaCerrada && !(await confirmar(
      'Vas a REABRIR esta quiniela. Quedará sin fecha de cierre y la gente podrá volver a registrar o cambiar predicciones, lo que puede afectar el ranking. ¿Continuar?',
      { titulo: 'Reabrir quiniela', confirmar: 'Reabrir', peligro: true }
    ))) return
    // Cerrar manualmente también merece confirmación: bloquea registros y picks al instante.
    if (!estaCerrada && !(await confirmar(
      'Vas a CERRAR esta quiniela ahora mismo.\n\n• Nadie podrá registrar predicciones nuevas ni cambiar las suyas.\n• El ranking queda fijo con los participantes actuales.\n• Podrás reabrirla más tarde si lo necesitas.\n\n¿Cerrar ahora?',
      { titulo: 'Cerrar quiniela', confirmar: 'Cerrar quiniela', cancelar: 'Cancelar' }
    ))) return
    setToggling(true)
    try {
      const changes = estaCerrada
        ? { cerrada: false, cierre: null }
        : { cerrada: true }
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), changes)
      const actualizado = { ...quinielaActual, ...changes }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alerta('Error al actualizar el estado.')
    } finally {
      setToggling(false)
    }
  }

  // ─── Marcar / desmarcar como principal ──────────────────────────────────
  const toggleDestacada = async () => {
    if (!quinielaActual || destacando) return
    const yaDestacada = !!quinielaActual.destacada
    setDestacando(true)
    try {
      if (yaDestacada) {
        await updateDoc(doc(db, 'quinielas', quinielaActual.id), { destacada: false })
        const actualizado = { ...quinielaActual, destacada: false }
        setQuinielaActual(actualizado)
        setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
      } else {
        const otrasDestacadas = quinielas.filter(q => q.id !== quinielaActual.id && q.destacada)
        await Promise.all([
          ...otrasDestacadas.map(q => updateDoc(doc(db, 'quinielas', q.id), { destacada: false })),
          updateDoc(doc(db, 'quinielas', quinielaActual.id), { destacada: true }),
        ])
        const actualizado = { ...quinielaActual, destacada: true }
        setQuinielaActual(actualizado)
        setQuinielas(prev => prev.map(q =>
          q.id === quinielaActual.id ? actualizado :
          q.destacada ? { ...q, destacada: false } : q
        ))
      }
    } catch {
      alerta('Error al actualizar el estado.')
    } finally {
      setDestacando(false)
    }
  }

  // ─── Devolver / reactivar bote ──────────────────────────────────────────
  const [toggleBote, setToggleBote] = useState(false)
  const toggleBoteDevuelto = async () => {
    if (!quinielaActual || toggleBote) return
    const nuevo = !quinielaActual.boteDevuelto
    const mensaje = nuevo
      ? '¿Marcar el bote como devuelto? Los premios dejarán de mostrarse en el ranking.'
      : '¿Reactivar el premio? Se volverán a mostrar los ganadores y sus premios.'
    if (!(await confirmar(mensaje))) return
    setToggleBote(true)
    try {
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { boteDevuelto: nuevo })
      const actualizado = { ...quinielaActual, boteDevuelto: nuevo }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alerta('Error al actualizar el estado del bote.')
    } finally {
      setToggleBote(false)
    }
  }

  // ─── Marcar/desmarcar pago de una predicción ────────────────────────────
  const togglePago = async (predId) => {
    if (!quinielaActual || togglingPago) return
    setTogglingPago(predId)
    try {
      const pagadosActuales = quinielaActual.pagados ?? []
      const yaPagado = pagadosActuales.includes(predId)
      const nuevosPagados = yaPagado
        ? pagadosActuales.filter(id => id !== predId)
        : [...pagadosActuales, predId]
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { pagados: nuevosPagados })
      const actualizado = { ...quinielaActual, pagados: nuevosPagados }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alerta('Error al actualizar el estado de pago.')
    } finally {
      setTogglingPago(null)
    }
  }

  // ─── Marcar/desmarcar cumpleaños de un participante (muestra 🎂 en el ranking) ─
  const toggleCumple = async (predId) => {
    if (!quinielaActual || togglingCumple) return
    setTogglingCumple(predId)
    try {
      const actuales = quinielaActual.cumpleaneros ?? []
      const yaCumple = actuales.includes(predId)
      const nuevos = yaCumple
        ? actuales.filter(id => id !== predId)
        : [...actuales, predId]
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { cumpleaneros: nuevos })
      const actualizado = { ...quinielaActual, cumpleaneros: nuevos }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alerta('Error al actualizar el cumpleaños.')
    } finally {
      setTogglingCumple(null)
    }
  }

  // ─── Eliminar predicción individual ──────────────────────────────────────
  const eliminarPrediccion = async (pred) => {
    if (!(await confirmar(`¿Eliminar la predicción de "${pred.nombre}"? El jugador podrá volver a registrarse.`, { titulo: 'Eliminar predicción', confirmar: 'Eliminar', peligro: true }))) return
    setEliminandoPred(pred.id)
    try {
      await deleteDoc(doc(db, 'predicciones', pred.id))
      setListaPredicciones(prev => prev.filter(p => p.id !== pred.id))
      setConteos(prev => ({ ...prev, [quinielaActual.id]: Math.max(0, (prev[quinielaActual.id] ?? 1) - 1) }))
    } catch {
      alerta('Error al eliminar. Intenta de nuevo.')
    } finally {
      setEliminandoPred(null)
    }
  }

  // ─── Eliminar quiniela ────────────────────────────────────────────────────
  const eliminarQuiniela = async () => {
    if (!quinielaActual || eliminando) return
    if (!(await confirmar(`¿Seguro que deseas eliminar "${quinielaActual.nombre}"? Esta acción no se puede deshacer.`, { titulo: 'Eliminar quiniela', confirmar: 'Eliminar', peligro: true }))) return
    if (deleteConfirm.trim() !== quinielaActual.nombre.trim()) return
    setEliminando(true)
    try {
      const predsSnap = await getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      await Promise.all(predsSnap.docs.map(d => deleteDoc(doc(db, 'predicciones', d.id))))
      await deleteDoc(doc(db, 'quinielas', quinielaActual.id))
      setConteos(prev => { const next = { ...prev }; delete next[quinielaActual.id]; return next })
      setQuinielas(prev => prev.filter(q => q.id !== quinielaActual.id))
      setQuinielaActual(null)
      setDeleteConfirm('')
      setVista('lista')
    } catch {
      alerta('Error al eliminar. Intenta de nuevo.')
    } finally {
      setEliminando(false)
    }
  }

  // ─── Validación de unicidad del código de acceso ────────────────────────
  // Evita que dos admins (o el mismo) usen el mismo código en quinielas
  // distintas — porque el buscador en home buscaría por codigoAccesoLower
  // y no sabría cuál retornar.
  const codigoYaUsado = async (codigoLower, excluirId = null) => {
    if (!codigoLower) return false
    try {
      const snap = await getDocs(query(
        collection(db, 'quinielas'),
        where('codigoAccesoLower', '==', codigoLower)
      ))
      return snap.docs.some(d => d.id !== excluirId)
    } catch (err) {
      // Si falla la consulta (red, permisos), NO bloqueamos al admin —
      // mejor permitir guardar y dejar que el conflicto se detecte después
      // que perder su trabajo por un error de red.
      console.error('Error validando código de acceso:', err)
      return false
    }
  }

  // ─── Guardar nueva quiniela ───────────────────────────────────────────────
  const camposPremio = (fijoStr, cuotaStr, modelo) => {
    const fijo = Number(fijoStr) || 0
    const cuotaNum = Number(cuotaStr) || 0
    const tienePremio = fijo > 0 || cuotaNum > 0
    return {
      campos: {
        tipoPremio: null,
        premioFijo: fijo > 0 ? fijo : null,
        cuota: cuotaNum > 0 ? cuotaNum : null,
        modeloPremio: tienePremio ? modelo : null,
      },
    }
  }

  // Abre el formulario de nueva quiniela, pre-llenando un código de acceso editable.
  const abrirNuevaQuiniela = () => {
    if (!codigoAcceso.trim()) setCodigoAcceso(generarCodigoAcceso())
    setVista('nueva')
  }

  const guardarNuevaQuiniela = async () => {
    // Gate de cuota (defensivo; la UI ya muestra el paywall si no puede crear).
    if (!puedeCrear) return alerta('Ya usaste tu(s) quiniela(s) incluida(s). Elige un plan para crear más.')
    if (!nombre.trim()) return alerta('Ponle un nombre a la quiniela')
    if (!cierre) return alerta('La fecha y hora de cierre es obligatoria')
    if (partidos.length === 0) return alerta('Agrega al menos un partido')
    if (partidos.some(p => !p.local.trim() || !p.visitante.trim())) return alerta('Completa nombre de equipos en todos los partidos')
    const chkCierre = validarCierreVsPartidos(cierre, partidos)
    if (chkCierre.conflicto) {
      setCierre(chkCierre.sugerencia)
      return alerta(
        `El cierre no puede ser después de que arranque el primer partido (${formatFixtureDate(chkCierre.primera)}).\n\n` +
        `Si no, se podrían registrar predicciones con partidos ya empezados.\n\n` +
        `Lo ajusté a ${formatFixtureDate(chkCierre.sugerencia)} (${MARGEN_CIERRE_MIN} min antes). Revísalo y guarda de nuevo.`
      )
    }
    const { campos: premioFields } = camposPremio(premioFijo, cuota, modeloPremio)
    setGuardando(true)
    try {
      const cierreTs = inputValueACierre(cierre)
      const creada   = new Date().toISOString()
      const codigoLimpio = codigoAcceso.trim()
      const empresaLimpia = empresa.trim()
      // El código es obligatorio para clientes (su quiniela es privada: el código
      // es la llave de acceso). El super admin sí puede dejarlo vacío (quinielas públicas).
      if (!soySuper && !codigoLimpio) {
        alerta('Ponle un código de acceso: es la llave para que entren tus jugadores.')
        setGuardando(false)
        return
      }
      // Validar unicidad del código de acceso antes de crear.
      // Mensaje neutro a propósito: no revelamos si el código es de otro admin
      // (sería un information leak hacia quinielas privadas ajenas).
      if (codigoLimpio) {
        if (esCodigoDebil(codigoLimpio) && !(await confirmar(
          `El código "${codigoLimpio}" es muy corto y fácil de adivinar. Te recomendamos uno más largo o el autogenerado. ¿Usarlo de todos modos?`,
          { titulo: 'Código fácil de adivinar', confirmar: 'Usar de todos modos' }
        ))) { setGuardando(false); return }
        const yaExiste = await codigoYaUsado(codigoLimpio.toLowerCase())
        if (yaExiste) {
          alerta(`El código "${codigoLimpio}" no está disponible. Prueba con otro (puedes agregar el año, iniciales o un número).`)
          setGuardando(false)
          return
        }
      }
      const base = {
        nombre: nombre.trim(), cierre: cierreTs, partidos,
        resultados: {}, creada, cerrada: false,
        ownerUid: auth.currentUser?.uid ?? null,
        codigoAcceso: codigoLimpio || null,
        codigoAccesoLower: codigoLimpio ? codigoLimpio.toLowerCase() : null,
        // Los admins normales solo crean quinielas privadas (no salen al home público).
        privada: soySuper ? !!privada : true,
        empresa: empresaLimpia || null,
        requiereApellido: !!requiereApellido,
        ...premioFields,
      }
      const ref = await addDoc(collection(db, 'quinielas'), base)
      const nueva = { id: ref.id, ...base }
      setQuinielaActual(nueva)
      setResultados({})
      setVista('gestionar')
      setTab('compartir')
      cargarQuinielas()
      // Descontar la cuota del cliente (el super admin no consume cuota).
      if (!soySuper && miUid) {
        try { await updateDoc(doc(db, 'admins', miUid), { quinielasCreadas: increment(1) }) }
        catch { /* el contador es suave; no bloquea la creación ya hecha */ }
        recargarMiAdminDoc()
      }
      setNombre(''); setCierre(''); setPartidos([{ local: '', visitante: '', hora: '' }])
      setPremioFijo(''); setCuota(''); setModeloPremio(MODELO_PREMIO.GANADOR_UNICO)
      setCodigoAcceso(''); setPrivada(false); setEmpresa(''); setRequiereApellido(false)
      setFixtures([]); setSeleccionados([])
    } catch { alerta('Error al guardar. Intenta de nuevo.') }
    finally { setGuardando(false) }
  }

  // ─── Seleccionar quiniela existente ──────────────────────────────────────
  const gestionarQuiniela = (q) => {
    setQuinielaActual(q)
    const resInit = {}
    Object.entries(q.resultados ?? {}).forEach(([idx, r]) => {
      resInit[idx] = r?.cancelado
        ? { cancelado: true }
        : { local: r.local ?? '', visitante: r.visitante ?? '' }
    })
    setResultados(resInit)
    setTab('resultados')
    setVista('gestionar')
  }

  // ─── Validar contra ESPN antes de mostrar la confirmación ──────────────
  const iniciarGuardarResultados = async () => {
    if (!quinielaActual || guardandoRes) return
    const partidos = quinielaActual.partidos ?? []
    const items = partidos.map((p, i) => {
      const r = resultados[i] ?? {}
      const cancelado = !!r.cancelado
      const tiene = !cancelado && String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
      if (!cancelado && !tiene) return null
      return {
        idx: i, partido: p,
        local: cancelado ? '' : String(r.local),
        visitante: cancelado ? '' : String(r.visitante),
        cancelado,
        espnLocal: undefined, espnVisitante: undefined, espnEstado: undefined,
      }
    }).filter(Boolean)

    if (items.length === 0) {
      return alerta('No hay resultados que guardar.')
    }

    setConfirmacionRes({ items })

    // Validar contra ESPN en background
    const conEspn = items.filter(it => it.partido.espnId && it.partido.ligaId && !it.cancelado)
    if (conEspn.length === 0) return

    setValidandoEspn(true)
    const porLiga = {}
    conEspn.forEach(it => {
      if (!porLiga[it.partido.ligaId]) porLiga[it.partido.ligaId] = []
      porLiga[it.partido.ligaId].push(it)
    })
    const actualizadas = [...items]
    for (const [liga, its] of Object.entries(porLiga)) {
      try {
        const fechas = its.map(it => it.partido.hora).filter(Boolean).sort()
        const inicio = fechas[0] ? fechas[0].slice(0, 10).replace(/-/g, '') : ''
        const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const url = inicio
          ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${inicio}-${hoy}`
          : `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`
        const r = await fetch(url)
        const d = await r.json()
        const events = d.events ?? []
        its.forEach(it => {
          const ev = events.find(e => e.id === it.partido.espnId)
          if (!ev) return
          const state = ev.status?.type?.state
          const comps = ev.competitions?.[0]?.competitors ?? []
          const home = comps.find(c => c.homeAway === 'home')
          const away = comps.find(c => c.homeAway === 'away')
          const i = actualizadas.findIndex(x => x.idx === it.idx)
          if (i >= 0) {
            actualizadas[i] = {
              ...actualizadas[i],
              espnLocal: home?.score,
              espnVisitante: away?.score,
              espnEstado: state,
            }
          }
        })
      } catch { /* silencioso */ }
    }
    setConfirmacionRes({ items: actualizadas })
    setValidandoEspn(false)
  }

  // ─── Guardar resultados ───────────────────────────────────────────────────
  const guardarResultados = async () => {
    if (!quinielaActual || guardandoRes) return
    setGuardandoRes(true)
    try {
      const resGuardar = {}
      Object.entries(resultados).forEach(([idx, r]) => {
        if (r?.cancelado) {
          resGuardar[idx] = { cancelado: true }
        } else if (String(r.local).trim() !== '' && String(r.visitante).trim() !== '') {
          const resultado = goalsToResultado(r.local, r.visitante)
          resGuardar[idx] = { local: r.local, visitante: r.visitante, resultado }
        }
      })
      const completos = resultadosCompletos({ partidos: quinielaActual.partidos, resultados: resGuardar })
      const patch = completos ? { resultados: resGuardar, finalizada: true, finalizadaEn: new Date().toISOString() } : { resultados: resGuardar }
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
      setGuardadoRes(true)
      setTimeout(() => setGuardadoRes(false), 3000)
      setQuinielaActual(prev => ({ ...prev, ...patch }))
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, ...patch } : q))
      setConfirmacionRes(null)
    } catch { alerta('Error al guardar resultados.') }
    finally { setGuardandoRes(false) }
  }

  // ─── Sincronizar desde ESPN ───────────────────────────────────────────────
  const sincronizarDesdeESPN = async () => {
    if (!quinielaActual || sincronizando) return
    setSincronizando(true)
    setSincrMsg('')

    const porLiga = {}
    ;(quinielaActual.partidos ?? []).forEach((p, i) => {
      if (!p.espnId || !p.ligaId) return
      if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
      porLiga[p.ligaId].push({ ...p, idx: i })
    })

    if (Object.keys(porLiga).length === 0) {
      setSincrMsg('⚠ Estos partidos no se pueden sincronizar (se agregaron a mano). Créalos desde el buscador.')
      setSincronizando(false)
      return
    }

    const resGuardar = { ...resultados }
    let actualizados = 0
    const nuevasSugerencias = []

    for (const [liga, ps] of Object.entries(porLiga)) {
      try {
        const fechas = ps.map(p => p.hora).filter(Boolean).sort()
        const inicio = fechas[0] ? fechas[0].slice(0, 10).replace(/-/g, '') : ''
        const hoy    = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const url    = inicio
          ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${inicio}-${hoy}`
          : `https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard`

        const r = await fetch(url)
        const d = await r.json()
        const events = d.events ?? []

        ps.forEach(p => {
          if (resGuardar[p.idx]?.cancelado) return
          const ev = events.find(e => e.id === p.espnId)
          if (!ev) {
            // Fallback: el ID no coincide. Buscar por nombres + día.
            // Si encuentra exactamente 1 candidato, pedimos confirmación al admin
            // (no actualizamos automáticamente para evitar usar un partido equivocado).
            const candidato = findEventByTeamsAndDate(events, p.local, p.visitante, p.hora)
            if (candidato) {
              nuevasSugerencias.push({ idx: p.idx, partidoOriginal: p, eventoSugerido: candidato, ligaId: liga })
            }
            return
          }
          const state = ev.status?.type?.state
          if (state !== 'post') return
          // ESPN reporta cancelados/pospuestos/forfeits con state="post" y completed=false,
          // típicamente con score 0-0. NO debemos guardarlo como empate — lo marcamos cancelado.
          const completed = ev.status?.type?.completed
          if (completed === false) {
            resGuardar[p.idx] = { cancelado: true }
            actualizados++
            return
          }
          const comps = ev.competitions?.[0]?.competitors ?? []
          const home  = comps.find(c => c.homeAway === 'home')
          const away  = comps.find(c => c.homeAway === 'away')
          if (home?.score === undefined || away?.score === undefined) return
          const resultado = goalsToResultado(home.score, away.score)
          resGuardar[p.idx] = { local: home.score, visitante: away.score, resultado }
          actualizados++
        })
      } catch { /* silencioso */ }
    }

    // Mostrar/actualizar las sugerencias (reemplazan a las anteriores en cada run)
    setSugerenciasIdMismatch(nuevasSugerencias)

    if (actualizados > 0) {
      try {
        const completos = resultadosCompletos({ partidos: quinielaActual.partidos, resultados: resGuardar })
        const patch = completos ? { resultados: resGuardar, finalizada: true, finalizadaEn: new Date().toISOString() } : { resultados: resGuardar }
        await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
        setResultados(resGuardar)
        setQuinielaActual(prev => ({ ...prev, ...patch }))
        setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, ...patch } : q))
        const sugMsg = nuevasSugerencias.length > 0
          ? ` · ${nuevasSugerencias.length} con ID cambiado (revisa arriba)`
          : ''
        setSincrMsg(`✓ ${actualizados} partido${actualizados !== 1 ? 's' : ''} sincronizado${actualizados !== 1 ? 's' : ''}${sugMsg}`)
        setTimeout(() => setSincrMsg(''), 6000)
      } catch { setSincrMsg('⚠ Error al guardar. Intenta de nuevo.') }
    } else if (nuevasSugerencias.length > 0) {
      setSincrMsg(`${nuevasSugerencias.length} partido${nuevasSugerencias.length !== 1 ? 's' : ''} con ID cambiado — revisa arriba para confirmar.`)
      setTimeout(() => setSincrMsg(''), 8000)
    } else {
      setSincrMsg('Sin partidos terminados para sincronizar.')
      setTimeout(() => setSincrMsg(''), 4000)
    }

    setSincronizando(false)
  }

  // ─── Aplicar / ignorar una sugerencia de ID cambiado en ESPN ──────────────
  const aplicarSugerencia = async (s) => {
    if (!quinielaActual || aplicandoSugerencia) return
    setAplicandoSugerencia(s.idx)
    try {
      const ev = s.eventoSugerido
      const state     = ev.status?.type?.state
      const completed = ev.status?.type?.completed
      const comps = ev.competitions?.[0]?.competitors ?? []
      const home  = comps.find(c => c.homeAway === 'home')
      const away  = comps.find(c => c.homeAway === 'away')

      // Calcular el nuevo resultado según el estado actual del evento
      let nuevoResultado = null
      if (state === 'post' && completed === false) {
        nuevoResultado = { cancelado: true }
      } else if (state === 'post' && home?.score !== undefined && away?.score !== undefined) {
        const resultado = goalsToResultado(home.score, away.score)
        nuevoResultado = { local: home.score, visitante: away.score, resultado }
      }
      // Si aún no terminó, no actualizamos resultado — solo el espnId

      const nuevosPartidos = (quinielaActual.partidos ?? []).map((p, i) =>
        i === s.idx ? { ...p, espnId: ev.id } : p
      )
      const nuevasResultados = { ...(quinielaActual.resultados ?? {}) }
      if (nuevoResultado) nuevasResultados[s.idx] = nuevoResultado

      const completos = nuevoResultado
        ? resultadosCompletos({ partidos: nuevosPartidos, resultados: nuevasResultados })
        : false
      const patch = {
        partidos: nuevosPartidos,
        resultados: nuevasResultados,
        ...(completos ? { finalizada: true, finalizadaEn: new Date().toISOString() } : {}),
      }

      await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
      setQuinielaActual(prev => ({ ...prev, ...patch }))
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, ...patch } : q))
      setResultados(nuevasResultados)
      setSugerenciasIdMismatch(prev => prev.filter(x => x.idx !== s.idx))
    } catch (err) {
      console.error('Error aplicando sugerencia ESPN:', err)
      alerta('Error al aplicar la sugerencia. Intenta de nuevo.')
    } finally {
      setAplicandoSugerencia(null)
    }
  }

  const ignorarSugerencia = (idx) => {
    setSugerenciasIdMismatch(prev => prev.filter(x => x.idx !== idx))
  }

  // ─── Caja: guardar / eliminar ─────────────────────────────────────────────
  const guardarMovimiento = async () => {
    if (!cajaNombre || !nuevoMonto || Number(nuevoMonto) <= 0) return
    setGuardandoMov(true)
    try {
      const datos = {
        nombre: cajaNombre,
        tipo: nuevoTipo,
        monto: Number(nuevoMonto),
        nota: nuevaNota.trim(),
        fecha: new Date().toISOString(),
      }
      const ref = await addDoc(collection(db, 'movimientos'), datos)
      setMovimientos(prev => [{ id: ref.id, ...datos }, ...prev])
      setNuevoMonto('')
      setNuevaNota('')
    } catch {
      alerta('Error al guardar. Intenta de nuevo.')
    } finally {
      setGuardandoMov(false)
    }
  }

  const eliminarMovimiento = async (mov) => {
    if (!(await confirmar('¿Eliminar este movimiento?', { titulo: 'Eliminar movimiento', confirmar: 'Eliminar', peligro: true }))) return
    try {
      await deleteDoc(doc(db, 'movimientos', mov.id))
      setMovimientos(prev => prev.filter(m => m.id !== mov.id))
    } catch {
      alerta('Error al eliminar.')
    }
  }

  // ─── Compartir ────────────────────────────────────────────────────────────
  const linkJugadores = quinielaActual ? `${window.location.origin}/quiniela/${quinielaActual.id}` : ''
  const linkRanking   = quinielaActual ? `${window.location.origin}/ranking/${quinielaActual.id}` : ''

  const copiar = (txt, key) => {
    navigator.clipboard.writeText(txt)
    setCopiado(key)
    setTimeout(() => setCopiado(null), 2000)
  }

  // ─── Lista helpers ────────────────────────────────────────────────────────
  // Las quinielas se filtran por dueño:
  //   - Super admin: ve todas, agrupadas en "Tuyas" + "De otros admins"
  //   - Admin normal: solo ve las que él creó (ownerUid == su uid)
  //   - Quinielas legacy (sin ownerUid) se consideran del super admin
  const esMia = (q) => (!q.ownerUid && soySuper) || q.ownerUid === miUid
  const subdividirPorEstado = (arr) => ({
    activas:     arr.filter(q => !esCerradaQ(q)),
    enJuego:     arr.filter(q => esCerradaQ(q) && !esFinalizadaQ(q)),
    finalizadas: arr.filter(q => esCerradaQ(q) && esFinalizadaQ(q)),
  })
  const quinielasMias     = quinielas.filter(esMia)
  const quinielasOtras    = soySuper ? quinielas.filter(q => !esMia(q)) : []
  const mias  = subdividirPorEstado(quinielasMias)
  const otras = subdividirPorEstado(quinielasOtras)

  // Mapa uid → doc de admin, para etiquetar de quién es cada quiniela (vista super).
  const adminsPorUid = {}
  clientes.forEach(c => { adminsPorUid[c.id] = c })
  const labelDueno = (q) => {
    if (!q.ownerUid) return null
    const a = adminsPorUid[q.ownerUid]
    if (a) return a.nombre || a.email
    return `Admin (${q.ownerUid.slice(0, 6)}…)`
  }

  // ─── Detección de posibles nombres duplicados (tab Participantes) ────────
  // Heurística estricta — solo marca casos con alta probabilidad real.
  const mapaSimilaresPorNombre = useMemo(
    () => detectarSimilares(listaPredicciones.map(p => p.nombre)),
    [listaPredicciones]
  )

  // ─── Caja helpers ────────────────────────────────────────────────────────
  const movimientosPorNombre = {}
  movimientos.forEach(m => {
    if (!movimientosPorNombre[m.nombre]) movimientosPorNombre[m.nombre] = []
    movimientosPorNombre[m.nombre].push(m)
  })
  const saldos = Object.entries(movimientosPorNombre)
    .map(([nombre, movs]) => ({
      nombre,
      saldo: movs.reduce((acc, m) => acc + ((m.tipo === 'premio' || m.tipo === 'deposito') ? m.monto : -m.monto), 0),
    }))
    .sort((a, b) => cajaOrden === 'monto'
      ? b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, 'es-MX')
      : a.nombre.localeCompare(b.nombre, 'es-MX'))
  const movimientosParticipante = cajaNombre ? movimientos.filter(m => m.nombre === cajaNombre) : []
  const saldoParticipante = movimientosParticipante.reduce(
    (acc, m) => acc + ((m.tipo === 'premio' || m.tipo === 'deposito') ? m.monto : -m.monto),
    0
  )

  // ─── Login ────────────────────────────────────────────────────────────────
  if (!authListo) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando…
    </div>
  )

  if (!autenticado) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>Panel de Administrador</h2>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <BrandWordmark markSize={24} fontSize={20} />
          </div>
        </div>
        <div style={card}>
          <label htmlFor="admin-email" style={lbl}>Correo electrónico</label>
          <input
            id="admin-email"
            type="email" placeholder="correo@ejemplo.com" value={email}
            onChange={e => { setEmail(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 12, borderColor: loginError ? 'var(--red)' : undefined }}
          />
          <label htmlFor="admin-password" style={lbl}>Contraseña</label>
          <input
            id="admin-password"
            type="password" placeholder="Tu contraseña" value={password}
            onChange={e => { setPassword(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 10, borderColor: loginError ? 'var(--red)' : undefined }}
          />
          {loginError && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{loginError}</p>}
          <button onClick={entrar} disabled={loginLoading} style={{ ...greenCtaStyle(loginLoading), width: '100%', padding: '12px' }}>
            {loginLoading ? 'Entrando…' : 'Entrar →'}
          </button>
          <button
            onClick={recuperarPassword}
            style={{
              width: '100%', marginTop: 12, padding: '4px', background: 'transparent',
              border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
          {resetMsg && (
            <p style={{ fontSize: 12, color: 'var(--green-light)', marginTop: 10, lineHeight: 1.5 }}>
              {resetMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  // ─── Cambio de contraseña obligatorio (primer ingreso del cliente) ─────────
  if (debeCambiarPassword) return (
    <CambioPassword
      uid={miUid}
      onListo={() => setAdminDoc(d => (d ? { ...d, debeCambiarPassword: false } : d))}
    />
  )

  // ─── Bloque de upsell de planes (banner de lista + Mi cuenta) ─────────────
  // Explica el Pase Mundial + botones de compra. Solo si NO tiene pase vigente.
  const renderUpsellPlan = () => (
    !temporadaVigente(adminDoc) ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <a
          href={waLink(MENSAJES_WA.comprarQuiniela)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'transparent', textDecoration: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>➕ Otra quiniela</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>$49</span>
          </div>
          <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            <li>Una quiniela adicional</li>
            <li>Pago único</li>
          </ul>
        </a>
        <a
          href={waLink(MENSAJES_WA.paseMundial)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--green)', background: 'var(--green-bg)', textDecoration: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>🏆 Pase Mundial</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>$199</span>
          </div>
          <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            <li>Quinielas ilimitadas durante el Mundial 2026</li>
            <li>Pago único, no por cada quiniela</li>
          </ul>
        </a>
      </div>
    ) : null
  )

  // ─── Formulario de premio (reutilizable) ──────────────────────────────────
  // Único modelo de premio: "Ganador único" (gana quien más puntos; empate = se reparte).
  const renderFormularioPremio = (fijo, setFijo, cuotaVal, setCuotaVal) => {
    const tienePremioLocal = (Number(fijo) || 0) > 0 || (Number(cuotaVal) || 0) > 0
    return (
      <div style={card}>
        <label style={lbl}>Premio</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: tienePremioLocal ? 14 : 0 }}>
          <div>
            <label style={{ ...lbl, marginBottom: 6, minHeight: 28 }}>Premio fijo<span style={{ display: 'block' }}>(MXN)</span></label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 500"
              value={fijo}
              onChange={e => setFijo(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Monto garantizado, independiente de participantes.</p>
          </div>
          <div>
            <label style={{ ...lbl, marginBottom: 6, minHeight: 28 }}>Cuota por participante<span style={{ display: 'block' }}>(MXN)</span></label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 50"
              value={cuotaVal}
              onChange={e => setCuotaVal(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Se suma al bote por cada participante que pague.</p>
          </div>
        </div>
        {!tienePremioLocal && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>Deja ambos en 0 para una quiniela gratis sin premio.</p>
        )}

        {tienePremioLocal && (
          <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-soft)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
              🏆 <strong>Gana quien acumule más puntos.</strong> Si dos o más quedan empatados en puntos,
              se reparten el premio en partes iguales.
            </p>
          </div>
        )}
      </div>
    )
  }

  // ─── Buscador de fixtures (reutilizable) ──────────────────────────────────
  const renderBuscadorFixtures = (onAgregar) => (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ ...lbl, marginBottom: 0 }}>
          {onAgregar === agregarSeleccionados ? 'Buscar partidos' : 'Agregar partidos'}
        </label>
        {/* El cambio Próximos/Pasados solo lo ve el super admin; los clientes
            siempre buscan partidos próximos (que es lo que necesitan). */}
        {soySuper && (
          <div style={{ display: 'flex', background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', padding: 3, gap: 2, border: '1px solid var(--border)' }}>
            {[{ val: false, label: 'Próximos' }, { val: true, label: 'Pasados' }].map(op => (
              <button
                key={String(op.val)}
                onClick={() => { setBuscarPasados(op.val); setFixtures([]); setSeleccionados([]) }}
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, border: 'none',
                  borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                  background: buscarPasados === op.val ? 'var(--card-light)' : 'transparent',
                  color: buscarPasados === op.val ? 'var(--text-strong)' : 'var(--muted)',
                }}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Elige la liga, toca <strong style={{ color: 'var(--text)' }}>Buscar</strong> y marca los partidos que quieras agregar.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: fixtures.length > 0 ? 12 : 0 }}>
        <select
          value={ligaId}
          onChange={e => { setLigaId(e.target.value); setFixtures([]); setSeleccionados([]) }}
          style={{ fontSize: 14, color: ligaId ? 'var(--text)' : 'var(--muted)' }}
        >
          <option value="" disabled>Selecciona una liga…</option>
          {LIGAS.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <button
          onClick={buscarFixtures}
          disabled={loadingFixtures || !ligaId}
          style={{ ...greenCtaStyle(loadingFixtures || !ligaId), padding: '9px 16px', whiteSpace: 'nowrap' }}
        >
          {loadingFixtures ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {errorFixtures && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, lineHeight: 1.5 }}>{errorFixtures}</p>}

      {fixtures.length > 0 && (
        <>
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            {fixtures.map((f, i) => {
              const sel     = seleccionados.some(s => s.id === f.id)
              const comps   = f.competitions?.[0]?.competitors ?? []
              const homeCmp = comps.find(c => c.homeAway === 'home')
              const awayCmp = comps.find(c => c.homeAway === 'away')
              const home    = homeCmp?.team?.displayName ?? '?'
              const away    = awayCmp?.team?.displayName ?? '?'
              const homeLogo = homeCmp?.team?.logo ?? ''
              const awayLogo = awayCmp?.team?.logo ?? ''
              return (
                <div
                  key={f.id} onClick={() => toggleFixture(f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', cursor: 'pointer',
                    borderBottom: i < fixtures.length - 1 ? '1px solid var(--border)' : 'none',
                    background: sel ? 'var(--green-bg)' : 'var(--card)', transition: 'background 0.1s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: sel ? '2px solid var(--green)' : '2px solid var(--border-strong)',
                    background: sel ? 'var(--green)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sel && <span style={{ color: '#07120A', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    {homeLogo && <img src={homeLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{home}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                    {awayLogo && <img src={awayLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{away}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{f.date ? formatFixtureDate(f.date) : ''}</span>
                </div>
              )
            })}
          </div>
          {seleccionados.length > 0 && (
            <button
              onClick={onAgregar}
              style={{ ...greenCtaStyle(false), width: '100%', marginTop: 10, padding: '11px' }}
            >
              + Agregar {seleccionados.length} partido{seleccionados.length !== 1 ? 's' : ''} al formulario
            </button>
          )}
        </>
      )}
    </div>
  )

  // ─── Render principal ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="hero-pad" style={{ background: 'var(--hero-gradient)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <a href="/" style={{ marginBottom: 8, textDecoration: 'none', display: 'inline-flex' }}>
              <BrandWordmark markSize={22} fontSize={18} />
            </a>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {soySuper ? 'Panel de Súper Administrador' : 'Panel de Administrador'}
            </h1>
            {!soySuper && adminDoc?.nombre && (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                👤 {adminDoc.nombre}{adminDoc.empresa ? ` · ${adminDoc.empresa}` : ''}
              </p>
            )}
          </div>
            <button
              onClick={salir}
              style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--muted)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              Salir
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              {vista !== 'lista' && (
                <button
                  onClick={() => {
                    setVista('lista')
                    setQuinielaActual(null)
                    setFixtures([])
                    setSeleccionados([])
                    setCajaNombre(null)
                  }}
                  style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {'← Atrás'}
                </button>
              )}
            </div>
            <a
              href="/"
              style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
            >
              🏠 Inicio
            </a>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAyudaAbierta(true)}
                style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ❓ Ayuda
              </button>
            </div>
          </div>
        </div>
      </div>

      {ayudaAbierta && <ComoFunciona onClose={() => setAyudaAbierta(false)} />}
      {tourAbierto && <TourBienvenida onClose={cerrarTour} />}

      <div style={{ maxWidth: 580, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* ── Vista: Lista ────────────────────────────────────────────────── */}
        {vista === 'lista' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {!soySuper && (
                  <button
                    onClick={abrirMiCuenta}
                    style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    👤 Mi cuenta
                  </button>
                )}
                <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false), padding: '9px 18px' }}>
                  + Nueva quiniela
                </button>
              </div>
            </div>

            {/* Aviso de plan para clientes (el super admin no tiene cuota). */}
            {!soySuper && adminDoc && (
              <div style={{ ...card, padding: '0.9rem 1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">{temporadaVigente(adminDoc) ? '🏆' : '🎟️'}</span>
                  <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 }}>
                    {temporadaVigente(adminDoc)
                      ? 'Pase Mundial activo — puedes crear quinielas ilimitadas.'
                      : quinielasRestantes(adminDoc) > 0
                        ? `Tienes ${quinielasRestantes(adminDoc)} quiniela${quinielasRestantes(adminDoc) === 1 ? '' : 's'} disponible${quinielasRestantes(adminDoc) === 1 ? '' : 's'}.`
                        : 'Ya usaste tus quinielas incluidas. Elige un plan para crear más.'}
                  </p>
                </div>
                {renderUpsellPlan()}
              </div>
            )}

            {/* Secciones del inicio (solo super admin): mostrar/ocultar y reordenar bloques del home. */}
            {soySuper && (() => {
              const abierto = verTodo['home-config']
              const orden = ordenSeccionesHome(homeConfig)
              const flecha = (clave, dir, deshabilitada) => (
                <button
                  onClick={() => !deshabilitada && guardandoHome === null && moverSeccionHome(clave, dir)}
                  disabled={deshabilitada || guardandoHome !== null}
                  aria-label={dir < 0 ? 'Subir' : 'Bajar'}
                  style={{
                    width: 36, height: 36, lineHeight: 1, padding: 0, borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-strong)', background: 'var(--card-light)',
                    color: deshabilitada ? 'var(--border-strong)' : 'var(--text)',
                    cursor: deshabilitada || guardandoHome !== null ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 700,
                  }}
                >
                  {dir < 0 ? '↑' : '↓'}
                </button>
              )
              return (
                <div style={{ ...card, padding: '0.9rem 1.1rem' }}>
                  <button
                    onClick={() => setVerTodo(v => ({ ...v, 'home-config': !v['home-config'] }))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                      padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                      🏠 Secciones del inicio
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      border: `1.5px solid ${abierto ? 'var(--green)' : 'var(--border-strong)'}`,
                      color: abierto ? 'var(--green)' : 'var(--muted)',
                      fontSize: 18, fontWeight: 300, lineHeight: 1,
                      background: abierto ? 'var(--green-bg)' : 'transparent',
                    }}>{abierto ? '−' : '+'}</span>
                  </button>
                  {abierto && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.45 }}>
                        Marca qué bloques se ven en la página de inicio (quinielapp.fun) y usa las flechas para cambiar su orden. Los cambios aplican de inmediato.
                      </p>
                      {homeConfig === null ? (
                        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</p>
                      ) : orden.map((clave, idx) => {
                        const label = LABELS_SECCIONES_HOME[clave] ?? clave
                        const visible = homeConfig?.[clave] !== false
                        const cargando = guardandoHome === clave
                        return (
                          <div
                            key={clave}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0',
                              borderTop: '1px solid var(--border)',
                              opacity: cargando ? 0.6 : 1,
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {flecha(clave, -1, idx === 0)}
                              {flecha(clave, 1, idx === orden.length - 1)}
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: cargando ? 'wait' : 'pointer', minHeight: 44 }}>
                              <input
                                type="checkbox"
                                checked={visible}
                                disabled={cargando}
                                onChange={() => toggleSeccionHome(clave)}
                                style={{ width: 20, height: 20, accentColor: 'var(--green)', cursor: 'inherit', flexShrink: 0 }}
                              />
                              <span style={{ fontSize: 14, color: visible ? 'var(--text)' : 'var(--muted)', flex: 1 }}>{label}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: visible ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }}>
                                {visible ? 'Visible' : 'Oculta'}
                              </span>
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {loadingLista ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
            ) : soySuper ? (
              (() => {
                const secBtn = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }
                const secLabel = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }
                const secCard = { ...card, marginTop: 12, padding: '0.9rem 1.1rem' }
                // Botón circular +/− para secciones principales
                const toggle = (ab) => (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${ab ? 'var(--green)' : 'var(--border-strong)'}`,
                    color: ab ? 'var(--green)' : 'var(--muted)',
                    fontSize: 18, fontWeight: 300, lineHeight: 1,
                    background: ab ? 'var(--green-bg)' : 'transparent',
                  }}>{ab ? '−' : '+'}</span>
                )
                // Chevron rotado para subsecciones
                const subChevron = (ab) => (
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: ab ? 'var(--green)' : 'var(--muted)',
                    display: 'inline-block',
                    transform: ab ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}>›</span>
                )

                // Flat list of quinielas: top 3 visible, ver más
                const renderFlat = (flat, claveVer, conDueno = false) => {
                  if (flat.length === 0) return <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', paddingTop: 8 }}>Sin quinielas.</p>
                  const ab = verTodo[claveVer]
                  const visible = ab ? flat : flat.slice(0, 3)
                  const ocultas = flat.length - visible.length
                  return (
                    <>
                      {visible.map(q => (
                        <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} dueno={conDueno ? labelDueno(q) : undefined} />
                      ))}
                      {flat.length > 3 && (
                        <button
                          onClick={() => setVerTodo(v => ({ ...v, [claveVer]: !ab }))}
                          style={{ display: 'block', width: '100%', padding: '8px', marginBottom: 4, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {ab ? '▲ Mostrar menos' : `▼ Mostrar ${ocultas} más`}
                        </button>
                      )}
                    </>
                  )
                }

                // ── Caja ───────────────────────────────────────────────────────
                const cajaAb = verTodo['caja-inline']
                const cajaSection = (
                  <div style={secCard}>
                    <button onClick={() => setVerTodo(v => ({ ...v, 'caja-inline': !cajaAb }))} style={secBtn}>
                      <span style={secLabel}>💰 Caja</span>
                      {toggle(cajaAb)}
                    </button>
                    {cajaAb && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                          Registra y consulta depósitos, inscripciones, premios y retiros por participante. Es una herramienta interna de apoyo — próximamente disponible para todos los administradores.
                        </p>
                        {saldos.length > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                              Ordenar:
                              <select
                                value={cajaOrden}
                                onChange={e => setCajaOrden(e.target.value)}
                                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--card-light)', color: 'var(--text)' }}
                              >
                                <option value="nombre">Nombre (A-Z)</option>
                                <option value="monto">Monto (mayor a menor)</option>
                              </select>
                            </label>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <input
                            type="text"
                            placeholder="Nombre del participante…"
                            value={buscarNombreCaja}
                            onChange={e => setBuscarNombreCaja(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && buscarNombreCaja.trim()) {
                                setCajaNombre(normalizarNombre(buscarNombreCaja.trim()))
                                setVista('caja')
                                setBuscarNombreCaja('')
                              }
                            }}
                            style={{ flex: 1 }}
                          />
                          <button
                            onClick={() => {
                              if (buscarNombreCaja.trim()) {
                                setCajaNombre(normalizarNombre(buscarNombreCaja.trim()))
                                setVista('caja')
                                setBuscarNombreCaja('')
                              }
                            }}
                            disabled={!buscarNombreCaja.trim()}
                            style={{ ...greenCtaStyle(!buscarNombreCaja.trim()), padding: '9px 16px', whiteSpace: 'nowrap' }}
                          >
                            Ver →
                          </button>
                        </div>
                        {loadingMovimientos ? (
                          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</p>
                        ) : saldos.length === 0 ? (
                          <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Sin movimientos. Busca un participante arriba para registrar el primero.</p>
                        ) : saldos.map(({ nombre, saldo }) => (
                          <div
                            key={nombre}
                            onClick={() => { setCajaNombre(nombre); setVista('caja') }}
                            style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{nombre}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: saldo > 0 ? 'var(--green)' : saldo === 0 ? 'var(--muted)' : 'var(--red)' }}>
                                {saldo >= 0 ? '+' : ''}{formatearMXN(saldo)}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>→</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )

                // ── Clientes ───────────────────────────────────────────────────
                const clientesAb = verTodo['clientes-bloque']
                const crearAb = verTodo['clientes-crear']
                const listaAb = verTodo['clientes-lista']
                const todosAb = verTodo['clientes-todos']
                const clientesMostrados = todosAb ? clientes : clientes.slice(0, 5)
                const clientesSection = (
                  <div style={secCard}>
                    <button onClick={() => setVerTodo(v => ({ ...v, 'clientes-bloque': !clientesAb }))} style={secBtn}>
                      <span style={secLabel}>
                        👥 Clientes
                        {clientes.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>({clientes.length})</span>}
                      </span>
                      {toggle(clientesAb)}
                    </button>
                    {clientesAb && (
                      <div style={{ marginTop: 12 }}>
                        {/* Dar de alta */}
                        <div style={{ marginBottom: 8 }}>
                          <button onClick={() => setVerTodo(v => ({ ...v, 'clientes-crear': !crearAb }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 52, padding: '14px 14px', background: crearAb ? 'var(--green-bg)' : 'var(--neutral-bg)', border: `1px solid ${crearAb ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: crearAb ? 'var(--green)' : 'var(--text)' }}>➕ Dar de alta un cliente</span>
                            {subChevron(crearAb)}
                          </button>
                          {crearAb && (
                            <div style={{ marginTop: 8, paddingLeft: 14, paddingBottom: 4, borderLeft: '3px solid var(--green)' }}>
                              <label htmlFor="nc-email" style={{ ...lbl, marginBottom: 4 }}>Correo <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input id="nc-email" type="email" placeholder="correo@cliente.com" value={ncEmail}
                                onChange={e => { setNcEmail(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                              <label htmlFor="nc-nombre" style={{ ...lbl, marginBottom: 4 }}>Nombre <span style={{ color: 'var(--red)' }}>*</span></label>
                              <input id="nc-nombre" type="text" placeholder="Nombre de quien organiza" value={ncNombre}
                                onChange={e => { setNcNombre(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                <div>
                                  <label htmlFor="nc-tel" style={{ ...lbl, marginBottom: 4 }}>WhatsApp</label>
                                  <input id="nc-tel" type="tel" placeholder="55 1234 5678" value={ncTel}
                                    onChange={e => setNcTel(e.target.value)} />
                                </div>
                                <div>
                                  <label htmlFor="nc-empresa" style={{ ...lbl, marginBottom: 4 }}>Empresa</label>
                                  <input id="nc-empresa" type="text" placeholder="(opcional)" value={ncEmpresa}
                                    onChange={e => setNcEmpresa(e.target.value)} />
                                </div>
                              </div>
                              {errorCliente && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{errorCliente}</p>}
                              <button onClick={crearCliente} disabled={creandoCliente}
                                style={{ ...greenCtaStyle(creandoCliente), width: '100%', padding: '12px' }}>
                                {creandoCliente ? 'Creando…' : 'Crear cuenta'}
                              </button>
                              {clienteCreado && (
                                <div style={{ marginTop: 14, padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'var(--green-bg)', border: '1px solid var(--green)' }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>✅ Cuenta creada — comparte estos accesos:</p>
                                  <p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.7, wordBreak: 'break-all' }}>
                                    📧 {clienteCreado.email}<br />
                                    🔑 {clienteCreado.password}
                                  </p>
                                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 12px' }}>
                                    ⚠️ Guarda o envía la contraseña ahora: por seguridad no se vuelve a mostrar.
                                  </p>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                      onClick={() => { navigator.clipboard?.writeText(mensajeAccesos(clienteCreado.email, clienteCreado.password)); }}
                                      style={{ flex: '1 1 140px', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--neutral-bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      📋 Copiar mensaje
                                    </button>
                                    {telParaWa(clienteCreado.telefono) && (
                                      <a
                                        href={waLink(mensajeAccesos(clienteCreado.email, clienteCreado.password), telParaWa(clienteCreado.telefono))}
                                        target="_blank" rel="noreferrer"
                                        style={{ flex: '1 1 140px', textAlign: 'center', padding: '10px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', background: '#25D366', color: '#06140B', fontSize: 12.5, fontWeight: 800 }}
                                      >
                                        💬 Enviar por WhatsApp
                                      </a>
                                    )}
                                  </div>
                                  <button onClick={() => setClienteCreado(null)}
                                    style={{ width: '100%', marginTop: 10, padding: '6px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    Cerrar
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Clientes existentes */}
                        <div>
                          <button onClick={() => setVerTodo(v => ({ ...v, 'clientes-lista': !listaAb }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 52, padding: '14px 14px', background: listaAb ? 'var(--green-bg)' : 'var(--neutral-bg)', border: `1px solid ${listaAb ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: listaAb ? 'var(--green)' : 'var(--text)' }}>📋 Clientes existentes</span>
                            {subChevron(listaAb)}
                          </button>
                          {listaAb && (
                            <div style={{ marginTop: 8, paddingLeft: 14, paddingBottom: 4, borderLeft: '3px solid var(--green)' }}>
                              {loadingClientes ? (
                                <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</p>
                              ) : clientes.length === 0 ? (
                                <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Aún no hay clientes dados de alta.</p>
                              ) : (
                                <>
                                  {clientesMostrados.map(c => {
                                    const enPase = temporadaVigente(c)
                                    const usadas = c.quinielasCreadas ?? 0
                                    const permitidas = c.quinielasPermitidas ?? 0
                                    const paseFecha = enPase && c.temporadaHasta?.toMillis
                                      ? new Date(c.temporadaHasta.toMillis()).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                                      : null
                                    return (
                                      <div key={c.id} style={card}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                          <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                                              {c.nombre || '(sin nombre)'}{c.empresa ? <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · {c.empresa}</span> : null}
                                            </p>
                                            <p style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{c.email}{c.telefono ? ` · 📱 ${c.telefono}` : ''}</p>
                                          </div>
                                          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)', background: c.activo ? 'var(--green-bg)' : 'var(--neutral-bg)', color: c.activo ? 'var(--green)' : 'var(--muted)' }}>
                                            {c.activo ? 'Activo' : 'Inactivo'}
                                          </span>
                                        </div>
                                        <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 12 }}>
                                          {enPase ? `🏆 Pase Mundial — ilimitadas hasta ${paseFecha}` : `📊 ${usadas}/${permitidas} quinielas usadas`}
                                          {c.debeCambiarPassword ? <span style={{ color: 'var(--yellow)' }}> · 🔑 contraseña sin cambiar</span> : null}
                                          {c.notas ? <span style={{ color: 'var(--muted)' }}><br />📝 {c.notas}</span> : null}
                                        </p>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <button onClick={() => darQuinielaExtra(c)} style={accionBtn}>➕ +1 quiniela ($49)</button>
                                          <button onClick={() => darPaseMundial(c)} style={accionBtn}>🏆 Pase Mundial ($199)</button>
                                          <button onClick={() => toggleActivoCliente(c)} style={accionBtn}>{c.activo ? '⏸ Desactivar' : '▶️ Activar'}</button>
                                          <button onClick={() => editarNotasCliente(c)} style={accionBtn}>📝 Notas</button>
                                          <button
                                            onClick={() => eliminarCliente(c)}
                                            disabled={eliminandoCliente === c.id}
                                            style={{ ...accionBtn, color: 'var(--red)', borderColor: 'var(--red)' }}
                                          >
                                            {eliminandoCliente === c.id ? 'Eliminando…' : '🗑 Eliminar'}
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  {clientes.length > 5 && !todosAb && (
                                    <button
                                      onClick={() => setVerTodo(v => ({ ...v, 'clientes-todos': true }))}
                                      style={{ display: 'block', width: '100%', padding: '8px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      ▼ Ver todos ({clientes.length - 5} más)
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )

                // ── Mis quinielas ──────────────────────────────────────────────
                const misFlat = [...mias.activas, ...mias.enJuego, ...mias.finalizadas]
                const misAb = verTodo['mis-quinielas']
                const misQuinielasSection = (
                  <div style={secCard}>
                    <button onClick={() => setVerTodo(v => ({ ...v, 'mis-quinielas': !misAb }))} style={secBtn}>
                      <span style={secLabel}>
                        ⚽ Mis quinielas
                        {misFlat.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>({misFlat.length})</span>}
                      </span>
                      {toggle(misAb)}
                    </button>
                    {misAb && (
                      <div style={{ marginTop: 8 }}>
                        {misFlat.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Aún no has creado quinielas.</p>
                            <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false), padding: '9px 18px' }}>
                              + Nueva quiniela
                            </button>
                          </div>
                        ) : renderFlat(misFlat, 'mis-q-flat')}
                      </div>
                    )}
                  </div>
                )

                // ── Quinielas de otros admins ──────────────────────────────────
                const quinielasPorAdmin = {}
                quinielasOtras.forEach(q => {
                  const uid = q.ownerUid || 'sin-owner'
                  if (!quinielasPorAdmin[uid]) quinielasPorAdmin[uid] = []
                  quinielasPorAdmin[uid].push(q)
                })
                const adminsConQ = Object.entries(quinielasPorAdmin).map(([uid, qs]) => {
                  const a = adminsPorUid[uid]
                  const sub = subdividirPorEstado(qs)
                  return {
                    uid,
                    nombre: a?.nombre || a?.email || `Admin (${uid.slice(0, 6)}…)`,
                    activas: sub.activas.length,
                    enJuego: sub.enJuego.length,
                    total: qs.length,
                    flat: [...sub.activas, ...sub.enJuego, ...sub.finalizadas],
                  }
                })
                const otrosAb = verTodo['otros-bloque']
                const otrosSection = quinielasOtras.length > 0 ? (
                  <div style={secCard}>
                    <button onClick={() => setVerTodo(v => ({ ...v, 'otros-bloque': !otrosAb }))} style={secBtn}>
                      <span style={secLabel}>
                        👤 Quinielas de otros admins
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>({quinielasOtras.length})</span>
                      </span>
                      {toggle(otrosAb)}
                    </button>
                    {otrosAb && (
                      <div style={{ marginTop: 12 }}>
                        {adminsConQ.map(adm => {
                          const admAb = adminExpandido === adm.uid
                          return (
                            <div key={adm.uid} style={{ marginBottom: 8 }}>
                              <button
                                onClick={() => setAdminExpandido(admAb ? null : adm.uid)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 56, padding: '14px 14px', background: admAb ? 'var(--green-bg)' : 'var(--neutral-bg)', border: `1px solid ${admAb ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                              >
                                <div style={{ textAlign: 'left' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: admAb ? 'var(--green)' : 'var(--text)' }}>{adm.nombre}</span>
                                  <span style={{ display: 'block', fontSize: 11, color: admAb ? 'var(--green)' : 'var(--muted)', marginTop: 3, opacity: admAb ? 0.85 : 1 }}>
                                    {adm.total} quiniela{adm.total !== 1 ? 's' : ''}
                                    {adm.activas > 0 ? ` · ${adm.activas} activa${adm.activas !== 1 ? 's' : ''}` : ''}
                                    {adm.enJuego > 0 ? ` · ${adm.enJuego} en juego` : ''}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: 16, fontWeight: 700, flexShrink: 0, marginLeft: 8,
                                  color: admAb ? 'var(--green)' : 'var(--muted)',
                                  display: 'inline-block',
                                  transform: admAb ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}>›</span>
                              </button>
                              {admAb && (
                                <div style={{ marginTop: 8, paddingLeft: 14, paddingBottom: 4, borderLeft: '3px solid var(--green)' }}>
                                  {renderFlat(adm.flat, `admin-${adm.uid}`, true)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : null

                return (
                  <>
                    {cajaSection}
                    {clientesSection}
                    {misQuinielasSection}
                    {otrosSection}
                  </>
                )
              })()
            ) : (
              // ── Vista de cliente normal ───────────────────────────────────────
              quinielasMias.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                  <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Sin quinielas todavía</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Crea tu primera quiniela para comenzar.</p>
                  <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false) }}>
                    Crear ahora →
                  </button>
                </div>
              ) : (() => {
                const tituloGrupo = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }
                const renderGrupo = (items, titulo, clave, limite, marginTop) => {
                  if (items.length === 0) return null
                  const abierto = verTodo[clave]
                  const visibles = abierto ? items : items.slice(0, limite)
                  const ocultas = items.length - visibles.length
                  return (
                    <>
                      <p style={{ ...tituloGrupo, marginTop }}>{titulo}</p>
                      {visibles.map(q => (
                        <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} />
                      ))}
                      {items.length > limite && (
                        <button
                          onClick={() => setVerTodo(v => ({ ...v, [clave]: !abierto }))}
                          style={{ display: 'block', width: '100%', padding: '8px', marginBottom: 4, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {abierto ? '▲ Mostrar menos' : `▼ Mostrar ${ocultas} más`}
                        </button>
                      )}
                    </>
                  )
                }
                return (
                  <>
                    {renderGrupo(mias.activas, 'Activas', 'mias-activas', 2, 0)}
                    {renderGrupo(mias.enJuego, 'Jugándose', 'mias-enjuego', 2, mias.activas.length > 0 ? 16 : 0)}
                    {renderGrupo(mias.finalizadas, 'Finalizadas', 'mias-finalizadas', 0, (mias.activas.length > 0 || mias.enJuego.length > 0) ? 16 : 0)}
                  </>
                )
              })()
            )}
          </>
        )}


        {/* ── Vista: Caja — detalle de participante ────────────────────── */}
        {vista === 'caja' && cajaNombre !== null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Caja</span>
            </div>
            <>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{cajaNombre}</p>
                  <p style={{
                    fontSize: 13, fontWeight: 700, marginTop: 2,
                    color: saldoParticipante > 0 ? 'var(--green)' : saldoParticipante === 0 ? 'var(--muted)' : 'var(--red)',
                  }}>
                    Saldo: {saldoParticipante >= 0 ? '+' : ''}{formatearMXN(saldoParticipante)}
                  </p>
                </div>

                <div style={card}>
                  <label style={lbl}>Registrar movimiento</label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    {[
                      { val: 'premio',      label: 'Premio',      signo: '+' },
                      { val: 'deposito',    label: 'Depósito',    signo: '+' },
                      { val: 'inscripcion', label: 'Inscripción', signo: '-' },
                      { val: 'retiro',      label: 'Retiro',      signo: '-' },
                    ].map(op => {
                      const activo = nuevoTipo === op.val
                      const esPos = op.signo === '+'
                      return (
                        <button
                          key={op.val}
                          onClick={() => setNuevoTipo(op.val)}
                          style={{
                            padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            background: activo ? (esPos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-soft)',
                            border: `1.5px solid ${activo ? (esPos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                            color: activo ? (esPos ? 'var(--green)' : 'var(--red)') : 'var(--muted)',
                            fontSize: 13, fontWeight: 700,
                          }}
                        >
                          {op.signo} {op.label}
                        </button>
                      )
                    })}
                  </div>

                  <label style={{ ...lbl, marginBottom: 6 }}>Monto (MXN)</label>
                  <input
                    type="number" min="1" step="1" placeholder="Ej. 100"
                    value={nuevoMonto}
                    onChange={e => setNuevoMonto(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />

                  <label style={{ ...lbl, marginBottom: 6 }}>Nota (opcional)</label>
                  <input
                    type="text" placeholder="Ej. Quiniela Semis"
                    value={nuevaNota}
                    onChange={e => setNuevaNota(e.target.value)}
                    style={{ marginBottom: 14 }}
                  />

                  <button
                    onClick={guardarMovimiento}
                    disabled={guardandoMov || !nuevoMonto || Number(nuevoMonto) <= 0}
                    style={greenCtaStyle(guardandoMov || !nuevoMonto || Number(nuevoMonto) <= 0)}
                  >
                    {guardandoMov ? 'Guardando…' : 'Guardar movimiento →'}
                  </button>
                </div>

                {movimientosParticipante.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '1.5rem' }}>
                    Sin movimientos registrados todavía.
                  </p>
                ) : (
                  <div style={card}>
                    <label style={lbl}>Historial</label>
                    {movimientosParticipante.map((m, i) => {
                      const esPos = m.tipo === 'premio' || m.tipo === 'deposito'
                      const tipoLabel = { premio: 'Premio', deposito: 'Depósito', inscripcion: 'Inscripción', retiro: 'Retiro' }[m.tipo] ?? m.tipo
                      return (
                        <div key={m.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          paddingTop: i === 0 ? 0 : 10, paddingBottom: 10,
                          borderBottom: i < movimientosParticipante.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                              {tipoLabel}{m.nota ? ` · ${m.nota}` : ''}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              {new Date(m.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: esPos ? 'var(--green)' : 'var(--red)' }}>
                              {esPos ? '+' : '-'}{formatearMXN(m.monto)}
                            </span>
                            <button
                              onClick={() => eliminarMovimiento(m)}
                              style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                fontSize: 16, color: 'var(--muted)', padding: '2px 4px', borderRadius: 4, lineHeight: 1,
                              }}
                              title="Eliminar"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            </>
        )}

        {/* ── Vista: Mi cuenta ─────────────────────────────────────────────── */}
        {vista === 'cuenta' && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Mi cuenta</p>

            {/* Tus datos */}
            <div style={card}>
              <p style={{ ...lbl, marginBottom: 12 }}>Tus datos</p>

              <label htmlFor="cuenta-nombre" style={{ ...lbl, marginBottom: 4 }}>Nombre</label>
              <input id="cuenta-nombre" type="text" value={cuentaNombre} onChange={e => { setCuentaNombre(e.target.value); setCuentaMsg(null) }} style={{ marginBottom: 14 }} />

              <label htmlFor="cuenta-empresa" style={{ ...lbl, marginBottom: 4 }}>Empresa u organización <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input id="cuenta-empresa" type="text" placeholder="Ej. Construcciones ACME" value={cuentaEmpresa} onChange={e => { setCuentaEmpresa(e.target.value); setCuentaMsg(null) }} style={{ marginBottom: 14 }} />

              <label htmlFor="cuenta-tel" style={{ ...lbl, marginBottom: 4 }}>Teléfono <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input id="cuenta-tel" type="tel" placeholder="Ej. 55 1234 5678" value={cuentaTel} onChange={e => { setCuentaTel(e.target.value); setCuentaMsg(null) }} style={{ marginBottom: 14 }} />

              <label style={{ ...lbl, marginBottom: 4 }}>Correo</label>
              <input type="email" value={adminDoc?.email ?? ''} disabled style={{ marginBottom: 6, opacity: 0.6, cursor: 'not-allowed' }} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.4 }}>Es tu usuario de acceso. Para cambiarlo, escríbenos por WhatsApp.</p>

              {cuentaMsg && <p style={{ fontSize: 12, color: cuentaMsg.tipo === 'ok' ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>{cuentaMsg.texto}</p>}
              <button onClick={guardarMiCuenta} disabled={guardandoCuenta} style={greenCtaStyle(guardandoCuenta)}>
                {guardandoCuenta ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>

            {/* Tu plan */}
            <div style={card}>
              <p style={{ ...lbl, marginBottom: 10 }}>Tu plan</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">{temporadaVigente(adminDoc) ? '🏆' : '🎟️'}</span>
                <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 }}>
                  {temporadaVigente(adminDoc)
                    ? 'Pase Mundial activo — puedes crear quinielas ilimitadas.'
                    : quinielasRestantes(adminDoc) > 0
                      ? `Tienes ${quinielasRestantes(adminDoc)} quiniela${quinielasRestantes(adminDoc) === 1 ? '' : 's'} disponible${quinielasRestantes(adminDoc) === 1 ? '' : 's'}.`
                      : 'Ya usaste tus quinielas incluidas. Elige un plan para crear más.'}
                </p>
              </div>
              {renderUpsellPlan()}
            </div>

            {/* Seguridad — colapsada por default */}
            <div style={card}>
              <button
                onClick={() => setSeguridadAbierta(v => !v)}
                aria-expanded={seguridadAbierta}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <span style={{ ...lbl, marginBottom: 0 }}>Seguridad — cambiar contraseña</span>
                <span style={{ fontSize: 13, color: 'var(--muted)', transform: seguridadAbierta ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">⌄</span>
              </button>
              {seguridadAbierta && (
                <div style={{ marginTop: 14 }}>
                  <label htmlFor="cuenta-p1" style={lbl}>Nueva contraseña</label>
                  <input id="cuenta-p1" type="password" placeholder="Mínimo 8 caracteres" value={cuentaP1} onChange={e => { setCuentaP1(e.target.value); setCuentaPassMsg(null) }} style={{ marginBottom: 8 }} />
                  <MedidorPassword pwd={cuentaP1} />
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.4 }}>Mínimo 8 caracteres, con al menos una letra y un número.</p>
                  <label htmlFor="cuenta-p2" style={lbl}>Confirmar contraseña</label>
                  <input id="cuenta-p2" type="password" placeholder="Repite tu contraseña" value={cuentaP2} onChange={e => { setCuentaP2(e.target.value); setCuentaPassMsg(null) }} onKeyDown={e => e.key === 'Enter' && cambiarMiPassword()} style={{ marginBottom: 10 }} />
                  {cuentaPassMsg && <p style={{ fontSize: 12, color: cuentaPassMsg.tipo === 'ok' ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>{cuentaPassMsg.texto}</p>}
                  <button onClick={cambiarMiPassword} disabled={cambiandoPass} style={greenCtaStyle(cambiandoPass)}>
                    {cambiandoPass ? 'Guardando…' : 'Cambiar contraseña'}
                  </button>
                </div>
              )}
            </div>

            {/* Ayuda */}
            <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text)' }}>¿Necesitas ayuda?</span>
              <a href={waLink(MENSAJES_WA.soporte)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textDecoration: 'none' }}>Escríbenos por WhatsApp →</a>
            </div>
          </>
        )}

        {/* ── Vista: Nueva quiniela ────────────────────────────────────────── */}
        {/* Cliente sin cuota disponible: en vez del formulario, ve el paywall. */}
        {vista === 'nueva' && !puedeCrear && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Nueva quiniela</p>
            <Paywall />
          </>
        )}

        {vista === 'nueva' && puedeCrear && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Nueva quiniela</p>

            {!tipNuevaCerrado && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 14 }}>
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>👋</span>
                <p style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, margin: 0 }}>
                  <strong style={{ color: 'var(--text-strong)' }}>Tip:</strong> ponle un <strong style={{ color: 'var(--text-strong)' }}>nombre</strong> y agrega tus <strong style={{ color: 'var(--text-strong)' }}>partidos con el buscador</strong>. La <strong style={{ color: 'var(--text-strong)' }}>hora de cierre</strong> se ajusta sola al primer partido. Comparte el <strong style={{ color: 'var(--text-strong)' }}>enlace + código</strong>, y al terminar usa <strong style={{ color: 'var(--text-strong)' }}>⚡ Sincronizar resultados</strong>.
                </p>
                <button onClick={cerrarTipNueva} aria-label="Cerrar tip" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1.3 }}>✕</button>
              </div>
            )}

            {/* 1. ¿Qué es? — identidad de la quiniela */}
            <div style={card}>
              <label htmlFor="quiniela-nombre" style={lbl}>Nombre de la quiniela</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 14 }}>
                <input id="quiniela-nombre" type="text" placeholder="Ej. Jornada 17 — Liga MX" value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
                <EmojiPicker inputId="quiniela-nombre" value={nombre} onChange={setNombre} />
              </div>

              <label htmlFor="quiniela-empresa" style={{ ...lbl, marginBottom: 4 }}>Empresa u organización <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Si la quiniela es para una empresa o equipo, ponlo aquí.
              </p>
              <input id="quiniela-empresa" type="text" placeholder="Ej. Construcciones ACME" value={empresa} onChange={e => setEmpresa(e.target.value)} />
            </div>

            {/* 2. Partidos: buscador + lista (el corazón de la quiniela) */}
            {renderBuscadorFixtures(agregarSeleccionados)}

            <div style={card}>
              <label style={lbl}>Partidos</label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Tráelos con el buscador de arriba; agrégalos <strong style={{ color: 'var(--text)' }}>manualmente</strong> solo si no aparecen.
                Una vez que alguien predijo, <strong style={{ color: 'var(--text)' }}>ya no se pueden cambiar</strong>.
              </p>
              {partidos.map((p, i) => {
                const incompleto = partidoIncompleto(p)
                // Modo edición si el usuario lo abrió, o si está incompleto (no se puede colapsar vacío).
                const enEdicion = editandoPartido === i || incompleto

                if (!enEdicion) {
                  // ── Tarjeta colapsada (solo lectura) ──
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 10, background: 'var(--card-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        {escudoMini(p.escudoLocal, p.local)}
                        <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                        {escudoMini(p.escudoVisitante, p.visitante)}
                        <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                      </div>
                      {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{formatFixtureDate(p.hora)}</span>}
                      <button onClick={() => setEditandoPartido(i)} aria-label="Editar partido" title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}>✏️</button>
                      {partidos.length > 1 && (
                        <button onClick={() => quitarPartido(i)} aria-label="Quitar partido" title="Quitar" style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '2px 4px', flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  )
                }

                // ── Modo edición ──
                return (
                  <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Partido {i + 1}
                      </span>
                      {partidos.length > 1 && (
                        <button onClick={() => quitarPartido(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>
                          Quitar ✕
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input type="text" placeholder="Equipo local"     value={p.local}     onChange={e => actualizarPartido(i, 'local', e.target.value)} />
                      <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>VS</span>
                      <input type="text" placeholder="Equipo visitante" value={p.visitante} onChange={e => actualizarPartido(i, 'visitante', e.target.value)} />
                    </div>
                    <DateTimeWrap vacio={!p.hora} texto="📅 Fecha y hora del partido">
                      <input type="datetime-local" value={p.hora} onChange={e => actualizarPartido(i, 'hora', e.target.value)} />
                    </DateTimeWrap>
                    {!incompleto && (
                      <div style={{ textAlign: 'right', marginTop: 8 }}>
                        <button onClick={() => setEditandoPartido(null)} style={{ background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>
                          Listo ✓
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button
                  onClick={agregarPartido}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: '4px' }}
                >
                  ¿No encuentras tu partido? Agrégalo a mano
                </button>
                <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                  Los partidos manuales no se sincronizan: tendrás que capturar el resultado tú mismo.
                </p>
              </div>
            </div>

            {/* 3. Cierre — depende de los partidos, por eso va después de ellos */}
            <div style={card}>
              <label htmlFor="quiniela-cierre" style={{ ...lbl, marginBottom: 4 }}>
                Fecha y hora de cierre <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Después de esta hora los jugadores ya no pueden registrar ni cambiar sus predicciones.
              </p>
              <DateTimeWrap vacio={!cierre}>
                <input id="quiniela-cierre" type="datetime-local" value={cierre} onChange={e => setCierre(e.target.value)} style={{ borderColor: !cierre ? 'var(--red)' : undefined }} />
              </DateTimeWrap>
              {primeraHoraPartido(partidos) && (
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                  📅 Tu primer partido empieza el <strong style={{ color: 'var(--text)' }}>{formatFixtureDate(primeraHoraPartido(partidos))}</strong>. El cierre debe ser antes.{' '}
                  <button type="button" onClick={() => setCierre(cierreSugerido(partidos))} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Cerrar 5 min antes
                  </button>
                </p>
              )}
            </div>

            {/* 4. Acceso — quién puede entrar */}
            <div style={card}>
              <p style={{ ...lbl, marginBottom: 10 }}>Acceso</p>

              <label htmlFor="quiniela-codigo" style={{ ...lbl, marginBottom: 4 }}>Código de acceso{!soySuper && <span style={{ color: 'var(--red)' }}> *</span>}</label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Generado automático. Puedes cambiarlo, pero evita un código muy fácil. Solo quien lo tenga puede participar.
              </p>
              <input id="quiniela-codigo" type="text" placeholder="Ej. ACME2026" value={codigoAcceso} onChange={e => setCodigoAcceso(e.target.value)} style={{ marginBottom: 14 }} />

              {soySuper ? (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={privada} onChange={e => setPrivada(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--green)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    <strong style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Quiniela privada</strong><br />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>No aparece en la página principal, solo se accede con el enlace directo.</span>
                  </span>
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  <span aria-hidden="true">🔒</span>
                  <span><strong style={{ color: 'var(--text)' }}>Privada</strong>: no aparece en listas públicas. Solo participa quien tenga el código.</span>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={requiereApellido} onChange={e => setRequiereApellido(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--green)' }} />
                <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Requerir nombre y apellido</strong><br />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pide nombre + apellido. Útil en grupos grandes.</span>
                </span>
              </label>
            </div>

            {/* 5. Premio */}
            {renderFormularioPremio(premioFijo, setPremioFijo, cuota, setCuota)}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setVista('lista'); setFixtures([]); setSeleccionados([]) }} style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarNuevaQuiniela} disabled={guardando} style={greenCtaStyle(guardando)}>
                {guardando ? 'Guardando…' : 'Guardar y continuar →'}
              </button>
            </div>
          </>
        )}

        {/* ── Vista: Gestionar quiniela ────────────────────────────────────── */}
        {vista === 'gestionar' && quinielaActual && (() => {
          const estaCerrada = esCerradaQ(quinielaActual)
          return (
            <>
              {/* Encabezado */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {quinielaActual.nombre}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {quinielaActual.partidos?.length ?? 0} partidos · Creada {formatFecha(quinielaActual.creada)}
                  </p>
                </div>
                <button
                  onClick={toggleCerrar}
                  disabled={toggling}
                  aria-label={toggling ? undefined : (estaCerrada ? 'Reabrir quiniela' : 'Cerrar quiniela')}
                  style={{
                    padding: '8px 14px', fontSize: 12, flexShrink: 0,
                    borderRadius: 'var(--radius-sm)', border: 'none', fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer',
                    background: toggling ? 'var(--card-light)' : (estaCerrada ? 'var(--green)' : 'var(--yellow)'),
                    color: toggling ? 'var(--muted)' : (estaCerrada ? '#07120A' : '#3F2700'),
                  }}
                >
                  {toggling ? '…' : estaCerrada ? '🔓 Reabrir' : '🔒 Cerrar'}
                </button>
              </div>

              {!estaCerrada && !quinielaActual.cierre && (
                <div style={{ background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--yellow-soft)' }}>
                  ⚠️ Quiniela reabierta sin fecha de cierre. Ve a Editar para configurar una si la necesitas.
                </div>
              )}

              {!estaCerrada && soySuper && (() => {
                const esDestacada = !!quinielaActual.destacada
                return (
                  <button
                    onClick={toggleDestacada}
                    disabled={destacando}
                    style={{
                      width: '100%', padding: '10px 12px', marginBottom: 12,
                      borderRadius: 'var(--radius-sm)', cursor: destacando ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700, textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      background: esDestacada ? 'var(--yellow-bg)' : 'var(--bg-soft)',
                      border: `1px solid ${esDestacada ? 'var(--yellow)' : 'var(--border)'}`,
                      color: esDestacada ? 'var(--yellow)' : 'var(--text)',
                    }}
                  >
                    <span>{esDestacada ? '⭐ Principal en inicio' : '☆ Marcar como principal'}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                      {destacando ? '…' : esDestacada ? 'Quitar' : 'Activar'}
                    </span>
                  </button>
                )
              })()}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', padding: 4, marginBottom: 16, border: '1px solid var(--border)' }}>
                {[
                  { key: 'resultados',   label: '⚽ Resultados' },
                  { key: 'participantes', label: `👥 ${conteos[quinielaActual.id] ?? 0}` },
                  { key: 'editar',       label: '✏️ Editar' },
                  { key: 'compartir',    label: '🔗 Compartir' },
                ].map(t => (
                  <button
                    key={t.key} onClick={() => setTab(t.key)}
                    style={{
                      flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: 700,
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                      background: tab === t.key ? 'var(--card-light)' : 'transparent',
                      color: tab === t.key ? 'var(--text-strong)' : 'var(--muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Resultados */}
              {tab === 'resultados' && (
                <>
                  {/* Sugerencias de IDs cambiados en ESPN — pedimos confirmación */}
                  {sugerenciasIdMismatch.length > 0 && (
                    <div style={{
                      background: 'var(--yellow-bg)', border: '1.5px solid var(--yellow)',
                      borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 12,
                    }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--yellow-soft)', marginBottom: 4 }}>
                        ⚠️ {sugerenciasIdMismatch.length} partido{sugerenciasIdMismatch.length !== 1 ? 's' : ''} con ID cambiado
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                        Encontramos un partido que parece ser el mismo pero con ID distinto. Verifica que sea correcto antes de aplicar.
                      </p>
                      {sugerenciasIdMismatch.map(s => {
                        const ev = s.eventoSugerido
                        const state = ev.status?.type?.state
                        const completed = ev.status?.type?.completed
                        const esCancelado = state === 'post' && completed === false
                        const comps = ev.competitions?.[0]?.competitors ?? []
                        const home = comps.find(c => c.homeAway === 'home')
                        const away = comps.find(c => c.homeAway === 'away')
                        const scoreTxt = esCancelado
                          ? 'Cancelado'
                          : state === 'post'
                            ? `${home?.score ?? '?'} – ${away?.score ?? '?'} (Final)`
                            : state === 'in'
                              ? `${home?.score ?? '?'} – ${away?.score ?? '?'} (En vivo)`
                              : 'Aún no inicia'
                        const aplicando = aplicandoSugerencia === s.idx
                        return (
                          <div key={s.idx} style={{
                            background: 'var(--card)', borderRadius: 'var(--radius-sm)',
                            padding: '10px 12px', marginBottom: 8, border: '1px solid var(--border)',
                          }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
                              {s.partidoOriginal.local} vs {s.partidoOriginal.visitante}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2, lineHeight: 1.5 }}>
                              ID original: <code style={{ fontFamily: 'monospace' }}>{s.partidoOriginal.espnId}</code> (ya no existe)
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                              ID encontrado: <code style={{ fontFamily: 'monospace', color: 'var(--green-light)' }}>{ev.id}</code> · {scoreTxt}
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => aplicarSugerencia(s)}
                                disabled={aplicando}
                                style={{
                                  flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                  border: 'none',
                                  background: aplicando ? 'var(--card-light)' : 'linear-gradient(135deg, var(--green), var(--green-light))',
                                  color: aplicando ? 'var(--muted)' : '#07120A',
                                  fontWeight: 800, fontSize: 12, cursor: aplicando ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {aplicando ? 'Aplicando…' : '✓ Confirmar y aplicar'}
                              </button>
                              <button
                                onClick={() => ignorarSugerencia(s.idx)}
                                disabled={aplicando}
                                style={{
                                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border-strong)',
                                  background: 'transparent', color: 'var(--muted)',
                                  fontWeight: 700, fontSize: 12, cursor: aplicando ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Ignorar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: sincrMsg.startsWith('✓') ? 'var(--green)' : sincrMsg.startsWith('⚠') ? 'var(--yellow)' : 'var(--muted)' }}>
                      {sincrMsg || (guardadoRes ? '✓ Ranking actualizado' : '')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                      <button
                        onClick={sincronizarDesdeESPN} disabled={sincronizando}
                        aria-label="Sincronizar resultados"
                        style={{ ...greenCtaStyle(sincronizando), display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {sincronizando ? 'Sincronizando…' : '⚡ Sincronizar resultados'}
                      </button>
                      <button
                        onClick={iniciarGuardarResultados} disabled={guardandoRes}
                        style={{
                          padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
                          background: 'var(--card-light)', color: 'var(--text)',
                          fontSize: 13, fontWeight: 600, cursor: guardandoRes ? 'not-allowed' : 'pointer',
                          opacity: guardandoRes ? 0.5 : 1,
                        }}
                      >
                        {guardandoRes ? 'Guardando…' : 'Guardar manual'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAyudaSyncAbierta(true)}
                        aria-label="Ver instrucciones de sincronizar resultados"
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border-strong)',
                          background: 'var(--card-light)', color: 'var(--muted)', fontSize: 13, fontWeight: 700,
                          cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                        }}
                      >
                        ⓘ
                      </button>
                    </div>
                  </div>

                  {ayudaSyncAbierta && (
                    <div
                      onClick={() => setAyudaSyncAbierta(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 1rem', overflowY: 'auto' }}
                    >
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', maxWidth: 480, width: '100%', padding: '1.25rem' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>Sincronizar resultados</h3>
                          <button
                            onClick={() => setAyudaSyncAbierta(false)}
                            aria-label="Cerrar"
                            style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', width: 28, height: 28, borderRadius: 'var(--radius-sm)', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                          <p style={{ marginBottom: 8 }}>📌 <strong style={{ color: 'var(--text)' }}>Al terminar los partidos</strong>, espera unos minutos (a que se marquen como finalizados) y da <strong style={{ color: 'var(--green)' }}>⚡ Sincronizar resultados</strong> para dejarlos guardados.</p>
                          <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--green)' }}>⚡ Sincronizar resultados</strong> — trae los marcadores reales para partidos que agregaste con el buscador. <strong style={{ color: 'var(--green)', background: 'var(--green-bg)', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontSize: 11 }}>Recomendado</strong></p>
                          <p><strong style={{ color: 'var(--text)' }}>Guardar manual</strong> — guarda los marcadores que escribas tú. Úsalo solo para partidos que agregaste manualmente.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={card}>
                    <label style={{ ...lbl, marginBottom: 14 }}>Registrar marcadores</label>
                    {(quinielaActual.partidos ?? []).map((p, i) => {
                      const r = resultados[i] ?? { local: '', visitante: '' }
                      const cancelado  = !!r.cancelado
                      const resultado  = cancelado ? null : goalsToResultado(r.local, r.visitante)
                      const resColor   = cancelado ? { bg: 'var(--neutral-bg)', color: 'var(--muted)' }
                        : resultado === 'home' ? { bg: 'var(--green-bg)',  color: 'var(--green)' }
                        : resultado === 'draw' ? { bg: 'var(--neutral-bg)', color: 'var(--muted)' }
                        : resultado === 'away' ? { bg: 'var(--yellow-bg)', color: 'var(--yellow)' }
                        : { bg: 'var(--neutral-bg)', color: 'var(--muted)' }
                      const resLabel = cancelado ? 'Cancelado'
                        : resultado === 'home' ? 'Local'
                        : resultado === 'draw' ? 'Empate'
                        : resultado === 'away' ? 'Visitante'
                        : 'Pendiente'

                      const toggleCancelado = () => setResultados(prev => {
                        const cur = prev[i] ?? {}
                        return { ...prev, [i]: cur.cancelado ? { local: '', visitante: '' } : { cancelado: true } }
                      })

                      return (
                        <div key={i} style={{ padding: '12px 0', borderBottom: i < (quinielaActual.partidos?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.local || `Local ${i + 1}`}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number" min="0" max="99" placeholder="0"
                                value={cancelado ? '' : (r.local ?? '')}
                                disabled={cancelado}
                                onChange={e => setResultados(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), cancelado: false, local: e.target.value } }))}
                                style={{ width: 44, textAlign: 'center', padding: '6px 4px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, opacity: cancelado ? 0.4 : 1 }}
                              />
                              <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>–</span>
                              <input
                                type="number" min="0" max="99" placeholder="0"
                                value={cancelado ? '' : (r.visitante ?? '')}
                                disabled={cancelado}
                                onChange={e => setResultados(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), cancelado: false, visitante: e.target.value } }))}
                                style={{ width: 44, textAlign: 'center', padding: '6px 4px', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, opacity: cancelado ? 0.4 : 1 }}
                              />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.visitante || `Visitante ${i + 1}`}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: resColor.bg, color: resColor.color, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                              {resLabel}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={toggleCancelado}
                              aria-pressed={cancelado}
                              style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)',
                                border: `1px solid ${cancelado ? 'var(--red)' : 'var(--border-strong)'}`,
                                background: cancelado ? 'var(--red-bg)' : 'transparent',
                                color: cancelado ? '#FCA5A5' : 'var(--muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {cancelado ? '✓ Cancelado' : 'Marcar cancelado'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {tienePremio(quinielaActual) && esFinalizadaQ(quinielaActual) && (
                    <div style={{
                      marginTop: 16, padding: '14px 16px',
                      background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
                        {quinielaActual.boteDevuelto ? '💸 Bote marcado como devuelto' : 'Bote del premio'}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                        {quinielaActual.boteDevuelto
                          ? 'El ranking muestra el premio como devuelto. Puedes reactivar el premio si fue un error.'
                          : 'Si nadie ganó o decides no repartir, marca el bote como devuelto. Los premios dejarán de mostrarse.'}
                      </p>
                      <button
                        onClick={toggleBoteDevuelto}
                        disabled={toggleBote}
                        style={{
                          padding: '9px 16px', borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${quinielaActual.boteDevuelto ? 'var(--green)' : 'var(--yellow)'}`,
                          background: 'transparent',
                          color: quinielaActual.boteDevuelto ? 'var(--green)' : 'var(--yellow)',
                          fontSize: 13, fontWeight: 700, cursor: toggleBote ? 'not-allowed' : 'pointer',
                          opacity: toggleBote ? 0.5 : 1,
                        }}
                      >
                        {toggleBote ? '…' : quinielaActual.boteDevuelto ? '↩ Reactivar premio' : '💸 Devolver bote'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Tab: Participantes */}
              {tab === 'participantes' && (
                <div style={card}>
                  <label style={{ ...lbl, marginBottom: 14 }}>Predicciones registradas</label>

                  {loadingPredicciones ? (
                    <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1.5rem 0' }}>Cargando…</p>
                  ) : listaPredicciones.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <p style={{ fontSize: 36, marginBottom: 12 }}>📭</p>
                      <p style={{ fontSize: 14, color: 'var(--muted)' }}>Nadie ha registrado predicciones todavía.</p>
                    </div>
                  ) : (() => {
                    const esTipoBote = (Number(quinielaActual.cuota) > 0) || quinielaActual.tipoPremio === TIPO_PREMIO.BOTE
                    const pagados = quinielaActual.pagados ?? []
                    const pendientes = esTipoBote ? listaPredicciones.filter(p => !pagados.includes(p.id)).length : 0
                    // Detectar nombres potencialmente duplicados (heurística estricta)
                    const mapaSimilares = mapaSimilaresPorNombre
                    const nSospechosos = [...mapaSimilares.values()].filter(arr => arr.length > 0).length
                    return (
                    <>
                      {esTipoBote && (
                        <div style={{
                          background: pendientes > 0 ? 'var(--yellow-bg)' : 'var(--green-bg)',
                          border: `1px solid ${pendientes > 0 ? 'var(--yellow)' : 'var(--green)'}`,
                          borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12,
                          fontSize: 12, color: pendientes > 0 ? 'var(--yellow-soft)' : 'var(--green-light)',
                        }}>
                          {pendientes > 0
                            ? `⏳ ${pendientes} pago${pendientes !== 1 ? 's' : ''} pendiente${pendientes !== 1 ? 's' : ''} de validar`
                            : '✓ Todos los pagos confirmados'}
                        </div>
                      )}
                      {nSospechosos > 0 && (
                        <div style={{
                          background: 'var(--yellow-bg)',
                          border: '1px solid var(--yellow)',
                          borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12,
                          fontSize: 12, color: 'var(--yellow-soft)', lineHeight: 1.5,
                        }}>
                          ⚠️ {nSospechosos} posible{nSospechosos !== 1 ? 's' : ''} duplicado{nSospechosos !== 1 ? 's' : ''} detectado{nSospechosos !== 1 ? 's' : ''}.
                          Revisa los nombres marcados con ⚠️ y elimina los que sean repetidos.
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                        {esTipoBote
                          ? 'Cuando confirmes el pago (transferencia o efectivo), pulsa el botón "⏳ Pendiente" del jugador para cambiarlo a "✓ Pagado". Eliminar lo quita del ranking.'
                          : 'Al eliminar una predicción el jugador podrá volver a registrarse con su nombre.'}
                      </p>
                      {/* Buscador — solo cuando hay suficientes participantes */}
                      {listaPredicciones.length > UMBRAL_BUSQUEDA_PARTICIPANTES && (
                        <input
                          type="text"
                          placeholder={`🔍 Buscar entre ${listaPredicciones.length} participantes…`}
                          value={busquedaParticipante}
                          onChange={e => setBusquedaParticipante(e.target.value)}
                          style={{ width: '100%', fontSize: 13, padding: '8px 12px', marginBottom: 10 }}
                          aria-label="Buscar participante por nombre"
                        />
                      )}
                      {(() => {
                        const filtro = busquedaParticipante.trim().toLowerCase()
                        const listaFiltrada = filtro
                          ? listaPredicciones.filter(p => (p.nombre ?? '').toLowerCase().includes(filtro))
                          : listaPredicciones
                        if (filtro && listaFiltrada.length === 0) {
                          return (
                            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1.5rem 0', fontStyle: 'italic' }}>
                              Sin resultados para "{busquedaParticipante}".
                            </p>
                          )
                        }
                        return listaFiltrada.map((pred, i) => {
                        const fecha = pred.fecha
                          ? new Date(pred.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'
                        const yaPagado = pagados.includes(pred.id)
                        const togglingEste = togglingPago === pred.id
                        return (
                          <div
                            key={pred.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                              padding: '10px 0',
                              borderBottom: i < listaFiltrada.length - 1 ? '1px solid var(--border)' : 'none',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                  {pred.nombre}
                                </p>
                                {(mapaSimilares.get(pred.nombre) ?? []).length > 0 && (
                                  <span
                                    title={`Posible duplicado con: ${(mapaSimilares.get(pred.nombre) ?? []).join(', ')}`}
                                    aria-label="Posible nombre duplicado"
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-full)',
                                      background: 'var(--yellow-bg)', color: 'var(--yellow)', flexShrink: 0,
                                      border: '1px solid var(--yellow)', cursor: 'help',
                                    }}
                                  >
                                    ⚠️ Similar
                                  </span>
                                )}
                              </div>
                              {(mapaSimilares.get(pred.nombre) ?? []).length > 0 && (
                                <p style={{ fontSize: 10, color: 'var(--yellow-soft)', marginBottom: 2, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  Parecido a: {(mapaSimilares.get(pred.nombre) ?? []).join(', ')}
                                </p>
                              )}
                              <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {fecha}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {esTipoBote && (
                                <button
                                  onClick={() => togglePago(pred.id)}
                                  disabled={togglingEste}
                                  aria-label={yaPagado ? 'Marcar como no pagado' : 'Marcar como pagado'}
                                  style={{
                                    background: yaPagado ? 'var(--green-bg)' : 'var(--yellow-bg)',
                                    border: `1px solid ${yaPagado ? 'var(--green)' : 'var(--yellow)'}`,
                                    color: yaPagado ? 'var(--green)' : 'var(--yellow)',
                                    fontSize: 12, fontWeight: 700, padding: '5px 10px',
                                    borderRadius: 'var(--radius-sm)', cursor: togglingEste ? 'not-allowed' : 'pointer',
                                    opacity: togglingEste ? 0.5 : 1,
                                  }}
                                >
                                  {togglingEste ? '…' : yaPagado ? '✓ Pagado' : '⏳ Pendiente'}
                                </button>
                              )}
                              {(() => {
                                const esCumple = (quinielaActual.cumpleaneros ?? []).includes(pred.id)
                                const togglingCumpleEste = togglingCumple === pred.id
                                return (
                                  <button
                                    onClick={() => toggleCumple(pred.id)}
                                    disabled={togglingCumpleEste}
                                    title={esCumple ? 'Quitar cumpleaños (oculta el 🎂 en el ranking)' : 'Marcar cumpleaños (muestra 🎂 en el ranking)'}
                                    aria-label={esCumple ? 'Quitar cumpleaños' : 'Marcar cumpleaños'}
                                    style={{
                                      background: esCumple ? 'var(--purple-bg, rgba(168,85,247,0.12))' : 'transparent',
                                      border: `1px solid ${esCumple ? 'var(--purple, #A855F7)' : 'var(--border-strong)'}`,
                                      color: esCumple ? 'var(--purple, #A855F7)' : 'var(--muted)',
                                      fontSize: 14, fontWeight: 700, padding: '5px 9px',
                                      borderRadius: 'var(--radius-sm)', cursor: togglingCumpleEste ? 'not-allowed' : 'pointer',
                                      opacity: togglingCumpleEste ? 0.5 : 1, lineHeight: 1,
                                    }}
                                  >
                                    {togglingCumpleEste ? '…' : '🎂'}
                                  </button>
                                )
                              })()}
                              <button
                                onClick={() => eliminarPrediccion(pred)}
                                disabled={eliminandoPred === pred.id}
                                style={{
                                  background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)',
                                  fontSize: 12, fontWeight: 600, padding: '5px 12px',
                                  borderRadius: 'var(--radius-sm)', cursor: eliminandoPred === pred.id ? 'not-allowed' : 'pointer',
                                  opacity: eliminandoPred === pred.id ? 0.5 : 1,
                                }}
                              >
                                {eliminandoPred === pred.id ? '…' : 'Eliminar'}
                              </button>
                            </div>
                          </div>
                        )
                      })
                      })()}
                    </>
                    )
                  })()}
                </div>
              )}

              {/* Tab: Editar */}
              {tab === 'editar' && (
                <>
                  {/* 1. ¿Qué es? */}
                  <div style={card}>
                    <label htmlFor="edit-nombre" style={lbl}>Nombre de la quiniela</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 14 }}>
                      <input id="edit-nombre" type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre de la quiniela" style={{ flex: 1, marginBottom: 0 }} />
                      <EmojiPicker inputId="edit-nombre" value={editNombre} onChange={setEditNombre} />
                    </div>

                    <label htmlFor="edit-empresa" style={{ ...lbl, marginBottom: 4 }}>Empresa u organización <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                    <input id="edit-empresa" type="text" placeholder="Ej. Construcciones ACME" value={editEmpresa} onChange={e => setEditEmpresa(e.target.value)} />
                  </div>

                  {/* 2. Partidos: buscador + lista */}
                  {renderBuscadorFixtures(agregarSeleccionadosAEdicion)}

                  <div style={card}>
                    <label style={{ ...lbl, marginBottom: 14 }}>Partidos</label>
                    {conteoPredicciones > 0 && (
                      <div style={{ background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--yellow-soft)' }}>
                        ⚠️ Hay {conteoPredicciones} predicción(es) registrada(s). Los partidos existentes 🔒 no se pueden modificar — solo puedes agregar nuevos al final.
                      </div>
                    )}
                    {editPartidos.map((p, i) => {
                      const esOriginal = i < editPartidosOriginales
                      const bloqueado = esOriginal && conteoPredicciones > 0
                      const incompleto = partidoIncompleto(p)
                      const enEdicion = !bloqueado && (editandoPartidoEdicion === i || incompleto)

                      if (!enEdicion) {
                        // ── Tarjeta colapsada (solo lectura) ──
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < editPartidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            {bloqueado && (
                              <span aria-label="Partido fijo" title="No editable: ya hay predicciones" style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>🔒</span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                              {escudoMini(p.escudoLocal, p.local)}
                              <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                              {escudoMini(p.escudoVisitante, p.visitante)}
                              <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                            </div>
                            {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{formatFixtureDate(p.hora)}</span>}
                            {!bloqueado && (
                              <button onClick={() => setEditandoPartidoEdicion(i)} aria-label="Editar partido" title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}>✏️</button>
                            )}
                            {!bloqueado && !esOriginal && (
                              <button
                                onClick={() => setEditPartidos(prev => prev.filter((_, idx) => idx !== i))}
                                aria-label="Quitar partido nuevo"
                                style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}
                              >
                                Quitar ✕
                              </button>
                            )}
                          </div>
                        )
                      }

                      // ── Modo edición ──
                      return (
                        <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < editPartidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                              Partido {i + 1}
                            </span>
                            {!esOriginal && (
                              <button onClick={() => setEditPartidos(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>
                                Quitar ✕
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <input type="text" placeholder="Equipo local"     value={p.local}     onChange={e => actualizarEditPartido(i, 'local', e.target.value)} />
                            <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>VS</span>
                            <input type="text" placeholder="Equipo visitante" value={p.visitante} onChange={e => actualizarEditPartido(i, 'visitante', e.target.value)} />
                          </div>
                          <DateTimeWrap vacio={!p.hora} texto="📅 Fecha y hora del partido">
                            <input type="datetime-local" value={p.hora} onChange={e => actualizarEditPartido(i, 'hora', e.target.value)} />
                          </DateTimeWrap>
                          {!incompleto && (
                            <div style={{ textAlign: 'right', marginTop: 8 }}>
                              <button onClick={() => setEditandoPartidoEdicion(null)} style={{ background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}>
                                Listo ✓
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {editPartidos.length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>Sin partidos. Agrega desde el buscador o manualmente.</p>
                    )}
                    <button
                      onClick={() => {
                        setEditandoPartidoEdicion(editPartidos.length)
                        setEditPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])
                      }}
                      style={{ width: '100%', padding: '10px', border: '1.5px dashed var(--border-strong)', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 600, marginTop: 10 }}
                    >
                      + Agregar partido manualmente
                    </button>
                  </div>

                  {/* 3. Cierre — depende de los partidos */}
                  <div style={card}>
                    <label htmlFor="edit-cierre" style={{ ...lbl, marginBottom: 4 }}>
                      Fecha y hora de cierre <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                      Después de esta hora los jugadores ya no pueden registrar ni cambiar sus predicciones.
                    </p>
                    <DateTimeWrap vacio={!editCierre}>
                      <input id="edit-cierre" type="datetime-local" value={editCierre} onChange={e => setEditCierre(e.target.value)} style={{ borderColor: !editCierre ? 'var(--red)' : undefined }} />
                    </DateTimeWrap>
                    {primeraHoraPartido(editPartidos) && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                        📅 Tu primer partido empieza el <strong style={{ color: 'var(--text)' }}>{formatFixtureDate(primeraHoraPartido(editPartidos))}</strong>. El cierre debe ser antes.{' '}
                        <button type="button" onClick={() => setEditCierre(cierreSugerido(editPartidos))} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          Cerrar 5 min antes
                        </button>
                      </p>
                    )}
                  </div>

                  {/* 4. Acceso — quién puede entrar */}
                  <div style={card}>
                    <p style={{ ...lbl, marginBottom: 10 }}>Acceso</p>

                    <label htmlFor="edit-codigo" style={{ ...lbl, marginBottom: 4 }}>Código de acceso {soySuper ? <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span> : <span style={{ color: 'var(--red)' }}>*</span>}</label>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                      Si pones un código, solo quien lo tenga puede participar. Evita uno muy fácil.
                    </p>
                    <input id="edit-codigo" type="text" placeholder="Ej. ACME2026" value={editCodigoAcceso} onChange={e => setEditCodigoAcceso(e.target.value)} style={{ marginBottom: 14 }} />

                    {soySuper ? (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                        <input type="checkbox" checked={editPrivada} onChange={e => setEditPrivada(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--green)' }} />
                        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                          <strong style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Quiniela privada</strong><br />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>No aparece en la página principal, solo se accede con el enlace directo.</span>
                        </span>
                      </label>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                        <span aria-hidden="true">🔒</span>
                        <span><strong style={{ color: 'var(--text)' }}>Privada</strong>: no aparece en listas públicas. Solo participa quien tenga el código.</span>
                      </div>
                    )}

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={editRequiereApellido} onChange={e => setEditRequiereApellido(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--green)' }} />
                      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                        <strong style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Requerir nombre y apellido</strong><br />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Pide nombre + apellido. Útil en grupos grandes.</span>
                      </span>
                    </label>
                  </div>

                  {/* 5. Premio */}
                  {renderFormularioPremio(editPremioFijo, setEditPremioFijo, editCuota, setEditCuota)}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setTab('resultados'); setFixtures([]); setSeleccionados([]) }} style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={guardarEdicion} disabled={guardandoEdicion} style={greenCtaStyle(guardandoEdicion)}>
                      {guardandoEdicion ? 'Guardando…' : 'Guardar cambios →'}
                    </button>
                  </div>

                  {/* Zona de peligro */}
                  <div style={{ marginTop: 24, border: '1.5px solid var(--red)', borderRadius: 'var(--radius-md)', padding: '1.1rem 1.25rem', background: 'var(--red-bg)' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#FCA5A5', marginBottom: 4 }}>Zona de peligro</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                      Eliminar la quiniela borrará también todas las predicciones registradas. Esta acción es permanente e irreversible.
                    </p>
                    <label style={{ ...lbl, marginBottom: 6 }}>Escribe el nombre de la quiniela para confirmar</label>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic' }}>"{quinielaActual.nombre}"</p>
                    <input
                      type="text" placeholder="Escribe el nombre exacto…"
                      value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                      style={{ marginBottom: 10, borderColor: 'var(--red)' }}
                    />
                    <button
                      onClick={eliminarQuiniela}
                      disabled={eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()}
                      style={{
                        width: '100%', padding: '11px',
                        borderRadius: 'var(--radius-sm)', border: 'none',
                        fontSize: 13, fontWeight: 700,
                        cursor: (eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()) ? 'not-allowed' : 'pointer',
                        background: (eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()) ? 'var(--card-light)' : 'var(--red)',
                        color: (eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()) ? 'var(--muted)' : 'var(--text-strong)',
                      }}
                    >
                      {eliminando ? 'Eliminando…' : '🗑 Eliminar quiniela permanentemente'}
                    </button>
                  </div>
                </>
              )}

              {/* Tab: Compartir */}
              {tab === 'compartir' && (
                <>
                  {[
                    { key: 'jugadores', label: 'Link para jugadores', link: linkJugadores, desc: 'Comparte este enlace para que los jugadores ingresen sus predicciones.' },
                    { key: 'ranking',   label: 'Link del ranking',    link: linkRanking,   desc: 'Comparte este enlace para que todos vean el ranking en tiempo real.' },
                  ].map(({ key, label, link, desc }) => (
                    <div key={key} style={card}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{desc}</p>

                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <a
                          href={link}
                          target="_blank" rel="noreferrer"
                          style={{
                            flex: 1, display: 'block', textAlign: 'center',
                            padding: '10px', borderRadius: 'var(--radius-sm)',
                            background: greenCta,
                            color: '#07120A', fontWeight: 800, fontSize: 13, textDecoration: 'none',
                            boxShadow: 'var(--shadow-green)',
                          }}
                        >
                          Abrir →
                        </a>
                        <button
                          onClick={() => copiar(link, key)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
                            background: copiado === key ? 'var(--green-bg)' : 'var(--card-light)',
                            color: copiado === key ? 'var(--green)' : 'var(--text)',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {copiado === key ? '✓ Copiado' : 'Copiar link'}
                        </button>
                        {navigator.share && (
                          <button
                            onClick={() => navigator.share({ title: 'QuinielApp', text: desc, url: link }).catch(() => {})}
                            style={{
                              flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
                              background: 'var(--card-light)', color: 'var(--text)',
                              fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            Compartir
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {link}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Mensaje listo para compartir (texto pre-armado) */}
                  {(() => {
                    const lineas = []
                    if (quinielaActual.empresa) {
                      lineas.push(`📋 Quiniela "${quinielaActual.nombre}" — ${quinielaActual.empresa}`)
                    } else {
                      lineas.push(`📋 Quiniela: ${quinielaActual.nombre}`)
                    }
                    lineas.push('')
                    if (quinielaActual.codigoAcceso) {
                      lineas.push(`🔑 Entra a https://quinielapp.fun y mete el código:`)
                      lineas.push(`   ${quinielaActual.codigoAcceso}`)
                    } else {
                      lineas.push(`🔗 ${linkJugadores}`)
                    }
                    if (Number(quinielaActual.cuota) > 0) {
                      lineas.push('')
                      lineas.push(`💵 Cuota: ${formatearMXN(quinielaActual.cuota)}`)
                    }
                    if (quinielaActual.cierre) {
                      const d = cierreToDate(quinielaActual.cierre)
                      if (d) {
                        lineas.push('')
                        lineas.push(`⏳ Cierra: ${d.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`)
                      }
                    }
                    lineas.push('')
                    lineas.push('¡Suerte! ⚽')
                    const mensaje = lineas.join('\n')
                    return (
                      <div style={card}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', marginBottom: 4 }}>
                          📣 Mensaje listo para compartir
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                          Copia y pega este mensaje en WhatsApp, Slack o correo para invitar a los participantes.
                        </p>
                        <pre style={{
                          background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)',
                          padding: '12px 14px', border: '1px solid var(--border)',
                          fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                          fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, marginBottom: 10,
                          overflowX: 'auto',
                        }}>
                          {mensaje}
                        </pre>
                        <button
                          onClick={() => copiar(mensaje, 'mensaje')}
                          style={{
                            width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
                            background: copiado === 'mensaje' ? 'var(--green-bg)' : 'var(--card-light)',
                            color: copiado === 'mensaje' ? 'var(--green)' : 'var(--text)',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {copiado === 'mensaje' ? '✓ Copiado al portapapeles' : '📋 Copiar mensaje'}
                        </button>
                      </div>
                    )
                  })()}
                </>
              )}
            </>
          )
        })()}
      </div>

      {/* Modal de confirmación de guardado de resultados */}
      {confirmacionRes && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !guardandoRes && setConfirmacionRes(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)',
              maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto',
              padding: '1.5rem',
            }}
          >
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
              Confirmar resultados
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Vas a guardar {confirmacionRes.items.length} resultado{confirmacionRes.items.length !== 1 ? 's' : ''}.
              {validandoEspn ? ' Validando resultados…' : ''}
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {confirmacionRes.items.map(it => {
                const espnTexto = (it.espnLocal != null && it.espnVisitante != null)
                  ? `${it.espnLocal}-${it.espnVisitante}`
                  : null
                const tuValor = it.cancelado ? 'Cancelado' : `${it.local}-${it.visitante}`
                const divergente = !it.cancelado && espnTexto && espnTexto !== tuValor && it.espnEstado === 'post'
                return (
                  <div
                    key={it.idx}
                    style={{
                      background: divergente ? 'var(--yellow-bg)' : 'var(--bg-soft)',
                      border: `1px solid ${divergente ? 'var(--yellow)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.partido.local} vs {it.partido.visitante}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800,
                        color: it.cancelado ? 'var(--muted)' : 'var(--green)', flexShrink: 0,
                      }}>
                        {tuValor}
                      </span>
                    </div>
                    {divergente && (
                      <p style={{ fontSize: 11, color: 'var(--yellow-soft)', marginTop: 6, fontWeight: 600 }}>
                        ⚠️ El marcador oficial reporta <strong>{espnTexto}</strong>. ¿Es correcto tu valor?
                      </p>
                    )}
                    {!divergente && espnTexto && espnTexto === tuValor && (
                      <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>
                        ✓ Coincide con el marcador oficial
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmacionRes(null)}
                disabled={guardandoRes}
                style={{
                  padding: '10px 18px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-strong)', background: 'transparent',
                  color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: guardandoRes ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button onClick={guardarResultados} disabled={guardandoRes} style={greenCtaStyle(guardandoRes)}>
                {guardandoRes ? 'Guardando…' : 'Confirmar y guardar →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente de card de quiniela en la lista ───────────────────────────────
function QuinielaCard({ q, conteos, onGestionar, dueno }) {
  const cerrada = esCerradaQ(q)
  const enJuego = cerrada && !esFinalizadaQ(q)
  const n = conteos[q.id] ?? 0
  const esTipoBote = (Number(q.cuota) > 0) || q.tipoPremio === TIPO_PREMIO.BOTE
  const pagosPendientes = esTipoBote ? Math.max(0, n - (q.pagados ?? []).length) : 0

  const badge = enJuego
    ? { label: 'Jugándose', bg: 'var(--yellow-bg)', color: 'var(--yellow)' }
    : cerrada
      ? { label: 'Finalizada', bg: 'var(--neutral-bg)', color: 'var(--muted)' }
      : { label: 'Abierta', bg: 'var(--green-bg)', color: 'var(--green)' }

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: 10,
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
          {q.nombre}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0,
            background: badge.bg, color: badge.color,
          }}>
            {badge.label}
          </span>
          {q.destacada && !cerrada && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              background: 'var(--yellow-bg)', color: 'var(--yellow)',
            }}>
              ⭐ Principal
            </span>
          )}
          {pagosPendientes > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              background: 'var(--yellow-bg)', color: 'var(--yellow)',
            }}>
              ⏳ {pagosPendientes} pago{pagosPendientes !== 1 ? 's' : ''}
            </span>
          )}
          {(q.privada || q.codigoAcceso) && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0,
              background: 'var(--neutral-bg)', color: 'var(--text)', border: '1px solid var(--border-strong)',
            }}>
              🔒 Privada
            </span>
          )}
        </div>
        {dueno && (
          <p style={{ fontSize: 11, color: 'var(--green-light)', marginBottom: 4, fontWeight: 700 }}>
            👤 {dueno}
          </p>
        )}
        {q.empresa && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>
            🏢 {q.empresa}
          </p>
        )}
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          {q.partidos?.length ?? 0} partidos · {n} {n === 1 ? 'participante' : 'participantes'}
          {tienePremio(q) && (
            <>
              {' · '}
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                💰 {formatearMXN(calcularBote(q, n))}
              </span>
            </>
          )}
        </p>
      </div>
      <button onClick={() => onGestionar(q)} style={{ ...greenCtaStyle(false), whiteSpace: 'nowrap', flexShrink: 0 }}>
        Gestionar
      </button>
    </div>
  )
}
