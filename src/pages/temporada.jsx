import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db, track } from '../firebase'
import { Footer } from '../components/Footer'
import { BrandMark } from '../components/Brand'
import { SvgIcon } from '../components/RankingTable'
import { calcularBote, calcularGanadores, formatearMXN } from '../utils/premios'
import { calcularPuntos } from '../utils/scoring'
import { normalizarNombre } from '../utils/nombres'

function claveNombre(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX')
}

// Compatibilidad para temporadas calculadas antes de que la tabla guardara
// premios. Solo corre para esos documentos antiguos; las tablas nuevas siguen
// costando una sola lectura porque ya incluyen `ganado` desde el servidor.
function esMarcadorExacto(pick, resultado) {
  return typeof pick === 'object' && pick !== null && resultado && !resultado.cancelado &&
    String(resultado.local ?? '').trim() !== '' && String(resultado.visitante ?? '').trim() !== '' &&
    String(pick.local ?? '').trim() !== '' && String(pick.visitante ?? '').trim() !== '' &&
    Number(resultado.local) === Number(pick.local) &&
    Number(resultado.visitante) === Number(pick.visitante)
}

async function calcularEstadisticasLegacy(temporada) {
  const jornadas = (temporada.jornadas ?? []).filter(j => j.finalizada && j.id)
  const porJugador = {}
  const destacados = {
    masParticipantes: null, mayorBote: null, masExactos: null, mayorPremioIndividual: null,
    partidosTotales: { valor: 0 }, dineroRepartido: { valor: 0 },
  }

  await Promise.all(jornadas.map(async jornada => {
    const [qSnap, predsSnap] = await Promise.all([
      getDoc(doc(db, 'quinielas', jornada.id)),
      getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', jornada.id))),
    ])
    if (!qSnap.exists()) return
    const quiniela = qSnap.data()
    const ocultos = quiniela.ocultos ?? []
    const partidos = quiniela.partidos ?? []
    const resultados = quiniela.resultados ?? {}
    destacados.partidosTotales.valor += partidos.length
    const jugadores = predsSnap.docs
      .filter(p => !ocultos.includes(p.id))
      .map(p => {
        const pred = p.data()
        return {
          nombre: normalizarNombre(pred.nombre),
          fecha: pred.fecha?.toMillis?.() ?? Number.MAX_SAFE_INTEGER,
          picks: pred.picks ?? {},
          ...calcularPuntos(pred.picks, resultados, {}, partidos),
        }
      })
      .sort((a, b) =>
        b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos || a.fecha - b.fecha)

    const { premioPorNombre } = calcularGanadores(jugadores, quiniela, jugadores.length)
    const bote = calcularBote(quiniela, jugadores.length)
    if (!destacados.masParticipantes || jugadores.length > destacados.masParticipantes.valor) {
      destacados.masParticipantes = { valor: jugadores.length, quiniela: quiniela.nombre ?? jornada.nombre ?? '' }
    }
    if (!destacados.mayorBote || bote > destacados.mayorBote.valor) {
      destacados.mayorBote = { valor: bote, quiniela: quiniela.nombre ?? jornada.nombre ?? '' }
    }

    const exactosPorPartido = partidos.map(() => 0)
    jugadores.forEach((jugador, indice) => {
      const clave = claveNombre(jugador.nombre)
      const premio = Number(premioPorNombre[jugador.nombre]) || 0
      const previo = porJugador[clave] ?? {
        ganado: 0, victorias: 0, podios: 0, jornadasConPremio: 0,
        mejorJornadaPuntos: 0, mejorJornada: '', mayorPremio: 0,
        quinielaMayorPremio: '', exactosDetalle: [],
      }
      previo.ganado += premio
      const nivel = jugadores
        .slice(0, indice + 1)
        .filter((otro, otroIdx, lista) => otroIdx === 0 || otro.puntos !== lista[otroIdx - 1].puntos)
        .length
      if (jugador.puntos > 0 && nivel === 1) previo.victorias++
      if (jugador.puntos > 0 && nivel <= 3) previo.podios++
      if (premio > 0) previo.jornadasConPremio++
      if (jugador.puntos > previo.mejorJornadaPuntos) {
        previo.mejorJornadaPuntos = jugador.puntos
        previo.mejorJornada = quiniela.nombre ?? jornada.nombre ?? ''
      }
      if (premio > previo.mayorPremio) {
        previo.mayorPremio = premio
        previo.quinielaMayorPremio = quiniela.nombre ?? jornada.nombre ?? ''
      }
      partidos.forEach((partido, partidoIdx) => {
        const resultado = resultados[partidoIdx] ?? resultados[String(partidoIdx)]
        const pick = jugador.picks?.[partidoIdx] ?? jugador.picks?.[String(partidoIdx)]
        if (!esMarcadorExacto(pick, resultado)) return
        exactosPorPartido[partidoIdx]++
        if (previo.exactosDetalle.length < 6) {
          previo.exactosDetalle.push({
            quiniela: quiniela.nombre ?? jornada.nombre ?? '',
            partido: `${partido.local ?? 'Local'} vs ${partido.visitante ?? 'Visitante'}`,
            marcador: `${resultado.local}-${resultado.visitante}`,
          })
        }
      })
      if (premio > (destacados.mayorPremioIndividual?.valor ?? 0)) {
        destacados.mayorPremioIndividual = { valor: premio, jugador: jugador.nombre, quiniela: quiniela.nombre ?? jornada.nombre ?? '' }
      }
      porJugador[clave] = previo
    })
    destacados.dineroRepartido.valor += Object.values(premioPorNombre)
      .reduce((total, premio) => total + (Number(premio) || 0), 0)

    exactosPorPartido.forEach((cantidad, partidoIdx) => {
      if (cantidad <= 0 || (destacados.masExactos && cantidad <= destacados.masExactos.valor)) return
      const partido = partidos[partidoIdx] ?? {}
      destacados.masExactos = {
        valor: cantidad,
        partido: `${partido.local ?? 'Local'} vs ${partido.visitante ?? 'Visitante'}`,
        quiniela: quiniela.nombre ?? jornada.nombre ?? '',
        escudoLocal: partido.escudoLocal ?? '',
        escudoVisitante: partido.escudoVisitante ?? '',
      }
    })
  }))

  return { porJugador, destacados }
}

