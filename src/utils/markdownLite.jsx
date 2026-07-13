// Renderizador minimalista de Markdown para las páginas legales estáticas
// (Aviso de Privacidad, Términos). Soporta solo lo que usan esos documentos:
// encabezados #/##/###, párrafos, listas "- ", citas "> ", tablas "| a | b |",
// líneas horizontales "---", y en línea **negritas** y [texto](url).
// No es un parser de Markdown general: si el contenido fuente cambia de
// estructura, revisar que siga soportado aquí.

function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
    if (boldMatch) return <strong key={key}>{boldMatch[1]}</strong>
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const [, label, href] = linkMatch
      const interno = href.startsWith('/') || href.includes('quinielapp.fun/')
      const path = interno ? href.replace(/^https?:\/\/(www\.)?quinielapp\.fun/, '') : href
      return interno
        ? <a key={key} href={path || '/'} className="legal-md-link">{label}</a>
        : <a key={key} href={href} target="_blank" rel="noreferrer" className="legal-md-link">{label}</a>
    }
    return part
  })
}

function textoPlanoHeading(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

function idHeading(text) {
  return `legal-${textoPlanoHeading(text)}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function extraerSeccionesMarkdown(raw) {
  return raw
    .split('\n')
    .map(linea => linea.trim().match(/^##\s+(.*)$/))
    .filter(Boolean)
    .map(match => ({ id: idHeading(match[1]), titulo: textoPlanoHeading(match[1]) }))
}

export function renderMarkdownLite(raw) {
  const blocks = raw.trim().split(/\n\s*\n/)
  return blocks.map((block, bi) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return null

    const headingMatch = lines[0].match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1].length
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      const sizes = { h1: 26, h2: 19, h3: 15.5 }
      return (
        <Tag
          key={bi}
          id={level > 1 ? idHeading(headingMatch[2]) : undefined}
          className={`legal-md-heading legal-md-${Tag}`}
          style={{ '--legal-heading-size': `${sizes[Tag]}px` }}
        >
          {renderInline(headingMatch[2], `${bi}-h`)}
        </Tag>
      )
    }

    if (block.trim() === '---') {
      return <hr key={bi} className="legal-md-divider" />
    }

    if (lines.every(l => l.startsWith('- '))) {
      return (
        <ul key={bi} className="legal-md-list">
          {lines.map((l, i) => <li key={i}>{renderInline(l.slice(2), `${bi}-${i}`)}</li>)}
        </ul>
      )
    }

    if (lines.every(l => /^\d+\.\s/.test(l))) {
      return (
        <ol key={bi} className="legal-md-list">
          {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ''), `${bi}-${i}`)}</li>)}
        </ol>
      )
    }

    if (lines.every(l => l.startsWith('>'))) {
      return (
        <blockquote key={bi} className="legal-md-quote">
          {renderInline(lines.map(l => l.replace(/^>\s?/, '')).join(' '), `${bi}-q`)}
        </blockquote>
      )
    }

    if (lines.every(l => l.startsWith('|'))) {
      const rows = lines.filter(l => !/^\|[\s-:|]+\|$/.test(l)).map(l =>
        l.split('|').slice(1, -1).map(c => c.trim())
      )
      const [head, ...body] = rows
      return (
        <div key={bi} className="legal-md-table-wrap">
          <table className="legal-md-table">
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i}>
                    {renderInline(c, `${bi}-th${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci}>
                      {renderInline(c, `${bi}-td${ri}${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    const isItalicNote = lines.length === 1 && /^\*[^*].*[^*]\*$/.test(lines[0])
    const text = lines.join(' ')
    return (
      <p key={bi} className={`legal-md-paragraph${isItalicNote ? ' is-note' : ''}`}>
        {renderInline(isItalicNote ? text.slice(1, -1) : text, bi)}
      </p>
    )
  })
}
