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
        ? <a key={key} href={path || '/'} style={{ color: 'var(--green-light)' }}>{label}</a>
        : <a key={key} href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--green-light)' }}>{label}</a>
    }
    return part
  })
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
        <Tag key={bi} style={{
          fontFamily: 'var(--font-display)', color: 'var(--text-strong)',
          fontSize: sizes[Tag], fontWeight: 700, margin: level === 1 ? '0 0 4px' : '28px 0 10px',
          lineHeight: 1.3,
        }}>
          {renderInline(headingMatch[2], `${bi}-h`)}
        </Tag>
      )
    }

    if (block.trim() === '---') {
      return <hr key={bi} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
    }

    if (lines.every(l => l.startsWith('- '))) {
      return (
        <ul key={bi} style={{ margin: '0 0 14px', paddingLeft: 20, color: 'var(--text)', fontSize: 14, lineHeight: 1.7 }}>
          {lines.map((l, i) => <li key={i}>{renderInline(l.slice(2), `${bi}-${i}`)}</li>)}
        </ul>
      )
    }

    if (lines.every(l => /^\d+\.\s/.test(l))) {
      return (
        <ol key={bi} style={{ margin: '0 0 14px', paddingLeft: 20, color: 'var(--text)', fontSize: 14, lineHeight: 1.7 }}>
          {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^\d+\.\s/, ''), `${bi}-${i}`)}</li>)}
        </ol>
      )
    }

    if (lines.every(l => l.startsWith('>'))) {
      return (
        <blockquote key={bi} style={{
          margin: '0 0 14px', padding: '10px 14px', borderLeft: '3px solid var(--green)',
          background: 'var(--neutral-bg)', borderRadius: '0 8px 8px 0',
          color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6,
        }}>
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
        <div key={bi} style={{ overflowX: 'auto', marginBottom: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-strong)', color: 'var(--text-strong)' }}>
                    {renderInline(c, `${bi}-th${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
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
      <p key={bi} style={{
        margin: '0 0 14px', color: isItalicNote ? 'var(--muted)' : 'var(--text)',
        fontSize: isItalicNote ? 12.5 : 14, fontStyle: isItalicNote ? 'italic' : 'normal',
        lineHeight: 1.65,
      }}>
        {renderInline(isItalicNote ? text.slice(1, -1) : text, bi)}
      </p>
    )
  })
}
