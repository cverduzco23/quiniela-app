import { useState, useEffect } from 'react'
import { collection, addDoc, doc, updateDoc, getDocs, deleteDoc, query, orderBy, where } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase'

// Slugs de la API pública de ESPN (sin API key)
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

function formatFecha(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function formatFixtureDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const card = { background: '#fff', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }
const lbl = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }
const btn = (bg, disabled) => ({
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: disabled ? '#D1D5DB' : bg, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  letterSpacing: 0.2,
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

  // ─── Formulario nueva quiniela ────────────────────────────────────────────
  const [nombre, setNombre]   = useState('')
  const [cierre, setCierre]   = useState('')
  const [partidos, setPartidos] = useState([{ local: '', visitante: '', hora: '' }])
  const [guardando, setGuardando] = useState(false)

  // ─── Resultados ───────────────────────────────────────────────────────────
  const [resultados, setResultados]       = useState({})
  const [guardandoRes, setGuardandoRes]   = useState(false)
  const [guardadoRes, setGuardadoRes]     = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincrMsg, setSincrMsg]           = useState('')

  // ─── Buscador de partidos (TheSportsDB) ──────────────────────────────────
  const [ligaId, setLigaId]               = useState('')
  const [fixtures, setFixtures]           = useState([])
  const [loadingFixtures, setLoadingFixtures] = useState(false)
  const [errorFixtures, setErrorFixtures] = useState(null)
  const [seleccionados, setSeleccionados] = useState([])
  const [buscarPasados, setBuscarPasados] = useState(false)

  // ─── Edición de quiniela existente ───────────────────────────────────────
  const [editPartidos, setEditPartidos]         = useState([])
  const [editCierre, setEditCierre]             = useState('')
  const [conteoPredicciones, setConteoPredicciones] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [deleteConfirm, setDeleteConfirm]       = useState('')
  const [eliminando, setEliminando]             = useState(false)

  useEffect(() => { if (autenticado && authListo) cargarQuinielas() }, [autenticado, authListo])

  useEffect(() => {
    if (tab !== 'editar' || !quinielaActual) return
    setEditPartidos([...(quinielaActual.partidos ?? [])])
    setEditCierre(quinielaActual.cierre ?? '')
    setFixtures([]); setSeleccionados([])
    setConteoPredicciones(null)
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      .then(snap => setConteoPredicciones(snap.size))
      .catch(() => setConteoPredicciones(0))
  }, [tab, quinielaActual?.id])

  const cargarQuinielas = async () => {
    setLoadingLista(true)
    try {
      const snap = await getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc')))
      setQuinielas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* silent */ }
    finally { setLoadingLista(false) }
  }

  // ─── CRUD partidos ────────────────────────────────────────────────────────
  const actualizarPartido = (i, campo, valor) =>
    setPartidos(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))
  const agregarPartido = () =>
    setPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])
  const quitarPartido = (i) =>
    setPartidos(prev => prev.filter((_, idx) => idx !== i))

  // ─── Buscador (API pública ESPN — sin API key) ───────────────────────────
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

  const agregarSeleccionados = () => {
    const nuevos = seleccionados.map(f => {
      const comps = f.competitions?.[0]?.competitors ?? []
      const home  = comps.find(c => c.homeAway === 'home')?.team?.displayName ?? ''
      const away  = comps.find(c => c.homeAway === 'away')?.team?.displayName ?? ''
      const toLocalISO = (iso) => {
        if (!iso) return ''
        const d = new Date(iso)
        const pad = n => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      }
      const homeCmp = comps.find(c => c.homeAway === 'home')
      const awayCmp = comps.find(c => c.homeAway === 'away')
      return {
        local:         homeCmp?.team?.displayName ?? '',
        visitante:     awayCmp?.team?.displayName ?? '',
        escudoLocal:   homeCmp?.team?.logo ?? '',
        escudoVisitante: awayCmp?.team?.logo ?? '',
        hora:          toLocalISO(f.date),
        espnId:        f.id,
        ligaId,
      }
    })
    setPartidos(prev => {
      const base = prev.length === 1 && !prev[0].local && !prev[0].visitante ? [] : prev
      return [...base, ...nuevos]
    })
    setSeleccionados([])
    setFixtures([])
  }

  // ─── Edición de quiniela existente ───────────────────────────────────────
  const quitarEditPartido = (i) => {
    if (conteoPredicciones > 0) {
      if (!window.confirm(`Hay ${conteoPredicciones} predicción(es) registrada(s). Eliminar este partido desalineará los picks existentes. ¿Continuar de todas formas?`)) return
    }
    setEditPartidos(prev => prev.filter((_, idx) => idx !== i))
  }

  const agregarSeleccionadosAEdicion = () => {
    const nuevos = seleccionados.map(f => {
      const comps  = f.competitions?.[0]?.competitors ?? []
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
    })
    setEditPartidos(prev => [...prev, ...nuevos])
    setSeleccionados([])
    setFixtures([])
  }

  const eliminarQuiniela = async () => {
    if (!quinielaActual || eliminando) return
    if (!window.confirm(`¿Seguro que deseas eliminar "${quinielaActual.nombre}"? Esta acción no se puede deshacer.`)) return
    if (deleteConfirm.trim() !== quinielaActual.nombre.trim()) return
    setEliminando(true)
    try {
      const predsSnap = await getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      await Promise.all(predsSnap.docs.map(d => deleteDoc(doc(db, 'predicciones', d.id))))
      await deleteDoc(doc(db, 'quinielas', quinielaActual.id))
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

  const guardarEdicion = async () => {
    if (!quinielaActual || guardandoEdicion) return
    if (editPartidos.length === 0) return alert('La quiniela debe tener al menos un partido.')
    setGuardandoEdicion(true)
    try {
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), {
        partidos: editPartidos,
        cierre: editCierre,
      })
      const actualizado = { ...quinielaActual, partidos: editPartidos, cierre: editCierre }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
      setTab('resultados')
    } catch {
      alert('Error al guardar cambios.')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  // ─── Guardar nueva quiniela ───────────────────────────────────────────────
  const guardarNuevaQuiniela = async () => {
    if (!nombre.trim()) return alert('Ponle un nombre a la quiniela')
    if (partidos.length === 0) return alert('Agrega al menos un partido')
    if (partidos.some(p => !p.local.trim() || !p.visitante.trim())) return alert('Completa nombre de equipos en todos los partidos')
    setGuardando(true)
    try {
      const ref = await addDoc(collection(db, 'quinielas'), {
        nombre: nombre.trim(), cierre, partidos,
        resultados: {}, creada: new Date().toISOString(), cerrada: false,
      })
      const nueva = { id: ref.id, nombre: nombre.trim(), cierre, partidos, resultados: {}, creada: new Date().toISOString(), cerrada: false }
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

  // ─── Seleccionar quiniela existente ───────────────────────────────────────
  const gestionarQuiniela = (q) => {
    setQuinielaActual(q)
    const resInit = {}
    Object.entries(q.resultados ?? {}).forEach(([idx, r]) => {
      resInit[idx] = { local: r.local ?? '', visitante: r.visitante ?? '' }
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
        if (String(r.local).trim() !== '' && String(r.visitante).trim() !== '') {
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

  // ─── Sincronizar resultados desde ESPN ───────────────────────────────────
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
        // Busca en la jornada de hoy y también con rango de fechas del partido
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
          const ev = events.find(e => e.id === p.espnId)
          if (!ev) return
          const state = ev.status?.type?.state
          if (state !== 'in' && state !== 'post') return
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
      setSincrMsg('Sin partidos en curso o terminados para sincronizar.')
      setTimeout(() => setSincrMsg(''), 4000)
    }

    setSincronizando(false)
  }

  const linkJugadores = quinielaActual ? `${window.location.origin}/?q=${quinielaActual.id}` : ''
  const linkRanking   = quinielaActual ? `${window.location.origin}/ranking?q=${quinielaActual.id}` : ''
  const copiar = (txt) => navigator.clipboard.writeText(txt)

  // ─── Pantalla de login ────────────────────────────────────────────────────
  if (!authListo) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#6B7280', fontSize: 14 }}>
      Cargando…
    </div>
  )

  if (!autenticado) return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F2942' }}>Panel de Administrador</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>⚽ Quiniela APP</p>
        </div>
        <div style={card}>
          <label style={lbl}>Correo electrónico</label>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 12, borderColor: loginError ? '#EF4444' : undefined }}
          />
          <label style={lbl}>Contraseña</label>
          <input
            type="password"
            placeholder="Tu contraseña"
            value={password}
            onChange={e => { setPassword(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 10, borderColor: loginError ? '#EF4444' : undefined }}
          />
          {loginError && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{loginError}</p>}
          <button onClick={entrar} disabled={loginLoading} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', loginLoading), width: '100%', padding: '12px' }}>
            {loginLoading ? 'Entrando…' : 'Entrar →'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#EEF2F8' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(150deg, #0F2942 0%, #1B5299 100%)', color: '#fff', padding: '2rem 1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 580, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 6, fontWeight: 600 }}>⚽ Quiniela APP</p>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Panel de Administrador</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {vista !== 'lista' && (
              <button
                onClick={() => { setVista('lista'); setQuinielaActual(null); setFixtures([]); setSeleccionados([]) }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                ← Lista
              </button>
            )}
            <button
              onClick={salir}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
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
              <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>Tus quinielas</span>
              <button onClick={() => setVista('nueva')} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', false), padding: '9px 18px' }}>
                + Nueva quiniela
              </button>
            </div>

            {loadingLista ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF', fontSize: 14 }}>Cargando…</div>
            ) : quinielas.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ fontWeight: 600, fontSize: 16, color: '#374151', marginBottom: 8 }}>Sin quinielas todavía</p>
                <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>Crea tu primera quiniela para comenzar.</p>
                <button onClick={() => setVista('nueva')} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', false) }}>
                  Crear ahora →
                </button>
              </div>
            ) : quinielas.map(q => (
              <div key={q.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 15, color: '#111827', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.nombre}
                  </p>
                  <p style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Creada: {formatFecha(q.creada)} · {q.partidos?.length ?? 0} partidos
                  </p>
                </div>
                <button onClick={() => gestionarQuiniela(q)} style={{ ...btn('#1B5299', false), whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Gestionar
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── Vista: Nueva quiniela ────────────────────────────────────────── */}
        {vista === 'nueva' && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 14 }}>Nueva quiniela</p>

            {/* Datos generales */}
            <div style={card}>
              <label style={lbl}>Nombre de la quiniela</label>
              <input type="text" placeholder="Ej. Jornada 17 — Liga MX" value={nombre} onChange={e => setNombre(e.target.value)} style={{ marginBottom: 12 }} />
              <label style={lbl}>Fecha y hora de cierre</label>
              <input type="datetime-local" value={cierre} onChange={e => setCierre(e.target.value)} />
            </div>

            {/* Buscador de partidos */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Buscar partidos</label>
                <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
                  {[{ val: false, label: 'Próximos' }, { val: true, label: 'Pasados' }].map(op => (
                    <button
                      key={String(op.val)}
                      onClick={() => { setBuscarPasados(op.val); setFixtures([]); setSeleccionados([]) }}
                      style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none',
                        borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                        background: buscarPasados === op.val ? '#fff' : 'transparent',
                        color: buscarPasados === op.val ? '#0F2942' : '#9CA3AF',
                        boxShadow: buscarPasados === op.val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de liga + botón buscar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: fixtures.length > 0 ? 12 : 0 }}>
                <select
                  value={ligaId}
                  onChange={e => { setLigaId(e.target.value); setFixtures([]); setSeleccionados([]) }}
                  style={{ fontSize: 14, color: ligaId ? '#111827' : '#9CA3AF' }}
                >
                  <option value="" disabled>Selecciona una liga…</option>
                  {LIGAS.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
                <button
                  onClick={buscarFixtures}
                  disabled={loadingFixtures || !ligaId}
                  style={{ ...btn('#1B5299', loadingFixtures || !ligaId), padding: '9px 16px', whiteSpace: 'nowrap' }}
                >
                  {loadingFixtures ? 'Buscando…' : 'Buscar'}
                </button>
              </div>

              {/* Error */}
              {errorFixtures && (
                <p style={{ fontSize: 12, color: '#EF4444', marginTop: 8, lineHeight: 1.5 }}>{errorFixtures}</p>
              )}

              {/* Lista de fixtures */}
              {fixtures.length > 0 && (
                <>
                  <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 4, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    {fixtures.map((f, i) => {
                      const sel    = seleccionados.some(s => s.id === f.id)
                      const comps  = f.competitions?.[0]?.competitors ?? []
                      const homeCmp = comps.find(c => c.homeAway === 'home')
                      const awayCmp = comps.find(c => c.homeAway === 'away')
                      const home   = homeCmp?.team?.displayName ?? '?'
                      const away   = awayCmp?.team?.displayName ?? '?'
                      const homeLogo = homeCmp?.team?.logo ?? ''
                      const awayLogo = awayCmp?.team?.logo ?? ''
                      const fecha  = f.date ? formatFixtureDate(f.date) : ''
                      return (
                        <div
                          key={f.id}
                          onClick={() => toggleFixture(f)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', cursor: 'pointer',
                            borderBottom: i < fixtures.length - 1 ? '1px solid #F3F4F6' : 'none',
                            background: sel ? '#EBF3FF' : '#fff',
                            transition: 'background 0.1s',
                          }}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: sel ? '2px solid #1B5299' : '2px solid #D1D5DB',
                            background: sel ? '#1B5299' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            {homeLogo && <img src={homeLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{home}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>vs</span>
                            {awayLogo && <img src={awayLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{away}</span>
                          </div>
                          <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{fecha}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Botón agregar seleccionados */}
                  {seleccionados.length > 0 && (
                    <button
                      onClick={agregarSeleccionados}
                      style={{ ...btn('#16A34A', false), width: '100%', marginTop: 10, padding: '11px' }}
                    >
                      + Agregar {seleccionados.length} partido{seleccionados.length !== 1 ? 's' : ''} al formulario
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Partidos manuales */}
            <div style={card}>
              <label style={lbl}>Partidos</label>
              {partidos.map((p, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < partidos.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Partido {i + 1}
                    </span>
                    {partidos.length > 1 && (
                      <button
                        onClick={() => quitarPartido(i)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
                      >
                        Quitar ✕
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input placeholder="Equipo local"     value={p.local}     onChange={e => actualizarPartido(i, 'local', e.target.value)} />
                    <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>VS</span>
                    <input placeholder="Equipo visitante" value={p.visitante} onChange={e => actualizarPartido(i, 'visitante', e.target.value)} />
                  </div>
                  <input type="datetime-local" value={p.hora} onChange={e => actualizarPartido(i, 'hora', e.target.value)} />
                </div>
              ))}
              <button
                onClick={agregarPartido}
                style={{ width: '100%', padding: '10px', border: '1.5px dashed #D1D5DB', background: 'transparent', borderRadius: 10, cursor: 'pointer', color: '#6B7280', fontSize: 13, fontWeight: 500 }}
              >
                + Agregar partido manualmente
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setVista('lista'); setFixtures([]); setSeleccionados([]) }} style={{ ...btn('#6B7280', false) }}>
                Cancelar
              </button>
              <button onClick={guardarNuevaQuiniela} disabled={guardando} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', guardando) }}>
                {guardando ? 'Guardando…' : 'Guardar y continuar →'}
              </button>
            </div>
          </>
        )}

        {/* ── Vista: Gestionar quiniela ────────────────────────────────────── */}
        {vista === 'gestionar' && quinielaActual && (
          <>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{quinielaActual.nombre}</p>
              <p style={{ fontSize: 12, color: '#9CA3AF' }}>{quinielaActual.partidos?.length ?? 0} partidos · Creada {formatFecha(quinielaActual.creada)}</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: '#E5E7EB', borderRadius: 10, padding: 4, marginBottom: 16 }}>
              {[{ key: 'resultados', label: '⚽ Resultados' }, { key: 'editar', label: '✏️ Editar' }, { key: 'compartir', label: '🔗 Compartir' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: 600,
                    border: 'none', borderRadius: 7, cursor: 'pointer',
                    background: tab === t.key ? '#fff' : 'transparent',
                    color: tab === t.key ? '#0F2942' : '#6B7280',
                    boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
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
                    const resultado = goalsToResultado(r.local, r.visitante)
                    const resColor = resultado === 'home'
                      ? { bg: '#DCFCE7', color: '#15803D' }
                      : resultado === 'draw'
                        ? { bg: '#F3F4F6', color: '#4B5563' }
                        : resultado === 'away'
                          ? { bg: '#EBF3FF', color: '#1D4ED8' }
                          : { bg: '#F9FAFB', color: '#9CA3AF' }
                    const resLabel = resultado === 'home' ? 'Local' : resultado === 'draw' ? 'Empate' : resultado === 'away' ? 'Visitante' : 'Pendiente'

                    return (
                      <div key={i} style={{ padding: '12px 0', borderBottom: i < (quinielaActual.partidos?.length ?? 0) - 1 ? '1px solid #F3F4F6' : 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.local || `Local ${i + 1}`}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number" min="0" placeholder="0"
                              value={r.local}
                              onChange={e => setResultados(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), local: e.target.value } }))}
                              style={{ width: 44, textAlign: 'center', padding: '6px 4px', fontSize: 15, fontWeight: 700 }}
                            />
                            <span style={{ color: '#9CA3AF', fontWeight: 700, fontSize: 13 }}>–</span>
                            <input
                              type="number" min="0" placeholder="0"
                              value={r.visitante}
                              onChange={e => setResultados(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), visitante: e.target.value } }))}
                              style={{ width: 44, textAlign: 'center', padding: '6px 4px', fontSize: 15, fontWeight: 700 }}
                            />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.visitante || `Visitante ${i + 1}`}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: resColor.bg, color: resColor.color, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                            {resLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: sincrMsg.startsWith('✓') ? '#16A34A' : sincrMsg.startsWith('⚠') ? '#D97706' : '#6B7280' }}>
                    {sincrMsg || (guardadoRes ? '✓ Ranking actualizado' : '')}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button
                      onClick={sincronizarDesdeESPN}
                      disabled={sincronizando}
                      style={{ ...btn('#16A34A', sincronizando), display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {sincronizando ? 'Sincronizando…' : '⚡ Sincronizar ESPN'}
                    </button>
                    <button onClick={guardarResultados} disabled={guardandoRes} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', guardandoRes) }}>
                      {guardandoRes ? 'Guardando…' : 'Guardar manual'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Tab: Editar */}
            {tab === 'editar' && (
              <>
                {/* Fecha de cierre */}
                <div style={card}>
                  <label style={lbl}>Fecha y hora de cierre</label>
                  <input
                    type="datetime-local"
                    value={editCierre}
                    onChange={e => setEditCierre(e.target.value)}
                  />
                </div>

                {/* Lista de partidos */}
                <div style={card}>
                  <label style={{ ...lbl, marginBottom: 14 }}>Partidos</label>
                  {conteoPredicciones > 0 && (
                    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400E' }}>
                      ⚠️ Hay {conteoPredicciones} predicción(es) registrada(s). Eliminar partidos puede desalinear los picks existentes.
                    </div>
                  )}
                  {editPartidos.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < editPartidos.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        {p.escudoLocal && <img src={p.escudoLocal} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                        <span style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.local}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>vs</span>
                        {p.escudoVisitante && <img src={p.escudoVisitante} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                        <span style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.visitante}</span>
                      </div>
                      {p.hora && <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{formatFixtureDate(p.hora)}</span>}
                      <button
                        onClick={() => quitarEditPartido(i)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}
                      >
                        Quitar ✕
                      </button>
                    </div>
                  ))}
                  {editPartidos.length === 0 && (
                    <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '1rem 0' }}>Sin partidos. Agrega desde el buscador o manualmente.</p>
                  )}
                </div>

                {/* Buscador ESPN para agregar más */}
                <div style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label style={{ ...lbl, marginBottom: 0 }}>Agregar partidos</label>
                    <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
                      {[{ val: false, label: 'Próximos' }, { val: true, label: 'Pasados' }].map(op => (
                        <button key={String(op.val)} onClick={() => { setBuscarPasados(op.val); setFixtures([]); setSeleccionados([]) }}
                          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s', background: buscarPasados === op.val ? '#fff' : 'transparent', color: buscarPasados === op.val ? '#0F2942' : '#9CA3AF', boxShadow: buscarPasados === op.val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: fixtures.length > 0 ? 12 : 0 }}>
                    <select value={ligaId} onChange={e => { setLigaId(e.target.value); setFixtures([]); setSeleccionados([]) }} style={{ fontSize: 14, color: ligaId ? '#111827' : '#9CA3AF' }}>
                      <option value="" disabled>Selecciona una liga…</option>
                      {LIGAS.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                    <button onClick={buscarFixtures} disabled={loadingFixtures || !ligaId} style={{ ...btn('#1B5299', loadingFixtures || !ligaId), padding: '9px 16px', whiteSpace: 'nowrap' }}>
                      {loadingFixtures ? 'Buscando…' : 'Buscar'}
                    </button>
                  </div>
                  {errorFixtures && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{errorFixtures}</p>}
                  {fixtures.length > 0 && (
                    <>
                      <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                        {fixtures.map((f, i) => {
                          const sel = seleccionados.some(s => s.id === f.id)
                          const comps = f.competitions?.[0]?.competitors ?? []
                          const homeCmp = comps.find(c => c.homeAway === 'home')
                          const awayCmp = comps.find(c => c.homeAway === 'away')
                          const home = homeCmp?.team?.displayName ?? '?'
                          const away = awayCmp?.team?.displayName ?? '?'
                          const homeLogo = homeCmp?.team?.logo ?? ''
                          const awayLogo = awayCmp?.team?.logo ?? ''
                          return (
                            <div key={f.id} onClick={() => toggleFixture(f)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: i < fixtures.length - 1 ? '1px solid #F3F4F6' : 'none', background: sel ? '#EBF3FF' : '#fff' }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: sel ? '2px solid #1B5299' : '2px solid #D1D5DB', background: sel ? '#1B5299' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                {homeLogo && <img src={homeLogo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{home}</span>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>vs</span>
                                {awayLogo && <img src={awayLogo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{away}</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{f.date ? formatFixtureDate(f.date) : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                      {seleccionados.length > 0 && (
                        <button onClick={agregarSeleccionadosAEdicion} style={{ ...btn('#16A34A', false), width: '100%', marginTop: 10, padding: '11px' }}>
                          + Agregar {seleccionados.length} partido{seleccionados.length !== 1 ? 's' : ''}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setEditPartidos(prev => [...prev, { local: '', visitante: '', hora: '' }])}
                    style={{ width: '100%', padding: '10px', border: '1.5px dashed #D1D5DB', background: 'transparent', borderRadius: 10, cursor: 'pointer', color: '#6B7280', fontSize: 13, fontWeight: 500, marginTop: 10 }}
                  >
                    + Agregar partido manualmente
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setTab('resultados'); setFixtures([]); setSeleccionados([]) }} style={{ ...btn('#6B7280', false) }}>
                    Cancelar
                  </button>
                  <button onClick={guardarEdicion} disabled={guardandoEdicion} style={{ ...btn('linear-gradient(135deg, #0F2942, #1B5299)', guardandoEdicion) }}>
                    {guardandoEdicion ? 'Guardando…' : 'Guardar cambios →'}
                  </button>
                </div>

                {/* Zona de peligro */}
                <div style={{ marginTop: 24, border: '1.5px solid #FECACA', borderRadius: 14, padding: '1.1rem 1.25rem' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>Zona de peligro</p>
                  <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>
                    Eliminar la quiniela borrará también todas las predicciones registradas. Esta acción es permanente e irreversible.
                  </p>
                  <label style={{ ...lbl, marginBottom: 6 }}>
                    Escribe el nombre de la quiniela para confirmar
                  </label>
                  <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8, fontStyle: 'italic' }}>
                    "{quinielaActual.nombre}"
                  </p>
                  <input
                    type="text"
                    placeholder="Escribe el nombre exacto…"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    style={{ marginBottom: 10, borderColor: '#FECACA' }}
                  />
                  <button
                    onClick={eliminarQuiniela}
                    disabled={eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()}
                    style={{
                      ...btn('#DC2626', eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()),
                      width: '100%', padding: '11px',
                      background: (eliminando || deleteConfirm.trim() !== quinielaActual.nombre.trim()) ? '#D1D5DB' : '#DC2626',
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
                  { label: 'Link para jugadores', link: linkJugadores, desc: 'Comparte este enlace para que los jugadores ingresen sus predicciones.' },
                  { label: 'Link del ranking',    link: linkRanking,   desc: 'Comparte este enlace para que todos vean el ranking en tiempo real.' },
                ].map(({ label: lbl2, link, desc }) => (
                  <div key={lbl2} style={card}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>{lbl2}</p>
                    <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>{desc}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F3F4F6', borderRadius: 8, padding: '9px 12px' }}>
                      <span style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {link}
                      </span>
                      <button onClick={() => copiar(link)} style={{ fontSize: 12, color: '#1B5299', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Copiar
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