function DestellosCard() {
  return <span className="temporada-card-sparkles" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</span>
}

function TarjetasDestacadas({ destacados, calculando, nombreTemporada }) {
  const carruselRef = useRef(null)
  const pausadoRef = useRef(false)
  const pausaManualHastaRef = useRef(0)
  const [volteadas, setVolteadas] = useState(new Set())
  const [activa, setActiva] = useState(0)

  const tarjetas = destacados ? [
    destacados.masParticipantes && {
      icono: 'users', titulo: 'Más participantes', principal: destacados.masParticipantes.quiniela,
      valor: `${destacados.masParticipantes.valor} participantes`,
      tono: 'neutral',
      descripcion: `La quiniela ${destacados.masParticipantes.quiniela} fue la que tuvo mayor número de participantes: ${destacados.masParticipantes.valor}.`,
    },
    destacados.masExactos && {
      icono: 'target', titulo: 'Más exactos en un partido', principal: destacados.masExactos.partido,
      valor: `${destacados.masExactos.valor} marcadores exactos`,
      tono: 'acierto',
      logos: [destacados.masExactos.escudoLocal, destacados.masExactos.escudoVisitante].filter(Boolean),
      descripcion: `${destacados.masExactos.partido}, en ${destacados.masExactos.quiniela}, fue el partido con más pronósticos exactos: ${destacados.masExactos.valor}.`,
    },
    destacados.mayorBote && {
      icono: 'money', titulo: 'Mayor bolsa', principal: destacados.mayorBote.quiniela,
      valor: formatearMXN(destacados.mayorBote.valor),
      tono: 'dinero',
      descripcion: `La quiniela ${destacados.mayorBote.quiniela} tuvo la bolsa de premios más grande de la temporada: ${formatearMXN(destacados.mayorBote.valor)}.`,
    },
    destacados.mayorPremioIndividual && {
      icono: 'trophy', titulo: 'Mayor premio individual', principal: destacados.mayorPremioIndividual.jugador,
      valor: formatearMXN(destacados.mayorPremioIndividual.valor),
      tono: 'dinero',
      descripcion: `${destacados.mayorPremioIndividual.jugador} obtuvo el mayor premio individual en una quiniela: ${formatearMXN(destacados.mayorPremioIndividual.valor)}, en ${destacados.mayorPremioIndividual.quiniela}.`,
    },
    destacados.partidosTotales && {
      icono: 'goal', titulo: 'Partidos totales', principal: nombreTemporada,
      valor: `${destacados.partidosTotales.valor} partidos`,
      tono: 'neutral',
      descripcion: `En ${nombreTemporada} se disputaron ${destacados.partidosTotales.valor} partidos entre todas las jornadas finalizadas.`,
    },
    destacados.dineroRepartido && {
      icono: 'money', titulo: 'Total de dinero repartido', principal: nombreTemporada,
      valor: formatearMXN(destacados.dineroRepartido.valor),
      tono: 'dinero',
      descripcion: `Durante ${nombreTemporada} se repartieron ${formatearMXN(destacados.dineroRepartido.valor)} en premios informativos entre los participantes.`,
    },
  ].filter(Boolean) : []

  useEffect(() => {
    if (tarjetas.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = setInterval(() => {
      if (pausadoRef.current || Date.now() < pausaManualHastaRef.current) return
      const carrusel = carruselRef.current
      if (!carrusel) return
      const siguiente = (activa + 1) % tarjetas.length
      const tarjeta = carrusel.children[siguiente]
      if (tarjeta) carrusel.scrollTo({ left: tarjeta.offsetLeft - carrusel.offsetLeft, behavior: 'smooth' })
      setActiva(siguiente)
    }, 4200)
    return () => clearInterval(interval)
  }, [activa, tarjetas.length])

  if (calculando) return (
    <div className="temporada-highlights-loading">Calculando récords de la temporada…</div>
  )
  if (!destacados) return null
  if (tarjetas.length === 0) return null
  return (
    <div className="temporada-highlights-wrap">
      <section
        ref={carruselRef}
        aria-label="Récords de la temporada"
        className="temporada-highlights"
        onScroll={(e) => {
          const carrusel = e.currentTarget
          const anchoPaso = (carrusel.firstElementChild?.getBoundingClientRect().width ?? 0) + 11
          if (anchoPaso <= 11) return
          const indice = Math.max(0, Math.min(tarjetas.length - 1, Math.round(carrusel.scrollLeft / anchoPaso)))
          if (indice !== activa) setActiva(indice)
        }}
        onPointerDown={() => { pausaManualHastaRef.current = Date.now() + 9000 }}
        onPointerEnter={() => { pausadoRef.current = true }}
        onPointerLeave={() => { pausadoRef.current = false }}
        onFocus={() => { pausadoRef.current = true }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) pausadoRef.current = false }}
      >
        {tarjetas.map((t, idx) => {
          const volteada = volteadas.has(t.titulo)
          return (
            <button
              type="button"
              key={t.titulo}
              className={`temporada-highlight-card is-${t.tono}${volteada ? ' is-flipped' : ''}${idx === activa ? ' is-active-card' : ''}`}
              aria-pressed={volteada}
              aria-label={`${t.titulo}: ${t.principal}. Toca para ${volteada ? 'volver' : 'ver la descripción'}.`}
              onClick={() => {
                pausaManualHastaRef.current = Date.now() + 9000
                setActiva(idx)
                setVolteadas(prev => {
                  return prev.has(t.titulo) ? new Set() : new Set([t.titulo])
                })
              }}
            >
              <span className="temporada-highlight-inner">
                <span className="temporada-highlight-face temporada-highlight-front">
                  <DestellosCard />
                  {t.logos?.length ? (
                    <span className="temporada-highlight-crests" aria-hidden="true">
                      {t.logos.map((logo, logoIdx) => <img key={`${logo}-${logoIdx}`} src={logo} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />)}
                    </span>
                  ) : (
                    <span className="temporada-highlight-icon" aria-hidden="true"><SvgIcon name={t.icono} size={42} /></span>
                  )}
                  <span className="temporada-highlight-title">{t.titulo}</span>
                  <strong>{t.principal}</strong>
                  <span className="temporada-highlight-value">{t.valor}</span>
                  <small>Toca para saber más</small>
                </span>
                <span className="temporada-highlight-face temporada-highlight-back">
                  <DestellosCard />
                  <span className="temporada-highlight-title">{t.titulo}</span>
                  <span>{t.descripcion}</span>
                  <small>Toca para volver</small>
                </span>
              </span>
            </button>
          )
        })}
      </section>
      <div className="temporada-highlight-dots" aria-hidden="true">
        {tarjetas.map((t, idx) => <span key={t.titulo} className={idx === activa ? 'is-active' : ''} />)}
      </div>
    </div>
  )
}

