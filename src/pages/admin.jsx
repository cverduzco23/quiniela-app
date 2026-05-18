import { useState, useEffect } from 'react'
import { collection, addDoc, doc, updateDoc, getDocs, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase'
import { cierreToDate, cierreToInputValue, inputValueACierre, quinielaCerrada, quinielaFinalizada, resultadosCompletos } from '../utils/cierre'
import { TIPO_PREMIO, MODELO_PREMIO, calcularBote, tienePremio, formatearMXN } from '../utils/premios'
import { normalizarNombre } from '../utils/nombres'

const LIGAS = [
  { id: 'mex.1',              nombre: '🇲🇽 Liga MX' },
  { id: 'fifa.world',         nombre: '🌍 Mundial 2026' },
  { id: 'uefa.champions',     nombre: '⭐ Champions League' },
  { id: 'concacaf.champions', nombre: '🌎 CONCACAF Champions Cup' },
  { id: 'eng.1',              nombre: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { id: 'esp.1',              nombre: '🇪🇸 La Liga' },
  { id: 'ita.1',              nombre: '🇮🇹 Serie A' },
  { id: 'ger.1',              nombre: '🇩🇪 Bundesliga' },
  { id: 'usa.1',              nombre: '🇺🇸 MLS' },
  { id: 'fifa.friendly',     nombre: '🌐 Amistosos Internacionales' },
]

function goalsToResultado(local, visitante) {
  const l = parseInt(local), v = parseInt(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const esCerradaQ = quinielaCerrada
const esFinalizadaQ = quinielaFinalizada

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

export default function Admin() {
  // ─── Autenticación ────────────────────────────────────────────────────────
  const [autenticado, setAutenticado] = useState(false)
  const [authListo, setAuthListo]     = useState(false)
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [loginError, setLoginError]   = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAutenticado(!!user)
      setAuthListo(true)
    })
    return unsub
  }, [])

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

  const salir = () => {
    if (window.confirm('¿Seguro que quieres cerrar sesión?')) signOut(auth)
  }

  // ─── Estado principal ─────────────────────────────────────────────────────
  const [vista, setVista]                 = useState('lista')
  const [quinielas, setQuinielas]         = useState([])
  const [loadingLista, setLoadingLista]   = useState(true)
  const [quinielaActual, setQuinielaActual] = useState(null)
  const [tab, setTab]                     = useState('resultados')
  const [conteos, setConteos]             = useState({})

  // ─── Formulario nueva quiniela ────────────────────────────────────────────
  const [nombre, setNombre]     = useState('')
  const [cierre, setCierre]     = useState('')
  const [partidos, setPartidos] = useState([{ local: '', visitante: '', hora: '' }])
  const [guardando, setGuardando] = useState(false)
  const [premioFijo, setPremioFijo]     = useState('')
  const [cuota, setCuota]               = useState('')
  const [modeloPremio, setModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)

  // ─── Resultados ───────────────────────────────────────────────────────────
  const [resultados, setResultados]       = useState({})
  const [guardandoRes, setGuardandoRes]   = useState(false)
  const [guardadoRes, setGuardadoRes]     = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincrMsg, setSincrMsg]           = useState('')
  const [confirmacionRes, setConfirmacionRes] = useState(null)
  const [validandoEspn, setValidandoEspn] = useState(false)

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
  const [editCierre, setEditCierre]             = useState('')
  const [editPremioFijo, setEditPremioFijo]     = useState('')
  const [editCuota, setEditCuota]               = useState('')
  const [editModeloPremio, setEditModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)
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
    setFixtures([]); setSeleccionados([])
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
  useEffect(() => { if (autenticado && authListo && vista === 'caja') cargarMovimientos() }, [autenticado, authListo, vista])

  // ─── CRUD partidos ────────────────────────────────────────────────────────
  const actualizarPartido = (i, campo, valor) =>
    setPartidos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))
  const agregarPartido = () =>
    setPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])
  const quitarPartido = (i) =>
    setPartidos(prev => prev.filter((_, idx) => idx !== i))

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

  const filtrarDuplicados = (existentes, nuevos) => {
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
      alert(`Estos partidos ya están agregados (mismo ID de ESPN) y se omitirán:\n\n• ${duplicadosId.join('\n• ')}`)
    }
    if (advertenciasManuales.length > 0) {
      const ok = window.confirm(
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

  const agregarSeleccionados = () => {
    const nuevos = seleccionados.map(fixtureAPartido)
    const baseExistente = (partidos.length === 1 && !partidos[0].local && !partidos[0].visitante)
      ? []
      : partidos
    const aceptados = filtrarDuplicados(baseExistente, nuevos)
    if (aceptados.length === 0) {
      setSeleccionados([])
      setFixtures([])
      return
    }
    setPartidos([...baseExistente, ...aceptados])
    setSeleccionados([])
    setFixtures([])
  }

  const agregarSeleccionadosAEdicion = () => {
    const nuevos = seleccionados.map(fixtureAPartido)
    const aceptados = filtrarDuplicados(editPartidos, nuevos)
    if (aceptados.length === 0) {
      setSeleccionados([])
      setFixtures([])
      return
    }
    setEditPartidos(prev => [...prev, ...aceptados])
    setSeleccionados([])
    setFixtures([])
  }

  // ─── Edición de quiniela existente ───────────────────────────────────────
  const guardarEdicion = async () => {
    if (!quinielaActual || guardandoEdicion) return
    if (editPartidos.length === 0) return alert('La quiniela debe tener al menos un partido.')
    if (!editNombre.trim()) return alert('El nombre no puede estar vacío.')
    if (!editCierre) return alert('La fecha y hora de cierre es obligatoria.')
    if ((conteoPredicciones ?? 0) > 0 && editPartidos.length < editPartidosOriginales) {
      return alert('No puedes quitar partidos existentes cuando ya hay predicciones registradas. Solo puedes agregar nuevos al final.')
    }
    const { campos: premioFields } = camposPremio(editPremioFijo, editCuota, editModeloPremio)
    setGuardandoEdicion(true)
    try {
      const cierreTs = inputValueACierre(editCierre)
      const patch = {
        nombre:   editNombre.trim(),
        partidos: editPartidos,
        cierre:   cierreTs,
        ...premioFields,
      }
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
      const actualizado = { ...quinielaActual, ...patch }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
      setTab('resultados')
    } catch {
      alert('Error al guardar cambios.')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  // ─── Cerrar / reabrir quiniela ───────────────────────────────────────────
  const toggleCerrar = async () => {
    if (!quinielaActual || toggling) return
    const estaCerrada = esCerradaQ(quinielaActual)
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
      alert('Error al actualizar el estado.')
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
      alert('Error al actualizar el estado.')
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
    if (!window.confirm(mensaje)) return
    setToggleBote(true)
    try {
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { boteDevuelto: nuevo })
      const actualizado = { ...quinielaActual, boteDevuelto: nuevo }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alert('Error al actualizar el estado del bote.')
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
      alert('Error al actualizar el estado de pago.')
    } finally {
      setTogglingPago(null)
    }
  }

  // ─── Eliminar predicción individual ──────────────────────────────────────
  const eliminarPrediccion = async (pred) => {
    if (!window.confirm(`¿Eliminar la predicción de "${pred.nombre}"? El jugador podrá volver a registrarse.`)) return
    setEliminandoPred(pred.id)
    try {
      await deleteDoc(doc(db, 'predicciones', pred.id))
      setListaPredicciones(prev => prev.filter(p => p.id !== pred.id))
      setConteos(prev => ({ ...prev, [quinielaActual.id]: Math.max(0, (prev[quinielaActual.id] ?? 1) - 1) }))
    } catch {
      alert('Error al eliminar. Intenta de nuevo.')
    } finally {
      setEliminandoPred(null)
    }
  }

  // ─── Eliminar quiniela ────────────────────────────────────────────────────
  const eliminarQuiniela = async () => {
    if (!quinielaActual || eliminando) return
    if (!window.confirm(`¿Seguro que deseas eliminar "${quinielaActual.nombre}"? Esta acción no se puede deshacer.`)) return
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
      alert('Error al eliminar. Intenta de nuevo.')
    } finally {
      setEliminando(false)
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

  const guardarNuevaQuiniela = async () => {
    if (!nombre.trim()) return alert('Ponle un nombre a la quiniela')
    if (!cierre) return alert('La fecha y hora de cierre es obligatoria')
    if (partidos.length === 0) return alert('Agrega al menos un partido')
    if (partidos.some(p => !p.local.trim() || !p.visitante.trim())) return alert('Completa nombre de equipos en todos los partidos')
    const { campos: premioFields } = camposPremio(premioFijo, cuota, modeloPremio)
    setGuardando(true)
    try {
      const cierreTs = inputValueACierre(cierre)
      const creada   = new Date().toISOString()
      const base = {
        nombre: nombre.trim(), cierre: cierreTs, partidos,
        resultados: {}, creada, cerrada: false,
        ...premioFields,
      }
      const ref = await addDoc(collection(db, 'quinielas'), base)
      const nueva = { id: ref.id, ...base }
      setQuinielaActual(nueva)
      setResultados({})
      setVista('gestionar')
      setTab('compartir')
      cargarQuinielas()
      setNombre(''); setCierre(''); setPartidos([{ local: '', visitante: '', hora: '' }])
      setPremioFijo(''); setCuota(''); setModeloPremio(MODELO_PREMIO.GANADOR_UNICO)
      setFixtures([]); setSeleccionados([])
    } catch { alert('Error al guardar. Intenta de nuevo.') }
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
      return alert('No hay resultados que guardar.')
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
    } catch { alert('Error al guardar resultados.') }
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
      setSincrMsg('⚠ Estos partidos no tienen ID de ESPN. Crea la quiniela desde el buscador.')
      setSincronizando(false)
      return
    }

    const resGuardar = { ...resultados }
    let actualizados = 0

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
          if (!ev) return
          const state = ev.status?.type?.state
          if (state !== 'post') return
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

    if (actualizados > 0) {
      try {
        const completos = resultadosCompletos({ partidos: quinielaActual.partidos, resultados: resGuardar })
        const patch = completos ? { resultados: resGuardar, finalizada: true, finalizadaEn: new Date().toISOString() } : { resultados: resGuardar }
        await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
        setResultados(resGuardar)
        setQuinielaActual(prev => ({ ...prev, ...patch }))
        setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, ...patch } : q))
        setSincrMsg(`✓ ${actualizados} partido${actualizados !== 1 ? 's' : ''} sincronizado${actualizados !== 1 ? 's' : ''}`)
        setTimeout(() => setSincrMsg(''), 4000)
      } catch { setSincrMsg('⚠ Error al guardar. Intenta de nuevo.') }
    } else {
      setSincrMsg('Sin partidos terminados para sincronizar.')
      setTimeout(() => setSincrMsg(''), 4000)
    }

    setSincronizando(false)
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
      alert('Error al guardar. Intenta de nuevo.')
    } finally {
      setGuardandoMov(false)
    }
  }

  const eliminarMovimiento = async (mov) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    try {
      await deleteDoc(doc(db, 'movimientos', mov.id))
      setMovimientos(prev => prev.filter(m => m.id !== mov.id))
    } catch {
      alert('Error al eliminar.')
    }
  }

  // ─── Compartir ────────────────────────────────────────────────────────────
  const linkJugadores = quinielaActual ? `${window.location.origin}/?q=${quinielaActual.id}` : ''
  const linkRanking   = quinielaActual ? `${window.location.origin}/ranking?q=${quinielaActual.id}` : ''

  const copiar = (txt, key) => {
    navigator.clipboard.writeText(txt)
    setCopiado(key)
    setTimeout(() => setCopiado(null), 2000)
  }

  // ─── Lista helpers ────────────────────────────────────────────────────────
  const quinielasActivas     = quinielas.filter(q => !esCerradaQ(q))
  const quinielasCerradas    = quinielas.filter(q => esCerradaQ(q))
  const quinielasEnJuego     = quinielasCerradas.filter(q => !esFinalizadaQ(q))
  const quinielasFinalizadas = quinielasCerradas.filter(q => esFinalizadaQ(q))

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
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'))
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
          <p style={{ fontSize: 13, color: 'var(--green-light)', marginTop: 4, fontWeight: 600 }}>⚽ QuinielApp</p>
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
        </div>
      </div>
    </div>
  )

  // ─── Formulario de premio (reutilizable) ──────────────────────────────────
  const renderFormularioPremio = (fijo, setFijo, cuotaVal, setCuotaVal, modelo, setModelo) => {
    const tienePremioLocal = (Number(fijo) || 0) > 0 || (Number(cuotaVal) || 0) > 0
    const opcionesModelo = [
      { val: MODELO_PREMIO.GANADOR_UNICO, label: 'Ganador único',   desc: 'Gana el 1° lugar. Si empatan, se reparten.' },
      { val: MODELO_PREMIO.PODIO,         label: 'Podio 70/20/10', desc: '1° lugar 70%, 2° lugar 20%, 3° lugar 10%.' },
    ]
    return (
      <div style={card}>
        <label style={lbl}>Premio</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: tienePremioLocal ? 14 : 0 }}>
          <div>
            <label style={{ ...lbl, marginBottom: 6 }}>Premio fijo (MXN)</label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 500"
              value={fijo}
              onChange={e => setFijo(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Monto garantizado, independiente de participantes.</p>
          </div>
          <div>
            <label style={{ ...lbl, marginBottom: 6 }}>Cuota por participante (MXN)</label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 50"
              value={cuotaVal}
              onChange={e => setCuotaVal(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Se suma al bote por cada participante que pague.</p>
          </div>
        </div>
        {!tienePremioLocal && (
          <p style={{ fontSize: 11, color: 'var(--muted)' }}>Deja ambos en 0 para una quiniela gratis sin premio.</p>
        )}

        {tienePremioLocal && (
          <>
            <label style={lbl}>Cómo se reparte</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {opcionesModelo.map(op => {
                const activa = modelo === op.val
                return (
                  <button
                    key={op.val}
                    type="button"
                    onClick={() => setModelo(op.val)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      background: activa ? 'var(--green-bg)' : 'var(--bg-soft)',
                      border: `1.5px solid ${activa ? 'var(--green)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{op.label}</span>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${activa ? 'var(--green)' : 'var(--border-strong)'}`,
                        background: activa ? 'var(--green)' : 'transparent',
                      }} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{op.desc}</p>
                  </button>
                )
              })}
            </div>
          </>
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
      </div>

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
        <div style={{ maxWidth: 580, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <a href="/" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green-light)', marginBottom: 6, fontWeight: 700, textDecoration: 'none', display: 'block' }}>⚽ QuinielApp</a>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Panel de Administrador</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {vista !== 'lista' && (
              <button
                onClick={() => {
                  if (vista === 'caja' && cajaNombre !== null) {
                    setCajaNombre(null)
                  } else {
                    setVista('lista')
                    setQuinielaActual(null)
                    setFixtures([])
                    setSeleccionados([])
                    setCajaNombre(null)
                  }
                }}
                style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {vista === 'caja' && cajaNombre !== null ? '← Caja' : '← Lista'}
              </button>
            )}
            <button
              onClick={salir}
              style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--muted)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 580, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>

        {/* ── Vista: Lista ────────────────────────────────────────────────── */}
        {vista === 'lista' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Tus quinielas</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setVista('caja')}
                  style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  💰 Caja
                </button>
                <button onClick={() => setVista('nueva')} style={{ ...greenCtaStyle(false), padding: '9px 18px' }}>
                  + Nueva quiniela
                </button>
              </div>
            </div>

            {loadingLista ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
            ) : quinielas.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Sin quinielas todavía</p>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Crea tu primera quiniela para comenzar.</p>
                <button onClick={() => setVista('nueva')} style={{ ...greenCtaStyle(false) }}>
                  Crear ahora →
                </button>
              </div>
            ) : (
              <>
                {quinielasActivas.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Activas
                    </p>
                    {quinielasActivas.map(q => (
                      <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} />
                    ))}
                  </>
                )}

                {quinielasEnJuego.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: quinielasActivas.length > 0 ? 16 : 0 }}>
                      Jugándose
                    </p>
                    {quinielasEnJuego.map(q => (
                      <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} />
                    ))}
                  </>
                )}

                {quinielasFinalizadas.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: (quinielasActivas.length > 0 || quinielasEnJuego.length > 0) ? 16 : 0 }}>
                      Finalizadas
                    </p>
                    {quinielasFinalizadas.map(q => (
                      <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Vista: Caja ─────────────────────────────────────────────────── */}
        {vista === 'caja' && (
          <>
            {cajaNombre === null ? (
              // ── Lista de saldos ──────────────────────────────────────────
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Caja</span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    type="text"
                    placeholder="Nombre del participante…"
                    value={buscarNombreCaja}
                    onChange={e => setBuscarNombreCaja(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && buscarNombreCaja.trim()) {
                        setCajaNombre(normalizarNombre(buscarNombreCaja.trim()))
                        setBuscarNombreCaja('')
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => {
                      if (buscarNombreCaja.trim()) {
                        setCajaNombre(normalizarNombre(buscarNombreCaja.trim()))
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
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
                ) : saldos.length === 0 ? (
                  <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
                    <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Sin movimientos todavía</p>
                    <p style={{ fontSize: 13, color: 'var(--muted)' }}>Busca un participante arriba para registrar su primer movimiento.</p>
                  </div>
                ) : (
                  saldos.map(({ nombre, saldo }) => (
                    <div
                      key={nombre}
                      onClick={() => setCajaNombre(nombre)}
                      style={{
                        ...card, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{nombre}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: saldo > 0 ? 'var(--green)' : saldo === 0 ? 'var(--muted)' : 'var(--red)',
                        }}>
                          {saldo >= 0 ? '+' : ''}{formatearMXN(saldo)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>→</span>
                      </div>
                    </div>
                  ))
                )}
              </>
            ) : (
              // ── Detalle de participante ──────────────────────────────────
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
            )}
          </>
        )}

        {/* ── Vista: Nueva quiniela ────────────────────────────────────────── */}
        {vista === 'nueva' && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Nueva quiniela</p>

            <div style={card}>
              <label htmlFor="quiniela-nombre" style={lbl}>Nombre de la quiniela</label>
              <input id="quiniela-nombre" type="text" placeholder="Ej. Jornada 17 — Liga MX" value={nombre} onChange={e => setNombre(e.target.value)} style={{ marginBottom: 12 }} />
              <label htmlFor="quiniela-cierre" style={{ ...lbl, marginBottom: 4 }}>
                Fecha y hora de cierre <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Los jugadores no podrán registrar predicciones después de esta hora.
              </p>
              <input id="quiniela-cierre" type="datetime-local" value={cierre} onChange={e => setCierre(e.target.value)} style={{ borderColor: !cierre ? 'var(--red)' : undefined }} />
            </div>

            {renderFormularioPremio(premioFijo, setPremioFijo, cuota, setCuota, modeloPremio, setModeloPremio)}

            {renderBuscadorFixtures(agregarSeleccionados)}

            <div style={card}>
              <label style={lbl}>Partidos</label>
              {partidos.map((p, i) => (
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
                    <input placeholder="Equipo local"     value={p.local}     onChange={e => actualizarPartido(i, 'local', e.target.value)} />
                    <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>VS</span>
                    <input placeholder="Equipo visitante" value={p.visitante} onChange={e => actualizarPartido(i, 'visitante', e.target.value)} />
                  </div>
                  <input type="datetime-local" value={p.hora} onChange={e => actualizarPartido(i, 'hora', e.target.value)} />
                </div>
              ))}
              <button
                onClick={agregarPartido}
                style={{ width: '100%', padding: '10px', border: '1.5px dashed var(--border-strong)', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}
              >
                + Agregar partido manualmente
              </button>
            </div>

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

              {!estaCerrada && (() => {
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

                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: sincrMsg.startsWith('✓') ? 'var(--green)' : sincrMsg.startsWith('⚠') ? 'var(--yellow)' : 'var(--muted)' }}>
                      {sincrMsg || (guardadoRes ? '✓ Ranking actualizado' : '')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                      <button
                        onClick={sincronizarDesdeESPN} disabled={sincronizando}
                        aria-label="Sincronizar resultados desde ESPN"
                        style={{ ...greenCtaStyle(sincronizando), display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {sincronizando ? 'Sincronizando…' : '⚡ Sincronizar ESPN'}
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
                    </div>
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
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                        {esTipoBote
                          ? 'Marca ✓ cuando recibas el comprobante. Eliminar quita al jugador del ranking.'
                          : 'Al eliminar una predicción el jugador podrá volver a registrarse con su nombre.'}
                      </p>
                      {listaPredicciones.map((pred, i) => {
                        const fecha = pred.fecha
                          ? new Date(pred.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'
                        const nPicks = Object.keys(pred.picks ?? {}).length
                        const yaPagado = pagados.includes(pred.id)
                        const togglingEste = togglingPago === pred.id
                        return (
                          <div
                            key={pred.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                              padding: '10px 0',
                              borderBottom: i < listaPredicciones.length - 1 ? '1px solid var(--border)' : 'none',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {pred.nombre}
                              </p>
                              <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {nPicks} pick{nPicks !== 1 ? 's' : ''} · {fecha}
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
                      })}
                    </>
                    )
                  })()}
                </div>
              )}

              {/* Tab: Editar */}
              {tab === 'editar' && (
                <>
                  <div style={card}>
                    <label htmlFor="edit-nombre" style={lbl}>Nombre de la quiniela</label>
                    <input id="edit-nombre" type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre de la quiniela" />
                  </div>

                  <div style={card}>
                    <label htmlFor="edit-cierre" style={{ ...lbl, marginBottom: 4 }}>
                      Fecha y hora de cierre <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                      Los jugadores no podrán registrar predicciones después de esta hora.
                    </p>
                    <input id="edit-cierre" type="datetime-local" value={editCierre} onChange={e => setEditCierre(e.target.value)} style={{ borderColor: !editCierre ? 'var(--red)' : undefined }} />
                  </div>

                  {renderFormularioPremio(editPremioFijo, setEditPremioFijo, editCuota, setEditCuota, editModeloPremio, setEditModeloPremio)}

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
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < editPartidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          {bloqueado && (
                            <span aria-label="Partido fijo" title="No editable: ya hay predicciones" style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>🔒</span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                            <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                            {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                            <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                          </div>
                          {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{formatFixtureDate(p.hora)}</span>}
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
                    })}
                    {editPartidos.length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>Sin partidos. Agrega desde el buscador o manualmente.</p>
                    )}
                    <button
                      onClick={() => setEditPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])}
                      style={{ width: '100%', padding: '10px', border: '1.5px dashed var(--border-strong)', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 600, marginTop: 10 }}
                    >
                      + Agregar partido manualmente
                    </button>
                  </div>

                  {renderBuscadorFixtures(agregarSeleccionadosAEdicion)}

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
              {validandoEspn ? ' Validando con ESPN…' : ''}
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
                        ⚠️ ESPN reporta <strong>{espnTexto}</strong>. ¿Es correcto tu valor?
                      </p>
                    )}
                    {!divergente && espnTexto && espnTexto === tuValor && (
                      <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>
                        ✓ Coincide con ESPN
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
function QuinielaCard({ q, conteos, onGestionar }) {
  const cerrada = esCerradaQ(q)
  const enJuego = cerrada && !esFinalizadaQ(q)
  const n = conteos[q.id] ?? 0
  const esTipoBote = (Number(q.cuota) > 0) || q.tipoPremio === TIPO_PREMIO.BOTE
  const pagosPendientes = esTipoBote ? Math.max(0, n - (q.pagados ?? []).length) : 0

  const badge = enJuego
    ? { label: 'Jugándose', bg: 'var(--yellow-bg)', color: 'var(--yellow)' }
    : cerrada
      ? { label: 'Finalizada', bg: 'var(--neutral-bg)', color: 'var(--muted)' }
      : { label: 'Activa', bg: 'var(--green-bg)', color: 'var(--green)' }

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: 10,
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {q.nombre}
          </p>
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
        </div>
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
