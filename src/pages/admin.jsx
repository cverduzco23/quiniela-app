import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, deleteDoc, query, orderBy, where, setDoc, serverTimestamp, writeBatch, increment, getCountFromServer } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword, sendEmailVerification, reload, updateProfile, deleteUser } from 'firebase/auth'
import { db, auth, crearUsuarioAislado, generarPasswordTemporal } from '../firebase'
import { CambioPassword } from '../components/CambioPassword'
import { useDialog } from '../components/Dialogs'
import { ComoFunciona } from '../components/ComoFunciona'
import { TourBienvenida } from '../components/TourBienvenida'
import { MedidorPassword } from '../components/MedidorPassword'
import { BrandMark, BrandWordmark } from '../components/Brand'
import { evaluarPassword } from '../utils/password'
import { waLink, MENSAJES_WA, mensajeReporteProblema } from '../utils/whatsapp'
import { cierreToDate, cierreToInputValue, inputValueACierre, quinielaCerrada, quinielaFinalizada, resultadosCompletos, hayPartidoEnVivo } from '../utils/cierre'
import { TIPO_PREMIO, MODELO_PREMIO, calcularBote, tienePremio, formatearMXN } from '../utils/premios'
import { normalizarNombre } from '../utils/nombres'
import { detectarSimilares } from '../utils/duplicados'
import { leerDias, leerQuiniela, leerGlobal, estaExcluido, marcarExcluido } from '../utils/analytics'
import { findEventByTeamsAndDate } from '../utils/espn'
import { EmojiPicker } from '../components/EmojiPicker'

// UIDs con privilegios globales (ver/editar todas las quinielas).
// Mantener sincronizado con `isSuperAdmin()` en firestore.rules.
const SUPER_ADMIN_UIDS = ['w6uc7cHowgM4Pmsya4bUHt1G3Pu2']

function esSuperAdminUid(uid) {
  return !!uid && SUPER_ADMIN_UIDS.includes(uid)
}

// Cuota de quinielas por cuenta (de por vida; solo el super admin resetea el
// contador). Mantener sincronizado con `maxQuinielas()` en firestore.rules.
const MAX_QUINIELAS = 50

// Máximo de partidos por quiniela. Mantener sincronizado con picksValidos()
// en firestore.rules (índices "0".."29"): con más partidos, las reglas
// rechazarían las predicciones de los jugadores.
const MAX_PARTIDOS = 30

// Slugs verificados contra el scoreboard de ESPN. Los torneos solo devuelven
// partidos cuando están en temporada; fuera de temporada el buscador sale vacío
// (es esperado, no es un error). Orden: lo más seguido por la afición mexicana
// primero (Liga MX, El Tri y torneos donde juegan clubes/selección de México).
const LIGAS = [
  // México y selección nacional (El Tri)
  { id: 'mex.1',                 nombre: '🇲🇽 Liga MX' },
  { id: 'mex.2',                 nombre: '🇲🇽 Liga de Expansión MX' },
  { id: 'mex.campeon',           nombre: '🇲🇽 Campeón de Campeones' },
  { id: 'fifa.world',            nombre: '🌍 Mundial 2026' },
  { id: 'fifa.worldq.concacaf',  nombre: '🎟️ Eliminatorias CONCACAF' },
  { id: 'concacaf.gold',         nombre: '🏆 Copa Oro' },
  { id: 'concacaf.nations.league', nombre: '🌎 CONCACAF Nations League' },
  { id: 'conmebol.america',      nombre: '🌎 Copa América' },
  // Torneos de clubes (Liga MX cruzando fronteras)
  { id: 'concacaf.leagues.cup',  nombre: '🤝 Leagues Cup (Liga MX vs MLS)' },
  { id: 'concacaf.champions',    nombre: '🌎 CONCACAF Champions Cup' },
  { id: 'fifa.cwc',              nombre: '🏟️ Mundial de Clubes' },
  { id: 'conmebol.libertadores', nombre: '🏆 Copa Libertadores' },
  { id: 'conmebol.sudamericana', nombre: '🥈 Copa Sudamericana' },
  // Europa: clubes
  { id: 'uefa.champions',        nombre: '⭐ Champions League' },
  { id: 'uefa.europa',           nombre: '🟠 Europa League' },
  { id: 'uefa.europa.conf',      nombre: '🟢 Conference League' },
  // Europa: selecciones
  { id: 'uefa.euro',             nombre: '🇪🇺 Eurocopa' },
  { id: 'uefa.nations',          nombre: '🇪🇺 UEFA Nations League' },
  // Ligas nacionales
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
  // Copas nacionales
  { id: 'eng.fa',                nombre: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 FA Cup' },
  { id: 'esp.copa_del_rey',      nombre: '🇪🇸 Copa del Rey' },
  // Otros
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

function normalizarCodigoAccesoInput(value) {
  return (value ?? '').toUpperCase()
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

const RESULTADOS_SYNC_COOLDOWN_MS = 90 * 1000

function fmtDiaScoreboard(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

async function fetchScoreboardResultados(cache, ligaId, partidos) {
  const fechas = partidos.map(p => p.hora).filter(Boolean).sort()
  let inicio = ''
  if (fechas[0]) {
    const d = new Date(fechas[0])
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() - 1)
      inicio = fmtDiaScoreboard(d)
    }
  }
  const hoy = fmtDiaScoreboard(new Date())
  const url = inicio
    ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${inicio}-${hoy}&limit=100`
    : `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?limit=100`
  if (cache.has(url)) return cache.get(url)
  const promesa = fetch(url)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ESPN ${r.status}`))))
    .then(data => data.events ?? [])
  cache.set(url, promesa)
  return promesa
}

function resultadoDeEventoESPN(ev) {
  const state = ev?.status?.type?.state
  if (state !== 'post') return null
  if (ev.status?.type?.completed === false) return { cancelado: true }
  const comps = ev.competitions?.[0]?.competitors ?? []
  const home = comps.find(c => c.homeAway === 'home')
  const away = comps.find(c => c.homeAway === 'away')
  if (home?.score === undefined || away?.score === undefined) return null
  return { local: home.score, visitante: away.score, resultado: goalsToResultado(home.score, away.score) }
}

async function prepararActualizacionMarcadores(q) {
  const partidos = q?.partidos ?? []
  const resultados = { ...(q?.resultados ?? {}) }
  const ahora = Date.now()
  const porLiga = {}
  let revisados = 0

  partidos.forEach((p, i) => {
    if (!p?.espnId || !p?.ligaId) return
    if (resultadoPartidoListo(resultados[i] ?? resultados[String(i)])) return
    const inicio = new Date(p.hora).getTime()
    if (!p.hora || isNaN(inicio) || inicio > ahora) return
    if (!porLiga[p.ligaId]) porLiga[p.ligaId] = []
    porLiga[p.ligaId].push({ ...p, idx: i })
    revisados++
  })

  if (revisados === 0) {
    return { patch: null, actualizados: 0, idsCorregidos: 0, finalizada: false, revisados }
  }

  const cache = new Map()
  let actualizados = 0
  let idsCorregidos = 0
  let nuevosPartidos = null

  for (const [liga, ps] of Object.entries(porLiga)) {
    const events = await fetchScoreboardResultados(cache, liga, ps)
    ps.forEach(p => {
      let ev = events.find(e => e.id === p.espnId)
      if (!ev) {
        ev = findEventByTeamsAndDate(events, p.local, p.visitante, p.hora)
        if (!ev) return
        if (!nuevosPartidos) nuevosPartidos = partidos.map(x => ({ ...x }))
        nuevosPartidos[p.idx].espnId = ev.id
        idsCorregidos++
      }
      const res = resultadoDeEventoESPN(ev)
      if (!res) return
      resultados[p.idx] = res
      actualizados++
    })
  }

  if (actualizados === 0 && idsCorregidos === 0) {
    return { patch: null, actualizados, idsCorregidos, finalizada: false, revisados }
  }

  const partidosFinales = nuevosPartidos ?? partidos
  const patch = { resultados }
  if (nuevosPartidos) patch.partidos = nuevosPartidos
  const finalizada = !q.finalizada && resultadosCompletos({ partidos: partidosFinales, resultados })
  if (finalizada) {
    patch.finalizada = true
    patch.finalizadaEn = new Date().toISOString()
  }
  return { patch, actualizados, idsCorregidos, finalizada, revisados }
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
function DateTimeWrap({ vacio, texto = 'Elige fecha y hora', children }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      {ES_IOS && vacio && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--muted-soft)', pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <AdminIcon name="calendar" size={15} />{texto}
        </span>
      )}
    </div>
  )
}

function SmoothCollapse({ open, children, className = '', style }) {
  return (
    <div
      className={`admin-smooth-collapse${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden={!open}
    >
      <div className="admin-smooth-collapse-inner">
        {children}
      </div>
    </div>
  )
}

function AdminIcon({ name, size = 14, style, strokeWidth = 2 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'inline-block', flexShrink: 0, ...style },
    'aria-hidden': 'true',
  }
  if (name === 'arrow-left') return <svg {...common}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
  if (name === 'home') return <svg {...common}><path d="m3 10.5 9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
  if (name === 'settings') return <svg {...common}><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.5.6.9 1 1 .34.14.7.2 1.1.2H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></svg>
  if (name === 'wallet') return <svg {...common}><path d="M20 7H5a3 3 0 0 0 0 6h15v7H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h13v3" /><path d="M16 13h.01" /></svg>
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  if (name === 'user') return <svg {...common}><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
  if (name === 'list') return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
  if (name === 'mail') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
  if (name === 'key') return <svg {...common}><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10 13 9-9" /><path d="m15 4 5 5" /><path d="m17 6-2 2" /></svg>
  if (name === 'copy') return <svg {...common}><rect x="9" y="9" width="13" height="13" rx="2" /><rect x="2" y="2" width="13" height="13" rx="2" /></svg>
  if (name === 'message') return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /></svg>
  if (name === 'ball') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z" /><path d="M12 7V3" /><path d="m16 10 4-1.5" /><path d="m14.5 15 2.5 3.5" /><path d="m9.5 15-2.5 3.5" /><path d="M8 10 4 8.5" /></svg>
  if (name === 'trash') return <svg {...common}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
  if (name === 'pause') return <svg {...common}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
  if (name === 'play') return <svg {...common} fill="currentColor" stroke="none"><path d="M8 5v14l11-7-11-7Z" /></svg>
  if (name === 'note') return <svg {...common}><path d="M4 4h16v16H4z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></svg>
  if (name === 'chart') return <svg {...common}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></svg>
  if (name === 'lock') return <svg {...common}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
  if (name === 'building') return <svg {...common}><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" /><path d="M9 21v-5h3v5" /><path d="M8 7h1" /><path d="M12 7h1" /><path d="M8 11h1" /><path d="M12 11h1" /><path d="M3 21h18" /></svg>
  if (name === 'external') return <svg {...common}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
  if (name === 'logout') return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
  if (name === 'device-mobile') return <svg {...common}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M12 18h.01" /></svg>
  if (name === 'monitor') return <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
  if (name === 'eye') return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  if (name === 'info') return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (name === 'trending-up') return <svg {...common}><path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
  if (name === 'pencil') return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
  if (name === 'link') return <svg {...common}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>
  if (name === 'bolt') return <svg {...common} fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
  if (name === 'calendar') return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
  if (name === 'eye-off') return <svg {...common}><path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10 7 10 7a14 14 0 0 1-2.6 3.3" /><path d="M6.6 6.6A14 14 0 0 0 2 11s3.5 7 10 7a9.3 9.3 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></svg>
  if (name === 'pin') return <svg {...common}><path d="M12 17v5" /><path d="M9 10.8V4h6v6.8a2 2 0 0 0 .6 1.4L18 15H6l2.4-2.8a2 2 0 0 0 .6-1.4Z" /></svg>
  if (name === 'unlock') return <svg {...common}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></svg>
  if (name === 'trophy') return <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v1a3 3 0 0 0 3 3" /><path d="M17 6h3v1a3 3 0 0 1-3 3" /></svg>
  if (name === 'megaphone') return <svg {...common}><path d="m3 11 15-6v14l-15-6Z" /><path d="M3 11v4" /><path d="M8 13v5a2 2 0 0 0 4 0v-3" /></svg>
  if (name === 'check') return <svg {...common}><path d="m20 6-11 11-5-5" /></svg>
  if (name === 'x') return <svg {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  if (name === 'undo') return <svg {...common}><path d="M3 7v6h6" /><path d="M3.5 13a8 8 0 1 1 1.9 5" /></svg>
  if (name === 'banknote') return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01" /><path d="M18 15v.01" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
  if (name === 'chevron-right') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
  if (name === 'chevron-down') return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>
  if (name === 'star') return <svg {...common}><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.4 6.2 21.4l1.1-6.5L2.6 9.8l6.5-.9L12 3Z" /></svg>
  if (name === 'smile') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.4 2 4 2 4-2 4-2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></svg>
  if (name === 'party') return <svg {...common}><path d="m5 19 5.8-15.3 9.5 9.5L5 19Z" /><path d="m8.5 11.5 4 4" /><path d="m13 5 6-2" /><path d="m16 8 4-4" /><path d="M18 11h3" /><path d="M9.5 3.5 11 2" /><path d="M20.5 7.5 22 6" /></svg>
  if (name === 'alert') return <svg {...common}><path d="M12 3 2.5 19.5a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5L12 3Z" /><path d="M12 9v5" /><path d="M12 17.5h.01" /></svg>
  if (name === 'heart') return <svg {...common}><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
}

// Responsive: escritorio (≥960px) vs móvil (<960px)
// Hook simple sobre matchMedia. El rediseño usa un layout ancho con barra lateral
// en escritorio y el patrón móvil (tablero de módulos / pestañas) por debajo.
const BREAKPOINT_ESCRITORIO = 960
function useEsEscritorio() {
  const [esEscritorio, setEsEscritorio] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${BREAKPOINT_ESCRITORIO}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BREAKPOINT_ESCRITORIO}px)`)
    const onChange = e => setEsEscritorio(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return esEscritorio
}

// Iniciales para el avatar (de un correo o nombre). "cverduzco@…" → "CV".
function iniciales(str) {
  if (!str) return 'SA'
  const base = str.includes('@') ? str.split('@')[0] : str
  const partes = base.replace(/[._-]+/g, ' ').trim().split(/\s+/)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

// Barra lateral del Super Admin (solo escritorio ≥960px)
// Navega cambiando `superModulo`. Reusa AdminIcon y BrandMark. Refleja el prototipo
// de escritorio (design_handoff_super_admin_panel): logo · sello SUPER ADMIN ·
// nav agrupada (Gestión / Plataforma) · footer de usuario.
function SidebarSuper({ activo, onNav, counts, email }) {
  const item = (modulo, icon, label, badge) => {
    const on = activo === modulo
    return (
      <button
        onClick={() => onNav(modulo)}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
          padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
          background: on ? 'var(--green-bg)' : 'transparent',
          color: on ? 'var(--green-light)' : 'var(--muted)',
          fontSize: 13, fontWeight: on ? 800 : 600,
        }}
      >
        <AdminIcon name={icon} size={17} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge ? (
          <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--neutral-bg)', color: 'var(--muted)', padding: '2px 7px', borderRadius: 'var(--radius-full)' }}>{badge}</span>
        ) : null}
      </button>
    )
  }
  const group = (t) => (
    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-dim)', padding: '14px 12px 6px' }}>{t}</span>
  )
  return (
    <aside style={{
      width: 256, flex: '0 0 auto', position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100vh', background: '#0E1626', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '22px 16px', overflowY: 'auto',
    }}>
      <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 6px 6px', textDecoration: 'none' }}>
        <BrandMark size={28} />
        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-strong)' }}>
          Quiniel<span style={{ color: 'var(--green)' }}>App</span>
        </span>
      </a>
      <span style={{ alignSelf: 'flex-start', margin: '0 0 16px 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 6, background: 'var(--yellow-bg)', color: 'var(--yellow-soft)' }}>
        SUPER ADMIN
      </span>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {item(null, 'home', 'Inicio')}
        {group('Gestión')}
        {item('clientes', 'users', 'Clientes', counts.clientes)}
        {item('otros', 'user', 'Otros admins', counts.otros)}
        {item('caja', 'wallet', 'Caja global')}
        {item('mis', 'ball', 'Mis quinielas', counts.mis)}
        {group('Plataforma')}
        {item('estadisticas', 'chart', 'Estadísticas')}
        {item('cuenta', 'key', 'Mi cuenta')}
      </nav>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
        <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--yellow), var(--yellow-soft))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#3a2e05' }}>
          {iniciales(email)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email ? email.split('@')[0] : 'Super admin'}
          </p>
          <p style={{ fontSize: 10.5, color: 'var(--yellow-soft)', margin: '1px 0 0' }}>Dueño · super admin</p>
        </div>
      </div>
    </aside>
  )
}

// Barra lateral del panel Cliente (escritorio ≥960px)
function SidebarCliente({ activo, onNav, adminDoc, onSalir }) {
  const item = (tab, icon, label) => {
    const on = activo === tab
    return (
      <button
        onClick={() => onNav(tab)}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
          padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
          background: on ? 'var(--green-bg)' : 'transparent',
          color: on ? 'var(--green-light)' : 'var(--muted)',
          fontSize: 13, fontWeight: on ? 800 : 600,
        }}
      >
        <AdminIcon name={icon} size={17} />
        <span style={{ flex: 1 }}>{label}</span>
      </button>
    )
  }
  return (
    <aside style={{
      width: 248, flex: '0 0 auto', position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100vh', background: '#0E1626', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '22px 16px', overflowY: 'auto',
    }}>
      <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 6px 18px', textDecoration: 'none' }}>
        <BrandWordmark markSize={26} fontSize={18} />
      </a>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {item('inicio', 'home', 'Inicio')}
        {item('quinielas', 'ball', 'Quinielas')}
        {item('caja', 'wallet', 'Caja')}
        {item('stats', 'chart', 'Estadísticas')}
        {item('cuenta', 'key', 'Mi cuenta')}
        {item('soporte', 'message', 'Soporte')}
      </nav>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px' }}>
          <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--green), var(--green-light))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#07120A' }}>
            {iniciales(adminDoc?.nombre || adminDoc?.email)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminDoc?.nombre || 'Mi cuenta'}</p>
          </div>
          <button onClick={onSalir} aria-label="Cerrar sesión" title="Cerrar sesión" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <AdminIcon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}

// Barra de pestañas inferior del panel Cliente (móvil <960px).
// Se oculta al hacer scroll hacia abajo y reaparece al scrollear hacia arriba,
// para recuperar espacio de pantalla ahora que el header superior es fijo.
function TabBarCliente({ activo, onNav }) {
  const [visible, setVisible] = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastY.current
        if (delta > 6 && y > 80) setVisible(false)
        else if (delta < -6 || y <= 80) setVisible(true)
        lastY.current = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const item = (tab, icon, label) => {
    const on = activo === tab
    return (
      <button
        onClick={() => onNav(tab)}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 2px',
          color: on ? 'var(--green)' : 'var(--muted-soft)',
        }}
      >
        <AdminIcon name={icon} size={19} />
        <span style={{ fontSize: 9.5, fontWeight: 700 }}>{label}</span>
      </button>
    )
  }
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      height: 60, background: 'rgba(11,18,32,0.96)', backdropFilter: 'blur(8px)',
      borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'stretch',
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.25s ease',
    }}>
      {item('inicio', 'home', 'Inicio')}
      {item('quinielas', 'ball', 'Quinielas')}
      {item('caja', 'wallet', 'Caja')}
      {item('stats', 'chart', 'Stats')}
      {item('cuenta', 'key', 'Cuenta')}
    </nav>
  )
}

function MobileAdminHeader() {
  return (
    <header className="admin-mobile-topbar">
      <a href="/" className="admin-mobile-brand" aria-label="Volver al Home de QuinielApp">
        <BrandWordmark markSize={26} fontSize={19} />
      </a>
    </header>
  )
}