function DetalleJugador({ jugador, detalle, ganado }) {
  if (!detalle) return <div className="temporada-player-loading">Calculando estadísticas…</div>
  const jornadas = jugador.jornadas ?? 0
  const promedio = jornadas > 0 ? (jugador.puntos / jornadas).toFixed(1) : '0.0'
  const exactosDetalle = detalle.exactosDetalle ?? []
  const estadisticas = [
    { icono: 'money', tono: 'dinero', titulo: 'Mayor premio en una quiniela', valor: formatearMXN(detalle.mayorPremio ?? 0), descripcion: detalle.quinielaMayorPremio || 'Todavía no ha recibido premio' },
    { icono: 'trophy', tono: 'primero', titulo: 'Victorias', valor: detalle.victorias ?? 0, descripcion: `${detalle.victorias ?? 0} primer${(detalle.victorias ?? 0) === 1 ? '' : 'os'} lugar${(detalle.victorias ?? 0) === 1 ? '' : 'es'}` },
    { icono: 'crown', tono: 'neutral', titulo: 'Podios', valor: detalle.podios ?? 0, descripcion: 'Jornadas terminadas dentro del top 3' },
    { icono: 'sparkles', tono: 'neutral', titulo: 'Mejor jornada', valor: `${detalle.mejorJornadaPuntos ?? 0} pts`, descripcion: detalle.mejorJornada || 'Sin jornadas jugadas' },
    { icono: 'scale', tono: 'neutral', titulo: 'Promedio por jornada', valor: promedio, descripcion: `${jugador.puntos ?? 0} puntos en ${jornadas} jornada${jornadas === 1 ? '' : 's'}` },
    { icono: 'money', tono: 'dinero', titulo: 'Jornadas premiadas', valor: detalle.jornadasConPremio ?? (ganado > 0 ? 1 : 0), descripcion: `Total acumulado: ${formatearMXN(ganado ?? 0)}` },
  ]
  return (
    <div className="temporada-player-detail">
      <div className="temporada-player-stats">
        {estadisticas.map(est => (
          <div key={est.titulo} className={`temporada-player-stat-row is-${est.tono}`}>
            <span className="temporada-player-stat-icon" aria-hidden="true"><SvgIcon name={est.icono} size={18} /></span>
            <span className="temporada-player-stat-copy">
              <span>{est.titulo}</span>
              <small>{est.descripcion}</small>
            </span>
            <strong>{est.valor}</strong>
          </div>
        ))}
      </div>
      <div className="temporada-exactos">
        <div className="temporada-exactos-title">
          <strong><SvgIcon name="target" size={14} /> Marcadores exactos</strong>
          <span><b>{jugador.exactos ?? 0}</b> en total</span>
        </div>
        {exactosDetalle.length === 0 ? (
          <p>Aún no tiene marcadores exactos en la temporada.</p>
        ) : (
          <div className="temporada-exactos-list">
            {exactosDetalle.map((exacto, idx) => (
              <div key={`${exacto.quiniela}-${exacto.partido}-${idx}`}>
                <span><strong>{exacto.partido}</strong><small>{exacto.quiniela}</small></span>
                <b>{exacto.marcador}</b>
              </div>
            ))}
            {(jugador.exactos ?? 0) > exactosDetalle.length && (
              <p className="temporada-exactos-more">Y {(jugador.exactos ?? 0) - exactosDetalle.length} exacto{(jugador.exactos ?? 0) - exactosDetalle.length !== 1 ? 's' : ''} más</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Tabla general de una temporada (grupo de quinielas de un organizador).
// La tabla viene precalculada por la Cloud Function al finalizar cada
// jornada, así que esta página cuesta 1 lectura. Es pública, como el ranking.
export default function Temporada() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const desdeQuiniela = searchParams.get('q')

  const [temporada, setTemporada] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [estadisticasLegacy, setEstadisticasLegacy] = useState(null)
  const [expandidos, setExpandidos] = useState(new Set())
  const [montados, setMontados] = useState(new Set())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!id) { setCargando(false); setError(true); return }
    let vivo = true
    getDoc(doc(db, 'temporadas', id))
      .then(snap => {
        if (!vivo) return
        if (!snap.exists()) setError(true)
        else setTemporada({ id: snap.id, ...snap.data() })
      })
      .catch(() => { if (vivo) setError(true) })
      .finally(() => { if (vivo) setCargando(false) })
    track('temporada_vista', { temporadaId: id })
    return () => { vivo = false }
  }, [id])

  useEffect(() => {
    if (!temporada || (temporada.versionTabla ?? 0) >= 4) return
    let vivo = true
    calcularEstadisticasLegacy(temporada)
      .then(datos => { if (vivo) setEstadisticasLegacy({ temporadaId: temporada.id, ...datos }) })
      .catch(() => { if (vivo) setEstadisticasLegacy({ temporadaId: temporada.id, porJugador: {}, destacados: {} }) })
    return () => { vivo = false }
  }, [temporada])

  const backHref = desdeQuiniela ? `/ranking/${desdeQuiniela}` : '/'
  const handleBack = (e) => {
    if (window.history.length <= 1) return
    e.preventDefault()
    window.history.back()
  }
  const toggleJugador = (clave) => {
    if (!montados.has(clave)) {
      setMontados(prev => new Set(prev).add(clave))
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setExpandidos(prev => new Set(prev).add(clave))
      }))
      return
    }
    setExpandidos(prev => {
      const siguiente = new Set(prev)
      siguiente.has(clave) ? siguiente.delete(clave) : siguiente.add(clave)
      return siguiente
    })
  }

  if (cargando) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--muted)', fontSize: 14 }}>
      Cargando temporada…
    </div>
  )

  if (error || !temporada) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--muted)' }}>
      <div style={{ maxWidth: 360 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>No se encontró la temporada</p>
        <a href={backHref} onClick={handleBack} style={{
          display: 'inline-block', padding: '11px 24px', borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--green), var(--green-light))',
          color: '#07120A', fontWeight: 800, fontSize: 14, textDecoration: 'none',
          boxShadow: 'var(--shadow-green)', letterSpacing: 0.2,
        }}>
          ← Volver
        </a>
      </div>
    </div>
  )

  const tabla = temporada.tabla ?? []
  const jornadasJugadas = temporada.jornadasJugadas ?? 0
  const totalQuinielas = temporada.totalQuinielas ?? 0
  const premiosCalculados = (temporada.versionTabla ?? 0) >= 2
  const estadisticasCalculadas = (temporada.versionTabla ?? 0) >= 4
  const legacyActual = estadisticasLegacy?.temporadaId === temporada.id ? estadisticasLegacy : null
  const destacados = estadisticasCalculadas ? temporada.destacados : legacyActual?.destacados

  // Posiciones olímpicas: empate en puntos comparte posición.
  const posiciones = tabla.map((j, i) => {
    if (i === 0) return 1
    return tabla[i - 1].puntos === j.puntos ? null : i + 1
  })
  let ultimaPos = 1
  const posicionesFinales = posiciones.map(p => { if (p != null) ultimaPos = p; return ultimaPos })

  return (
    <div className="temporada-page" style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', zIndex: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="ranking-bg-fade" aria-hidden="true" />
      <div className="hero-pad ranking-hero-pad" style={{ color: 'var(--text)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="ranking-brand-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <a href={backHref} onClick={handleBack} className="app-back-button" aria-label="Volver" title="Volver">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </a>
            <a href="/" className="ranking-brand-link" aria-label="QuinielApp Temporada">
              <BrandMark size={22} />
              <span className="ranking-brand-name">
                Quiniel<span style={{ color: 'var(--green)' }}>App</span>
              </span>
              <span className="ranking-brand-dot" aria-hidden="true" />
              <span className="ranking-brand-label">Temporada</span>
            </a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.01em' }}>
            {temporada.nombre}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Tabla general · {jornadasJugadas} de {totalQuinielas} jornada{totalQuinielas !== 1 ? 's' : ''} jugada{jornadasJugadas !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', padding: '20px 16px 6px', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
        <div className="temporada-section-title">
          <h2><span aria-hidden="true">✦</span> Momentos destacados</h2>
          <p>Toca una tarjeta para conocer la historia detrás del dato.</p>
        </div>
        <TarjetasDestacadas destacados={destacados} calculando={!estadisticasCalculadas && !legacyActual} nombreTemporada={temporada.nombre} />
        <div className="ranking-panel ranking-table-panel">
          <div className="ranking-table-head temporada-table-head">
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>#</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Jugador</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'right' }}>Puntos</span>
          </div>
          {tabla.length === 0 ? (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
              La tabla general aparecerá cuando termine la primera jornada de la temporada.
            </div>
          ) : tabla.map((j, i) => {
            const pos = posicionesFinales[i]
            const esLider = pos === 1
            const clave = claveNombre(j.nombre)
            const detalle = estadisticasCalculadas ? j : legacyActual?.porJugador?.[clave]
            const ganado = premiosCalculados
              ? (j.ganado ?? 0)
              : legacyActual
                ? (legacyActual.porJugador?.[clave]?.ganado ?? 0)
                : null
            const abierto = expandidos.has(clave)
            return (
              <div
                key={`${j.nombre}-${i}`}
                className={`temporada-player${esLider ? ' is-leader' : ''}${abierto ? ' is-open' : ''}`}
                style={{ borderBottom: i < tabla.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() => toggleJugador(clave)}
                  className="temporada-player-row"
                  style={{ background: esLider ? 'rgba(250,204,21,0.035)' : 'transparent' }}
                >
                  <span className="temporada-player-main">
                    <span className="temporada-player-position" style={{ color: esLider ? 'var(--yellow)' : 'var(--muted)' }}>{pos}</span>
                    <span className="temporada-player-name">
                      <span style={{ fontWeight: esLider ? 750 : 600 }}>{j.nombre}</span>
                      {esLider && (
                        <span aria-label="Líder de la temporada" title="Líder de la temporada">👑</span>
                      )}
                    </span>
                    <span className="temporada-player-points" style={{ color: esLider ? 'var(--yellow)' : 'var(--text)' }}>{j.puntos}<small>pts</small></span>
                    <span className="temporada-player-chevron" aria-hidden="true">⌄</span>
                  </span>
                  <span className="temporada-player-meta">
                    <span title={`Jugó ${j.jornadas ?? 0} de ${jornadasJugadas} jornadas`}><b>{j.jornadas ?? 0}/{jornadasJugadas}</b> jornadas</span>
                    <span className="is-hits"><SvgIcon name="check" size={11} /><b>{j.aciertos}</b> aciertos</span>
                    <span className="is-exacts"><SvgIcon name="target" size={11} /><b>{j.exactos}</b> exactos</span>
                    <span className={(ganado ?? 0) > 0 ? 'is-prize' : ''}>Ganado: <b>{ganado == null ? 'Calculando…' : formatearMXN(ganado)}</b></span>
                  </span>
                </button>
                {montados.has(clave) && (
                  <div className="temporada-player-collapse" aria-hidden={!abierto}>
                    <div><DetalleJugador jugador={j} detalle={detalle} ganado={ganado ?? 0} /></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted-soft)', marginTop: 10, textAlign: 'center' }}>
          Suma los puntos y premios informativos de todas las jornadas finalizadas de la temporada.
        </p>
        <div className="app-footer-slot">
          <Footer maxWidth="640px" />
        </div>
      </div>
    </div>
  )
}
