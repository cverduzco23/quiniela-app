import { useState, useEffect } from 'react'
import { collection, addDoc, doc, updateDoc, getDocs, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase'
import { cierreToDate, cierreToInputValue, inputValueACierre, quinielaCerrada } from '../utils/cierre'

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
]

function goalsToResultado(local, visitante) {
  const l = parseInt(local), v = parseInt(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

const esCerradaQ = quinielaCerrada

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

  const salir = () => signOut(auth)

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

  // ─── Resultados ───────────────────────────────────────────────────────────
  const [resultados, setResultados]       = useState({})
  const [guardandoRes, setGuardandoRes]   = useState(false)
  const [guardadoRes, setGuardadoRes]     = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincrMsg, setSincrMsg]           = useState('')

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
  const [editCierre, setEditCierre]             = useState('')
  const [conteoPredicciones, setConteoPredicciones] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [deleteConfirm, setDeleteConfirm]       = useState('')
  const [eliminando, setEliminando]             = useState(false)

  // ─── Cerrar / reabrir ─────────────────────────────────────────────────────
  const [toggling, setToggling] = useState(false)

  // ─── Lista de predicciones individuales ──────────────────────────────────
  const [listaPredicciones, setListaPredicciones]       = useState([])
  const [loadingPredicciones, setLoadingPredicciones]   = useState(false)
  const [eliminandoPred, setEliminandoPred]             = useState(null)

  // ─── Compartir ───────────────────────────────────────────────────────────
  const [copiado, setCopiado] = useState(null)

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
    setEditCierre(cierreToInputValue(quinielaActual.cierre))
    setFixtures([]); setSeleccionados([])
    setConteoPredicciones(null)
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      .then(snap => setConteoPredicciones(snap.size))
      .catch(() => setConteoPredicciones(0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, quinielaActual?.id])

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
    setGuardandoEdicion(true)
    try {
      const cierreTs = inputValueACierre(editCierre)
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), {
        nombre:   editNombre.trim(),
        partidos: editPartidos,
        cierre:   cierreTs,
      })
      const actualizado = { ...quinielaActual, nombre: editNombre.trim(), partidos: editPartidos, cierre: cierreTs }
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
  const guardarNuevaQuiniela = async () => {
    if (!nombre.trim()) return alert('Ponle un nombre a la quiniela')
    if (!cierre) return alert('La fecha y hora de cierre es obligatoria')
    if (partidos.length === 0) return alert('Agrega al menos un partido')
    if (partidos.some(p => !p.local.trim() || !p.visitante.trim())) return alert('Completa nombre de equipos en todos los partidos')
    setGuardando(true)
    try {
      const cierreTs = inputValueACierre(cierre)
      const creada   = new Date().toISOString()
      const ref = await addDoc(collection(db, 'quinielas'), {
        nombre: nombre.trim(), cierre: cierreTs, partidos,
        resultados: {}, creada, cerrada: false,
      })
      const nueva = { id: ref.id, nombre: nombre.trim(), cierre: cierreTs, partidos, resultados: {}, creada, cerrada: false }
      setQuinielaActual(nueva)
      setResultados({})
      setVista('gestionar')
      setTab('compartir')
      cargarQuinielas()
      setNombre(''); setCierre(''); setPartidos([{ local: '', visitante: '', hora: '' }])
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
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { resultados: resGuardar })
      setGuardadoRes(true)
      setTimeout(() => setGuardadoRes(false), 3000)
      setQuinielaActual(prev => ({ ...prev, resultados: resGuardar }))
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, resultados: resGuardar } : q))
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
        await updateDoc(doc(db, 'quinielas', quinielaActual.id), { resultados: resGuardar })
        setResultados(resGuardar)
        setQuinielaActual(prev => ({ ...prev, resultados: resGuardar }))
        setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? { ...q, resultados: resGuardar } : q))
        setSincrMsg(`✓ ${actualizados} partido${actualizados !== 1 ? 's' : ''} sincronizado${actualizados !== 1 ? 's' : ''}`)
        setTimeout(() => setSincrMsg(''), 4000)
      } catch { setSincrMsg('⚠ Error al guardar. Intenta de nuevo.') }
    } else {
      setSincrMsg('Sin partidos terminados para sincronizar.')
      setTimeout(() => setSincrMsg(''), 4000)
    }

    setSincronizando(false)
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
  const quinielasActivas  = quinielas.filter(q => !esCerradaQ(q))
  const quinielasCerradas = quinielas.filter(q => esCerradaQ(q))

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
                onClick={() => { setVista('lista'); setQuinielaActual(null); setFixtures([]); setSeleccionados([]) }}
                style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                ← Lista
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
              <button onClick={() => setVista('nueva')} style={{ ...greenCtaStyle(false), padding: '9px 18px' }}>
                + Nueva quiniela
              </button>
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

                {quinielasCerradas.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: quinielasActivas.length > 0 ? 16 : 0 }}>
                      Cerradas
                    </p>
                    {quinielasCerradas.map(q => (
                      <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} />
                    ))}
                  </>
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
                        onClick={guardarResultados} disabled={guardandoRes}
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
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                        Al eliminar una predicción el jugador podrá volver a registrarse con su nombre.
                      </p>
                      {listaPredicciones.map((pred, i) => {
                        const fecha = pred.fecha
                          ? new Date(pred.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'
                        const nPicks = Object.keys(pred.picks ?? {}).length
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
                            <button
                              onClick={() => eliminarPrediccion(pred)}
                              disabled={eliminandoPred === pred.id}
                              style={{
                                background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)',
                                fontSize: 12, fontWeight: 600, padding: '5px 12px',
                                borderRadius: 'var(--radius-sm)', cursor: eliminandoPred === pred.id ? 'not-allowed' : 'pointer',
                                opacity: eliminandoPred === pred.id ? 0.5 : 1,
                                flexShrink: 0,
                              }}
                            >
                              {eliminandoPred === pred.id ? '…' : 'Eliminar'}
                            </button>
                          </div>
                        )
                      })}
                    </>
                  )}
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

                  <div style={card}>
                    <label style={{ ...lbl, marginBottom: 14 }}>Partidos</label>
                    {conteoPredicciones > 0 && (
                      <div style={{ background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--yellow-soft)' }}>
                        ⚠️ Hay {conteoPredicciones} predicción(es) registrada(s). Solo agregues partidos al final, no reordenes ni elimines.
                      </div>
                    )}
                    {editPartidos.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < editPartidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                          <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                          {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                          <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                        </div>
                        {p.hora && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{formatFixtureDate(p.hora)}</span>}
                      </div>
                    ))}
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
    </div>
  )
}

// ─── Componente de card de quiniela en la lista ───────────────────────────────
function QuinielaCard({ q, conteos, onGestionar }) {
  const cerrada = esCerradaQ(q)
  const n = conteos[q.id] ?? 0

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
            background: cerrada ? 'var(--neutral-bg)' : 'var(--green-bg)',
            color: cerrada ? 'var(--muted)' : 'var(--green)',
          }}>
            {cerrada ? 'Cerrada' : 'Activa'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          {q.partidos?.length ?? 0} partidos · {n} {n === 1 ? 'participante' : 'participantes'}
        </p>
      </div>
      <button onClick={() => onGestionar(q)} style={{ ...greenCtaStyle(false), whiteSpace: 'nowrap', flexShrink: 0 }}>
        Gestionar
      </button>
    </div>
  )
}