function formatFecha(value) {
  const d = cierreToDate(value)
  if (!d) return '-'
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

// Traducciones de fases/rondas conocidas. Lo que no se reconozca se muestra tal cual
// viene de ESPN (mejor mostrar algo en inglés que nada).
const FASES_TRADUCIDAS = {
  'group stage':        'Fase de grupos',
  'round of 32':        'Dieciseisavos de final',
  'round of 16':        'Octavos de final',
  'quarterfinal':       'Cuartos de final',
  'quarterfinals':      'Cuartos de final',
  'semifinal':          'Semifinal',
  'semifinals':         'Semifinal',
  'third place':        'Tercer lugar',
  'third place playoff': 'Tercer lugar',
  'bronze final':       'Tercer lugar',
  'final':              'Final',
}

// ESPN trae la fase/grupo del partido en `competition.altGameNote`, con formatos
// distintos según el torneo: "FIFA World Cup, Group A", "UEFA Champions League, Final",
// "WCQ - Concacaf, 2026 FIFA World Cup¤ CONCACAF Qualification - Group C", o solo el
// nombre de la liga ("Liga MX") cuando ESPN no expone fase/jornada para esa competición.
// Devuelve null cuando no hay nada útil que mostrar.
function faseLegible(altGameNote) {
  if (!altGameNote) return null
  // Algunas notas vienen concatenadas con "¤"; nos quedamos con el fragmento más específico (el último).
  const partes = altGameNote.split('¤')
  const seg = partes[partes.length - 1].trim()
  let fase = null
  if (seg.includes(',')) {
    const bits = seg.split(',')
    fase = bits[bits.length - 1].trim()
  } else if (seg.includes(' - ')) {
    const bits = seg.split(' - ')
    fase = bits[bits.length - 1].trim()
  } else if (partes.length > 1) {
    fase = seg
  }
  if (!fase) return null

  const grupo = fase.match(/^Group\s+([A-Z0-9]+)$/i)
  if (grupo) return `Grupo ${grupo[1].toUpperCase()}`

  const traducida = FASES_TRADUCIDAS[fase.toLowerCase()]
  return traducida ?? fase
}

// Margen de seguridad: el cierre se sugiere unos minutos ANTES del primer partido.
const MARGEN_CIERRE_MIN = 5

// Valida que el cierre no quede DESPUÉS del arranque del primer partido: si así fuera,
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

function fechaMs(valor) {
  if (!valor) return 0
  if (typeof valor.toDate === 'function') return valor.toDate().getTime()
  if (typeof valor.toMillis === 'function') return valor.toMillis()
  if (typeof valor.seconds === 'number') return valor.seconds * 1000
  const t = new Date(valor).getTime()
  return Number.isNaN(t) ? 0 : t
}

function fechaCreacionMs(q) {
  return fechaMs(q?.creada)
}

function fechaFinalizadaMs(q) {
  return fechaMs(q?.finalizadaEn) || fechaCreacionMs(q)
}

function resultadoPartidoListo(r) {
  if (!r) return false
  if (r.cancelado) return true
  return String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
}

function resultadosParaUI(resultados = {}) {
  const resInit = {}
  Object.entries(resultados).forEach(([idx, r]) => {
    resInit[idx] = r?.cancelado
      ? { cancelado: true }
      : { local: r.local ?? '', visitante: r.visitante ?? '' }
  })
  return resInit
}

function partidosJugadosCard(q) {
  const resultados = q?.resultados ?? {}
  return (q?.partidos ?? []).reduce((total, _, i) => (
    total + (resultadoPartidoListo(resultados[i] ?? resultados[String(i)]) ? 1 : 0)
  ), 0)
}

function partidosEnVivoCard(q, ahora = Date.now()) {
  const resultados = q?.resultados ?? {}
  const VENTANA = 2.5 * 60 * 60 * 1000
  return (q?.partidos ?? []).reduce((total, p, i) => {
    const r = resultados[i] ?? resultados[String(i)]
    if (resultadoPartidoListo(r) || !p?.hora) return total
    const inicio = new Date(p.hora).getTime()
    if (Number.isNaN(inicio)) return total
    return total + (ahora >= inicio && ahora <= inicio + VENTANA ? 1 : 0)
  }, 0)
}

// Cierre sugerido (valor listo para <input datetime-local>) = primer partido - margen.
// Devuelve '' si ningún partido tiene hora todavía (ej. manuales sin capturar).
function cierreSugerido(partidos) {
  const primera = primeraHoraPartido(partidos)
  if (!primera) return ''
  const d = new Date(primera)
  if (isNaN(d.getTime())) return ''
  return cierreToInputValue(new Date(d.getTime() - MARGEN_CIERRE_MIN * 60 * 1000))
}

// Estilos compartidos
const card = { background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: 10, border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }
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

// Definiciones de cada estadística: qué mide, su alcance y sus excepciones.
// Se muestran al tocar la tarjeta o el icono de info en el panel de estadísticas.
const DEFINICIONES_STATS = {
  visitas:      { t: 'Visitas', d: 'Cada vez que alguien abre el ranking o la página de predicciones de una quiniela. Se cuenta una sola vez por sesión: si refresca o navega dentro de la misma visita, no se suma otra vez. No mide cuánto tiempo se quedan ni los clics, y no incluye la página de inicio. Últimos 7 días.' },
  dispositivos: { t: 'Dispositivos únicos', d: 'Aparatos distintos (celulares o computadoras) que han entrado alguna vez, en total. Se identifican con una marca anónima en el navegador, sin IP ni datos personales. Es aproximado: puede duplicarse si alguien borra el caché, usa modo incógnito, o entra desde otro navegador o aparato.' },
  jugaron:      { t: 'Jugaron', d: 'Cuántas predicciones se enviaron de verdad (llenaron sus marcadores y le dieron enviar). No cuenta solo entrar ni escribir el código de acceso. Si una persona manda dos predicciones, cuentan dos. Últimos 7 días.' },
  conversion:   { t: 'Conversión', d: 'De cada 100 visitas, cuántas terminaron enviando predicción (Jugaron ÷ Visitas). Te dice qué tanto de la gente que entra realmente juega. Es un estimado.' },
  tipo:         { t: 'De dónde entran', d: 'De las visitas, qué porcentaje fue desde celular y qué porcentaje desde computadora (y dentro de celular, iPhone vs Android). Se detecta por el tipo de navegador. Últimos 7 días.' },
  hora:         { t: 'Actividad por hora', d: 'La hora del día (horario de México) en la que se registran más visitas, sumando los últimos 7 días. Útil para saber a qué hora conviene mandar el WhatsApp.' },
  aperturas:    { t: 'Participantes más abiertos', d: 'En una quiniela ya cerrada, cuánta gente abrió las predicciones de cada participante (al tocar su fila en el ranking para ver sus pronósticos). Se cuenta una vez por sesión y participante.' },
  enVivo:       { t: 'Partidos con más conectados en vivo', d: 'Cuántos espectadores estaban viendo el ranking mientras ese partido se jugaba en vivo. Se cuenta una vez por sesión y partido.' },
}

export default function Admin() {
  // Diálogos con diseño propio (reemplazan alert/confirm/prompt nativos).
  const { alerta, confirmar, pedirTexto } = useDialog()
  // Escritorio (≥960px) → barra lateral; móvil → tablero de módulos.
  const esEscritorio = useEsEscritorio()
  // Autenticación
  const [autenticado, setAutenticado] = useState(false)
  const [authListo, setAuthListo]     = useState(false)
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [loginError, setLoginError]   = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Auto-registro de organizadores
  // 'entrar' | 'crear'. El home enlaza con /admin?registro=1 para abrir
  // directo la pestaña de crear cuenta.
  const [modoAuth, setModoAuth] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('registro') ? 'crear' : 'entrar' } catch { return 'entrar' }
  })
  const [correoVerificado, setCorreoVerificado] = useState(false)
  const [regNombre, setRegNombre]   = useState('')
  const [regEmail, setRegEmail]     = useState('')
  const [regP1, setRegP1]           = useState('')
  const [regP2, setRegP2]           = useState('')
  const [regError, setRegError]     = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [reenvioEn, setReenvioEn]   = useState(0)   // cooldown (s) para reenviar verificación
  const [verifMsg, setVerifMsg]     = useState(null) // { tipo: 'ok'|'error', texto }
  const [creandoPerfil, setCreandoPerfil] = useState(false)
  const [errorPerfil, setErrorPerfil]     = useState('') // fallo al crear admins/{uid}

  const [miUid, setMiUid] = useState(null)
  // Doc admins/{uid}: perfil + derechos del cliente. null para el super admin
  // (que no necesita doc) o si aún no se ha cargado.
  const [adminDoc, setAdminDoc] = useState(null)
  const [resetMsg, setResetMsg] = useState('')
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  const [tourAbierto, setTourAbierto] = useState(false)
  // Tip contextual en "Nueva quiniela": se cierra y no vuelve a salir (localStorage).
  const [tipNuevaCerrado, setTipNuevaCerrado] = useState(() => {
    try { return localStorage.getItem('tipNuevaVisto') === '1' } catch { return false }
  })
  const cerrarTipNueva = () => {
    try { localStorage.setItem('tipNuevaVisto', '1') } catch { /* noop */ }
    setTipNuevaCerrado(true)
  }

  // "Mi cuenta" (perfil del cliente)
  const [cuentaNombre, setCuentaNombre]   = useState('')
  const [cuentaTel, setCuentaTel]         = useState('')
  const [guardandoCuenta, setGuardandoCuenta] = useState(false)
  const [cuentaMsg, setCuentaMsg]         = useState(null) // { tipo: 'ok'|'error', texto }
  const [editandoCuentaCampo, setEditandoCuentaCampo] = useState(null) // 'nombre'|'telefono'|null
  // Cambio de contraseña dentro de Mi cuenta.
  const [cuentaP1, setCuentaP1]           = useState('')
  const [cuentaP2, setCuentaP2]           = useState('')
  const [cambiandoPass, setCambiandoPass] = useState(false)
  const [cuentaPassMsg, setCuentaPassMsg] = useState(null)
  // La sección de cambio de contraseña va colapsada por default: solo se
  // despliega cuando el usuario realmente la necesita.
  const [seguridadAbierta, setSeguridadAbierta] = useState(false)
  const [correoCuentaSheetAbierto, setCorreoCuentaSheetAbierto] = useState(false)
  // Auto-eliminación de cuenta (solo clientes): link discreto y confirmación
  // en bottom sheet.
  const [eliminarCuentaAbierta, setEliminarCuentaAbierta] = useState(false)
  const [eliminandoCuenta, setEliminandoCuenta] = useState(false)
  const [eliminarCuentaMsg, setEliminarCuentaMsg] = useState(null) // { tipo, texto }
  // Super admin: mismo botón/UI que el cliente, pero solo informa que la
  // auto-eliminación es exclusiva de cuentas de jugador.
  const [eliminarCuentaSoloUsuariosAbierta, setEliminarCuentaSoloUsuariosAbierta] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setAutenticado(!!user)
      setMiUid(user?.uid ?? null)
      setCorreoVerificado(!!user?.emailVerified)
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
  // ¿Puede crear una quiniela? El super admin siempre; un cliente si está activo.
  // (El gate duro real vive en firestore.rules: adminActivo()). Ya no hay límite de cuota.
  const puedeCrear = soySuper || !!adminDoc?.activo
  const soporteOpciones = ({ framed = true } = {}) => {
    const actionStyle = (primera = false) => framed
      ? { ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', width: '100%' }
      : {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '13px 0',
          border: 'none',
          borderTop: primera ? 'none' : '1px solid var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }
    const labelStyle = { display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }
    const subStyle = { fontSize: 12, color: 'var(--muted)' }
    const soporteLink = waLink(MENSAJES_WA?.soporte || 'Hola, necesito ayuda con mi panel de QuinielApp.')
    const reporteLink = waLink(mensajeReporteProblema({ correo: adminDoc?.email ?? auth.currentUser?.email ?? '' }))

    return (
      <div style={{ display: 'grid', gap: framed ? 10 : 0, maxWidth: framed ? 560 : undefined }}>
        <button type="button" onClick={() => setAyudaAbierta(true)} style={actionStyle(true)}>
          <AdminIcon name="info" size={18} style={{ color: 'var(--green)' }} />
          <span style={{ flex: 1 }}>
            <span style={labelStyle}>Centro de ayuda</span>
            <span style={subStyle}>Cómo funciona la app, paso a paso</span>
          </span>
          <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
        </button>
        <a href={soporteLink} target="_blank" rel="noreferrer" style={{ ...actionStyle(false), textDecoration: 'none' }}>
          <AdminIcon name="message" size={18} style={{ color: '#25D366' }} />
          <span style={{ flex: 1 }}>
            <span style={labelStyle}>Soporte por WhatsApp</span>
            <span style={subStyle}>Escríbenos y te ayudamos</span>
          </span>
          <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
        </a>
        <a href={reporteLink} target="_blank" rel="noreferrer" style={{ ...actionStyle(false), textDecoration: 'none' }}>
          <AdminIcon name="alert" size={18} style={{ color: 'var(--muted)' }} />
          <span style={{ flex: 1 }}>
            <span style={labelStyle}>Reportar un problema</span>
            <span style={subStyle}>¿Algo no funciona? Cuéntanos</span>
          </span>
          <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
        </a>
      </div>
    )
  }

  // Tour de bienvenida: solo la primera vez que un admin entra al panel.
  // El "visto" se guarda en localStorage (sin tocar Firestore ni sus reglas).
  useEffect(() => {
    if (!authListo || !autenticado || debeCambiarPassword || (!soySuper && !adminDoc)) return
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem('tourAdminVisto')) setTourAbierto(true)
    } catch { /* localStorage no disponible: simplemente no se muestra */ }
  }, [authListo, autenticado, soySuper, debeCambiarPassword, adminDoc])
  const cerrarTour = () => {
    try { localStorage.setItem('tourAdminVisto', '1') } catch { /* noop */ }
    setTourAbierto(false)
  }

  // Abre "Mi cuenta" precargando el formulario con los datos actuales.
  const abrirMiCuenta = () => {
    setCuentaNombre(adminDoc?.nombre ?? '')
    setCuentaTel(adminDoc?.telefono ?? '')
    setCuentaMsg(null)
    setCuentaPassMsg(null)
    setEditandoCuentaCampo(null)
    setCorreoCuentaSheetAbierto(false)
    setCuentaP1(''); setCuentaP2('')
    setEliminarCuentaAbierta(false)
    setEliminarCuentaMsg(null)
    setVista('cuenta')
  }

  const cancelarEdicionCuenta = () => {
    setCuentaNombre(adminDoc?.nombre ?? '')
    setCuentaTel(adminDoc?.telefono ?? '')
    setCuentaMsg(null)
    setEditandoCuentaCampo(null)
    setCorreoCuentaSheetAbierto(false)
  }

  // Guarda nombre/teléfono (las reglas congelan activo/correo).
  const guardarMiCuenta = async () => {
    if (!cuentaNombre.trim()) { setCuentaMsg({ tipo: 'error', texto: 'El nombre no puede quedar vacío.' }); return }
    if (!miUid) return
    setGuardandoCuenta(true)
    setCuentaMsg(null)
    const datos = {
      nombre: cuentaNombre.trim(),
      telefono: cuentaTel.trim() || null,
    }
    try {
      const ref = doc(db, 'admins', miUid)
      if (adminDoc || !soySuper) {
        await updateDoc(ref, datos)
      } else {
        await setDoc(ref, {
          ...datos,
          email: auth.currentUser?.email ?? null,
          creado: serverTimestamp(),
        }, { merge: true })
      }
      setAdminDoc(d => ({ id: miUid, ...(d ?? {}), ...datos, email: d?.email ?? auth.currentUser?.email ?? null }))
      setCuentaMsg({ tipo: 'ok', texto: 'Datos guardados.' })
      setEditandoCuentaCampo(null)
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
      setPassword('')
      setResetMsg('')
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

  // Auto-registro de organizadores
  // Crea la cuenta de Firebase Auth y manda el correo de verificación. El doc
  // admins/{uid} se crea DESPUÉS, cuando el correo ya está verificado (las
  // reglas lo exigen); ver crearMiPerfilOrganizador.
  const registrarse = async () => {
    setRegError('')
    const nombre = regNombre.trim()
    const correo = regEmail.trim().toLowerCase()
    if (nombre.length < 2) return setRegError('Escribe tu nombre (mínimo 2 letras).')
    if (nombre.length > 60) return setRegError('El nombre es muy largo (máximo 60 caracteres).')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return setRegError('Ese correo no se ve válido. Revísalo.')
    const v = evaluarPassword(regP1)
    if (!v.ok) return setRegError(v.error)
    if (regP1 !== regP2) return setRegError('Las contraseñas no coinciden.')
    setRegLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, correo, regP1)
      // El nombre viaja en el perfil de Auth (displayName): Firestore aún no
      // nos deja escribir nada hasta que el correo esté verificado.
      try { await updateProfile(cred.user, { displayName: nombre }) } catch { /* no crítico */ }
      try { await sendEmailVerification(cred.user) } catch { /* la pantalla tiene "Reenviar" */ }
      // El listener de auth detecta la sesión y enruta a "Verifica tu correo".
    } catch (e) {
      if (e?.code === 'auth/email-already-in-use') {
        setRegError('Ya existe una cuenta con ese correo. Usa la pestaña Entrar o toca "¿Olvidaste tu contraseña?".')
      } else if (e?.code === 'auth/invalid-email') {
        setRegError('Ese correo no se ve válido. Revísalo.')
      } else if (e?.code === 'auth/weak-password') {
        setRegError('Esa contraseña es muy débil. Usa al menos 8 caracteres con letras y números.')
      } else if (e?.code === 'auth/too-many-requests') {
        setRegError('Demasiados intentos. Espera unos minutos y vuelve a intentar.')
      } else if (e?.code === 'auth/operation-not-allowed') {
        setRegError('El registro no está disponible por el momento. Escríbenos por WhatsApp y te ayudamos.')
      } else {
        setRegError('No se pudo crear la cuenta. Intenta de nuevo.')
      }
    } finally {
      setRegLoading(false)
    }
  }

  // Cooldown del botón "Reenviar correo" (evita spamear a Firebase).
  useEffect(() => {
    if (reenvioEn <= 0) return
    const t = setInterval(() => setReenvioEn(s => (s > 1 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [reenvioEn])

  const reenviarVerificacion = async () => {
    if (reenvioEn > 0 || !auth.currentUser) return
    setVerifMsg(null)
    try {
      await sendEmailVerification(auth.currentUser)
      setVerifMsg({ tipo: 'ok', texto: 'Correo reenviado. Revisa tu bandeja y la carpeta de spam.' })
      setReenvioEn(60)
    } catch (e) {
      if (e?.code === 'auth/too-many-requests') {
        setVerifMsg({ tipo: 'error', texto: 'Demasiados intentos. Espera unos minutos antes de reenviar.' })
        setReenvioEn(60)
      } else {
        setVerifMsg({ tipo: 'error', texto: 'No se pudo reenviar el correo. Intenta de nuevo.' })
      }
    }
  }

  const revisarVerificacion = async () => {
    if (!auth.currentUser) return
    setVerifMsg(null)
    try {
      await reload(auth.currentUser)
      if (auth.currentUser.emailVerified) {
        setCorreoVerificado(true)
      } else {
        setVerifMsg({ tipo: 'error', texto: 'Aún no vemos tu correo verificado. Abre el enlace del correo y vuelve a tocar aquí.' })
      }
    } catch {
      setVerifMsg({ tipo: 'error', texto: 'No se pudo comprobar. Revisa tu conexión e intenta de nuevo.' })
    }
  }

  // Con el correo ya verificado, crea admins/{uid} (activo de inmediato).
  // OJO: el ID token cachea email_verified=false; sin getIdToken(true) las
  // reglas rechazarían el setDoc aunque el correo ya esté verificado.
  const crearMiPerfilOrganizador = async () => {
    const user = auth.currentUser
    if (!user) return
    setCreandoPerfil(true)
    setErrorPerfil('')
    try {
      await user.getIdToken(true)
      // El tope de nombre (≤60) espeja las reglas de Firestore. El teléfono no
      // se pide en el registro (se puede capturar después en Mi cuenta).
      const datos = {
        email: user.email,
        nombre: ((user.displayName || '').trim() || 'Organizador').slice(0, 60).trim(),
        telefono: null,
        activo: true,
        creado: serverTimestamp(),
        quinielasCreadas: 0,
        origen: 'auto',
      }
      await setDoc(doc(db, 'admins', user.uid), datos)
      setAdminDoc({ id: user.uid, ...datos, creado: null })
    } catch (e) {
      // permission-denied cubre también las cuentas vetadas (bloqueados/).
      setErrorPerfil(e?.code === 'permission-denied'
        ? 'No pudimos activar tu cuenta. Si crees que es un error, escríbenos por WhatsApp.'
        : 'No pudimos activar tu cuenta. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setCreandoPerfil(false)
    }
  }

  // Dispara la creación del perfil en cuanto el estado lo permite. Al ser un
  // efecto derivado (y no parte del handler de registro), cubre también al que
  // cerró la pestaña sin verificar y vuelve a entrar días después.
  useEffect(() => {
    if (authListo && autenticado && !soySuper && !adminDoc && correoVerificado && !creandoPerfil && !errorPerfil) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      crearMiPerfilOrganizador()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authListo, autenticado, soySuper, adminDoc, correoVerificado])

  // Clientes (solo super admin)
  const [clientes, setClientes]               = useState([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [ncEmail, setNcEmail]                 = useState('')
  const [ncNombre, setNcNombre]               = useState('')
  const [ncTel, setNcTel]                     = useState('')
  const [creandoCliente, setCreandoCliente]   = useState(false)
  const [eliminandoCliente, setEliminandoCliente] = useState(null) // id del cliente que se está borrando
  const [errorCliente, setErrorCliente]       = useState('')
  // Datos de la cuenta recién creada para entregar por WhatsApp.
  const [clienteCreado, setClienteCreado]     = useState(null) // { email, password, telefono }
  // Usuarios vetados (colección bloqueados/): se muestran aparte con Desbloquear.
  const [bloqueadosLista, setBloqueadosLista] = useState([])
  // Fila de cliente expandida en la tabla de escritorio (muestra sus acciones).
  const [clienteExpandido, setClienteExpandido] = useState(null)

  const cargarClientes = async () => {
    setLoadingClientes(true)
    try {
      const snap = await getDocs(collection(db, 'admins'))
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !esSuperAdminUid(c.id))
      // Más recientes primero (creado puede ser Timestamp o faltar en docs viejos).
      lista.sort((a, b) => {
        const ta = a.creado?.toMillis ? a.creado.toMillis() : 0
        const tb = b.creado?.toMillis ? b.creado.toMillis() : 0
        return tb - ta
      })
      setClientes(lista)
      // Lectura aparte y no-fatal: si falla (p.ej. reglas sin desplegar aún),
      // no debe tirar la lista de clientes que ya cargó bien.
      try {
        const snapBloq = await getDocs(collection(db, 'bloqueados'))
        setBloqueadosLista(snapBloq.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {
        setBloqueadosLista([])
      }
    } catch {
      setClientes([])
      setBloqueadosLista([])
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
      // 2) Perfil del cliente. Sin planes ni cuota: cualquier cliente activo
      // crea quinielas ilimitadas gratis. `activo` sigue siendo el gate de acceso.
      await setDoc(doc(db, 'admins', uid), {
        email,
        nombre,
        telefono: ncTel.trim() || null,
        activo: true,
        debeCambiarPassword: true,
        creado: serverTimestamp(),
        notas: null,
      })
      // 3) Mostrar accesos para entregar por WhatsApp.
      setClienteCreado({ email, password, telefono: ncTel.trim() })
      setNcEmail(''); setNcNombre(''); setNcTel('')
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

  const editarNotasCliente = async (c) => {
    const notas = await pedirTexto(`Notas internas sobre ${c.nombre || c.email}:`, c.notas ?? '')
    if (notas === null) return
    try {
      await updateDoc(doc(db, 'admins', c.id), { notas: notas.trim() || null })
      cargarClientes()
    } catch { alerta('No se pudo guardar la nota.') }
  }

  // Borra al cliente del panel (doc admins/{uid}) SIN vetarlo: si esa persona
  // vuelve a entrar con su cuenta (correo verificado), la app le recrea el
  // perfil automáticamente, y su contador de quinielas arranca de nuevo en 0.
  // Sirve para limpiar cuentas muertas; para frenar a alguien: Pausar o Bloquear.
  // OJO: la cuenta de Firebase Auth NO se puede borrar desde aquí (requiere servidor);
  // hay que eliminarla a mano en la consola de Firebase. Se lo recordamos al super admin.
  const eliminarCliente = async (c) => {
    const aviso =
      `¿Eliminar a ${c.nombre || c.email} del panel?\n\n` +
      `• Desaparecerá de tu lista de clientes.\n` +
      `• Si vuelve a entrar con su cuenta, su perfil se recrea solo (y su contador de quinielas vuelve a 0). Para vetarlo de verdad, usa Bloquear.\n` +
      `• Las quinielas que haya creado NO se borran (siguen visibles para sus participantes).\n` +
      `• La cuenta de acceso (Firebase Auth) NO se borra automáticamente: puedes eliminarla tú en la consola de Firebase → Authentication.`
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

  // Bloquea al cliente: lo elimina del panel Y lo veta (bloqueados/{uid}).
  // Un usuario vetado no puede recrear su perfil aunque entre con su cuenta.
  const bloquearCliente = async (c) => {
    const aviso =
      `¿Bloquear a ${c.nombre || c.email}?\n\n` +
      `• Desaparecerá de tu lista de clientes y quedará VETADO: aunque entre con su cuenta, no podrá volver a activar su perfil ni registrarse de nuevo con ella.\n` +
      `• Las quinielas que haya creado NO se borran (siguen visibles para sus participantes).\n` +
      `• Puedes revertirlo con Desbloquear en la sección de bloqueados.`
    if (!(await confirmar(aviso, { titulo: 'Bloquear cliente', confirmar: 'Bloquear', peligro: true }))) return
    setEliminandoCliente(c.id)
    try {
      // Primero el veto, luego el borrado: si algo falla a medias, el usuario
      // queda vetado con perfil (inofensivo) y no al revés (se recrearía solo).
      await setDoc(doc(db, 'bloqueados', c.id), {
        email: c.email ?? null,
        nombre: c.nombre ?? null,
        creado: serverTimestamp(),
      })
      await deleteDoc(doc(db, 'admins', c.id))
      await cargarClientes()
    } catch {
      alerta('No se pudo bloquear al cliente. Intenta de nuevo.')
    } finally {
      setEliminandoCliente(null)
    }
  }

  const desbloquearCliente = async (b) => {
    if (!(await confirmar(
      `¿Desbloquear a ${b.nombre || b.email || b.id}?\n\nSi entra de nuevo con su cuenta, su perfil se reactiva solo y podrá volver a crear quinielas.`,
      { titulo: 'Desbloquear', confirmar: 'Desbloquear' }
    ))) return
    try {
      await deleteDoc(doc(db, 'bloqueados', b.id))
      await cargarClientes()
    } catch {
      alerta('No se pudo desbloquear. Intenta de nuevo.')
    }
  }

  const salir = async () => {
    if (await confirmar('¿Seguro que quieres cerrar sesión?')) signOut(auth)
  }

  const abrirEliminarCuenta = () => {
    setEliminarCuentaAbierta(true)
    setEliminarCuentaMsg(null)
  }

  const cerrarEliminarCuenta = () => {
    if (eliminandoCuenta) return
    setEliminarCuentaAbierta(false)
    setEliminarCuentaMsg(null)
  }

  // Auto-eliminación de cuenta (solo clientes). Diseño deliberado:
  // 1) Se marca el perfil con eliminada:true: el doc admins/{uid} NO se borra:
  // si el dueño pudiera borrarlo, podría recrearlo al instante y resetear su
  // contador de quinielas (cuota infinita). Huérfano y marcado, el super
  // admin lo limpia cuando quiera desde su lista.
  // 2) Se borra la cuenta de Auth; sus quinielas se conservan para los jugadores.
  const eliminarMiCuenta = async () => {
    const user = auth.currentUser
    if (!user || soySuper || eliminandoCuenta) return
    setEliminandoCuenta(true)
    setEliminarCuentaMsg(null)
    try {
      await updateDoc(doc(db, 'admins', user.uid), { eliminada: true })
      try {
        await deleteUser(user)
        // deleteUser cierra la sesión: onAuthStateChanged nos regresa al login.
      } catch (e) {
        // La cuenta sigue viva: revertimos el marcador para no confundir.
        try { await updateDoc(doc(db, 'admins', user.uid), { eliminada: false }) } catch { /* noop */ }
        if (e?.code === 'auth/requires-recent-login') {
          setEliminarCuentaMsg({ tipo: 'error', texto: 'Por seguridad, cierra sesión, vuelve a entrar y vuelve a intentarlo.' })
          return
        }
        throw e
      }
    } catch {
      setEliminarCuentaMsg({ tipo: 'error', texto: 'No se pudo eliminar la cuenta. Intenta de nuevo o escríbenos por WhatsApp.' })
    } finally {
      setEliminandoCuenta(false)
    }
  }

  // Estado principal
  const [vista, setVista]                 = useState('lista')
  const [superModulo, setSuperModulo]     = useState(null)
  const [busquedaClientesSuper, setBusquedaClientesSuper] = useState('')
  const [filtroMisSuper, setFiltroMisSuper] = useState('todas')
  const [busquedaMisSuper, setBusquedaMisSuper] = useState('')
  // Pestaña activa del panel cliente (nuevo shell escritorio/móvil): inicio | quinielas | caja | stats | cuenta | soporte
  const [clienteTab, setClienteTab]       = useState('inicio')
  const [filtroQuinielasCliente, setFiltroQuinielasCliente] = useState('todas')
  const [busquedaQuinielasCliente, setBusquedaQuinielasCliente] = useState('')
  const filtroQuinielasScrollRef = useRef(null)
  const filtroQuinielasNudgeRef = useRef(false)
  // Estadísticas (analítica propia, solo super admin).
  const [statsDias, setStatsDias]         = useState(null)   // resumen últimos días
  const [statsGlobal, setStatsGlobal]     = useState(null)   // doc analytics/global (dispositivos únicos)
  const [statsCargando, setStatsCargando] = useState(false)
  const [statsQId, setStatsQId]           = useState('')     // quiniela elegida para el detalle
  const [statsQData, setStatsQData]       = useState(null)   // doc analytics/q_<id>
  const [statsQNombres, setStatsQNombres] = useState({})     // prediccionId → nombre
  const [statsQLiveIds, setStatsQLiveIds] = useState(() => new Set()) // espnId de partidos EN VIVO ahora mismo (quiniela elegida)
  const [statsTab, setStatsTab]           = useState('general') // 'general' | 'porQuiniela'
  const [noContarme, setNoContarme]       = useState(false)  // este dispositivo está excluido del conteo
  const [infoStat, setInfoStat]           = useState(null)   // qué definición de métrica está abierta
  const [quinielas, setQuinielas]         = useState([])
  const [loadingLista, setLoadingLista]   = useState(true)
  const [quinielaActual, setQuinielaActual] = useState(null)
  const [tab, setTab]                     = useState('resultados')
  const [conteos, setConteos]             = useState({})
  // Qué grupos de la lista están expandidos (clave → bool), para el "Mostrar más".
  const [verTodo, setVerTodo]             = useState({})
  // Admin seleccionado en la sección "Otros admins" para ver sus quinielas.
  const [adminExpandido, setAdminExpandido] = useState(null)

  // Cargar la lista de clientes para el super admin: en el tab Clientes y también
  // en la lista (para etiquetar de quién es cada quiniela de "otros admins").
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autenticado && authListo && soySuper && vista === 'lista') cargarClientes()
  }, [autenticado, authListo, soySuper, vista])

  // Formulario nueva quiniela
  const [nombre, setNombre]     = useState('')
  const [cierre, setCierre]     = useState('')
  const [partidos, setPartidos] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [premioFijo, setPremioFijo]     = useState('')
  const [cuota, setCuota]               = useState('')
  const [modeloPremio, setModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)
  const [codigoAcceso, setCodigoAcceso] = useState('')

  // Resultados
  const [resultados, setResultados]       = useState({})
  const [sincronizandoResultados, setSincronizandoResultados] = useState(false)
  const [syncResultadosCooldown, setSyncResultadosCooldown]   = useState(false)
  const [syncResultadosMsg, setSyncResultadosMsg]             = useState(null) // { tipo: 'ok'|'info'|'error', texto }
  const syncResultadosCooldownTimer = useRef(null)
  const syncResultadosMsgTimer = useRef(null)

  // Buscador de partidos ESPN
  const [ligaId, setLigaId]               = useState('')
  const [fixtures, setFixtures]           = useState([])
  const [loadingFixtures, setLoadingFixtures] = useState(false)
  const [errorFixtures, setErrorFixtures] = useState(null)
  const [seleccionados, setSeleccionados] = useState([])

  // Edición de quiniela existente
  const [editNombre, setEditNombre]             = useState('')
  const [editPartidos, setEditPartidos]         = useState([])
  const [editPartidosOriginales, setEditPartidosOriginales] = useState(0)
  const [editCierre, setEditCierre]             = useState('')
  const [editPremioFijo, setEditPremioFijo]     = useState('')
  const [editCuota, setEditCuota]               = useState('')
  const [editModeloPremio, setEditModeloPremio] = useState(MODELO_PREMIO.GANADOR_UNICO)
  const [editCodigoAcceso, setEditCodigoAcceso] = useState('')
  const [conteoPredicciones, setConteoPredicciones] = useState(null)
  const [partidosFijosInfo, setPartidosFijosInfo] = useState(false)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [deleteConfirm, setDeleteConfirm]       = useState('')
  const [eliminando, setEliminando]             = useState(false)

  // Cerrar / reabrir
  const [toggling, setToggling] = useState(false)

  // Lista de predicciones individuales
  const [listaPredicciones, setListaPredicciones]       = useState([])
  const [loadingPredicciones, setLoadingPredicciones]   = useState(false)
  const [eliminandoPred, setEliminandoPred]             = useState(null)
  const [togglingPago, setTogglingPago]                 = useState(null)
  const [togglingOculto, setTogglingOculto]             = useState(null)
  const [busquedaParticipante, setBusquedaParticipante] = useState('')

  // Compartir
  const [copiado, setCopiado] = useState(null)

  // Caja
  const [cajaNombre, setCajaNombre]                 = useState(null)
  const [movimientos, setMovimientos]               = useState([])
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)
  const [nuevoTipo, setNuevoTipo]                   = useState('premio')
  const [nuevoMonto, setNuevoMonto]                 = useState('')
  const [nuevaNota, setNuevaNota]                   = useState('')
  const [guardandoMov, setGuardandoMov]             = useState(false)

  // Donativos (registrados por el webhook de Stripe)
  const [donativos, setDonativos]                   = useState([])
  const [loadingDonativos, setLoadingDonativos]     = useState(false)
  const [buscarNombreCaja, setBuscarNombreCaja]     = useState('')
  // Participante seleccionado en el panel "Registrar movimiento" (Caja de escritorio).
  const [cajaMovNombre, setCajaMovNombre]           = useState('')
  // Orden de la lista de saldos en Caja: 'nombre' (A-Z) o 'monto' (mayor a menor).
  const [cajaOrden, setCajaOrden]                   = useState('monto')

  const uidSesionAnterior = useRef(undefined)
  useEffect(() => {
    if (!authListo) return
    const uidActual = miUid ?? null
    if (uidSesionAnterior.current === uidActual) return
    uidSesionAnterior.current = uidActual

    setPassword('')
    setLoginError('')
    setResetMsg('')
    setRegP1('')
    setRegP2('')
    setVerifMsg(null)
    setErrorPerfil('')
    setCuentaMsg(null)
    setCuentaPassMsg(null)
    setCuentaP1('')
    setCuentaP2('')
    setGuardandoCuenta(false)
    setCambiandoPass(false)
    setSeguridadAbierta(false)
    setCorreoCuentaSheetAbierto(false)
    setEditandoCuentaCampo(null)
    setEliminarCuentaAbierta(false)
    setEliminarCuentaMsg(null)
    setEliminandoCuenta(false)
    setVista('lista')
    setSuperModulo(null)
    setClienteTab('inicio')
    setQuinielaActual(null)
    setCajaNombre(null)
  }, [authListo, miUid])

  // Declarado antes de los useEffects que lo usan para evitar la zona muerta temporal
  const cargarQuinielas = async () => {
    setLoadingLista(true)
    try {
      const qSnap = await getDocs(query(collection(db, 'quinielas'), orderBy('creada', 'desc')))
      const lista = qSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Conteos de participantes por AGREGACIÓN (getCountFromServer): 1 lectura
      // por quiniela en lugar de descargar la colección completa de predicciones
      // (hallazgo H1 de la auditoría). Un cliente solo necesita los de SUS quinielas.
      const paraConteo = soySuper ? lista : lista.filter(q => q.ownerUid === miUid)
      const conteoMap = {}
      await Promise.all(paraConteo.map(async q => {
        try {
          const c = await getCountFromServer(query(collection(db, 'predicciones'), where('quinielaId', '==', q.id)))
          conteoMap[q.id] = c.data().count
        } catch { conteoMap[q.id] = 0 }
      }))
      setConteos(conteoMap)
      setQuinielas(lista)
    } catch { /* silent */ }
    finally { setLoadingLista(false) }
  }

  // Corre solo cuando la sesión queda lista; para entonces soySuper/miUid ya
  // tienen su valor final, por eso no van en los deps.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (autenticado && authListo) cargarQuinielas() }, [autenticado, authListo])

  // Estadísticas: carga el resumen (días + total de dispositivos). Se necesita en el
  // tablero de escritorio (superModulo vacío) y en la pestaña Estadísticas del móvil
  // (superModulo === 'estadisticas').
  useEffect(() => {
    if (!soySuper || vista !== 'lista' || (superModulo && superModulo !== 'estadisticas')) return
    let vivo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatsCargando(true)
    Promise.all([leerDias(14), leerGlobal()])
      .then(([d, g]) => { if (vivo) { setStatsDias(d); setStatsGlobal(g) } })
      .catch(() => { if (vivo) { setStatsDias([]); setStatsGlobal({}) } })
      .finally(() => { if (vivo) setStatsCargando(false) })
    return () => { vivo = false }
  }, [soySuper, vista, superModulo])

  // Al entrar al panel, marca este dispositivo como "no contar" la primera vez,
  // para que tus propias visitas no inflen las estadísticas. La decisión se toma
  // una sola vez: si luego lo apagas a mano, se respeta.
  useEffect(() => {
    if (!autenticado) return
    try {
      if (!localStorage.getItem('qpa_excluir_decidido')) {
        marcarExcluido(true)
        localStorage.setItem('qpa_excluir_decidido', '1')
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoContarme(estaExcluido())
  }, [autenticado])

  // Enciende/apaga la exclusión de este dispositivo desde el panel.
  const toggleNoContarme = (valor) => {
    marcarExcluido(valor)
    try { localStorage.setItem('qpa_excluir_decidido', '1') } catch { /* noop */ }
    setNoContarme(valor)
  }

  // Estadísticas: carga el detalle (aperturas / en vivo) de la quiniela elegida.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!statsQId) { setStatsQData(null); setStatsQNombres({}); return }
    if (loadingLista) return
    const puedeVerStatsQ = quinielas.some(q =>
      q.id === statsQId && (((!q.ownerUid && soySuper) || q.ownerUid === miUid))
    )
    if (!puedeVerStatsQ) {
      setStatsQId('')
      setStatsQData(null)
      setStatsQNombres({})
      return
    }
    let vivo = true
    Promise.all([
      leerQuiniela(statsQId),
      getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', statsQId))),
    ]).then(([data, snap]) => {
      if (!vivo) return
      setStatsQData(data)
      const m = {}
      snap.docs.forEach(d => { m[d.id] = d.data().nombre })
      setStatsQNombres(m)
    }).catch(() => { if (vivo) { setStatsQData({}); setStatsQNombres({}) } })
    return () => { vivo = false }
  }, [statsQId, loadingLista, quinielas, soySuper, miUid])

  // Estadísticas: detecta si alguno de los partidos de la quiniela elegida está
  // EN VIVO ahora mismo, para el badge en "Partidos con más conectados en vivo".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!statsQId) { setStatsQLiveIds(new Set()); return }
    const qObj = quinielas.find(q => q.id === statsQId)
    const conEspn = (qObj?.partidos || []).filter(p => p.espnId && p.ligaId)
    if (conEspn.length === 0) { setStatsQLiveIds(new Set()); return }
    let vivo = true
    const porLiga = {}
    conEspn.forEach(p => { (porLiga[p.ligaId] ||= []).push(p) })
    const fmtF = d => d.toISOString().slice(0, 10).replace(/-/g, '')
    const hoyD = new Date()
    const rango = `${fmtF(new Date(hoyD.getTime() - 86400000))}-${fmtF(new Date(hoyD.getTime() + 86400000))}`
    Promise.all(Object.entries(porLiga).map(async ([liga, ps]) => {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/scoreboard?dates=${rango}`)
        const d = await r.json()
        const events = d.events ?? []
        return ps.filter(p => events.find(e => e.id === p.espnId)?.status?.type?.state === 'in').map(p => String(p.espnId))
      } catch { return [] }
    })).then(res => { if (vivo) setStatsQLiveIds(new Set(res.flat())) })
    return () => { vivo = false }
  }, [statsQId, quinielas])

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

  useEffect(() => () => {
    if (syncResultadosCooldownTimer.current) clearTimeout(syncResultadosCooldownTimer.current)
    if (syncResultadosMsgTimer.current) clearTimeout(syncResultadosMsgTimer.current)
  }, [])

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
    setEditCodigoAcceso(normalizarCodigoAccesoInput(quinielaActual.codigoAcceso ?? ''))
    setFixtures([]); setSeleccionados([])
    setConteoPredicciones(null)
    getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaActual.id)))
      .then(snap => setConteoPredicciones(snap.size))
      .catch(() => setConteoPredicciones(0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, quinielaActual?.id])

  // Caja: carga
  const cargarMovimientos = async () => {
    setLoadingMovimientos(true)
    try {
      const snap = await getDocs(query(collection(db, 'movimientos'), orderBy('fecha', 'desc')))
      setMovimientos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* silent */ }
    finally { setLoadingMovimientos(false) }
  }

  useEffect(() => {
    if (autenticado && authListo && (vista === 'caja' || (vista === 'lista' && soySuper))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargarMovimientos()
    }
  }, [autenticado, authListo, vista, soySuper])

  // Donativos: carga
  const cargarDonativos = async () => {
    setLoadingDonativos(true)
    try {
      const snap = await getDocs(query(collection(db, 'donativos'), orderBy('fecha', 'desc')))
      setDonativos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { /* silent */ }
    finally { setLoadingDonativos(false) }
  }

  useEffect(() => {
    if (autenticado && authListo && vista === 'lista' && soySuper) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargarDonativos()
    }
  }, [autenticado, authListo, vista, soySuper])

  // CRUD partidos
  const quitarPartido = (i) =>
    setPartidos(prev => prev.filter((_, idx) => idx !== i))
  // Escudo del equipo, o un círculo con la inicial si es manual (sin logo de ESPN).
  const escudoMini = (url, nombre) => (
    url
      ? <img src={url} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
      : <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--border)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(nombre ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>
  )

  // Buscador ESPN
  const buscarFixtures = async () => {
    setLoadingFixtures(true)
    setErrorFixtures(null)
    setFixtures([])
    setSeleccionados([])

    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
    const hoy = new Date()
    const desde = hoy
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() + 60)

    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${ligaId}/scoreboard?dates=${fmt(desde)}-${fmt(hasta)}&limit=50`
      )
      const data = await res.json()
      const filtrados = (data.events ?? []).filter(e =>
        e.status?.type?.state === 'pre' || !e.status?.type?.state
      )
      if (filtrados.length === 0) {
        setErrorFixtures('No hay partidos próximos disponibles para esta competición.')
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
    let aceptados = await filtrarDuplicados(baseExistente, nuevos)
    const disponibles = MAX_PARTIDOS - baseExistente.length
    if (aceptados.length > disponibles) {
      alerta(
        `Una quiniela puede tener máximo ${MAX_PARTIDOS} partidos.\n\n` +
        (disponibles > 0
          ? `Se agregarán solo los primeros ${disponibles}; los demás se omiten.`
          : 'Ya llegaste al límite: quita algún partido o crea otra quiniela.')
      )
      aceptados = aceptados.slice(0, Math.max(0, disponibles))
    }
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
    let aceptados = await filtrarDuplicados(editPartidos, nuevos)
    const disponibles = MAX_PARTIDOS - editPartidos.length
    if (aceptados.length > disponibles) {
      alerta(
        `Una quiniela puede tener máximo ${MAX_PARTIDOS} partidos.\n\n` +
        (disponibles > 0
          ? `Se agregarán solo los primeros ${disponibles}; los demás se omiten.`
          : 'Ya llegaste al límite: quita algún partido o crea otra quiniela.')
      )
      aceptados = aceptados.slice(0, Math.max(0, disponibles))
    }
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

  // Edición de quiniela existente
  const guardarEdicion = async () => {
    if (!quinielaActual || guardandoEdicion) return
    if (editPartidos.length === 0) return alerta('La quiniela debe tener al menos un partido.')
    if (editPartidos.length > MAX_PARTIDOS) return alerta(`Una quiniela puede tener máximo ${MAX_PARTIDOS} partidos. Quita ${editPartidos.length - MAX_PARTIDOS} para poder guardar.`)
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
    if ((conteoPredicciones ?? 0) > 0 && editPartidos.length !== editPartidosOriginales) {
      return alerta('Ya hay predicciones registradas: la lista de partidos queda fija. Si necesitas otros partidos, crea una quiniela nueva.')
    }
    const { campos: premioFields } = camposPremio(editPremioFijo, editCuota, editModeloPremio)
    setGuardandoEdicion(true)
    try {
      const cierreTs = inputValueACierre(editCierre)
      const codigoLimpio = editCodigoAcceso.trim()
      // El código es obligatorio: es la llave de acceso para los jugadores.
      if (!codigoLimpio) {
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
        codigoAcceso: codigoLimpio,
        codigoAccesoLower: codigoLimpio.toLowerCase(),
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

  // Cerrar / reabrir quiniela
  // ¿El primer partido ya arrancó? Es el punto de no retorno: después de eso
  // ya no tiene sentido reabrir (empiezan los resultados).
  const primerPartidoArranco = (q) => {
    const primera = primeraHoraPartido(q?.partidos)
    if (!primera) return false
    const d = new Date(primera)
    return !isNaN(d.getTime()) && new Date().getTime() >= d.getTime()
  }

  const toggleCerrar = async () => {
    if (!quinielaActual || toggling) return
    const estaCerrada = esCerradaQ(quinielaActual)

    if (estaCerrada) {
      // Reabrir: solo mientras no arranque el primer partido, así nunca
      // entran registros tardíos (los partidos aún no empiezan).
      if (primerPartidoArranco(quinielaActual)) {
        return alerta('Ya no se puede reabrir: el primer partido ya empezó. Si necesitas otra ronda, crea una quiniela nueva.')
      }
      if (!(await confirmar(
        'Vas a REABRIR esta quiniela. La gente podrá volver a registrar predicciones hasta la hora de cierre. ¿Continuar?',
        { titulo: 'Reabrir quiniela', confirmar: 'Reabrir' }
      ))) return
      setToggling(true)
      try {
        // Garantizamos una fecha de cierre válida (futura). Si la actual ya venció
        // (ej. la pusieron mal), la reajustamos sola a 5 min antes del primer partido.
        const cierreActual = cierreToDate(quinielaActual.cierre)
        let nuevoCierre = quinielaActual.cierre ?? null
        if (!cierreActual || cierreActual.getTime() <= new Date().getTime()) {
          const sugerido = cierreSugerido(quinielaActual.partidos)
          nuevoCierre = sugerido ? inputValueACierre(sugerido) : null
        }
        const changes = { cerrada: false, cierre: nuevoCierre }
        await updateDoc(doc(db, 'quinielas', quinielaActual.id), changes)
        const actualizado = { ...quinielaActual, ...changes }
        setQuinielaActual(actualizado)
        setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
      } catch {
        alerta('Error al actualizar el estado.')
      } finally {
        setToggling(false)
      }
      return
    }

    // Cerrar ahora: solo restringe (bloquea registros), nunca es injusto.
    if (!(await confirmar(
      'Vas a CERRAR esta quiniela ahora mismo.\n\n• Nadie podrá registrar predicciones nuevas.\n• El ranking queda fijo con los participantes actuales.\n• Podrás reabrirla mientras no arranque el primer partido.\n\n¿Cerrar ahora?',
      { titulo: 'Cerrar quiniela', confirmar: 'Cerrar quiniela', cancelar: 'Cancelar' }
    ))) return
    setToggling(true)
    try {
      const changes = { cerrada: true }
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

  // Devolver / reactivar bote
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

  // Marcar/desmarcar pago de una predicción
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

  // Ocultar/mostrar una predicción del ranking público
  // No la borra: solo deja de aparecer en /ranking (y de contar para el bote)
  // mientras esté oculta. Se puede alternar en cualquier momento.
  const toggleOculto = async (predId) => {
    if (!quinielaActual || togglingOculto) return
    setTogglingOculto(predId)
    try {
      const ocultosActuales = quinielaActual.ocultos ?? []
      const yaOculto = ocultosActuales.includes(predId)
      const nuevosOcultos = yaOculto
        ? ocultosActuales.filter(id => id !== predId)
        : [...ocultosActuales, predId]
      await updateDoc(doc(db, 'quinielas', quinielaActual.id), { ocultos: nuevosOcultos })
      const actualizado = { ...quinielaActual, ocultos: nuevosOcultos }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === quinielaActual.id ? actualizado : q))
    } catch {
      alerta('Error al actualizar la visibilidad.')
    } finally {
      setTogglingOculto(null)
    }
  }

  // Eliminar predicción individual
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

  // Eliminar quiniela
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

  // Validación de unicidad del código de acceso
  // Evita que dos admins (o el mismo) usen el mismo código en quinielas
  // distintas, porque el buscador en home buscaría por codigoAccesoLower
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
      // Si falla la consulta (red, permisos), NO bloqueamos al admin:
      // mejor permitir guardar y dejar que el conflicto se detecte después
      // que perder su trabajo por un error de red.
      console.error('Error validando código de acceso:', err)
      return false
    }
  }

  // Guardar nueva quiniela
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
    setSuperModulo(null)
    if (!codigoAcceso.trim()) setCodigoAcceso(generarCodigoAcceso())
    setVista('nueva')
  }

  // Crea la quiniela de un cliente respetando la cuota: las reglas exigen que
  // la quiniela N se llame "{uid}-{N}" y venga en el MISMO batch que el
  // incremento +1 del contador quinielasCreadas (así nadie puede saltarse el
  // límite ni con batches manipulados). El super admin no pasa por aquí.
  const crearQuinielaConCuota = async (base, reintento = false) => {
    const adminsRef = doc(db, 'admins', miUid)
    // Lectura fresca: el ID depende del contador real (pudo crear en otro dispositivo).
    const snap = await getDoc(adminsRef)
    const usadas = snap.data()?.quinielasCreadas ?? 0
    if (usadas >= MAX_QUINIELAS) throw Object.assign(new Error('cuota agotada'), { code: 'app/cuota-agotada' })
    const qRef = doc(db, 'quinielas', `${miUid}-${usadas + 1}`)
    const batch = writeBatch(db)
    batch.set(qRef, base)
    batch.update(adminsRef, { quinielasCreadas: increment(1) })
    try {
      await batch.commit()
    } catch (e) {
      // Contador desfasado (otro dispositivo creó en paralelo): un solo reintento con datos frescos.
      if (!reintento && e?.code === 'permission-denied') return crearQuinielaConCuota(base, true)
      throw e
    }
    setAdminDoc(d => (d ? { ...d, quinielasCreadas: usadas + 1 } : d))
    return qRef
  }

  const guardarNuevaQuiniela = async () => {
    // Gate de acceso (defensivo; el gate duro real vive en firestore.rules).
    if (!puedeCrear) return alerta('Tu cuenta no está activa para crear quinielas. Escríbenos si crees que es un error.')
    if (!soySuper && (adminDoc?.quinielasCreadas ?? 0) >= MAX_QUINIELAS) {
      return alerta(`Llegaste al límite de ${MAX_QUINIELAS} quinielas por cuenta. Escríbenos por WhatsApp si necesitas más.`)
    }
    if (!nombre.trim()) return alerta('Ponle un nombre a la quiniela')
    if (!cierre) return alerta('La fecha y hora de cierre es obligatoria')
    if (partidos.length === 0) return alerta('Agrega al menos un partido')
    if (partidos.length > MAX_PARTIDOS) return alerta(`Una quiniela puede tener máximo ${MAX_PARTIDOS} partidos. Quita ${partidos.length - MAX_PARTIDOS} para poder guardar.`)
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
      // El código es obligatorio: es la llave de acceso para los jugadores.
      if (!codigoLimpio) {
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
        codigoAcceso: codigoLimpio,
        codigoAccesoLower: codigoLimpio.toLowerCase(),
        privada: true,
        ...premioFields,
      }
      const ref = soySuper
        ? await addDoc(collection(db, 'quinielas'), base)
        : await crearQuinielaConCuota(base)
      const nueva = { id: ref.id, ...base }
      setQuinielaActual(nueva)
      setResultados({})
      setSuperModulo(null)
      setVista('gestionar')
      setTab('compartir')
      cargarQuinielas()
      setNombre(''); setCierre(''); setPartidos([])
      setPremioFijo(''); setCuota(''); setModeloPremio(MODELO_PREMIO.GANADOR_UNICO)
      setCodigoAcceso('')
      setFixtures([]); setSeleccionados([])
    } catch (e) {
      if (e?.code === 'app/cuota-agotada') {
        alerta(`Llegaste al límite de ${MAX_QUINIELAS} quinielas por cuenta. Escríbenos por WhatsApp si necesitas más.`)
      } else {
        alerta('Error al guardar. Intenta de nuevo.')
      }
    }
    finally { setGuardando(false) }
  }

  // Seleccionar quiniela existente
  const gestionarQuiniela = (q) => {
    // No reseteamos superModulo: así el botón Atrás regresa a la lista del
    // módulo de origen ('mis' / 'otros') en vez de la cuadrícula de secciones.
    setQuinielaActual(q)
    setResultados(resultadosParaUI(q.resultados ?? {}))
    setSyncResultadosMsg(null)
    setTab('resultados')
    setVista('gestionar')
  }

  const mostrarSyncResultadosMsg = (msg, ttl = 4200) => {
    if (syncResultadosMsgTimer.current) clearTimeout(syncResultadosMsgTimer.current)
    setSyncResultadosMsg(msg)
    syncResultadosMsgTimer.current = setTimeout(() => {
      setSyncResultadosMsg(null)
      syncResultadosMsgTimer.current = null
    }, ttl)
  }

  const actualizarMarcadoresAhora = async () => {
    if (!quinielaActual || sincronizandoResultados) return
    if (syncResultadosCooldown) {
      mostrarSyncResultadosMsg({ tipo: 'info', texto: 'Revisado. No hay marcadores nuevos.' })
      return
    }
    setSincronizandoResultados(true)
    if (syncResultadosMsgTimer.current) clearTimeout(syncResultadosMsgTimer.current)
    setSyncResultadosMsg(null)

    try {
      const { patch, actualizados, idsCorregidos, finalizada } = await prepararActualizacionMarcadores(quinielaActual)
      if (!patch) {
        mostrarSyncResultadosMsg({ tipo: 'info', texto: 'Revisado. No hay marcadores nuevos.' })
        return
      }

      await updateDoc(doc(db, 'quinielas', quinielaActual.id), patch)
      const actualizado = { ...quinielaActual, ...patch }
      setQuinielaActual(actualizado)
      setQuinielas(prev => prev.map(q => q.id === actualizado.id ? { ...q, ...patch } : q))
      setResultados(resultadosParaUI(actualizado.resultados ?? {}))

      const partes = []
      if (actualizados > 0) partes.push(`${actualizados} marcador${actualizados !== 1 ? 'es' : ''} actualizado${actualizados !== 1 ? 's' : ''}`)
      if (idsCorregidos > 0) partes.push(`${idsCorregidos} referencia${idsCorregidos !== 1 ? 's' : ''} del partido corregida${idsCorregidos !== 1 ? 's' : ''}`)
      if (finalizada) partes.push('quiniela finalizada')
      mostrarSyncResultadosMsg({ tipo: 'ok', texto: partes.length ? partes.join(' · ') : 'Marcadores actualizados.' })
    } catch {
      mostrarSyncResultadosMsg({ tipo: 'error', texto: 'No se pudieron actualizar los marcadores. Intenta de nuevo en unos minutos.' }, 6500)
    } finally {
      setSincronizandoResultados(false)
      setSyncResultadosCooldown(true)
      if (syncResultadosCooldownTimer.current) clearTimeout(syncResultadosCooldownTimer.current)
      syncResultadosCooldownTimer.current = setTimeout(() => {
        setSyncResultadosCooldown(false)
        syncResultadosCooldownTimer.current = null
      }, RESULTADOS_SYNC_COOLDOWN_MS)
    }
  }

  // Caja: guardar / eliminar
  const guardarMovimiento = async (nombreOverride) => {
    // nombreOverride puede venir de un handler onClick (evento) → solo lo usamos si es string.
    const nombre = (typeof nombreOverride === 'string' && nombreOverride.trim()) ? nombreOverride.trim() : cajaNombre
    if (!nombre || !nuevoMonto || Number(nuevoMonto) <= 0) return
    setGuardandoMov(true)
    try {
      const datos = {
        nombre,
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

  const eliminarParticipanteCaja = async (nombre) => {
    const movsDelParticipante = movimientos.filter(m => m.nombre === nombre)
    if (!movsDelParticipante.length) return
    const plural = movsDelParticipante.length === 1 ? 'movimiento' : 'movimientos'
    if (!(await confirmar(`¿Eliminar a "${nombre}" de Caja? Se borrarán sus ${movsDelParticipante.length} ${plural}.`, { titulo: 'Eliminar participante', confirmar: 'Eliminar', peligro: true }))) return
    try {
      await Promise.all(movsDelParticipante.map(m => deleteDoc(doc(db, 'movimientos', m.id))))
      setMovimientos(prev => prev.filter(m => m.nombre !== nombre))
      if (cajaNombre === nombre) setCajaNombre(null)
      if (cajaMovNombre === nombre) setCajaMovNombre('')
    } catch {
      alerta('Error al eliminar.')
    }
  }

  // Compartir
  const linkJugadores = quinielaActual ? `${window.location.origin}/quiniela/${quinielaActual.id}` : ''
  const linkRanking   = quinielaActual ? `${window.location.origin}/ranking/${quinielaActual.id}` : ''

  const copiar = (txt, key) => {
    navigator.clipboard.writeText(txt)
    setCopiado(key)
    setTimeout(() => setCopiado(null), 2000)
  }

  // Lista helpers
  // Las quinielas se filtran por dueño:
  // - Super admin: ve todas, agrupadas en "Tuyas" + "De otros admins"
  // - Admin normal: solo ve las que él creó (ownerUid == su uid)
  // - Quinielas legacy (sin ownerUid) se consideran del super admin
  const esMia = (q) => (!q.ownerUid && soySuper) || q.ownerUid === miUid
  const subdividirPorEstado = (arr) => ({
    activas:     arr.filter(q => !esCerradaQ(q)),
    enJuego:     arr.filter(q => esCerradaQ(q) && !esFinalizadaQ(q)),
    finalizadas: arr.filter(q => esCerradaQ(q) && esFinalizadaQ(q)),
  })
  const quinielasMias     = quinielas.filter(esMia)
  const quinielasOtras    = soySuper ? quinielas.filter(q => !esMia(q)) : []
  const mias  = subdividirPorEstado(quinielasMias)

  // Mapa uid → doc de admin, para etiquetar de quién es cada quiniela (vista super).
  const adminsPorUid = {}
  clientes.forEach(c => { adminsPorUid[c.id] = c })
  const labelDueno = (q) => {
    if (!q.ownerUid) return null
    const a = adminsPorUid[q.ownerUid]
    if (a) return a.nombre || a.email
    return `Admin (${q.ownerUid.slice(0, 6)}…)`
  }

  // Detección de posibles nombres duplicados (tab Participantes)
  // Heurística estricta: solo marca casos con alta probabilidad real.
  const mapaSimilaresPorNombre = useMemo(
    () => detectarSimilares(listaPredicciones.map(p => p.nombre)),
    [listaPredicciones]
  )

  useEffect(() => {
    const esClienteMobile = !soySuper && !esEscritorio
    if (!autenticado || !authListo || !esClienteMobile || vista !== 'lista' || clienteTab !== 'quinielas') return
    if (filtroQuinielasNudgeRef.current) return

    const row = filtroQuinielasScrollRef.current
    if (!row) return

    const maxScroll = row.scrollWidth - row.clientWidth
    if (maxScroll <= 4) return

    filtroQuinielasNudgeRef.current = true
    let raf = 0
    const t = window.setTimeout(() => {
      const start = row.scrollLeft
      const distance = maxScroll - start
      const duration = 2600
      const startedAt = window.performance.now()
      const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration)
        row.scrollLeft = start + distance * easeInOutCubic(progress)
        if (progress < 1) raf = window.requestAnimationFrame(tick)
      }
      raf = window.requestAnimationFrame(tick)
    }, 420)
    return () => {
      window.clearTimeout(t)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [autenticado, authListo, soySuper, esEscritorio, vista, clienteTab, quinielasMias.length])

  // Caja helpers
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

  // Login
  if (!authListo) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando…
    </div>
  )

  if (!autenticado) return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 20% 0%, rgba(34,197,94,0.16), transparent 40%), radial-gradient(circle at 85% 10%, rgba(250,204,21,0.10), transparent 36%), linear-gradient(135deg, #08111F, #0B1220 55%, #111827)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 18px',
    }}>
      <div style={{ width: '100%', maxWidth: 392 }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13, fontWeight: 750, textDecoration: 'none', marginBottom: 28 }}>
          <AdminIcon name="arrow-left" size={15} />
          Inicio
        </a>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <BrandWordmark markSize={30} fontSize={20} />
        </div>
        <div style={{
          background: 'var(--card)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          padding: '26px 24px',
          boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
        }}>
          {/* Tabs Entrar / Crear cuenta */}
          <div style={{ display: 'flex', gap: 4, background: '#0F1A2C', borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {[['entrar', 'Entrar'], ['crear', 'Crear cuenta']].map(([modo, etiqueta]) => (
              <button
                key={modo}
                onClick={() => { setModoAuth(modo); setLoginError(''); setRegError('') }}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 750,
                  background: modoAuth === modo ? 'var(--card)' : 'transparent',
                  color: modoAuth === modo ? 'var(--text-strong)' : 'var(--muted)',
                  boxShadow: modoAuth === modo ? '0 2px 8px rgba(0,0,0,0.35)' : 'none',
                }}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {modoAuth === 'entrar' ? (<>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, letterSpacing: 0 }}>Entrar al panel</h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 22 }}>Para organizadores de quinielas.</p>
          <label htmlFor="admin-email" style={lbl}>Correo</label>
          <input
            id="admin-email"
            type="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 15, background: '#0F1A2C', borderColor: loginError ? 'var(--red)' : 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          <label htmlFor="admin-password" style={lbl}>Contraseña</label>
          <input
            id="admin-password"
            type="password"
            placeholder="Tu contraseña"
            value={password}
            onChange={e => { setPassword(e.target.value); setLoginError('') }}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            style={{ marginBottom: 9, background: '#0F1A2C', borderColor: loginError ? 'var(--red)' : 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          <button
            onClick={recuperarPassword}
            style={{
              display: 'block',
              marginLeft: 'auto',
              marginBottom: 18,
              padding: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--green-light)',
              fontSize: 12,
              fontWeight: 750,
              cursor: 'pointer',
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
          {loginError && <p style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 12 }}>{loginError}</p>}
          <button onClick={entrar} disabled={loginLoading} style={{ ...greenCtaStyle(loginLoading), width: '100%', padding: '13px', borderRadius: 10 }}>
            {loginLoading ? 'Entrando…' : 'Entrar'}
          </button>
          {resetMsg && (
            <p style={{ fontSize: 12, color: 'var(--green-light)', marginTop: 12, lineHeight: 1.5 }}>
              {resetMsg}
            </p>
          )}
          </>) : (<>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, letterSpacing: 0 }}>Crea tu cuenta</h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 22 }}>
            Gratis. Solo para organizar quinielas: tus jugadores no necesitan cuenta.
          </p>
          <label htmlFor="reg-nombre" style={lbl}>Tu nombre</label>
          <input
            id="reg-nombre"
            type="text"
            placeholder="¿Cómo te llamas?"
            value={regNombre}
            onChange={e => { setRegNombre(e.target.value); setRegError('') }}
            style={{ marginBottom: 15, background: '#0F1A2C', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          <label htmlFor="reg-email" style={lbl}>Correo</label>
          <input
            id="reg-email"
            type="email"
            placeholder="tu@correo.com"
            value={regEmail}
            onChange={e => { setRegEmail(e.target.value); setRegError('') }}
            style={{ marginBottom: 15, background: '#0F1A2C', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          <label htmlFor="reg-p1" style={lbl}>Contraseña</label>
          <input
            id="reg-p1"
            type="password"
            placeholder="Mínimo 8 caracteres, letras y números"
            value={regP1}
            onChange={e => { setRegP1(e.target.value); setRegError('') }}
            style={{ marginBottom: 8, background: '#0F1A2C', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          <div style={{ marginBottom: 15 }}>
            <MedidorPassword pwd={regP1} />
          </div>
          <label htmlFor="reg-p2" style={lbl}>Confirma tu contraseña</label>
          <input
            id="reg-p2"
            type="password"
            placeholder="Escríbela otra vez"
            value={regP2}
            onChange={e => { setRegP2(e.target.value); setRegError('') }}
            onKeyDown={e => e.key === 'Enter' && registrarse()}
            style={{ marginBottom: 18, background: '#0F1A2C', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 9, minHeight: 46 }}
          />
          {regError && <p style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 12 }}>{regError}</p>}
          <button onClick={registrarse} disabled={regLoading} style={{ ...greenCtaStyle(regLoading), width: '100%', padding: '13px', borderRadius: 10 }}>
            {regLoading ? 'Creando cuenta…' : 'Crear mi cuenta'}
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
            Te mandaremos un correo para verificar tu cuenta.
          </p>
          <p className="legal-note">
            Al crear tu cuenta aceptas los <a href="/terminos">Términos y Condiciones</a> y
            el <a href="/privacidad">Aviso de Privacidad</a>.
          </p>
          </>)}
        </div>
      </div>
    </div>
  )

  // Auto-registro: verificar correo / activando cuenta
  // Un usuario con sesión pero SIN doc admins/{uid} (y que no es super admin)
  // está a medio registro: primero verificar el correo, luego el efecto crea
  // su perfil de organizador. Los clientes dados de alta a mano nunca pasan
  // por aquí (su doc ya existe).
  if (!soySuper && !adminDoc) {
    const cardAuth = {
      background: 'var(--card)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 16,
      padding: '26px 24px',
      boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
    }
    const shellAuth = {
      minHeight: '100vh',
      background: 'radial-gradient(circle at 20% 0%, rgba(34,197,94,0.16), transparent 40%), radial-gradient(circle at 85% 10%, rgba(250,204,21,0.10), transparent 36%), linear-gradient(135deg, #08111F, #0B1220 55%, #111827)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 18px',
    }
    const salirBtn = (
      <button
        onClick={salir}
        style={{ display: 'block', margin: '16px auto 0', padding: 0, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}
      >
        Salir
      </button>
    )
    return (
      <div style={shellAuth}>
        <div style={{ width: '100%', maxWidth: 392 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <BrandWordmark markSize={30} fontSize={20} />
          </div>
          {!correoVerificado ? (
            <div style={cardAuth}>
              <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 10 }}>📬</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8, textAlign: 'center' }}>Verifica tu correo</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.55, textAlign: 'center' }}>
                Te enviamos un enlace a<br />
                <strong style={{ color: 'var(--text-strong)' }}>{auth.currentUser?.email}</strong>.<br />
                Ábrelo para activar tu cuenta y regresa aquí.
              </p>
              {verifMsg && (
                <p style={{ fontSize: 12, color: verifMsg.tipo === 'ok' ? 'var(--green-light)' : '#FCA5A5', marginBottom: 12, lineHeight: 1.5, textAlign: 'center' }}>
                  {verifMsg.texto}
                </p>
              )}
              <button onClick={revisarVerificacion} style={{ ...greenCtaStyle(false), width: '100%', padding: '13px', borderRadius: 10, marginBottom: 10 }}>
                Ya verifiqué mi correo
              </button>
              <button
                onClick={reenviarVerificacion}
                disabled={reenvioEn > 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'transparent',
                  color: reenvioEn > 0 ? 'var(--muted)' : 'var(--text-strong)',
                  fontSize: 13,
                  fontWeight: 750,
                  cursor: reenvioEn > 0 ? 'default' : 'pointer',
                }}
              >
                {reenvioEn > 0 ? `Reenviar correo (${reenvioEn}s)` : 'Reenviar correo'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
                ¿No llega? Revisa la carpeta de spam o correo no deseado.
              </p>
              {salirBtn}
            </div>
          ) : (
            <div style={cardAuth}>
              {errorPerfil ? (<>
                <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 10 }}>😕</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8, textAlign: 'center' }}>Algo no salió bien</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.55, textAlign: 'center' }}>{errorPerfil}</p>
                <button
                  onClick={() => { setErrorPerfil(''); crearMiPerfilOrganizador() }}
                  style={{ ...greenCtaStyle(false), width: '100%', padding: '13px', borderRadius: 10, marginBottom: 10 }}
                >
                  Reintentar
                </button>
                <a
                  href={waLink(MENSAJES_WA?.soporte || 'Hola, no puedo activar mi cuenta de QuinielApp.')}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'block', textAlign: 'center', color: 'var(--green-light)', fontSize: 12.5, fontWeight: 750, textDecoration: 'none' }}
                >
                  Escríbenos por WhatsApp
                </a>
                {salirBtn}
              </>) : (<>
                <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 10 }}>⚽</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8, textAlign: 'center' }}>Activando tu cuenta…</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, textAlign: 'center' }}>
                  Un momento, estamos preparando tu panel de organizador.
                </p>
              </>)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Cambio de contraseña obligatorio (primer ingreso del cliente)
  if (debeCambiarPassword) return (
    <CambioPassword
      uid={miUid}
      onListo={() => setAdminDoc(d => (d ? { ...d, debeCambiarPassword: false } : d))}
    />
  )

  // Formulario de premio (reutilizable)
  // Único modelo de premio: "Ganador único" (gana quien más puntos; empate = se reparte).
  const renderFormularioPremio = (fijo, setFijo, cuotaVal, setCuotaVal) => {
    const tienePremioLocal = (Number(fijo) || 0) > 0 || (Number(cuotaVal) || 0) > 0
    return (
      <div style={card}>
        <label style={lbl}>Premio</label>
        <div className="admin-prize-grid" style={{ marginBottom: tienePremioLocal ? 14 : 0 }}>
          <div className="admin-prize-field">
            <label className="admin-prize-field-label" style={lbl}>Premio fijo<span>(MXN)</span></label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 500"
              value={fijo}
              onChange={e => setFijo(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Monto garantizado, independiente de participantes.</p>
          </div>
          <div className="admin-prize-field">
            <label className="admin-prize-field-label" style={lbl}>Cuota por participante<span>(MXN)</span></label>
            <input
              type="number" min="0" step="1" placeholder="Ej. 50"
              value={cuotaVal}
              onChange={e => setCuotaVal(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Se suma al bote por cada participante que pague.</p>
          </div>
        </div>
        {!tienePremioLocal && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>Deja ambos en 0 para una quiniela gratis sin premio, solo por diversión.</p>
        )}

        {tienePremioLocal && (
          <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-soft)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>
              <AdminIcon name="trophy" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /><strong>Gana quien acumule más puntos.</strong> Si dos o más quedan empatados en puntos,
              se reparten el premio en partes iguales.
            </p>
          </div>
        )}
      </div>
    )
  }

  // Buscador de fixtures (reutilizable)
  const renderBuscadorFixtures = (onAgregar) => (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ ...lbl, marginBottom: 0 }}>
          {onAgregar === agregarSeleccionados ? 'Buscar partidos' : 'Agregar partidos'}
        </label>
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
              const fase = faseLegible(f.competitions?.[0]?.altGameNote)
              const faseAnterior = i > 0 ? faseLegible(fixtures[i - 1].competitions?.[0]?.altGameNote) : null
              const mostrarFase = fase && fase !== faseAnterior
              return (
                <div key={f.id}>
                  {mostrarFase && (
                    <div style={{
                      padding: '6px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: 0.6,
                      background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
                    }}>
                      {fase}
                    </div>
                  )}
                  <div
                    onClick={() => toggleFixture(f)}
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {homeLogo && <img src={homeLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0 }}>{home}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0, textAlign: 'right' }}>{away}</span>
                        {awayLogo && <img src={awayLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{f.date ? formatFixtureDate(f.date) : ''}</div>
                    </div>
                  </div>
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

  // Render principal
  // En escritorio (≥960px) el super admin usa barra lateral fija + contenido ancho;
  // en móvil se conserva el patrón actual (hero + tablero de módulos a pantalla completa).
  const superDesktop = soySuper && esEscritorio
  // La barra lateral cambia de módulo y sale de cualquier vista de detalle.
  const navSuper = (modulo) => {
    setVista('lista')
    setQuinielaActual(null)
    setFixtures([])
    setSeleccionados([])
    setCajaNombre(null)
    setSuperModulo(modulo)
  }
  // Cliente: nuevo shell (barra lateral escritorio / pestañas móvil)
  // El super admin en MÓVIL también usa este shell (barra inferior idéntica al
  // admin): así maneja su panel tal cual lo haría un organizador. Solo el super
  // de ESCRITORIO conserva su barra lateral propia (SidebarSuper).
  const clienteShell = !superDesktop
  const clienteDesktop = clienteShell && esEscritorio
  const clienteMobile = clienteShell && !esEscritorio
  // El super móvil ya no tiene "home" ni "módulo" propios: navega por pestañas.
  const superMobileHome = false
  const superMobileModule = false
  // Navegación por pestañas (barra inferior). El super móvil comparte este shell:
  // Inicio/Quinielas se pintan con la rama cliente (diseño admin); Caja/Estadísticas
  // reusan sus módulos ya hechos fijando `superModulo`. Cuenta abre la ficha común.
  const navCliente = (tab) => {
    if (tab === 'cuenta') { abrirMiCuenta() }     // precarga el formulario y pone vista='cuenta'
    else { setVista('lista') }
    setQuinielaActual(null)
    setFixtures([])
    setSeleccionados([])
    setCajaNombre(null)
    if (soySuper) {
      // Caja/Estadísticas del super se renderizan por su módulo; el resto limpia.
      setSuperModulo(tab === 'caja' ? 'caja' : tab === 'stats' ? 'estadisticas' : null)
    }
    setClienteTab(tab)
  }
  return (
    <div style={{ minHeight: '100vh', background: '#070d18', position: 'relative', zIndex: 0, display: (superDesktop || clienteDesktop) ? 'flex' : 'block', alignItems: (superDesktop || clienteDesktop) ? 'stretch' : undefined }}>
      <div className="admin-bg-fade" aria-hidden="true" />
      {superDesktop && (
        <SidebarSuper
          activo={vista === 'lista' ? superModulo : null}
          onNav={navSuper}
          counts={{ clientes: clientes.length || null, otros: quinielasOtras.length || null, mis: quinielasMias.length || null }}
          email={auth.currentUser?.email}
        />
      )}
      {clienteDesktop && (
        <SidebarCliente activo={clienteTab} onNav={navCliente} adminDoc={adminDoc} onSalir={salir} />
      )}
      <div style={{ flex: (superDesktop || clienteDesktop) ? 1 : undefined, minWidth: 0, paddingBottom: clienteMobile ? 68 : undefined }}>
        {clienteMobile && <MobileAdminHeader />}

      {ayudaAbierta && <ComoFunciona onClose={() => setAyudaAbierta(false)} />}
      {tourAbierto && <TourBienvenida onClose={cerrarTour} />}

      <div style={{ maxWidth: superDesktop ? 1200 : clienteDesktop ? 1040 : 580, margin: '0 auto', padding: (superDesktop || clienteDesktop) ? '26px 30px 48px' : (clienteMobile && vista === 'cuenta') ? '30px 20px 90px' : superMobileHome || superMobileModule ? '18px 16px 108px' : '1.25rem 1rem 3rem' }}>

        {/* Vista: Lista */}
        {vista === 'lista' && (
          <>
            {!soySuper && !clienteShell && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={abrirMiCuenta}
                  style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  👤 Mi cuenta
                </button>
                <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false), padding: '9px 18px' }}>
                  + Nueva quiniela
                </button>
              </div>
            </div>}

            {loadingLista ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
            ) : (superDesktop || (soySuper && superModulo)) ? (
              // Super escritorio (dashboard + módulos por sidebar) y super móvil en
              // Caja/Estadísticas (superModulo fijado por la barra inferior).
              (() => {
                const secLabel = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }
                const secCard = { ...card, marginTop: 12, padding: '0.9rem 1.1rem' }
                const inlineIconLabel = (icon, label, color = 'currentColor') => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
                    <AdminIcon name={icon} size={13} />
                    {label}
                  </span>
                )
                // Caja
                const cajaNeto = saldos.reduce((a, s) => a + s.saldo, 0)
                const cajaAFavor = saldos.filter(s => s.saldo > 0).reduce((a, s) => a + s.saldo, 0)
                const cajaPorCobrar = saldos.filter(s => s.saldo < 0).reduce((a, s) => a + s.saldo, 0)
                const filtroCaja = buscarNombreCaja.trim().toLowerCase()
                const saldosFiltrados = filtroCaja ? saldos.filter(s => s.nombre.toLowerCase().includes(filtroCaja)) : saldos
                const kpiCaja = (valor, label, color) => (
                  <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '15px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color, margin: 0, lineHeight: 1 }}>{valor}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, margin: '5px 0 0' }}>{label}</p>
                  </div>
                )
                const tiposMov = [
                  { val: 'premio', label: 'Premio', signo: '+' },
                  { val: 'deposito', label: 'Depósito', signo: '+' },
                  { val: 'inscripcion', label: 'Inscripción', signo: '-' },
                  { val: 'retiro', label: 'Retiro', signo: '-' },
                ]
                const abrirDetalleCaja = (nombre) => {
                  const limpio = normalizarNombre(nombre || '')
                  if (!limpio) return
                  setCajaNombre(limpio)
                  setVista('caja')
                  setBuscarNombreCaja('')
                }
                const abrirNuevoUsuarioCaja = async () => {
                  const inicial = buscarNombreCaja.trim()
                  const nombre = inicial || await pedirTexto(
                    'Nombre del participante:',
                    '',
                    { titulo: 'Nuevo usuario', confirmar: 'Agregar' }
                  )
                  if (nombre === null) return
                  const limpio = normalizarNombre(nombre)
                  if (!limpio) {
                    alerta('Escribe el nombre del participante para agregarlo a Caja.')
                    return
                  }
                  abrirDetalleCaja(limpio)
                }
                const irARegistrarUsuarioCaja = () => {
                  setCajaMovNombre(buscarNombreCaja.trim())
                  document.getElementById('cd-part')?.focus()
                }
                const kpiCajaMobile = (valor, label, color) => (
                  <div className="super-mobile-kpi-card">
                    <div className="super-mobile-kpi-value" style={{ color }}>{valor}</div>
                    <div className="super-mobile-kpi-label">{label}</div>
                  </div>
                )
                const cajaSection = (
                  <div className="super-module-content">
                    <div className="super-mobile-kpi-grid">
                      {kpiCajaMobile(formatearMXN(cajaNeto), 'Saldo neto', 'var(--text-strong)')}
                      {kpiCajaMobile(`+${formatearMXN(cajaAFavor)}`, 'A favor', 'var(--green-light)')}
                      {kpiCajaMobile(formatearMXN(cajaPorCobrar), 'Por cobrar', 'var(--red)')}
                    </div>
                    <div className="super-mobile-toolbar">
                      <div className="super-mobile-search super-mobile-search--line">
                        <AdminIcon name="search" size={15} />
                        <input
                          type="text"
                          placeholder="Nombre del participante…"
                          value={buscarNombreCaja}
                          onChange={e => setBuscarNombreCaja(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') abrirDetalleCaja(buscarNombreCaja)
                          }}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="super-order-row super-order-row--with-action">
                      <label className="super-order-control">
                        Ordenar:
                        <select value={cajaOrden} onChange={e => setCajaOrden(e.target.value)} className="super-order-select" aria-label="Ordenar caja">
                          <option value="monto">Monto</option>
                          <option value="nombre">A-Z</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={abrirNuevoUsuarioCaja}
                        aria-label="Agregar nuevo usuario a Caja"
                        style={{ ...greenCtaStyle(false), padding: '0 16px', height: 42, whiteSpace: 'nowrap', boxShadow: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <AdminIcon name="plus" size={14} /> Agregar usuario
                      </button>
                    </div>
                    {loadingMovimientos ? (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</p>
                    ) : saldosFiltrados.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                        {saldos.length === 0 ? 'Sin movimientos. Busca un participante arriba para registrar el primero.' : 'Sin coincidencias.'}
                      </p>
                    ) : (
                      <div className="super-mobile-card-list">
                        {saldosFiltrados.map(({ nombre, saldo }) => (
                          <div
                            key={nombre}
                            role="button"
                            tabIndex={0}
                            className="super-mobile-card super-balance-row"
                            onClick={() => abrirDetalleCaja(nombre)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalleCaja(nombre) } }}
                          >
                            <span className="super-balance-name">{nombre}</span>
                            <span className="super-balance-amount" style={{ color: saldo > 0 ? 'var(--green)' : saldo === 0 ? 'var(--muted)' : 'var(--red)' }}>
                              {saldo >= 0 ? '+' : ''}{formatearMXN(saldo)}
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); eliminarParticipanteCaja(nombre) }}
                                aria-label={`Eliminar a ${nombre} de Caja`}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
                              >
                                <AdminIcon name="trash" size={14} />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )

                // Caja global (escritorio): KPIs + saldos + registrar
                const cajaDesktop = (
                  <div>
                    <div style={{ marginBottom: 20 }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Caja global</h2>
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>Saldos y movimientos por participante. Herramienta interna.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                      {kpiCaja(formatearMXN(cajaNeto), 'Saldo neto', 'var(--text-strong)')}
                      {kpiCaja(`+${formatearMXN(cajaAFavor)}`, 'A favor', 'var(--green-light)')}
                      {kpiCaja(formatearMXN(cajaPorCobrar), 'Por cobrar', 'var(--red)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
                      {/* Izquierda: saldos */}
                      <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '14px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 10px', height: 36 }}>
                            <AdminIcon name="search" size={14} style={{ color: 'var(--muted)' }} />
                            <input
                              type="text"
                              placeholder="Buscar participante…"
                              value={buscarNombreCaja}
                              onChange={e => setBuscarNombreCaja(e.target.value)}
                              style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, color: 'var(--text)', fontSize: 13 }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={irARegistrarUsuarioCaja}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '0 12px', height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--green)', background: 'var(--green-bg)', color: 'var(--green-light)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <AdminIcon name="plus" size={13} /> Agregar usuario
                          </button>
                          <select value={cajaOrden} onChange={e => setCajaOrden(e.target.value)} style={{ fontSize: 12, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--card-light)', color: 'var(--text)' }}>
                            <option value="monto">Monto</option>
                            <option value="nombre">A-Z</option>
                          </select>
                        </div>
                        {loadingMovimientos ? (
                          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Cargando…</p>
                        ) : saldosFiltrados.length === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>{saldos.length === 0 ? 'Sin movimientos todavía.' : 'Sin coincidencias.'}</p>
                        ) : saldosFiltrados.map(({ nombre, saldo }) => {
                          const sel = cajaMovNombre === nombre
                          return (
                            <div
                              key={nombre}
                              onClick={() => setCajaMovNombre(nombre)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: sel ? 'var(--green-bg)' : 'transparent', borderBottom: '1px solid var(--border)' }}
                            >
                              <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{nombre}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: saldo > 0 ? 'var(--green-light)' : saldo === 0 ? 'var(--muted)' : 'var(--red)' }}>
                                  {saldo >= 0 ? '+' : ''}{formatearMXN(saldo)}
                                </span>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); eliminarParticipanteCaja(nombre) }}
                                  title={`Eliminar a ${nombre} de Caja`}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                                >
                                  <AdminIcon name="trash" size={13} />
                                </button>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {/* Derecha: registrar movimiento */}
                      <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '16px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 14px' }}>
                          <AdminIcon name="wallet" size={15} /> Registrar movimiento
                        </p>
                        <label style={{ ...lbl, marginBottom: 6 }}>Tipo</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                          {tiposMov.map(op => {
                            const activo = nuevoTipo === op.val
                            const esPos = op.signo === '+'
                            return (
                              <button key={op.val} onClick={() => setNuevoTipo(op.val)} style={{ padding: '8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: activo ? (esPos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-soft)', border: `1.5px solid ${activo ? (esPos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, color: activo ? (esPos ? 'var(--green)' : 'var(--red)') : 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
                                {op.signo} {op.label}
                              </button>
                            )
                          })}
                        </div>
                        <label htmlFor="cd-part" style={{ ...lbl, marginBottom: 6 }}>Participante</label>
                        <input id="cd-part" type="text" placeholder="Nombre del participante" value={cajaMovNombre} onChange={e => setCajaMovNombre(e.target.value)} style={{ marginBottom: 12 }} />
                        <label htmlFor="cd-monto" style={{ ...lbl, marginBottom: 6 }}>Monto (MXN)</label>
                        <input id="cd-monto" type="number" min="1" step="1" placeholder="Ej. 100" value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)} style={{ marginBottom: 10 }} />
                        <label htmlFor="cd-nota" style={{ ...lbl, marginBottom: 6 }}>Nota (opcional)</label>
                        <input id="cd-nota" type="text" placeholder="Ej. Quiniela Semis" value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} style={{ marginBottom: 14 }} />
                        <button
                          onClick={async () => {
                            const n = normalizarNombre(cajaMovNombre.trim())
                            if (!n) return
                            await guardarMovimiento(n)
                          }}
                          disabled={guardandoMov || !cajaMovNombre.trim() || !nuevoMonto || Number(nuevoMonto) <= 0}
                          style={{ ...greenCtaStyle(guardandoMov || !cajaMovNombre.trim() || !nuevoMonto || Number(nuevoMonto) <= 0), width: '100%', padding: '12px' }}
                        >
                          {guardandoMov ? 'Guardando…' : 'Guardar movimiento'}
                        </button>
                      </div>
                    </div>
                  </div>
                )

                // Clientes
                const crearAb = verTodo['clientes-crear']
                const normalizaCliente = (txt) => String(txt ?? '')
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .trim()
                const filtroClientes = normalizaCliente(busquedaClientesSuper)
                const clientesMostrados = filtroClientes
                  ? clientes.filter(c => [c.nombre, c.email, c.telefono].some(v => normalizaCliente(v).includes(filtroClientes)))
                  : clientes
                const clienteCard = (c) => {
                  return (
                    <div key={c.id} className={`super-client-card${c.activo ? '' : ' is-inactive'}`}>
                      <div className="super-client-head">
                        <div style={{ minWidth: 0 }}>
                          <p className="super-client-name">
                            {c.nombre || '(sin nombre)'}
                          </p>
                          <p className="super-client-contact">{c.email}{c.telefono ? ` · ${c.telefono}` : ''}</p>
                        </div>
                        <span className={`super-status-badge${c.activo && !c.eliminada ? '' : ' is-muted'}`}>{c.eliminada ? 'Cuenta eliminada' : c.activo ? 'Activo' : 'Inactivo'}</span>
                      </div>
                      {(c.debeCambiarPassword || c.notas || c.eliminada) && (
                        <p className="super-client-plan">
                          {c.eliminada ? <span style={{ color: 'var(--muted)' }}>El usuario eliminó su cuenta; puedes borrar esta ficha con Eliminar.</span> : null}
                          {c.debeCambiarPassword ? <span style={{ color: 'var(--yellow)' }}>{c.eliminada ? <br /> : null}Contraseña sin cambiar</span> : null}
                          {c.notas ? <span style={{ color: 'var(--muted)' }}>{(c.debeCambiarPassword || c.eliminada) ? <br /> : null}{c.notas}</span> : null}
                        </p>
                      )}
                      <div className="super-action-row">
                        <button type="button" onClick={() => toggleActivoCliente(c)} className="super-action-btn"><AdminIcon name={c.activo ? 'pause' : 'play'} size={12} />{c.activo ? 'Pausar' : 'Activar'}</button>
                        <button type="button" onClick={() => editarNotasCliente(c)} className="super-action-btn"><AdminIcon name="note" size={12} />Notas</button>
                        <button type="button" onClick={() => eliminarCliente(c)} disabled={eliminandoCliente === c.id} className="super-action-btn is-danger">
                          <AdminIcon name="trash" size={12} />{eliminandoCliente === c.id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                        <button type="button" onClick={() => bloquearCliente(c)} disabled={eliminandoCliente === c.id} className="super-action-btn is-danger">
                          <AdminIcon name="lock" size={12} />Bloquear
                        </button>
                      </div>
                    </div>
                  )
                }
                const bloqueadosSection = bloqueadosLista.length === 0 ? null : (
                  <div className="super-mobile-card" style={{ marginTop: 4 }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 10px' }}>
                      <AdminIcon name="lock" size={14} /> Bloqueados ({bloqueadosLista.length})
                    </p>
                    {bloqueadosLista.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nombre || '(sin nombre)'}</p>
                          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.email || b.id}</p>
                        </div>
                        <button type="button" onClick={() => desbloquearCliente(b)} className="super-action-btn" style={{ flexShrink: 0 }}>
                          <AdminIcon name="unlock" size={12} />Desbloquear
                        </button>
                      </div>
                    ))}
                  </div>
                )
                const clientesSection = (
                  <div className="super-module-content">
                    <div className="super-mobile-search" style={{ marginBottom: 4 }}>
                      <AdminIcon name="search" size={16} />
                      <input
                        type="text"
                        value={busquedaClientesSuper}
                        onChange={e => setBusquedaClientesSuper(e.target.value)}
                        placeholder="Buscar cliente…"
                        aria-label="Buscar cliente"
                        autoComplete="off"
                      />
                    </div>
                    <SmoothCollapse open={!!crearAb}>
                      <div className="super-mobile-card">
                        <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 12px' }}>
                          <AdminIcon name="plus" size={15} /> Nuevo cliente
                        </p>
                        <label htmlFor="nc-email" style={{ ...lbl, marginBottom: 4 }}>Correo <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input id="nc-email" type="email" placeholder="correo@cliente.com" value={ncEmail} onChange={e => { setNcEmail(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                        <label htmlFor="nc-nombre" style={{ ...lbl, marginBottom: 4 }}>Nombre <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input id="nc-nombre" type="text" placeholder="Nombre de quien organiza" value={ncNombre} onChange={e => { setNcNombre(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                          <div>
                            <label htmlFor="nc-tel" style={{ ...lbl, marginBottom: 4 }}>WhatsApp</label>
                            <input id="nc-tel" type="tel" placeholder="55 1234 5678" value={ncTel} onChange={e => setNcTel(e.target.value)} />
                          </div>
                        </div>
                        {errorCliente && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{errorCliente}</p>}
                        <button onClick={crearCliente} disabled={creandoCliente} style={{ ...greenCtaStyle(creandoCliente), width: '100%', padding: '12px' }}>
                          {creandoCliente ? 'Creando…' : 'Crear cuenta'}
                        </button>
                        {clienteCreado && (
                          <div style={{ marginTop: 14, padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'var(--green-bg)', border: '1px solid var(--green)' }}>
                            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
                              <AdminIcon name="check" size={13} /> Cuenta creada: comparte estos accesos:
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.7, wordBreak: 'break-all' }}>
                              <AdminIcon name="mail" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{clienteCreado.email}<br />
                              <AdminIcon name="key" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{clienteCreado.password}
                            </p>
                            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 12px' }}>
                              Guarda o envía la contraseña ahora: por seguridad no se vuelve a mostrar.
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => { navigator.clipboard?.writeText(mensajeAccesos(clienteCreado.email, clienteCreado.password)); }}
                                style={{ flex: '1 1 140px', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--neutral-bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                              >
                                {inlineIconLabel('copy', 'Copiar mensaje')}
                              </button>
                              {telParaWa(clienteCreado.telefono) && (
                                <a
                                  href={waLink(mensajeAccesos(clienteCreado.email, clienteCreado.password), telParaWa(clienteCreado.telefono))}
                                  target="_blank" rel="noreferrer"
                                  style={{ flex: '1 1 140px', textAlign: 'center', padding: '10px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', background: '#25D366', color: '#06140B', fontSize: 12.5, fontWeight: 800 }}
                                >
                                  {inlineIconLabel('message', 'Enviar por WhatsApp')}
                                </a>
                              )}
                            </div>
                            <button onClick={() => setClienteCreado(null)} style={{ width: '100%', marginTop: 10, padding: '6px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              Cerrar
                            </button>
                          </div>
                        )}
                      </div>
                    </SmoothCollapse>
                    {loadingClientes ? (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</p>
                    ) : clientes.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Aún no hay clientes dados de alta.</p>
                    ) : clientesMostrados.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Sin coincidencias.</p>
                    ) : (
                      <div className="super-mobile-card-list">
                        {clientesMostrados.map(clienteCard)}
                      </div>
                    )}
                    {bloqueadosSection}
                    <button type="button" className="super-mobile-fab" onClick={() => setVerTodo(v => ({ ...v, 'clientes-crear': true }))}>
                      <AdminIcon name="plus" size={18} strokeWidth={2.5} />
                      Cliente
                    </button>
                  </div>
                )

                // Clientes (escritorio): dos columnas: tabla + alta
                const cuentaCreadaCard = clienteCreado && (
                  <div style={{ marginTop: 14, padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'var(--green-bg)', border: '1px solid var(--green)' }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
                      <AdminIcon name="check" size={13} /> Cuenta creada: comparte estos accesos:
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.7, wordBreak: 'break-all' }}>
                      <AdminIcon name="mail" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{clienteCreado.email}<br />
                      <AdminIcon name="key" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{clienteCreado.password}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 12px' }}>
                      Guarda o envía la contraseña ahora: por seguridad no se vuelve a mostrar.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(mensajeAccesos(clienteCreado.email, clienteCreado.password)); }}
                        style={{ flex: '1 1 140px', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--neutral-bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {inlineIconLabel('copy', 'Copiar mensaje')}
                      </button>
                      {telParaWa(clienteCreado.telefono) && (
                        <a
                          href={waLink(mensajeAccesos(clienteCreado.email, clienteCreado.password), telParaWa(clienteCreado.telefono))}
                          target="_blank" rel="noreferrer"
                          style={{ flex: '1 1 140px', textAlign: 'center', padding: '10px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', background: '#25D366', color: '#06140B', fontSize: 12.5, fontWeight: 800 }}
                        >
                          {inlineIconLabel('message', 'WhatsApp')}
                        </a>
                      )}
                    </div>
                    <button onClick={() => setClienteCreado(null)}
                      style={{ width: '100%', marginTop: 10, padding: '6px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Cerrar
                    </button>
                  </div>
                )
                const clientesActivosN = clientes.filter(c => c.activo).length
                const clientesDesktop = (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Clientes</h2>
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} · {clientesActivosN} activo{clientesActivosN !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.75fr 1fr', gap: 16, alignItems: 'start' }}>
                      {/* Izquierda: tabla de clientes */}
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 10px', height: 36 }}>
                            <AdminIcon name="search" size={14} style={{ color: 'var(--muted)' }} />
                            <input
                              type="text"
                              placeholder="Buscar cliente…"
                              value={busquedaClientesSuper}
                              onChange={e => setBusquedaClientesSuper(e.target.value)}
                              style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, color: 'var(--text)', fontSize: 13 }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2.6fr 0.9fr 28px', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                          {['Cliente', 'Estado', ''].map((h, i) => (
                            <span key={i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-soft)' }}>{h}</span>
                          ))}
                        </div>
                        {loadingClientes ? (
                          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '18px' }}>Cargando…</p>
                        ) : clientes.length === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '18px' }}>Aún no hay clientes dados de alta.</p>
                        ) : clientesMostrados.length === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '18px' }}>Sin coincidencias.</p>
                        ) : clientesMostrados.map(c => {
                          const abierto = clienteExpandido === c.id
                          return (
                            <div key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: c.activo ? 1 : 0.78 }}>
                              <div
                                onClick={() => setClienteExpandido(abierto ? null : c.id)}
                                style={{ display: 'grid', gridTemplateColumns: '2.6fr 0.9fr 28px', gap: 12, padding: '14px 18px', alignItems: 'center', cursor: 'pointer', background: abierto ? 'var(--green-bg)' : 'transparent' }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '(sin nombre)'}</p>
                                  <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</p>
                                </div>
                                <span>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)', background: c.activo && !c.eliminada ? 'var(--green-bg)' : 'var(--neutral-bg)', color: c.activo && !c.eliminada ? 'var(--green)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                                    {c.eliminada ? 'Cuenta eliminada' : c.activo ? 'Activo' : 'Inactivo'}
                                  </span>
                                </span>
                                <span style={{ color: 'var(--muted)', display: 'inline-flex', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                                  <AdminIcon name="chevron-right" size={15} />
                                </span>
                              </div>
                              <SmoothCollapse open={abierto}>
                                <div style={{ padding: '0 18px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {c.eliminada && <span style={{ width: '100%', fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>El usuario eliminó su cuenta; puedes borrar esta ficha con Eliminar.</span>}
                                  {c.debeCambiarPassword && <span style={{ width: '100%', fontSize: 11.5, color: 'var(--yellow)', marginBottom: 2 }}>Contraseña sin cambiar</span>}
                                  {c.notas && <span style={{ width: '100%', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{c.notas}</span>}
                                  <button onClick={() => toggleActivoCliente(c)} style={accionBtn}>{inlineIconLabel(c.activo ? 'pause' : 'play', c.activo ? 'Desactivar' : 'Activar')}</button>
                                  <button onClick={() => editarNotasCliente(c)} style={accionBtn}>{inlineIconLabel('note', 'Notas')}</button>
                                  <button onClick={() => eliminarCliente(c)} disabled={eliminandoCliente === c.id} style={{ ...accionBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>
                                    {eliminandoCliente === c.id ? 'Eliminando…' : inlineIconLabel('trash', 'Eliminar')}
                                  </button>
                                  <button onClick={() => bloquearCliente(c)} disabled={eliminandoCliente === c.id} style={{ ...accionBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>
                                    {inlineIconLabel('lock', 'Bloquear')}
                                  </button>
                                </div>
                              </SmoothCollapse>
                            </div>
                          )
                        })}
                        {bloqueadosLista.length > 0 && (
                          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
                            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>
                              <AdminIcon name="lock" size={13} /> Bloqueados ({bloqueadosLista.length})
                            </p>
                            {bloqueadosLista.map(b => (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0' }}>
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nombre || '(sin nombre)'}</p>
                                  <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.email || b.id}</p>
                                </div>
                                <button onClick={() => desbloquearCliente(b)} style={{ ...accionBtn, flexShrink: 0 }}>{inlineIconLabel('unlock', 'Desbloquear')}</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Derecha: alta de cliente */}
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '16px 18px' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 14px' }}>
                          <AdminIcon name="plus" size={15} /> Nuevo cliente
                        </p>
                        <label htmlFor="ncd-email" style={{ ...lbl, marginBottom: 4 }}>Correo <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input id="ncd-email" type="email" placeholder="correo@cliente.com" value={ncEmail} onChange={e => { setNcEmail(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                        <label htmlFor="ncd-nombre" style={{ ...lbl, marginBottom: 4 }}>Nombre <span style={{ color: 'var(--red)' }}>*</span></label>
                        <input id="ncd-nombre" type="text" placeholder="Nombre de quien organiza" value={ncNombre} onChange={e => { setNcNombre(e.target.value); setErrorCliente('') }} style={{ marginBottom: 12 }} />
                        <label htmlFor="ncd-tel" style={{ ...lbl, marginBottom: 4 }}>WhatsApp</label>
                        <input id="ncd-tel" type="tel" placeholder="55 1234 5678" value={ncTel} onChange={e => setNcTel(e.target.value)} style={{ marginBottom: 12 }} />
                        {errorCliente && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{errorCliente}</p>}
                        <button onClick={crearCliente} disabled={creandoCliente} style={{ ...greenCtaStyle(creandoCliente), width: '100%', padding: '12px' }}>
                          {creandoCliente ? 'Creando…' : 'Crear cuenta'}
                        </button>
                        {cuentaCreadaCard}
                      </div>
                    </div>
                  </div>
                )

                // Mis quinielas
                const misFlat = [...mias.activas, ...mias.enJuego, ...mias.finalizadas]
                const filtrosMis = [
                  ['todas', 'Todas'],
                  ['abiertas', 'Abiertas'],
                  ['jugando', 'Jugándose'],
                  ['finalizadas', 'Finalizadas'],
                ]
                const filtroMis = normalizaCliente(busquedaMisSuper)
                const misActivasF = filtroMis ? mias.activas.filter(q => normalizaCliente(q.nombre).includes(filtroMis)) : mias.activas
                const misEnJuegoF = filtroMis ? mias.enJuego.filter(q => normalizaCliente(q.nombre).includes(filtroMis)) : mias.enJuego
                const misFinalizadasF = filtroMis ? mias.finalizadas.filter(q => normalizaCliente(q.nombre).includes(filtroMis)) : mias.finalizadas
                const misFiltradasTotal = filtroMisSuper === 'abiertas' ? misActivasF.length
                  : filtroMisSuper === 'jugando' ? misEnJuegoF.length
                    : filtroMisSuper === 'finalizadas' ? misFinalizadasF.length
                      : misActivasF.length + misEnJuegoF.length + misFinalizadasF.length
                const renderGrupoMisMobile = (titulo, arr, color, dim = false) => {
                  if (arr.length === 0) return null
                  return (
                    <div style={{ marginBottom: 20, opacity: dim ? 0.74 : 1 }}>
                      <div className="super-state-label">
                        <span className="super-state-dot" style={{ background: color }} />
                        <span className="super-state-text">{titulo}</span>
                        <span className="super-state-count">{arr.length}</span>
                      </div>
                      <div className="super-mobile-card-list">
                        {arr.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                      </div>
                    </div>
                  )
                }
                const misQuinielasSection = (
                  <div className="super-module-content">
                    {misFlat.length > 0 && (
                      <div className="super-mobile-search" style={{ marginBottom: 12 }}>
                        <AdminIcon name="search" size={16} />
                        <input
                          type="text"
                          value={busquedaMisSuper}
                          onChange={e => setBusquedaMisSuper(e.target.value)}
                          placeholder="Buscar quiniela…"
                          aria-label="Buscar quiniela"
                          autoComplete="off"
                        />
                      </div>
                    )}
                    <div className="super-filter-row" role="tablist" aria-label="Filtrar mis quinielas">
                      {filtrosMis.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`super-filter-chip${filtroMisSuper === key ? ' is-active' : ''}`}
                          onClick={() => setFiltroMisSuper(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {misFiltradasTotal === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                        {misFlat.length === 0 ? 'Aún no has creado quinielas.' : 'Sin coincidencias.'}
                      </p>
                    ) : (
                      <>
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'abiertas') && renderGrupoMisMobile('Abiertas', misActivasF, 'var(--green)')}
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'jugando') && renderGrupoMisMobile('Jugándose', misEnJuegoF, 'var(--green)')}
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'finalizadas') && renderGrupoMisMobile('Finalizadas', misFinalizadasF, 'var(--muted)', true)}
                      </>
                    )}
                    <button type="button" className="super-mobile-fab" onClick={abrirNuevaQuiniela}>
                      <AdminIcon name="plus" size={18} strokeWidth={2.5} />
                      Nueva
                    </button>
                  </div>
                )

                // Mis quinielas (escritorio): grupos por estado, grid 2×
                const grupoQ = (titulo, arr, color, dim = false) => arr.length > 0 ? (
                  <div style={{ marginBottom: 22, opacity: dim ? 0.74 : 1 }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted-soft)', margin: '0 0 11px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} /> {titulo} <span style={{ color: 'var(--muted-dim)' }}>{arr.length}</span>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' }}>
                      {arr.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                    </div>
                  </div>
                ) : null
                const misDesktop = (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Mis quinielas</h2>
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>
                          {misFlat.length} quiniela{misFlat.length !== 1 ? 's' : ''} · {mias.activas.length} abierta{mias.activas.length !== 1 ? 's' : ''} · {mias.enJuego.length} jugándose
                        </p>
                      </div>
                      <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false), height: 38, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 18px', flexShrink: 0 }}>
                        <AdminIcon name="plus" size={16} /> Nueva quiniela
                      </button>
                    </div>
                    {misFlat.length > 0 && (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                          {filtrosMis.map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              className={`super-filter-chip${filtroMisSuper === key ? ' is-active' : ''}`}
                              onClick={() => setFiltroMisSuper(key)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 10px', height: 36, marginBottom: 18, maxWidth: 320 }}>
                          <AdminIcon name="search" size={14} style={{ color: 'var(--muted)' }} />
                          <input
                            type="text"
                            placeholder="Buscar quiniela…"
                            value={busquedaMisSuper}
                            onChange={e => setBusquedaMisSuper(e.target.value)}
                            style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, color: 'var(--text)', fontSize: 13 }}
                          />
                        </div>
                      </>
                    )}
                    {misFlat.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Aún no has creado quinielas.</p>
                    ) : misFiltradasTotal === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Sin coincidencias.</p>
                    ) : (
                      <>
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'abiertas') && grupoQ('Abiertas', misActivasF, 'var(--green)')}
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'jugando') && grupoQ('Jugándose', misEnJuegoF, 'var(--green)')}
                        {(filtroMisSuper === 'todas' || filtroMisSuper === 'finalizadas') && grupoQ('Finalizadas', misFinalizadasF, 'var(--muted)', true)}
                      </>
                    )}
                  </div>
                )

                // Quinielas de otros admins
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
                const otrosActivas = adminsConQ.reduce((a, x) => a + x.activas, 0)
                const otrosEnJuego = adminsConQ.reduce((a, x) => a + x.enJuego, 0)
                const kpiOtrosMobile = (valor, label) => (
                  <div className="super-mobile-kpi-card">
                    <div className="super-mobile-kpi-value super-mobile-kpi-value--large">{valor}</div>
                    <div className="super-mobile-kpi-label">{label}</div>
                  </div>
                )
                const otrosSection = (
                  <div className="super-module-content">
                    <div className="super-mobile-kpi-grid">
                      {kpiOtrosMobile(quinielasOtras.length, 'Quinielas')}
                      {kpiOtrosMobile(otrosActivas, 'Activas')}
                      {kpiOtrosMobile(otrosEnJuego, 'En juego')}
                    </div>
                    {adminsConQ.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No hay quinielas de otros admins.</p>
                    ) : (
                      <div className="super-mobile-card-list" style={{ gap: 8 }}>
                        {adminsConQ.map(adm => {
                          const admAb = adminExpandido === adm.uid
                          return (
                            <div key={adm.uid}>
                              <button type="button" onClick={() => setAdminExpandido(admAb ? null : adm.uid)} className={`super-admin-row${admAb ? ' is-open' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                                  <span className="super-admin-avatar">{iniciales(adm.nombre)}</span>
                                  <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: admAb ? 'var(--green)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adm.nombre}</span>
                                    <span style={{ display: 'block', fontSize: 11, color: admAb ? 'var(--green-light)' : 'var(--muted)', marginTop: 2 }}>
                                      {adm.total} quiniela{adm.total !== 1 ? 's' : ''}{adm.activas > 0 ? ` · ${adm.activas} activa${adm.activas !== 1 ? 's' : ''}` : ''}{adm.enJuego > 0 ? ` · ${adm.enJuego} en juego` : ''}
                                    </span>
                                  </div>
                                </div>
                                <span style={{ fontSize: 16, fontWeight: 700, color: admAb ? 'var(--green)' : 'var(--muted)', transform: admAb ? 'rotate(90deg)' : 'none', transition: 'transform .15s, color .15s', flexShrink: 0 }}>›</span>
                              </button>
                              <SmoothCollapse open={admAb}>
                                <div className="super-admin-children">
                                  {adm.flat.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} dueno={labelDueno(q)} superCompact softManage />)}
                                </div>
                              </SmoothCollapse>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )

                // Otros admins (escritorio): KPIs + tarjetas de admin
                const kpiOtros = (valor, label) => (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '15px 16px' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1 }}>{valor}</p>
                    <p style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, margin: '5px 0 0' }}>{label}</p>
                  </div>
                )
                const otrosDesktop = (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Otros admins</h2>
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>{adminsConQ.length} cliente{adminsConQ.length !== 1 ? 's' : ''} admin · {quinielasOtras.length} quiniela{quinielasOtras.length !== 1 ? 's' : ''}</p>
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)', border: '1px solid var(--border-strong)' }}>Solo lectura</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                      {kpiOtros(quinielasOtras.length, 'Quinielas de otros')}
                      {kpiOtros(otrosActivas, 'Activas')}
                      {kpiOtros(otrosEnJuego, 'En juego')}
                    </div>
                    {adminsConQ.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No hay quinielas de otros admins.</p>
                    ) : adminsConQ.map(adm => {
                      const admAb = adminExpandido === adm.uid
                      return (
                        <div key={adm.uid} style={{ marginBottom: 10, background: 'var(--card)', border: `1px solid ${admAb ? 'var(--green)' : 'var(--border)'}`, borderLeft: admAb ? '3px solid var(--green)' : '1px solid var(--border)', borderRadius: 13, overflow: 'hidden' }}>
                          <button
                            onClick={() => setAdminExpandido(admAb ? null : adm.uid)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 18px', background: admAb ? 'var(--green-bg)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: 'var(--card-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>{iniciales(adm.nombre)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adm.nombre}</p>
                              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 0' }}>
                                {adm.total} quiniela{adm.total !== 1 ? 's' : ''}{adm.activas > 0 ? ` · ${adm.activas} activa${adm.activas !== 1 ? 's' : ''}` : ''}{adm.enJuego > 0 ? ` · ${adm.enJuego} en juego` : ''}
                              </p>
                            </div>
                            <span style={{ color: admAb ? 'var(--green)' : 'var(--muted)', display: 'inline-flex', transform: admAb ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                              <AdminIcon name="chevron-right" size={16} />
                            </span>
                          </button>
                          <SmoothCollapse open={admAb}>
                            <div style={{ padding: '4px 18px 14px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' }}>
                                {adm.flat.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} dueno={labelDueno(q)} superCompact softManage />)}
                              </div>
                            </div>
                          </SmoothCollapse>
                        </div>
                      )
                    })}
                  </div>
                )

                // Estadísticas
                const statsSection = (() => {
                  const statsQuinielas = quinielasMias
                  // statsDias trae 14 días: los últimos 7 (semana actual) + los 7 previos, para
                  // poder mostrar la tendencia "vs. la semana pasada" en la tarjeta de visitas.
                  const diasTodos = statsDias ?? []
                  const dias     = diasTodos.slice(-7)
                  const diasPrev = diasTodos.slice(0, Math.max(0, diasTodos.length - 7)).slice(-7)
                  const sumar = (arr, k) => arr.reduce((a, d) => a + (Number(d[k]) || 0), 0)
                  const totVisitas     = sumar(dias, 'visitas')
                  const totVisitasPrev = sumar(diasPrev, 'visitas')
                  const hayComparativo = diasPrev.length > 0
                  const trendPct = (hayComparativo && totVisitasPrev > 0)
                    ? Math.round(((totVisitas - totVisitasPrev) / totVisitasPrev) * 100)
                    : null
                  const totEnvios  = sumar(dias, 'envios')
                  const totMovil   = sumar(dias, 'movil')
                  const totEscr    = sumar(dias, 'escritorio')
                  const totIos     = sumar(dias, 'ios')
                  const totAndroid = sumar(dias, 'android')
                  const totDisp    = totMovil + totEscr
                  const conversion = totVisitas > 0 ? Math.round((totEnvios / totVisitas) * 100) : 0
                  const pct = (n, tot) => tot > 0 ? Math.round((n / tot) * 100) : 0

                  // Actividad por hora (acumulando las horas de los últimos 7 días).
                  const horasAcum = {}
                  dias.forEach(d => Object.entries(d.horas || {}).forEach(([h, n]) => {
                    horasAcum[Number(h)] = (horasAcum[Number(h)] || 0) + (Number(n) || 0)
                  }))
                  const horaPicoEntry = Object.entries(horasAcum).sort((a, b) => b[1] - a[1])[0]
                  const horaPicoNum = horaPicoEntry ? Number(horaPicoEntry[0]) : null
                  const horaPico = horaPicoNum !== null ? `${String(horaPicoNum).padStart(2, '0')}:00` : null
                  const maxHora = Math.max(1, ...Array.from({ length: 24 }, (_, h) => horasAcum[h] || 0))

                  const maxDia = Math.max(1, ...dias.map(d => Number(d.visitas) || 0))
                  const fmtDia = (date) => date.toLocaleDateString('es-MX', { weekday: 'short' })

                  // Detalle de la quiniela elegida.
                  const aperturas = statsQData?.aperturas || {}
                  const topAperturas = Object.entries(aperturas)
                    .map(([id, n]) => ({ nombre: statsQNombres[id] || 'Participante', n: Number(n) || 0 }))
                    .sort((a, b) => b.n - a.n).slice(0, 4)
                  const qObj = statsQuinielas.find(q => q.id === statsQId)
                  const datosPartido = (espnId) => {
                    const p = (qObj?.partidos || []).find(x => String(x.espnId) === String(espnId))
                    return p ? { local: p.local, visitante: p.visitante } : { local: 'Partido', visitante: '' }
                  }
                  const topEnVivo = Object.entries(statsQData?.enVivo || {})
                    .map(([espnId, n]) => ({ espnId, ...datosPartido(espnId), n: Number(n) || 0 }))
                    .sort((a, b) => b.n - a.n).slice(0, 5)

                  const totDispositivos = Number(statsGlobal?.dispositivos) || 0
                  const hayDatos = totVisitas > 0 || totEnvios > 0 || totDispositivos > 0
                  // Info de cada métrica: tocar la tarjeta o el icono ⓘ abre su definición.
                  const toggleInfo = (k) => setInfoStat(p => p === k ? null : k)
                  const infoBtn = (k) => (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleInfo(k) }}
                      aria-label={`Qué significa ${DEFINICIONES_STATS[k]?.t ?? ''}`}
                      style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', color: infoStat === k ? 'var(--green)' : 'var(--muted)' }}
                    >
                      <AdminIcon name="info" size={13} />
                    </button>
                  )
                  const defBox = (k) => DEFINICIONES_STATS[k] ? (
                    <SmoothCollapse open={infoStat === k}>
                      <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', marginTop: 8, marginBottom: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 3 }}>{DEFINICIONES_STATS[k].t}</p>
                        <p style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.5 }}>{DEFINICIONES_STATS[k].d}</p>
                      </div>
                    </SmoothCollapse>
                  ) : null
                  // Etiqueta de sección con su icono de info al lado.
                  const tituloInfo = (k, texto) => (
                    <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>{texto}{infoBtn(k)}</div>
                  )

                  const pillUltimos = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--neutral-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '5px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Últimos 7 días
                    </span>
                  )

                  const segmentControl = (
                    <div className="stats-segment" role="tablist" aria-label="Vista de estadísticas">
                      <button type="button" role="tab" aria-selected={statsTab === 'general'} className={`stats-segment-btn${statsTab === 'general' ? ' is-active' : ''}`} onClick={() => setStatsTab('general')}>General</button>
                      <button type="button" role="tab" aria-selected={statsTab === 'porQuiniela'} className={`stats-segment-btn${statsTab === 'porQuiniela' ? ' is-active' : ''}`} onClick={() => setStatsTab('porQuiniela')}>Por quiniela</button>
                    </div>
                  )

                  // Gráfica de línea (7 puntos) para la tarjeta de visitas
                  const chartW = 300, chartH = 74
                  const chartPts = dias.map((d, i) => {
                    const v = Number(d.visitas) || 0
                    const x = dias.length > 1 ? (i / (dias.length - 1)) * chartW : chartW / 2
                    const y = chartH - (v / maxDia) * (chartH - 10) - 5
                    return [x, y]
                  })
                  const smoothPath = (pts) => {
                    if (pts.length === 0) return ''
                    if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`
                    let d = `M ${pts[0][0]},${pts[0][1]}`
                    for (let i = 0; i < pts.length - 1; i++) {
                      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
                      d += ` Q ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`
                    }
                    const last = pts[pts.length - 1]
                    d += ` L ${last[0]},${last[1]}`
                    return d
                  }
                  const linePath = smoothPath(chartPts)
                  const areaPath = chartPts.length > 0
                    ? `${linePath} L ${chartPts[chartPts.length - 1][0]},${chartH} L ${chartPts[0][0]},${chartH} Z`
                    : ''

                  const heroCard = (
                    <button type="button" onClick={() => toggleInfo('visitas')} className="stats-hero-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-light)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Visitas · 7 días</span>
                        {trendPct !== null && (
                          <span className={`stats-trend-badge ${trendPct >= 0 ? 'is-up' : 'is-down'}`}>
                            <AdminIcon name="trending-up" size={11} style={{ transform: trendPct < 0 ? 'scaleY(-1)' : 'none' }} />
                            {Math.abs(trendPct)}%
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1 }}>{totVisitas.toLocaleString('es-MX')}</div>
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, marginBottom: 12 }}>
                        {hayComparativo ? `vs. ${totVisitasPrev.toLocaleString('es-MX')} la semana pasada` : 'Aún no hay comparativo de la semana pasada'}
                      </p>
                      {dias.length > 1 && (
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
                          <defs>
                            <linearGradient id="statsHeroFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(34,197,94,0.45)" />
                              <stop offset="100%" stopColor="rgba(34,197,94,0)" />
                            </linearGradient>
                          </defs>
                          <path d={areaPath} fill="url(#statsHeroFill)" stroke="none" />
                          <path d={linePath} fill="none" stroke="var(--green-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      <div style={{ display: 'flex', marginTop: 6 }}>
                        {dias.map(d => (
                          <span key={d.id} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'capitalize' }}>{fmtDia(d.fecha)}</span>
                        ))}
                      </div>
                    </button>
                  )

                  const miniCard = (k, valor, etiqueta, icon) => (
                    <button type="button" onClick={() => toggleInfo(k)} className="stats-mini-card">
                      <span className="stats-mini-icon"><AdminIcon name={icon} size={15} /></span>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.15, marginTop: 8 }}>{valor}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, marginTop: 2 }}>{etiqueta}</div>
                    </button>
                  )

                  const generalTab = (
                    <>
                      {heroCard}
                      {defBox('visitas')}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                        {miniCard('jugaron', totEnvios, 'Jugaron', 'ball')}
                        {miniCard('conversion', `${conversion}%`, 'Conversión', 'trending-up')}
                        {miniCard('dispositivos', totDispositivos, 'Dispositivos', 'device-mobile')}
                      </div>
                      {defBox('jugaron')}
                      {defBox('conversion')}
                      {defBox('dispositivos')}

                      <div style={{ marginTop: 6 }}>
                        {tituloInfo('tipo', 'De dónde entran')}
                        {defBox('tipo')}
                        <div className="stats-device-track">
                          <div className="stats-device-fill" style={{ width: `${pct(totMovil, totDisp)}%` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="stats-dot is-green" />Celular <strong>{pct(totMovil, totDisp)}%</strong></span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="stats-dot is-muted" />Compu <strong>{pct(totEscr, totDisp)}%</strong></span>
                        </div>
                        {(totIos > 0 || totAndroid > 0) && (
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                            {totIos > 0 && <>iPhone {pct(totIos, totDisp)}%</>}
                            {totIos > 0 && totAndroid > 0 && ' · '}
                            {totAndroid > 0 && <>Android {pct(totAndroid, totDisp)}%</>}
                          </p>
                        )}
                      </div>

                      <div className="stats-hour-card">
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                          <AdminIcon name="clock" size={14} style={{ color: 'var(--muted)' }} /> Actividad por hora {infoBtn('hora')}
                        </p>
                        {defBox('hora')}
                        <div style={{ display: 'flex', gap: 3 }}>
                          {Array.from({ length: 24 }, (_, h) => {
                            const n = horasAcum[h] || 0
                            const esPico = h === horaPicoNum && n > 0
                            const intensidad = n > 0 ? 0.18 + 0.82 * (n / maxHora) : 0
                            return (
                              <div
                                key={h}
                                style={{
                                  flex: 1, aspectRatio: '1', borderRadius: 4,
                                  background: n > 0 ? `rgba(34,197,94,${intensidad})` : 'var(--border)',
                                  border: esPico ? '1.5px solid var(--green-light)' : '1.5px solid transparent',
                                  boxShadow: esPico ? '0 0 8px rgba(134,239,172,0.55)' : 'none',
                                }}
                              />
                            )
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9.5, color: 'var(--muted)' }}>
                          <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                        </div>
                        {horaPico && (
                          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
                            Pico a las <strong style={{ color: 'var(--text-strong)' }}>{horaPico}</strong>: ideal para avisar por WhatsApp.
                          </p>
                        )}
                      </div>
                    </>
                  )

                  const porQuinielaTab = (
                    <>
                      <p style={lbl}>Detalle por quiniela</p>
                      <div className="stats-select-wrap">
                        <select
                          value={statsQId}
                          onChange={e => setStatsQId(e.target.value)}
                          disabled={statsQuinielas.length === 0}
                          className="stats-select"
                        >
                          <option value="">{statsQuinielas.length === 0 ? 'No tienes quinielas todavía' : 'Elige una quiniela…'}</option>
                          {statsQuinielas.map(q => <option key={q.id} value={q.id}>{q.nombre}</option>)}
                        </select>
                        <AdminIcon name="chevron-down" size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                      </div>

                      {!statsQId ? (
                        <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', padding: '4px 0' }}>Elige una quiniela para ver su detalle.</p>
                      ) : (
                        <>
                          <div className="stats-block-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                                <AdminIcon name="eye" size={14} style={{ color: 'var(--green)' }} /> Participantes más abiertos {infoBtn('aperturas')}
                              </p>
                              {topAperturas.length > 0 && <span className="stats-top-pill">Top {topAperturas.length}</span>}
                            </div>
                            {defBox('aperturas')}
                            {topAperturas.length === 0 ? (
                              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Nadie ha abierto predicciones todavía.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {topAperturas.map((a, i) => (
                                  <div key={i} className={`stats-participant-row${i === 0 ? ' is-top' : ''}`}>
                                    <span className="stats-participant-avatar">
                                      {iniciales(a.nombre)}
                                      {i === 0 && <span className="stats-participant-crown" aria-hidden="true">👑</span>}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                                        <span style={{ fontSize: 13, fontWeight: i === 0 ? 800 : 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? 'var(--green-light)' : 'var(--muted)', flexShrink: 0 }}>{a.n}</span>
                                      </div>
                                      <div className="stats-progress-track">
                                        <div className="stats-progress-fill" style={{ width: `${Math.max(6, Math.round((a.n / (topAperturas[0].n || 1)) * 100))}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="stats-block-card">
                            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                              <span className="stats-live-dot" aria-hidden="true" /> Partidos con más conectados en vivo {infoBtn('enVivo')}
                            </p>
                            {defBox('enVivo')}
                            {topEnVivo.length === 0 ? (
                              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Sin datos de partidos en vivo todavía.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {topEnVivo.map((p, i) => {
                                  const enVivoAhora = statsQLiveIds.has(String(p.espnId))
                                  if (enVivoAhora) {
                                    return (
                                      <div key={i} className="stats-live-card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span className="stats-live-badge"><span className="stats-live-badge-dot" />EN VIVO</span>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                                            <AdminIcon name="eye" size={13} /> {p.n} viendo
                                          </span>
                                        </div>
                                        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginTop: 8 }}>
                                          {p.local} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>vs</span> {p.visitante}
                                        </p>
                                      </div>
                                    )
                                  }
                                  return (
                                    <div key={i} className="stats-match-row">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                                        <span style={{ fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.local} vs {p.visitante}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{p.n} viendo</span>
                                      </div>
                                      <div className="stats-progress-track">
                                        <div className="stats-progress-fill is-muted" style={{ width: `${Math.max(6, Math.round((p.n / (topEnVivo[0].n || 1)) * 100))}%` }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )

                  return (
                    <div className={superDesktop ? undefined : 'super-module-content'} style={superDesktop ? secCard : undefined}>
                      {superDesktop && (
                        <div style={{ ...secLabel, marginBottom: 4, justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: 'var(--green-bg)', color: 'var(--green)' }}>
                              <AdminIcon name="chart" size={15} />
                            </span>
                            Estadísticas
                          </span>
                          {pillUltimos}
                        </div>
                      )}
                      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14 }}>
                        Se actualiza solo conforme la gente entra a tus quinielas.
                      </p>

                      {segmentControl}

                      {statsCargando && !statsDias ? (
                        <p style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Cargando…</p>
                      ) : statsTab === 'general' && !hayDatos ? (
                        <div style={{ padding: 16, borderRadius: 'var(--radius-sm)', background: 'var(--bg-soft)', border: '1px dashed var(--border)', textAlign: 'center' }}>
                          <div style={{ color: 'var(--muted)', marginBottom: 6 }}><AdminIcon name="chart" size={24} /></div>
                          <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Aún no hay datos</p>
                          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Aparecerán aquí conforme la gente abra tus quinielas.</p>
                        </div>
                      ) : statsTab === 'general' ? generalTab : porQuinielaTab}

                      {statsTab === 'general' && (
                        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                            <input
                              type="checkbox"
                              checked={noContarme}
                              onChange={e => toggleNoContarme(e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: 'var(--green)', cursor: 'pointer' }}
                            />
                            No contar mis visitas en este dispositivo
                          </label>
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, paddingLeft: 24, lineHeight: 1.4 }}>
                            Así tus propias pruebas no inflan los números. Se activa solo la primera vez que entras al panel.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })()

                const enMovimientoSuper = [...mias.enJuego, ...mias.activas]
                const movingCard = (q) => {
                  const enJuego = esCerradaQ(q) && !esFinalizadaQ(q)
                  const jugadores = conteos[q.id] ?? 0
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className="super-moving-card"
                      onClick={() => gestionarQuiniela(q)}
                    >
                      <span className={`super-moving-badge ${enJuego ? 'is-playing' : 'is-open'}`}>
                        {enJuego ? 'Jugándose' : 'Abierta'}
                      </span>
                      <span className="super-moving-name">{q.nombre}</span>
                      <span className="super-moving-meta">
                        {jugadores} jugador{jugadores === 1 ? '' : 'es'}
                      </span>
                    </button>
                  )
                }

                // Título de página en móvil (mismo estilo que headerCli del admin),
                // para que Caja/Estadísticas del super se vean igual que en un admin.
                const tituloTabSuper = (titulo, sub, onBack, accion) => superDesktop ? null : (
                  <div style={{ marginBottom: 18 }}>
                    {onBack && (
                      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
                        <AdminIcon name="arrow-left" size={15} /> Mi cuenta
                      </button>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>{titulo}</h2>
                        {sub && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>{sub}</p>}
                      </div>
                      {accion}
                    </div>
                  </div>
                )
                // Vuelve a la ficha de Mi cuenta desde las sub-vistas (Otros/Clientes).
                const volverACuentaSuper = () => { setSuperModulo(null); setVista('cuenta') }
                return (
                  <>
                    {!superModulo && superDesktop && (() => {
                      // Inicio / tablero maestro (escritorio)
                      // statsDias trae 14 días (para la tendencia de Estadísticas); aquí solo usamos los últimos 7.
                      const d7 = (statsDias ?? []).slice(-7)
                      const sum = (k) => d7.reduce((a, d) => a + (Number(d[k]) || 0), 0)
                      const visitas7 = sum('visitas')
                      const mov = sum('movil'), esc = sum('escritorio')
                      const celPct = (mov + esc) > 0 ? Math.round((mov / (mov + esc)) * 100) : 0
                      const horasAcum = {}
                      d7.forEach(d => Object.entries(d.horas || {}).forEach(([h, n]) => { horasAcum[h] = (horasAcum[h] || 0) + (Number(n) || 0) }))
                      const hpEntry = Object.entries(horasAcum).sort((a, b) => b[1] - a[1])[0]
                      const horaPico = hpEntry ? `${String(hpEntry[0]).padStart(2, '0')}:00` : '-'
                      const maxV = Math.max(1, ...d7.map(d => Number(d.visitas) || 0))
                      const idxPico = d7.reduce((best, d, i) => (Number(d.visitas) || 0) > (Number(d7[best]?.visitas) || 0) ? i : best, 0)
                      const cajaNeto = saldos.reduce((a, s) => a + s.saldo, 0)
                      const totalDonado = donativos.reduce((a, d) => a + (Number(d.monto) || 0), 0)
                      const cliAct = clientes.filter(c => c.activo).length
                      const saludo = auth.currentUser?.displayName || 'César'

                      const kpi = ({ icon, color, tint, valor, sub, label }) => (
                        <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '15px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }}>
                          <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 9, background: tint, color, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <AdminIcon name={icon} size={16} />
                          </span>
                          <p style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1 }}>
                            {valor}{sub && <span style={{ fontSize: 13, color: 'var(--muted-soft)' }}> {sub}</span>}
                          </p>
                          <p style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, margin: '4px 0 0' }}>{label}</p>
                        </div>
                      )
                      const deskModule = ({ modulo, icon, title, meta, desc }) => (
                        <button
                          key={modulo}
                          onClick={() => setSuperModulo(modulo)}
                          style={{
                            textAlign: 'left', cursor: 'pointer',
                            border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13,
                            background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)',
                            padding: '15px 16px',
                          }}
                        >
                          <span style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 10, background: 'var(--green-bg)', color: 'var(--green-light)', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }}>
                            <AdminIcon name={icon} size={19} />
                          </span>
                          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 7 }}>
                            {title}
                            {meta && <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--neutral-bg)', color: 'var(--muted)', padding: '1px 7px', borderRadius: 'var(--radius-full)' }}>{meta}</span>}
                          </p>
                          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
                        </button>
                      )
                      return (
                        <div>
                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Hola, {saludo}</h2>
                                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)' }}>PANEL MAESTRO</span>
                              </div>
                              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>Vista general de toda la plataforma</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                              <button onClick={() => setSuperModulo('clientes')} style={{ ...greenCtaStyle(false), height: 38, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 18px' }}>
                                <AdminIcon name="plus" size={16} /> Nuevo cliente
                              </button>
                            </div>
                          </div>
                          {/* KPIs */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
                            {kpi({ icon: 'users', color: 'var(--green-light)', tint: 'var(--green-bg)', valor: cliAct, sub: `/ ${clientes.length}`, label: 'Clientes activos' })}
                            {kpi({ icon: 'list', color: 'var(--muted)', tint: 'var(--neutral-bg)', valor: quinielas.length, label: 'Quinielas totales' })}
                            {kpi({ icon: 'wallet', color: 'var(--green-light)', tint: 'var(--green-bg)', valor: formatearMXN(cajaNeto), label: 'Caja global' })}
                            {kpi({ icon: 'trending-up', color: 'var(--muted)', tint: 'var(--neutral-bg)', valor: visitas7.toLocaleString('es-MX'), label: 'Visitas · 7 días' })}
                            {kpi({ icon: 'heart', color: '#FB7185', tint: 'rgba(251,113,133,0.14)', valor: loadingDonativos ? '…' : formatearMXN(totalDonado), sub: donativos.length ? `· ${donativos.length}` : null, label: 'Donativos (Stripe)' })}
                          </div>
                          {/* En movimiento: accesos directos a quinielas abiertas o jugándose */}
                          {enMovimientoSuper.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-soft)', margin: '0 0 11px' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--muted)' }}>
                                  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
                                </svg>
                                En movimiento
                              </p>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {enMovimientoSuper.map(movingCard)}
                              </div>
                            </div>
                          )}
                          {/* Módulos */}
                          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-soft)', margin: '0 0 11px' }}>Módulos</p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13, marginBottom: 20 }}>
                            {deskModule({ modulo: 'caja', icon: 'wallet', title: 'Caja global', desc: 'Saldos y movimientos de todos los participantes.' })}
                            {deskModule({ modulo: 'clientes', icon: 'users', title: 'Clientes', meta: clientes.length || null, desc: 'Altas, notas y estado de cuentas.' })}
                            {quinielasOtras.length > 0 && deskModule({ modulo: 'otros', icon: 'user', title: 'Otros admins', meta: quinielasOtras.length, desc: 'Quinielas agrupadas por cliente.' })}
                            {deskModule({ modulo: 'mis', icon: 'ball', title: 'Mis quinielas', meta: misFlat.length || null, desc: 'Quinielas creadas desde tu cuenta.' })}
                            {deskModule({ modulo: 'cuenta', icon: 'key', title: 'Mi cuenta', desc: 'Accesos, seguridad y herramientas.' })}
                          </div>
                          {/* Actividad 7 días */}
                          <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '16px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', gap: 26 }}>
                            <div style={{ flex: '0 0 auto' }}>
                              <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted-soft)', margin: '0 0 4px' }}>Actividad 7 días</p>
                              <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{visitas7.toLocaleString('es-MX')} visitas</p>
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
                              {(d7.length ? d7 : Array.from({ length: 7 }, () => ({ visitas: 0 }))).map((d, i) => {
                                const v = Number(d.visitas) || 0
                                const h = Math.max(6, Math.round((v / maxV) * 100))
                                return <span key={i} title={`${v} visitas`} style={{ flex: 1, height: `${h}%`, background: i === idxPico && v > 0 ? 'var(--green)' : 'var(--card-light)', borderRadius: 3 }} />
                              })}
                            </div>
                            <div style={{ flex: '0 0 auto', display: 'flex', gap: 22, borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
                              <div><p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Celular</p><p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', margin: '2px 0 0' }}>{celPct}%</p></div>
                              <div><p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Hora pico</p><p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', margin: '2px 0 0' }}>{horaPico}</p></div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    {superModulo === 'caja' && (superDesktop ? cajaDesktop : (<>{tituloTabSuper('Caja', 'Depósitos, premios y saldos por participante')}{cajaSection}</>))}
                    {superModulo === 'clientes' && (superDesktop ? clientesDesktop : (<>{tituloTabSuper('Clientes', 'Altas, notas y estado de cuentas', volverACuentaSuper)}{clientesSection}</>))}
                    {superModulo === 'mis' && (superDesktop ? misDesktop : misQuinielasSection)}
                    {superModulo === 'otros' && (superDesktop ? otrosDesktop : (<>{tituloTabSuper('Otros admins', 'Quinielas agrupadas por cliente', volverACuentaSuper)}{otrosSection}</>))}
                    {superModulo === 'estadisticas' && (superDesktop ? statsSection : (<>{tituloTabSuper('Estadísticas', 'Actividad de tus quinielas', undefined, (
                      <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--neutral-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '5px 12px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                        Últimos 7 días
                      </span>
                    ))}{statsSection}</>))}
                    {superModulo === 'cuenta' && superDesktop && (
                      <div style={{ maxWidth: 820, margin: '0 auto' }}>
                        <div style={{ marginBottom: 20 }}>
                          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>Mi cuenta</h2>
                          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>Datos, seguridad y herramientas.</p>
                        </div>
                        {/* Tu cuenta */}
                        <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)', padding: '16px 18px', marginBottom: 14 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 12px' }}>Tu cuenta</p>
                          <label style={{ ...lbl, marginBottom: 6 }}>Correo</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                            <AdminIcon name="lock" size={14} style={{ color: 'var(--muted)' }} />
                            <span style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>{auth.currentUser?.email || 'Super admin'}</span>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0' }}>El correo no se puede cambiar.</p>
                        </div>
                        {/* Seguridad */}
                        <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)', padding: '16px 18px', marginBottom: 14 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 12px' }}>Seguridad</p>
                          <label htmlFor="superd-p1" style={{ ...lbl, marginBottom: 6 }}>Nueva contraseña</label>
                          <input id="superd-p1" type="password" placeholder="Mínimo 8 caracteres" value={cuentaP1} onChange={e => { setCuentaP1(e.target.value); setCuentaPassMsg(null) }} style={{ marginBottom: 8 }} />
                          <MedidorPassword pwd={cuentaP1} />
                          <label htmlFor="superd-p2" style={{ ...lbl, marginTop: 12, marginBottom: 6 }}>Confirmar contraseña</label>
                          <input id="superd-p2" type="password" placeholder="Repite tu contraseña" value={cuentaP2} onChange={e => { setCuentaP2(e.target.value); setCuentaPassMsg(null) }} onKeyDown={e => e.key === 'Enter' && cambiarMiPassword()} style={{ marginBottom: 10 }} />
                          {cuentaPassMsg && <p style={{ fontSize: 12, color: cuentaPassMsg.tipo === 'ok' ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>{cuentaPassMsg.texto}</p>}
                          <button onClick={cambiarMiPassword} disabled={cambiandoPass} style={{ ...greenCtaStyle(cambiandoPass), padding: '11px 20px' }}>
                            {cambiandoPass ? 'Guardando…' : 'Cambiar contraseña'}
                          </button>
                        </div>
                        {/* Herramientas */}
                        <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)', padding: '8px 6px' }}>
                          {[
                            ['Consola de Firebase', 'https://console.firebase.google.com/project/quiniela-app-24896/overview', 'external', 'var(--text)'],
                            ['Ver quinielapp.fun', 'https://quinielapp.fun', 'external', 'var(--text)'],
                          ].map(([label, href, icon, color]) => (
                            <a key={label} href={href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', textDecoration: 'none', color, fontSize: 13.5, fontWeight: 600, borderRadius: 'var(--radius-sm)' }}>
                              <AdminIcon name={icon} size={16} style={{ color: 'var(--muted)' }} />
                              <span style={{ flex: 1 }}>{label}</span>
                              <AdminIcon name="chevron-right" size={14} style={{ color: 'var(--muted)' }} />
                            </a>
                          ))}
                          <button onClick={salir} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '13px 14px', background: 'transparent', border: 'none', color: 'var(--red)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', borderRadius: 'var(--radius-sm)', textAlign: 'left' }}>
                            <AdminIcon name="logout" size={16} />
                            <span style={{ flex: 1 }}>Cerrar sesión</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()
            ) : (() => {
              // Panel cliente (nuevo shell): router por pestaña
              const nombreCli = adminDoc?.nombre?.split(' ')[0] || 'admin'
              const tituloGrupo = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }
              const totalJugadores = quinielasMias.reduce((a, q) => a + (conteos[q.id] || 0), 0)
              const headerCli = (titulo, sub, cta) => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1 }}>{titulo}</h2>
                    {sub && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>{sub}</p>}
                  </div>
                  {cta}
                </div>
              )
              const ctaNueva = clienteDesktop ? (
                <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false), height: 38, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 18px', flexShrink: 0 }}>
                  <AdminIcon name="plus" size={16} /> Nueva quiniela
                </button>
              ) : null
              const renderGrupo = (items, titulo, clave, limite, marginTop) => {
                if (items.length === 0) return null
                const abierto = verTodo[clave]
                const visibles = items.slice(0, limite)
                const extras = items.slice(limite)
                const gridQuinielasStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' }
                return (
                  <>
                    <p style={{ ...tituloGrupo, marginTop }}>{titulo}</p>
                    {clienteDesktop ? (
                      <>
                        <div style={gridQuinielasStyle}>
                          {visibles.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                        </div>
                        {extras.length > 0 && (
                          <SmoothCollapse open={!!abierto}>
                            <div style={{ ...gridQuinielasStyle, marginTop: 12 }}>
                              {extras.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                            </div>
                          </SmoothCollapse>
                        )}
                      </>
                    ) : (
                      <>
                        {visibles.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                        {extras.length > 0 && (
                          <SmoothCollapse open={!!abierto}>
                            <div>
                              {extras.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                            </div>
                          </SmoothCollapse>
                        )}
                      </>
                    )}
                    {extras.length > 0 && (
                      <button
                        onClick={() => setVerTodo(v => ({ ...v, [clave]: !abierto }))}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '8px', margin: '4px 0 4px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
                      >
                        {abierto ? 'Mostrar menos' : `Mostrar ${extras.length} más`}
                        <AdminIcon name="chevron-down" size={15} style={{ color: 'var(--muted-soft)', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                      </button>
                    )}
                  </>
                )
              }
              const ordenarRecientes = (arr) => [...arr].sort((a, b) => fechaCreacionMs(b) - fechaCreacionMs(a))
              const ordenarFinalizadasRecientes = (arr) => [...arr].sort((a, b) => fechaFinalizadaMs(b) - fechaFinalizadaMs(a))
              const miasOrdenadas = {
                activas: ordenarRecientes(mias.activas),
                enJuego: ordenarRecientes(mias.enJuego),
                finalizadas: ordenarFinalizadasRecientes(mias.finalizadas),
              }
              const busquedaQuinielasTexto = busquedaQuinielasCliente.trim()
              const busquedaQuinielas = busquedaQuinielasTexto.toLowerCase()
              const coincideBusquedaQuiniela = (q) => {
                if (!busquedaQuinielas) return true
                return [
                  q.nombre,
                  q.codigoAcceso,
                ].some(v => String(v ?? '').toLowerCase().includes(busquedaQuinielas))
              }
              const filtrarBusquedaQuinielas = (arr) => arr.filter(coincideBusquedaQuiniela)
              const miasFiltradas = {
                activas: filtrarBusquedaQuinielas(miasOrdenadas.activas),
                enJuego: filtrarBusquedaQuinielas(miasOrdenadas.enJuego),
                finalizadas: filtrarBusquedaQuinielas(miasOrdenadas.finalizadas),
              }
              const totalQuinielasFiltradas = miasFiltradas.activas.length + miasFiltradas.enJuego.length + miasFiltradas.finalizadas.length
              const filtrosQuinielasCliente = [
                { key: 'todas', label: 'Todas', count: totalQuinielasFiltradas, tone: 'all' },
                { key: 'abiertas', label: 'Abiertas', count: miasFiltradas.activas.length, tone: 'green' },
                { key: 'jugando', label: 'Jugándose', count: miasFiltradas.enJuego.length, tone: 'green' },
                { key: 'finalizadas', label: 'Finalizadas', count: miasFiltradas.finalizadas.length, tone: 'muted' },
              ]
              const quinielasClienteFiltradas = filtroQuinielasCliente === 'abiertas'
                ? miasFiltradas.activas
                : filtroQuinielasCliente === 'jugando'
                  ? miasFiltradas.enJuego
                  : filtroQuinielasCliente === 'finalizadas'
                    ? miasFiltradas.finalizadas
                    : [...miasFiltradas.activas, ...miasFiltradas.enJuego, ...miasFiltradas.finalizadas]
              const filtroQuinielasActual = filtrosQuinielasCliente.find(f => f.key === filtroQuinielasCliente)
              const buscadorQuinielas = (
                <div className="super-mobile-search admin-quinielas-search">
                  <AdminIcon name="search" size={15} />
                  <input
                    type="search"
                    placeholder="Buscar quiniela o código…"
                    value={busquedaQuinielasCliente}
                    onChange={e => setBusquedaQuinielasCliente(e.target.value)}
                    autoComplete="off"
                    aria-label="Buscar quinielas"
                  />
                </div>
              )
              const sinResultadosQuinielas = (
                <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '1rem 0' }}>
                  Sin resultados para "{busquedaQuinielasTexto}".
                </p>
              )
              const listaQuinielas = quinielasMias.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}><AdminIcon name="ball" size={40} /></div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Sin quinielas todavía</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Crea tu primera quiniela para comenzar.</p>
                  <button onClick={abrirNuevaQuiniela} style={{ ...greenCtaStyle(false) }}>Crear ahora →</button>
                </div>
              ) : clienteMobile ? (
                <div>
                  {buscadorQuinielas}
                  <div ref={filtroQuinielasScrollRef} className="super-filter-row admin-quiniela-filter-row" role="tablist" aria-label="Filtrar quinielas">
                    {filtrosQuinielasCliente.map(({ key, label, count, tone }) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        className={`super-filter-chip admin-quiniela-filter-chip admin-quiniela-filter-chip--${tone}${filtroQuinielasCliente === key ? ' is-active' : ''}`}
                        onClick={() => setFiltroQuinielasCliente(key)}
                        aria-selected={filtroQuinielasCliente === key}
                      >
                        {tone !== 'all' && <span className="admin-quiniela-filter-dot" />}
                        <span>{label} · {count}</span>
                      </button>
                    ))}
                  </div>
                  {busquedaQuinielas && totalQuinielasFiltradas === 0 ? (
                    sinResultadosQuinielas
                  ) : quinielasClienteFiltradas.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No hay quinielas {filtroQuinielasActual?.label?.toLowerCase() ?? 'en este filtro'}.
                    </p>
                  ) : (
                    <div className="super-mobile-card-list">
                      {quinielasClienteFiltradas.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {buscadorQuinielas}
                  {(() => {
                    if (busquedaQuinielas && totalQuinielasFiltradas === 0) return sinResultadosQuinielas
                    const sinAbiertas = miasFiltradas.activas.length === 0 && miasFiltradas.enJuego.length === 0
                    // Si no hay quinielas abiertas ni jugándose, mostramos las finalizadas
                    // en vez de esconderlas todas tras el "Mostrar más".
                    const limFinalizadas = clienteDesktop ? 4 : (sinAbiertas ? 2 : 0)
                    return (
                      <>
                        {renderGrupo(miasFiltradas.activas, 'Activas', 'mias-activas', clienteDesktop ? 6 : 2, 0)}
                        {renderGrupo(miasFiltradas.enJuego, 'Jugándose', 'mias-enjuego', clienteDesktop ? 6 : 2, miasFiltradas.activas.length > 0 ? 20 : 0)}
                        {renderGrupo(miasFiltradas.finalizadas, 'Finalizadas', 'mias-finalizadas', limFinalizadas, sinAbiertas ? 0 : 20)}
                      </>
                    )
                  })()}
                </>
              )
              const proximamente = (icon, titulo, desc) => (
                <div style={{ ...card, textAlign: 'center', padding: '3rem 2rem' }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}><AdminIcon name={icon} size={40} /></div>
                  <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 'var(--radius-full)', background: 'var(--neutral-bg)', color: 'var(--muted)', marginBottom: 12 }}>PRÓXIMAMENTE</span>
                  <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>{titulo}</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>{desc}</p>
                </div>
              )

              // Router
              if (clienteTab === 'quinielas') {
                return (<>{headerCli('Quinielas', `${quinielasMias.length} en total · ${mias.activas.length} activa${mias.activas.length !== 1 ? 's' : ''}`, ctaNueva)}{listaQuinielas}</>)
              }
              if (clienteTab === 'caja') {
                return (<>{headerCli('Caja', 'Depósitos, premios y saldos por participante')}{proximamente('wallet', 'Caja próximamente', 'Aquí podrás registrar depósitos, inscripciones, premios y retiros por participante, y ver el saldo de cada quiniela. Estamos afinando esta sección.')}</>)
              }
              if (clienteTab === 'stats') {
                return (<>{headerCli('Estadísticas', 'Actividad de tus quinielas')}{proximamente('chart', 'Estadísticas próximamente', 'Aquí verás visitas, predicciones enviadas y participantes más activos de tus quinielas. Estamos afinando esta sección.')}</>)
              }
              if (clienteTab === 'soporte') {
                return (
                  <>
                    {headerCli('Soporte', '¿Necesitas ayuda con tu panel?')}
                    {soporteOpciones()}
                  </>
                )
              }
              // clienteTab === 'inicio' (default)
              const abiertas = [...miasOrdenadas.activas, ...miasOrdenadas.enJuego].slice(0, 3)
              const quinielasInicio = abiertas.length > 0
                ? abiertas
                : (clienteMobile ? miasOrdenadas.finalizadas.slice(0, 1) : [])
              const tituloQuinielasInicio = abiertas.length > 0 ? 'Tus quinielas' : 'Última finalizada'
              return (
                <>
                  {headerCli(`Hola, ${nombreCli}`, 'Tu panel de quinielas', ctaNueva)}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                    {[
                      { v: mias.activas.length, l: 'Abiertas', c: 'var(--green-light)' },
                      { v: mias.enJuego.length, l: 'Jugándose', c: 'var(--green-light)' },
                      { v: totalJugadores, l: 'Jugadores', c: 'var(--text-strong)' },
                    ].map(s => (
                      <div key={s.l} style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: '14px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)' }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: s.c, margin: 0, lineHeight: 1 }}>{s.v}</p>
                        <p style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, margin: '4px 0 0' }}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                  {quinielasInicio.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <p style={tituloGrupo}>{tituloQuinielasInicio}</p>
                        <button onClick={() => navCliente('quinielas')} style={{ background: 'transparent', border: 'none', color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Ver todas ›</button>
                      </div>
                      {clienteDesktop ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' }}>
                          {quinielasInicio.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)}
                        </div>
                      ) : (
                        quinielasInicio.map(q => <QuinielaCard key={q.id} q={q} conteos={conteos} onGestionar={gestionarQuiniela} superCompact softManage />)
                      )}
                    </>
                  ) : quinielasMias.length === 0 ? listaQuinielas : null}
                </>
              )
            })()}
          </>
        )}


        {/* Vista: Caja: detalle de participante */}
        {vista === 'caja' && cajaNombre !== null && (
          <div className="super-module-content">
            {clienteShell && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => { setVista('lista'); setCajaNombre(null) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
                  <AdminIcon name="arrow-left" size={15} /> Caja
                </button>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cajaNombre}</h2>
              </div>
            )}
            <div className={`super-balance-current${saldoParticipante > 0 ? ' is-positive' : saldoParticipante < 0 ? ' is-negative' : ''}`}>
              <span className="super-balance-current-label">Saldo actual</span>
              <span className="super-balance-current-value" style={{ color: saldoParticipante > 0 ? 'var(--green)' : saldoParticipante === 0 ? 'var(--muted)' : 'var(--red)' }}>
                {saldoParticipante >= 0 ? '+' : ''}{formatearMXN(saldoParticipante)}
              </span>
            </div>

            <div className="super-mobile-card" style={{ padding: '1.1rem 1.25rem' }}>
              <label style={{ ...lbl, marginBottom: 10 }}>Registrar movimiento</label>

              <div className="super-segment-grid">
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
                      type="button"
                      onClick={() => setNuevoTipo(op.val)}
                      className={`super-segment-btn${activo ? (esPos ? ' is-positive' : ' is-negative') : ''}`}
                    >
                      {op.signo} {op.label}
                    </button>
                  )
                })}
              </div>

              <label style={{ ...lbl, marginBottom: 6 }}>Monto (MXN)</label>
              <input type="number" min="1" step="1" placeholder="Ej. 100" value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)} style={{ marginBottom: 12 }} />

              <label style={{ ...lbl, marginBottom: 6 }}>Nota (opcional)</label>
              <input type="text" placeholder="Ej. Quiniela Semis" value={nuevaNota} onChange={e => setNuevaNota(e.target.value)} style={{ marginBottom: 14 }} />

              <button
                onClick={guardarMovimiento}
                disabled={guardandoMov || !nuevoMonto || Number(nuevoMonto) <= 0}
                style={{ ...greenCtaStyle(guardandoMov || !nuevoMonto || Number(nuevoMonto) <= 0), width: '100%', padding: '12px' }}
              >
                {guardandoMov ? 'Guardando…' : 'Guardar movimiento →'}
              </button>
            </div>

            <div className="super-mobile-card" style={{ padding: '1.1rem 1.25rem' }}>
              <label style={lbl}>Historial</label>
              {movimientosParticipante.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13, padding: '4px 0' }}>Sin movimientos registrados todavía.</p>
              ) : movimientosParticipante.map((m) => {
                const esPos = m.tipo === 'premio' || m.tipo === 'deposito'
                const tipoLabel = { premio: 'Premio', deposito: 'Depósito', inscripcion: 'Inscripción', retiro: 'Retiro' }[m.tipo] ?? m.tipo
                return (
                  <div key={m.id} className="super-history-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tipoLabel}{m.nota ? ` · ${m.nota}` : ''}</p>
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
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Vista: Mi cuenta */}
        {vista === 'cuenta' && (() => {
          const cuentaEmail = adminDoc?.email ?? auth.currentUser?.email ?? ''
          const nombreCuenta = cuentaNombre.trim() || adminDoc?.nombre || 'Mi cuenta'
          const telefonoCuenta = cuentaTel.trim()
          const passwordEval = evaluarPassword(cuentaP1)
	          const passwordListo = !!cuentaP2 && passwordEval.ok && cuentaP1 === cuentaP2
	          const passwordCoincide = !!cuentaP2 && cuentaP1 === cuentaP2
	          const soporteLink = waLink(MENSAJES_WA?.soporte || 'Hola, necesito ayuda con mi panel de QuinielApp.')
	          const correoLink = waLink('¡Hola! Quiero cambiar el correo de acceso de mi cuenta en QuinielApp.')
          const editarCampo = (campo) => {
            setEditandoCuentaCampo(campo)
            setCuentaMsg(null)
          }
          const guardarPasswordCuenta = () => {
            if (!passwordListo || cambiandoPass) return
            cambiarMiPassword()
          }

          return (
            <>
              <div className={`admin-account-page${correoCuentaSheetAbierto || eliminarCuentaAbierta ? ' is-sheet-open' : ''}`}>
                <section className="admin-account-profile">
                  <span className="admin-account-avatar">
                    {iniciales(cuentaNombre || adminDoc?.nombre || adminDoc?.email || auth.currentUser?.email)}
                  </span>
                  <h2 className="admin-account-name">{nombreCuenta}</h2>
                  <span className="admin-account-role">{soySuper ? 'Super Admin' : 'Organizador'}</span>
                </section>

                <p className="admin-account-group-label">Datos</p>
                <section className="admin-account-group" aria-label="Datos de cuenta">
                  {editandoCuentaCampo === 'nombre' ? (
                    <div className="admin-account-data-row is-editing">
                      <p className="admin-account-editing-label">Editando nombre</p>
                      <div className="admin-account-edit-line">
                        <input
                          id="cuenta-nombre"
                          className="admin-account-edit-input"
                          type="text"
                          value={cuentaNombre}
                          autoFocus
                          onChange={e => { setCuentaNombre(e.target.value); setCuentaMsg(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') guardarMiCuenta()
                            if (e.key === 'Escape') cancelarEdicionCuenta()
                          }}
                        />
                        <button type="button" className="admin-account-inline-btn is-cancel" onClick={cancelarEdicionCuenta} disabled={guardandoCuenta} aria-label="Cancelar edición de nombre">
                          <AdminIcon name="x" size={16} strokeWidth={2.2} />
                        </button>
                        <button type="button" className="admin-account-inline-btn is-save" onClick={guardarMiCuenta} disabled={guardandoCuenta} aria-label="Guardar nombre">
                          <AdminIcon name="check" size={18} strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="admin-account-data-row" onClick={() => editarCampo('nombre')}>
                      <span className="admin-account-row-copy">
                        <span className="admin-account-row-label">Nombre</span>
                        <span className="admin-account-row-value">{nombreCuenta}</span>
                      </span>
                      <span className="admin-account-edit-chip" aria-hidden="true">
                        <AdminIcon name="pencil" size={15} />
                      </span>
                    </button>
                  )}

                  {editandoCuentaCampo === 'telefono' ? (
                    <div className="admin-account-data-row is-editing">
                      <p className="admin-account-editing-label">Editando teléfono</p>
                      <div className="admin-account-edit-line">
                        <input
                          id="cuenta-tel"
                          className="admin-account-edit-input"
                          type="tel"
                          inputMode="tel"
                          placeholder="Ej. 55 1234 5678"
                          value={cuentaTel}
                          autoFocus
                          onChange={e => { setCuentaTel(e.target.value); setCuentaMsg(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') guardarMiCuenta()
                            if (e.key === 'Escape') cancelarEdicionCuenta()
                          }}
                        />
                        <button type="button" className="admin-account-inline-btn is-cancel" onClick={cancelarEdicionCuenta} disabled={guardandoCuenta} aria-label="Cancelar edición de teléfono">
                          <AdminIcon name="x" size={16} strokeWidth={2.2} />
                        </button>
                        <button type="button" className="admin-account-inline-btn is-save" onClick={guardarMiCuenta} disabled={guardandoCuenta} aria-label="Guardar teléfono">
                          <AdminIcon name="check" size={18} strokeWidth={2.4} />
                        </button>
                      </div>
                      <p className="admin-account-edit-note">Opcional. Sirve para que te contactemos si hay algún problema con tu cuenta.</p>
                    </div>
                  ) : (
                    <button type="button" className="admin-account-data-row" onClick={() => editarCampo('telefono')}>
                      <span className="admin-account-row-copy">
                        <span className="admin-account-row-label">Teléfono</span>
                        <span className={`admin-account-row-value${telefonoCuenta ? '' : ' is-empty'}`}>{telefonoCuenta || 'Agregar teléfono'}</span>
                      </span>
                      <span className="admin-account-edit-chip" aria-hidden="true">
                        <AdminIcon name="pencil" size={15} />
                      </span>
                    </button>
                  )}

                  <div className="admin-account-data-row">
                    <span className="admin-account-row-copy">
                      <span className="admin-account-row-label">Correo <span>· acceso</span></span>
                      <span className="admin-account-row-value is-email">{cuentaEmail}</span>
                    </span>
                    <button type="button" className="admin-account-lock-btn" onClick={() => setCorreoCuentaSheetAbierto(true)} aria-label="Por qué no puedo editar el correo">
                      <AdminIcon name="lock" size={15} />
                    </button>
                  </div>
                </section>

                {cuentaMsg && <p className={`admin-account-message is-${cuentaMsg.tipo}`}>{cuentaMsg.texto}</p>}

                <p className="admin-account-group-label">Ajustes</p>
                <section className="admin-account-group" aria-label="Ajustes de cuenta">
                  <button
                    type="button"
                    className="admin-account-setting-row"
                    onClick={() => setSeguridadAbierta(v => !v)}
                    aria-expanded={seguridadAbierta}
                  >
                    <span className="admin-account-setting-icon">
                      <AdminIcon name="key" size={16} />
                    </span>
                    <span className="admin-account-setting-label">Cambiar contraseña</span>
                    <AdminIcon name="chevron-down" size={16} style={{ color: 'var(--muted-soft)', transform: seguridadAbierta ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
                  </button>
                  <SmoothCollapse open={seguridadAbierta}>
                    <div className="admin-account-password-panel">
                      <label htmlFor="cuenta-p1" className="admin-account-password-label">Nueva contraseña</label>
                      <input
                        id="cuenta-p1"
                        className="admin-account-password-input"
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        value={cuentaP1}
                        onChange={e => { setCuentaP1(e.target.value); setCuentaPassMsg(null) }}
                      />
                      <MedidorPassword pwd={cuentaP1} />
                      <p className="admin-account-password-note">Mínimo 8 caracteres, con al menos una letra y un número.</p>
                      <label htmlFor="cuenta-p2" className="admin-account-password-label">Confirmar contraseña</label>
                      <input
                        id="cuenta-p2"
                        className="admin-account-password-input"
                        type="password"
                        placeholder="Repite tu contraseña"
                        value={cuentaP2}
                        onChange={e => { setCuentaP2(e.target.value); setCuentaPassMsg(null) }}
                        onKeyDown={e => e.key === 'Enter' && guardarPasswordCuenta()}
                      />
                      {cuentaP2 && (
                        <p className={`admin-account-password-match${passwordCoincide ? ' is-ok' : ' is-error'}`}>
                          <AdminIcon name={passwordCoincide ? 'check' : 'x'} size={13} strokeWidth={2.4} />
                          {passwordCoincide ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                        </p>
                      )}
                      {cuentaPassMsg && <p className={`admin-account-message is-${cuentaPassMsg.tipo}`}>{cuentaPassMsg.texto}</p>}
                      <button type="button" className="admin-account-password-submit" onClick={guardarPasswordCuenta} disabled={!passwordListo || cambiandoPass}>
                        {cambiandoPass ? 'Guardando…' : 'Cambiar contraseña'}
                      </button>
                    </div>
                  </SmoothCollapse>

                  <button type="button" className="admin-account-setting-row" onClick={() => setAyudaAbierta(true)}>
                    <span className="admin-account-setting-icon">
                      <AdminIcon name="info" size={16} />
                    </span>
                    <span className="admin-account-setting-label">Centro de ayuda</span>
                    <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
                  </button>

                  <a href={soporteLink} target="_blank" rel="noreferrer" className="admin-account-setting-row">
                    <span className="admin-account-setting-icon is-whatsapp">
                      <AdminIcon name="message" size={16} />
                    </span>
                    <span className="admin-account-setting-label">Soporte por WhatsApp</span>
                    <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
                  </a>

	                </section>

                {soySuper && (
                  <>
                    <p className="admin-account-group-label">Súper admin</p>
                    <section className="admin-account-group" aria-label="Herramientas de super admin">
                      <button type="button" className="admin-account-setting-row" onClick={() => { setSuperModulo('otros'); setVista('lista') }}>
                        <span className="admin-account-setting-icon">
                          <AdminIcon name="user" size={16} />
                        </span>
                        <span className="admin-account-setting-label">Otros admins</span>
                        <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
                      </button>
                      <button type="button" className="admin-account-setting-row" onClick={() => { setSuperModulo('clientes'); setVista('lista') }}>
                        <span className="admin-account-setting-icon">
                          <AdminIcon name="users" size={16} />
                        </span>
                        <span className="admin-account-setting-label">Clientes</span>
                        <AdminIcon name="chevron-right" size={16} style={{ color: 'var(--muted)' }} />
                      </button>
                    </section>
                  </>
                )}

                <button type="button" className="admin-account-logout-btn" onClick={salir}>
                  <AdminIcon name="logout" size={17} />
                  Cerrar sesión
                </button>

                {(soySuper || adminDoc) && (
                  <section className="admin-account-danger-zone" aria-label="Eliminar cuenta">
                    <button
                      type="button"
                      className="admin-account-delete-link"
                      onClick={soySuper ? () => setEliminarCuentaSoloUsuariosAbierta(true) : abrirEliminarCuenta}
                    >
                      Eliminar mi cuenta
                    </button>
                  </section>
                )}

                <section className="admin-account-footer-group" aria-label="Apoyo y legal">
                  <a href="/donar" className="admin-account-footer-link is-apoyar">
                    <AdminIcon name="heart" size={16} />
                    Apoyar el proyecto
                  </a>
                  <a href={soporteLink} target="_blank" rel="noreferrer" className="admin-account-footer-link">
                    Contacto
                  </a>
                  <a href="/privacidad" className="admin-account-footer-link">
                    Aviso de privacidad
                  </a>
                  <a href="/terminos" className="admin-account-footer-link">
                    Términos y condiciones
                  </a>
                  <hr className="admin-account-footer-divider" />
                  <p className="admin-account-footer-copy">© {new Date().getFullYear()} QuinielApp · v1.0</p>
                </section>
              </div>

              {correoCuentaSheetAbierto && (
                <div className="admin-account-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="cuenta-correo-title" onClick={() => setCorreoCuentaSheetAbierto(false)}>
                  <div className="admin-account-sheet" onClick={e => e.stopPropagation()}>
                    <span className="admin-account-sheet-grabber" aria-hidden="true" />
                    <span className="admin-account-sheet-icon">
                      <AdminIcon name="lock" size={24} />
                    </span>
                    <h2 id="cuenta-correo-title" className="admin-account-sheet-title">Tu correo es tu usuario</h2>
                    <p className="admin-account-sheet-copy">
                      Por seguridad, el correo de acceso no se puede cambiar desde la app. Si necesitas actualizarlo, solicita un cambio.
                    </p>
                    <a href={correoLink} target="_blank" rel="noreferrer" className="admin-account-sheet-primary">
                      <AdminIcon name="message" size={18} />
                      Solicitar cambio de correo
                    </a>
                    <button type="button" className="admin-account-sheet-secondary" onClick={() => setCorreoCuentaSheetAbierto(false)}>
                      Entendido
                    </button>
                  </div>
                </div>
              )}

              {eliminarCuentaAbierta && (
                <div className="admin-account-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="cuenta-eliminar-title" onClick={cerrarEliminarCuenta}>
                  <div className="admin-account-sheet is-danger" onClick={e => e.stopPropagation()}>
                    <span className="admin-account-sheet-grabber" aria-hidden="true" />
                    <div className="admin-account-danger-heading">
                      <span className="admin-account-sheet-icon is-danger">
                        <AdminIcon name="alert" size={24} />
                      </span>
                      <h2 id="cuenta-eliminar-title" className="admin-account-sheet-title">¿Eliminar tu cuenta?</h2>
                    </div>
                    <p className="admin-account-sheet-copy is-danger">
                      Esta acción es permanente. Se borrarán tu cuenta y tus datos de organizador. Las quinielas ya jugadas no se pueden recuperar.
                    </p>
                    {eliminarCuentaMsg && <p className={`admin-account-message is-${eliminarCuentaMsg.tipo}`}>{eliminarCuentaMsg.texto}</p>}
                    <button type="button" className="admin-account-sheet-primary is-danger" onClick={eliminarMiCuenta} disabled={eliminandoCuenta}>
                      <AdminIcon name="trash" size={18} />
                      {eliminandoCuenta ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
                    </button>
                    <button type="button" className="admin-account-sheet-secondary is-bordered" onClick={cerrarEliminarCuenta} disabled={eliminandoCuenta}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {eliminarCuentaSoloUsuariosAbierta && (
                <div className="admin-account-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="cuenta-eliminar-solo-usuarios-title" onClick={() => setEliminarCuentaSoloUsuariosAbierta(false)}>
                  <div className="admin-account-sheet is-danger" onClick={e => e.stopPropagation()}>
                    <span className="admin-account-sheet-grabber" aria-hidden="true" />
                    <div className="admin-account-danger-heading">
                      <span className="admin-account-sheet-icon is-danger">
                        <AdminIcon name="alert" size={24} />
                      </span>
                      <h2 id="cuenta-eliminar-solo-usuarios-title" className="admin-account-sheet-title">¿Eliminar tu cuenta?</h2>
                    </div>
                    <p className="admin-account-sheet-copy is-danger">
                      Esta función es solo para usuarios de tu app. Los botones no ejecutan acciones mas que salir del modal.
                    </p>
                    <button type="button" className="admin-account-sheet-primary is-danger" onClick={() => setEliminarCuentaSoloUsuariosAbierta(false)}>
                      <AdminIcon name="trash" size={18} />
                      Sí, eliminar definitivamente
                    </button>
                    <button type="button" className="admin-account-sheet-secondary is-bordered" onClick={() => setEliminarCuentaSoloUsuariosAbierta(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* Vista: Nueva quiniela */}
        {vista === 'nueva' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Nueva quiniela</p>
              <button
                type="button"
                onClick={() => setAyudaAbierta(true)}
                aria-label="Abrir ayuda"
                title="Ayuda"
                style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-strong)', background: 'var(--card-light)',
                  color: 'var(--green)', fontSize: 14, fontWeight: 900,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                ?
              </button>
            </div>

            {!tipNuevaCerrado && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 14 }}>
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>👋</span>
                <p style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, margin: 0 }}>
                  <strong style={{ color: 'var(--text-strong)' }}>Tip:</strong> ponle un <strong style={{ color: 'var(--text-strong)' }}>nombre</strong> y agrega tus <strong style={{ color: 'var(--text-strong)' }}>partidos con el buscador</strong>. La <strong style={{ color: 'var(--text-strong)' }}>hora de cierre</strong> se ajusta sola al primer partido. Comparte el <strong style={{ color: 'var(--text-strong)' }}>código</strong>: los <strong style={{ color: 'var(--text-strong)' }}>resultados se llenan automáticamente</strong> cuando terminan los partidos.
                </p>
                <button onClick={cerrarTipNueva} aria-label="Cerrar tip" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1.3 }}>✕</button>
              </div>
            )}

            {/* 1. ¿Qué es?: identidad de la quiniela */}
            <div style={card}>
              <label htmlFor="quiniela-nombre" style={lbl}>Nombre de la quiniela</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 14 }}>
                <input id="quiniela-nombre" type="text" placeholder="Ej. Jornada 17: Liga MX" value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
                <EmojiPicker inputId="quiniela-nombre" value={nombre} onChange={setNombre} />
              </div>
            </div>

            {/* 2. Partidos: buscador + lista (el corazón de la quiniela) */}
            {renderBuscadorFixtures(agregarSeleccionados)}

            <div style={card}>
              <label style={lbl}>Partidos</label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Agrégalos con el <strong style={{ color: 'var(--text)' }}>buscador de arriba</strong>.
                Una vez que alguien predijo, <strong style={{ color: 'var(--text)' }}>ya no se pueden cambiar</strong>.
              </p>
              {partidos.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>Aún no hay partidos. Búscalos arriba y agrégalos.</p>
              )}
              {partidos.map((p, i) => (
                // Tarjeta solo lectura (los partidos vienen de ESPN, no se editan)
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < partidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {escudoMini(p.escudoLocal, p.local)}
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0 }}>{p.local}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0, textAlign: 'right' }}>{p.visitante}</span>
                      {escudoMini(p.escudoVisitante, p.visitante)}
                    </div>
                    {p.hora && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{formatFixtureDate(p.hora)}</div>}
                  </div>
                  <button type="button" onClick={() => quitarPartido(i)} aria-label="Quitar partido" title="Quitar" style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '2px 6px', flexShrink: 0 }}>Quitar ✕</button>
                </div>
              ))}
            </div>

            {/* 3. Cierre: depende de los partidos, por eso va después de ellos */}
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
                  <AdminIcon name="calendar" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Tu primer partido empieza el <strong style={{ color: 'var(--text)' }}>{formatFixtureDate(primeraHoraPartido(partidos))}</strong>. El cierre debe ser antes.{' '}
                  <button type="button" onClick={() => setCierre(cierreSugerido(partidos))} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Cerrar 5 min antes
                  </button>
                </p>
              )}
            </div>

            {/* 4. Acceso: quién puede entrar */}
            <div style={card}>
              <label htmlFor="quiniela-codigo" style={{ ...lbl, marginBottom: 4 }}>Código de acceso <span style={{ color: 'var(--red)' }}>*</span></label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Generado automático. Puedes cambiarlo, pero evita un código muy fácil. Solo quien lo tenga puede participar.
              </p>
              <input id="quiniela-codigo" type="text" placeholder="Ej. ACME2026" value={codigoAcceso} autoCapitalize="characters" onChange={e => setCodigoAcceso(normalizarCodigoAccesoInput(e.target.value))} />
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

        {/* Vista: Gestionar quiniela */}
        {vista === 'gestionar' && quinielaActual && (() => {
          const estaCerrada = esCerradaQ(quinielaActual)
          const estaFinalizada = esFinalizadaQ(quinielaActual)
	          const actualizarMarcadoresDisabled = sincronizandoResultados
          // Reabrir solo mientras no arranque el primer partido (ni esté finalizada).
          const puedeReabrir = estaCerrada && !estaFinalizada && !primerPartidoArranco(quinielaActual)
          const estadoBadge = estaFinalizada
            ? { label: 'Finalizada', bg: 'var(--neutral-bg)', color: 'var(--muted)' }
            : estaCerrada
              ? { label: 'Jugándose', bg: 'var(--green-bg)', color: 'var(--green-light)' }
              : { label: 'Abierta', bg: 'var(--green-bg)', color: 'var(--green)' }
          const volverAtras = () => { setVista('lista'); setQuinielaActual(null); setFixtures([]); setSeleccionados([]); setCajaNombre(null) }
          return (
            <>
              {/* Volver (escritorio super o cualquier vista del cliente: el hero con su back está oculto) */}
              {(superDesktop || clienteShell) && (
                <button onClick={volverAtras} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
                  <AdminIcon name="arrow-left" size={15} /> {soySuper ? 'Mis quinielas' : 'Quinielas'}
                </button>
              )}
              {/* Encabezado */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: superDesktop ? 'var(--font-display)' : undefined, fontSize: superDesktop ? 24 : 15, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {quinielaActual.nombre}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)', background: estadoBadge.bg, color: estadoBadge.color }}>{estadoBadge.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {quinielaActual.partidos?.length ?? 0} partidos · Creada {formatFecha(quinielaActual.creada)}
                    </span>
                  </div>
                </div>
                {(!estaCerrada || puedeReabrir) && (
                  <button
                    onClick={toggleCerrar}
                    disabled={toggling}
                    aria-label={toggling ? undefined : (estaCerrada ? 'Reabrir quiniela' : 'Cerrar quiniela')}
                    style={{
                      padding: '8px 14px', fontSize: 12, flexShrink: 0,
                      borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer',
                      border: estaCerrada ? 'none' : '1px solid var(--border-strong)',
                      background: toggling ? 'var(--card-light)' : (estaCerrada ? 'var(--green)' : 'var(--neutral-bg)'),
                      color: toggling ? 'var(--muted)' : (estaCerrada ? '#07120A' : 'var(--text)'),
                    }}
                  >
                    {toggling ? '…' : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AdminIcon name={estaCerrada ? 'unlock' : 'lock'} size={13} />
                        {estaCerrada ? 'Reabrir' : 'Cerrar'}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-soft)', borderRadius: 'var(--radius-sm)', padding: 4, marginBottom: 16, border: '1px solid var(--border)' }}>
                {[
                  { key: 'resultados',   icon: 'ball',   label: 'Resultados' },
                  { key: 'participantes', icon: 'users',  label: `${conteos[quinielaActual.id] ?? 0}` },
                  { key: 'editar',       icon: 'pencil', label: 'Editar' },
                  { key: 'compartir',    icon: 'link',   label: 'Compartir' },
                ].map(t => (
                  <button
                    key={t.key} onClick={() => setTab(t.key)}
                    style={{
                      flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: 700,
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                      background: tab === t.key ? 'var(--card-light)' : 'transparent',
                      color: tab === t.key ? 'var(--text-strong)' : 'var(--muted)',
                      transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    <AdminIcon name={t.icon} size={14} />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Resultados */}
              {tab === 'resultados' && (
                <>
                  <div style={card}>
                    <label style={{ ...lbl, marginBottom: 6 }}>Marcadores</label>
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                      Se llenan <strong style={{ color: 'var(--green)' }}>automáticamente</strong> cuando termina cada partido.
                    </p>
	                    {(quinielaActual.partidos ?? []).map((p, i) => {
                      const r = resultados[i] ?? {}
                      const cancelado    = !!r.cancelado
                      const tieneMarcador = !cancelado && String(r.local ?? '').trim() !== '' && String(r.visitante ?? '').trim() !== ''
                      const resultado    = tieneMarcador ? goalsToResultado(r.local, r.visitante) : null
                      const pendiente    = !cancelado && !tieneMarcador
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
                      const ultimo = i === (quinielaActual.partidos?.length ?? 0) - 1

                      return (
                        <div
                          key={i}
                          style={{
                            padding: '12px 4px',
                            borderBottom: ultimo ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          {/* Fila horizontal estilo ranking: local: marcador: visitante */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                {p.local || `Local ${i + 1}`}
                              </span>
                              {escudoMini(p.escudoLocal, p.local)}
                            </div>
                            <span style={{
                              minWidth: 52, textAlign: 'center',
                              fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800,
                              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--card-light)',
                              color: cancelado ? 'var(--muted)' : pendiente ? 'var(--muted-soft)' : 'var(--text-strong)',
                              textDecoration: cancelado ? 'line-through' : 'none',
                            }}>
                              {cancelado ? 'Cancelado' : pendiente ? 'vs' : `${r.local}-${r.visitante}`}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              {escudoMini(p.escudoVisitante, p.visitante)}
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.visitante || `Visitante ${i + 1}`}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)', background: resColor.bg, color: resColor.color, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                              {resLabel}
                            </span>
                          </div>
	                        </div>
	                      )
	                    })}
	                    <div style={{ display: 'grid', justifyItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
	                      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, lineHeight: 1.45 }}>
	                        ¿Ya terminó un partido y no aparece el marcador?
	                      </p>
	                      <button
	                        type="button"
	                        onClick={actualizarMarcadoresAhora}
	                        disabled={actualizarMarcadoresDisabled}
	                        style={{
	                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
	                          padding: '7px 11px', borderRadius: 'var(--radius-sm)',
	                          border: '1px solid var(--border-strong)',
	                          background: actualizarMarcadoresDisabled ? 'var(--card-light)' : 'transparent',
	                          color: actualizarMarcadoresDisabled ? 'var(--muted)' : 'var(--green)',
	                          fontSize: 12, fontWeight: 800,
	                          cursor: actualizarMarcadoresDisabled ? 'not-allowed' : 'pointer',
	                        }}
	                      >
	                        <AdminIcon name="refresh" size={13} style={sincronizandoResultados ? { animation: 'refresh-spin .75s linear infinite' } : undefined} />
	                        {sincronizandoResultados ? 'Actualizando…' : 'Actualizar ahora'}
	                      </button>
	                      {syncResultadosMsg && (
	                        <p style={{
	                          fontSize: 11.5,
	                          color: syncResultadosMsg.tipo === 'ok' ? 'var(--green)' : syncResultadosMsg.tipo === 'error' ? 'var(--red)' : 'var(--muted)',
	                          margin: 0,
	                          lineHeight: 1.45,
	                        }}>
	                          {syncResultadosMsg.texto}
	                        </p>
	                      )}
	                    </div>
	                    <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 14, marginBottom: 0, lineHeight: 1.55 }}>
	                      ¿Un marcador no llegó o está mal?
	                      <br />
	                      <a
                        href={waLink(mensajeReporteProblema({
                          correo: adminDoc?.email ?? auth.currentUser?.email ?? '',
                          quiniela: quinielaActual.nombre,
                          enlace: linkRanking,
                        }))}
                        target="_blank" rel="noreferrer"
                        style={{ color: 'var(--green)', fontWeight: 700 }}
                      >
                        Repórtalo por WhatsApp
                      </a>
                    </p>
                  </div>

                  {tienePremio(quinielaActual) && esFinalizadaQ(quinielaActual) && (
                    <div style={{
                      marginTop: 16, padding: '14px 16px',
                      background: 'linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))', borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)',
                    }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {quinielaActual.boteDevuelto && <AdminIcon name="banknote" size={14} />}
                        {quinielaActual.boteDevuelto ? 'Bote marcado como devuelto' : 'Bote del premio'}
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
                        {toggleBote ? '…' : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <AdminIcon name={quinielaActual.boteDevuelto ? 'undo' : 'banknote'} size={14} />
                            {quinielaActual.boteDevuelto ? 'Reactivar premio' : 'Devolver bote'}
                          </span>
                        )}
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
                      <div style={{ color: 'var(--muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}><AdminIcon name="users" size={36} /></div>
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <AdminIcon name={pendientes > 0 ? 'clock' : 'check'} size={13} />
                            {pendientes > 0
                              ? `${pendientes} pago${pendientes !== 1 ? 's' : ''} pendiente${pendientes !== 1 ? 's' : ''} de validar`
                              : 'Todos los pagos confirmados'}
                          </span>
                        </div>
                      )}
                      {nSospechosos > 0 && (
                        <div style={{
                          background: 'var(--yellow-bg)',
                          border: '1px solid var(--yellow)',
                          borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12,
                          fontSize: 12, color: 'var(--yellow-soft)', lineHeight: 1.5,
                        }}>
                          <AdminIcon name="info" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{nSospechosos} posible{nSospechosos !== 1 ? 's' : ''} duplicado{nSospechosos !== 1 ? 's' : ''} detectado{nSospechosos !== 1 ? 's' : ''}.
                          Revisa los nombres marcados como <strong>Similar</strong> y elimina los que sean repetidos.
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5, display: 'grid', gap: 5 }}>
                        {esTipoBote && (
                          <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                            <AdminIcon name="clock" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span><strong style={{ color: 'var(--text)' }}>Pendiente/Pagado</strong>: pulsa el botón cuando confirmes el pago del jugador.</span>
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                          <AdminIcon name="eye" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span><strong style={{ color: 'var(--text)' }}>Ocultar</strong>: lo quita del ranking público sin borrarlo{esTipoBote ? ' (no cuenta para el bote)' : ''}. Es reversible.</span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                          <AdminIcon name="trash" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span><strong style={{ color: 'var(--text)' }}>Eliminar</strong>: lo saca de la quiniela; el jugador podrá registrarse de nuevo.</span>
                        </span>
                      </div>
                      <div style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <AdminIcon name="info" size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--green)' }} />
                        <span><strong style={{ color: 'var(--text)' }}>¿Alguien quiere cambiar sus predicciones?</strong> Elimínalo aquí y pídele que se registre otra vez. En realidad no se editan: se capturan de nuevo. Solo mientras la quiniela esté abierta.</span>
                      </div>
                      <input
                        type="text"
                        className="admin-participant-search"
                        placeholder={`Buscar entre ${listaPredicciones.length} participantes…`}
                        value={busquedaParticipante}
                        onChange={e => setBusquedaParticipante(e.target.value)}
                        style={{ width: '100%', fontSize: 13, padding: '8px 12px', marginBottom: 10 }}
                        aria-label="Buscar participante por nombre"
                      />
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
                          : '-'
                        const yaPagado = pagados.includes(pred.id)
                        const togglingEste = togglingPago === pred.id
                        return (
                          <div
                            key={pred.id}
                            style={{
                              display: 'flex',
                              flexDirection: esEscritorio ? 'row' : 'column',
                              alignItems: esEscritorio ? 'center' : 'stretch',
                              justifyContent: 'space-between', gap: esEscritorio ? 10 : 8,
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
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}
                                  >
                                    <AdminIcon name="info" size={10} /> Similar
                                  </span>
                                )}
                                {(quinielaActual.ocultos ?? []).includes(pred.id) && (
                                  <span
                                    title="No se muestra en el ranking público ni cuenta para el bote mientras esté oculta"
                                    aria-label="Predicción oculta"
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-full)',
                                      background: 'var(--neutral-bg)', color: 'var(--muted)', flexShrink: 0,
                                      border: '1px solid var(--border-strong)', cursor: 'help',
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}
                                  >
                                    <AdminIcon name="eye-off" size={10} /> Oculta
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
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
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  {togglingEste ? '…' : (
                                    <>
                                      <AdminIcon name={yaPagado ? 'check' : 'clock'} size={12} />
                                      {yaPagado ? 'Pagado' : 'Pendiente'}
                                    </>
                                  )}
                                </button>
                              )}
                              {(() => {
                                const estaOculto = (quinielaActual.ocultos ?? []).includes(pred.id)
                                const togglingOcultoEste = togglingOculto === pred.id
                                return (
                                  <button
                                    onClick={() => toggleOculto(pred.id)}
                                    disabled={togglingOcultoEste}
                                    title={estaOculto ? 'Mostrar de nuevo en el ranking público' : 'Ocultar del ranking público (no se borra; puedes mostrarla de nuevo cuando quieras)'}
                                    aria-label={estaOculto ? 'Mostrar predicción' : 'Ocultar predicción'}
                                    style={{
                                      background: estaOculto ? 'var(--neutral-bg)' : 'transparent',
                                      border: '1px solid var(--border-strong)',
                                      color: estaOculto ? 'var(--text)' : 'var(--muted)',
                                      fontSize: 13, fontWeight: 700, padding: '5px 9px',
                                      borderRadius: 'var(--radius-sm)', cursor: togglingOcultoEste ? 'not-allowed' : 'pointer',
                                      opacity: togglingOcultoEste ? 0.5 : 1, lineHeight: 1,
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    {togglingOcultoEste ? '…' : <AdminIcon name={estaOculto ? 'eye-off' : 'eye'} size={15} />}
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
                  </div>

                  {/* 2. Partidos: el buscador solo aparece si aún no hay predicciones */}
                  {conteoPredicciones === 0 && renderBuscadorFixtures(agregarSeleccionadosAEdicion)}

                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <label style={{ ...lbl, marginBottom: 0 }}>Partidos</label>
                      {conteoPredicciones > 0 && (
                        <button
                          type="button"
                          onClick={() => setPartidosFijosInfo(v => !v)}
                          aria-label="Por qué la lista de partidos está fija"
                          aria-expanded={partidosFijosInfo}
                          title="Lista fija"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: partidosFijosInfo ? 'var(--text)' : 'var(--muted)', padding: 2, display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
                        >
                          <AdminIcon name="lock" size={14} />
                        </button>
                      )}
                    </div>
                    {conteoPredicciones > 0 && (
                      <SmoothCollapse open={partidosFijosInfo}>
                        <div style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                          Ya hay {conteoPredicciones} predicción{conteoPredicciones !== 1 ? 'es' : ''} registrada{conteoPredicciones !== 1 ? 's' : ''}, así que la lista de partidos queda fija: no se puede agregar ni quitar. Si necesitas otros partidos, crea una quiniela nueva.
                        </div>
                      </SmoothCollapse>
                    )}
                    {editPartidos.map((p, i) => (
                      // Tarjeta solo lectura (los partidos vienen de ESPN, no se editan)
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < editPartidos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {escudoMini(p.escudoLocal, p.local)}
                            <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0 }}>{p.local}</span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>vs</span>
                            <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0%', minWidth: 0, textAlign: 'right' }}>{p.visitante}</span>
                            {escudoMini(p.escudoVisitante, p.visitante)}
                          </div>
                          {p.hora && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{formatFixtureDate(p.hora)}</div>}
                        </div>
                        {conteoPredicciones === 0 && (
                          <button
                            onClick={() => setEditPartidos(prev => prev.filter((_, idx) => idx !== i))}
                            aria-label="Quitar partido"
                            title="Quitar"
                            style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}
                          >
                            Quitar ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {editPartidos.length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>Sin partidos. Agrégalos desde el buscador de arriba.</p>
                    )}
                  </div>

                  {/* 3. Cierre: depende de los partidos */}
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
                        <AdminIcon name="calendar" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Tu primer partido empieza el <strong style={{ color: 'var(--text)' }}>{formatFixtureDate(primeraHoraPartido(editPartidos))}</strong>. El cierre debe ser antes.{' '}
                        <button type="button" onClick={() => setEditCierre(cierreSugerido(editPartidos))} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          Cerrar 5 min antes
                        </button>
                      </p>
                    )}
                  </div>

                  {/* 4. Acceso: quién puede entrar */}
                  <div style={card}>
                    <label htmlFor="edit-codigo" style={{ ...lbl, marginBottom: 4 }}>Código de acceso <span style={{ color: 'var(--red)' }}>*</span></label>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                      Solo quien lo tenga puede participar. Evita uno muy fácil.
                    </p>
                    <input id="edit-codigo" type="text" placeholder="Ej. ACME2026" value={editCodigoAcceso} autoCapitalize="characters" onChange={e => setEditCodigoAcceso(normalizarCodigoAccesoInput(e.target.value))} />
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
                    lineas.push(`📋 Quiniela: ${quinielaActual.nombre}`)
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
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <AdminIcon name="megaphone" size={15} />
                          Mensaje listo para compartir
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <AdminIcon name={copiado === 'mensaje' ? 'check' : 'copy'} size={14} />
                            {copiado === 'mensaje' ? 'Copiado al portapapeles' : 'Copiar mensaje'}
                          </span>
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

      {/* Panel cliente móvil: barra de pestañas + botón flotante para crear */}
      {clienteMobile && <TabBarCliente activo={clienteTab} onNav={navCliente} />}
      {clienteMobile && vista === 'lista' && (clienteTab === 'inicio' || clienteTab === 'quinielas') && (
        <button
          onClick={abrirNuevaQuiniela}
          aria-label="Nueva quiniela"
          style={{
            position: 'fixed', bottom: 74, right: 16, zIndex: 901,
            width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--green), var(--green-light))', color: '#07120A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-green)',
          }}
        >
          <AdminIcon name="plus" size={24} />
        </button>
      )}
      {superMobileHome && (
        <button
          type="button"
          className="super-mobile-fab"
          onClick={abrirNuevaQuiniela}
          aria-label="Nueva quiniela"
        >
          <AdminIcon name="plus" size={18} strokeWidth={2.5} />
          Nueva
        </button>
      )}
      </div>
    </div>
  )
}

// Componente de card de quiniela en la lista
function QuinielaCard({ q, conteos, onGestionar, dueno, superCompact = false, softManage = false }) {
  const cerrada = esCerradaQ(q)
  const finalizada = cerrada && esFinalizadaQ(q)
  const enJuego = cerrada && !finalizada
  const enVivo = enJuego && hayPartidoEnVivo(q)
  const n = conteos[q.id] ?? 0
  const nVisible = Math.max(0, n - (q.ocultos ?? []).length)
  const totalPartidos = q.partidos?.length ?? 0
  const jugados = partidosJugadosCard(q)
  const enVivoAhora = partidosEnVivoCard(q)
  const progreso = totalPartidos > 0 ? Math.min(100, Math.round((jugados / totalPartidos) * 100)) : 0
  const conPremio = tienePremio(q)
  const bote = conPremio ? calcularBote(q, nVisible) : 0
  const esTipoBote = (Number(q.cuota) > 0) || q.tipoPremio === TIPO_PREMIO.BOTE
  const pagosPendientes = esTipoBote ? Math.max(0, n - (q.pagados ?? []).length) : 0

  const estado = finalizada ? 'finalizada' : enVivo ? 'en-vivo' : enJuego ? 'jugandose' : 'abierta'
  const badge = {
    abierta: 'Abierta',
    jugandose: 'Jugándose',
    'en-vivo': 'En vivo',
    finalizada: 'Finalizada',
  }[estado]
  const boton = 'Gestionar'
  const cardClasses = [
    'admin-q-card',
    `admin-q-card--${estado}`,
    conPremio ? '' : 'admin-q-card--no-prize',
    superCompact ? 'admin-q-card--compact' : '',
    softManage ? 'admin-q-card--soft-action' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClasses}>
      <div className="admin-q-card-main">
        <div className="admin-q-card-head">
          <p className="admin-q-card-title">{q.nombre}</p>
          <span className={`admin-q-status admin-q-status--${estado}`}>
            <span className="admin-q-status-dot" />
            {badge}
          </span>
        </div>
        {pagosPendientes > 0 || dueno ? (
          <div className="admin-q-chip-row">
            {pagosPendientes > 0 && (
              <span className="admin-q-chip admin-q-chip--warning">
                {pagosPendientes} pago{pagosPendientes !== 1 ? 's' : ''}
              </span>
            )}
            {dueno && <span className="admin-q-chip admin-q-chip--owner">{dueno}</span>}
          </div>
        ) : null}
        <div className={`admin-q-metrics${conPremio ? '' : ' admin-q-metrics--no-prize'}`}>
          {conPremio && (
            <div className="admin-q-prize">
              <span className="admin-q-prize-label">{finalizada ? 'Bote repartido' : 'Bote'}</span>
              <span className="admin-q-prize-value">{formatearMXN(bote)}</span>
            </div>
          )}
          {!conPremio && (
            <div className="admin-q-fun-prize">
              <span className="admin-q-fun-label">{finalizada ? 'Se jugó por' : 'Se juega por'}</span>
              <span className="admin-q-fun-chip" aria-label="Diversión">
                <AdminIcon name="party" size={17} strokeWidth={2.2} />
                Diversión
              </span>
            </div>
          )}
          <div className="admin-q-stat">
            <span className="admin-q-stat-value">{n}</span>
            <span className="admin-q-stat-label">participantes</span>
          </div>
          <div className="admin-q-stat">
            <span className="admin-q-stat-value">{totalPartidos}</span>
            <span className="admin-q-stat-label">partidos</span>
          </div>
        </div>
        {enJuego && (
          <div className="admin-q-progress-block">
            <div className="admin-q-progress-copy">
              <span>{jugados} de {totalPartidos} partidos jugados</span>
              {enVivoAhora > 0 && <span className="is-live">{enVivoAhora} en juego ahora</span>}
            </div>
            <div className="admin-q-progress-track">
              <span className="admin-q-progress-fill" style={{ width: `${progreso}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="admin-q-card-footer">
        <a href={`/ranking/${q.id}?from=admin`} className="admin-q-ranking-action" aria-label={`Ver ranking de ${q.nombre}`}>
          <AdminIcon name="trophy" size={14} strokeWidth={2.2} />
          Ranking
        </a>
        <button type="button" onClick={() => onGestionar(q)} className={`admin-q-action${finalizada ? ' admin-q-action--secondary' : ''}`} aria-label={`Gestionar ${q.nombre}`}>
          {boton}
        </button>
      </div>
    </div>
  )
}
