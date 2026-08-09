import { useEffect, useRef, useState } from 'react'
import { BrandMark, BrandWordmark } from './Brand'
import { SvgIcon } from './RankingTable'

function FlechaVolver() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function MarcaTemporada() {
  return (
    <a href="/" className="ranking-brand-link" aria-label="QuinielApp Temporada">
      <BrandMark size={22} />
      <span className="ranking-brand-name">Quiniel<span style={{ color: 'var(--green)' }}>App</span></span>
      <span className="ranking-brand-dot" aria-hidden="true" />
      <span className="ranking-brand-label">Temporada</span>
    </a>
  )
}

function EncabezadoEstado({ backHref = '/', onBack, temporada = false, cargandoTexto }) {
  return (
    <header className="system-state-header">
      <a href={backHref} onClick={onBack} className="app-back-button" aria-label="Volver" title="Volver">
        <FlechaVolver />
      </a>
      {temporada ? <MarcaTemporada /> : (
        <a href="/" className="system-state-brand" aria-label="QuinielApp inicio">
          <BrandWordmark markSize={24} fontSize={20} />
        </a>
      )}
      {cargandoTexto && (
        <span className="system-state-loading-label"><i aria-hidden="true" />{cargandoTexto}</span>
      )}
    </header>
  )
}

export function EstadoCarga({ texto, backHref = '/', onBack, temporada = false, mobileFallback }) {
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMostrar(true), 200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <div className="system-state-mobile">{mobileFallback}</div>
      <div className={`system-state system-state-loading${mostrar ? ' is-visible' : ''}`}>
        <EncabezadoEstado backHref={backHref} onBack={onBack} temporada={temporada} cargandoTexto={texto} />
        <main className="system-skeleton" aria-label={texto} aria-busy="true">
          <span className="system-skeleton-title" />
          <span className="system-skeleton-subtitle" />
          <div className="system-skeleton-rows">
            {Array.from({ length: 6 }, (_, i) => <span key={i} style={{ '--skeleton-delay': `${i * 90}ms` }} />)}
          </div>
        </main>
        <div className="system-state-footer" aria-hidden="true" />
      </div>
    </>
  )
}

export function EstadoPantalla({
  tono = 'warning', icono = 'info', titulo, copia, acciones, aside, pie,
  backHref = '/', onBack, temporada = false, mobileFallback,
}) {
  const tituloRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      tituloRef.current?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <>
      <div className="system-state-mobile">{mobileFallback}</div>
      <div className={`system-state is-${tono}`}>
        <EncabezadoEstado backHref={backHref} onBack={onBack} temporada={temporada} />
        <main className={`system-state-main${aside ? ' has-aside' : ''}`}>
          <section className="system-state-message">
            <span className="system-state-icon" aria-hidden="true"><SvgIcon name={icono} size={38} /></span>
            <h1 ref={tituloRef} tabIndex={-1}>{titulo}</h1>
            <p>{copia}</p>
            {acciones && <div className="system-state-actions">{acciones}</div>}
          </section>
          {aside}
        </main>
        <footer className="system-state-footer">{pie}</footer>
      </div>
    </>
  )
}

export function BotonEstado({ principal = false, icono, children, className = '', ...props }) {
  const Tag = props.href ? 'a' : 'button'
  return (
    <Tag className={`system-state-button ${principal ? 'is-primary' : 'is-secondary'} ${className}`.trim()} {...props}>
      {icono && <SvgIcon name={icono} size={15} />}
      {children}
    </Tag>
  )
}
