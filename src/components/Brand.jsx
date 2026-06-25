export function BrandMark({ size = 28, style, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...props}
    >
      <rect width="64" height="64" rx="16" fill="#0B1220" />
      <rect x="1" y="1" width="62" height="62" rx="15" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
      <circle cx="32" cy="32" r="19" stroke="#22C55E" strokeWidth="6" />
      <circle cx="32" cy="32" r="9.5" stroke="#FACC15" strokeWidth="5" />
      <circle cx="32" cy="32" r="3.8" fill="#22C55E" />
    </svg>
  )
}

export function BrandWordmark({ markSize = 28, fontSize = 24, style }) {
  return (
    <span
      aria-label="QuinielApp"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(6, Math.round(markSize * 0.24)),
        color: 'var(--text-strong)',
        lineHeight: 1,
        ...style,
      }}
    >
      <BrandMark size={markSize} />
      <span
        aria-hidden="true"
        style={{
          fontSize,
          fontWeight: 900,
          letterSpacing: '-0.03em',
          color: 'var(--text-strong)',
        }}
      >
        Quiniel<span style={{ color: 'var(--green)' }}>App</span>
      </span>
    </span>
  )
}
