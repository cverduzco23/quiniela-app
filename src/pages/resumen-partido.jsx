import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { BrandMark } from '../components/Brand'
import { Footer } from '../components/Footer'
import { ColumnaPartido } from '../components/RankingTable'
import { miIdentidadEnQuiniela } from '../utils/misQuinielas'
import { normalizarNombre } from '../utils/nombres'
import { getResultado } from '../utils/scoring'

function calcularEstadoResumen(quiniela, idx) {
  const stored = quiniela.resultados?.[idx] ?? quiniela.resultados?.[String(idx)]
  const cancelado = !!stored?.cancelado
  const resDisplay = cancelado ? null : getResultado(stored)
  const scoreLocal = cancelado ? '-' : stored?.local ?? '-'
  const scoreVisitante = cancelado ? '-' : stored?.visitante ?? '-'

  return {
    live: null,
    stored,
    cancelado,
    noFinal: false,
    suspendido: false,
    esVivo: false,
    esFinish: !!resDisplay,
    scoreLocal,
    scoreVisitante,
    resDisplay,
    marcadorNoFinalVisible: false,
    pendiente: !cancelado && !resDisplay,
    jugado: !cancelado && resDisplay !== null,
    marcadorVisible: !!resDisplay,
  }
}

export default function ResumenPartidoPage() {
  const { quinielaId, partidoIdx } = useParams()
  const [estado, setEstado] = useState({ tipo: 'cargando' })

  useEffect(() => {
    let activo = true

    const cargar = async () => {
      const idx = Number(partidoIdx)
      if (!quinielaId || !Number.isInteger(idx) || idx < 0) {
        if (activo) setEstado({ tipo: 'no-encontrado' })
        return
      }

      try {
        const [snapQ, snapP] = await Promise.all([
          getDoc(doc(db, 'quinielas', quinielaId)),
          getDocs(query(collection(db, 'predicciones'), where('quinielaId', '==', quinielaId))),
        ])
        if (!snapQ.exists()) {
          if (activo) setEstado({ tipo: 'no-encontrado' })
          return
        }

        const quiniela = { id: snapQ.id, ...snapQ.data() }
        const partido = quiniela.partidos?.[idx]
        if (!partido) {
          if (activo) setEstado({ tipo: 'no-encontrado' })
          return
        }

        const nombrePropio = miIdentidadEnQuiniela(quinielaId)
        const prediccionPropia = nombrePropio
          ? snapP.docs
              .map(d => d.data())
              .find(p => normalizarNombre(p.nombre) === nombrePropio)
          : null
        const resultado = calcularEstadoResumen(quiniela, idx)

        if (activo) {
          setEstado({
            tipo: 'listo',
            quiniela,
            partido,
            idx,
            resultado,
            ahora: Date.now(),
            miPick: prediccionPropia?.picks?.[idx] ?? prediccionPropia?.picks?.[String(idx)] ?? null,
          })
        }
      } catch {
        if (activo) setEstado({ tipo: 'error' })
      }
    }

    cargar()
    return () => { activo = false }
  }, [partidoIdx, quinielaId])

  useEffect(() => {
    if (estado.tipo !== 'listo') return
    document.title = `${estado.partido.local} vs ${estado.partido.visitante} · Resumen · QuinielApp`
    return () => { document.title = 'QuinielApp' }
  }, [estado])

  const rankingHref = `/ranking/${quinielaId}`

  if (estado.tipo !== 'listo') {
    const mensaje = estado.tipo === 'cargando'
      ? 'Cargando resumen del partido…'
      : estado.tipo === 'no-encontrado'
        ? 'No encontramos este partido.'
        : 'No pudimos cargar el resumen. Inténtalo de nuevo.'

    return (
      <div className="match-summary-page">
        <ResumenHeader rankingHref={rankingHref} />
        <main className="match-summary-message">
          <p>{mensaje}</p>
          {estado.tipo !== 'cargando' && <Link to={rankingHref}>Volver al ranking</Link>}
        </main>
      </div>
    )
  }

  return (
    <div className="match-summary-page">
      <ResumenHeader rankingHref={rankingHref} />
      <main className="match-summary-main">
        <p className="match-summary-quiniela">{estado.quiniela.nombre}</p>
        <ColumnaPartido
          quiniela={estado.quiniela}
          idx={estado.idx}
          partido={estado.partido}
          estado={estado.resultado}
          st={null}
          eventos={[]}
          penales={[]}
          miPick={estado.miPick}
          puedeVerStream={false}
          ahora={estado.ahora}
        />
      </main>
      <div className="app-footer-slot">
        <Footer maxWidth="720px" />
      </div>
    </div>
  )
}

function ResumenHeader({ rankingHref }) {
  return (
    <header className="match-summary-header">
      <div className="match-summary-header-inner">
        <Link to={rankingHref} className="app-back-button" aria-label="Volver al ranking" title="Volver al ranking">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <Link to="/" className="ranking-brand-link" aria-label="QuinielApp">
          <BrandMark size={22} />
          <span className="ranking-brand-name">
            Quiniel<span style={{ color: 'var(--green)' }}>App</span>
          </span>
          <span className="ranking-brand-dot" aria-hidden="true" />
          <span className="ranking-brand-label">Resumen</span>
        </Link>
      </div>
    </header>
  )
}
