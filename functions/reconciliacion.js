// Comparación estricta: datos incompletos o no finales nunca corrigen resultados.
export function normalizarMarcador(r) {
  if (!r) return null
  if (r.cancelado) return { cancelado: true }
  const valores = [r.local, r.visitante]
  if (valores.some(v => v == null || String(v).trim() === '' ||
      !Number.isInteger(Number(v)) || Number(v) < 0)) return null
  const [l, v] = valores.map(Number)
  return { local: String(l), visitante: String(v), resultado: l > v ? 'home' : l < v ? 'away' : 'draw' }
}

export function mismaPuntuacion(a, b) {
  return JSON.stringify(normalizarMarcador(a)) === JSON.stringify(normalizarMarcador(b))
}

export function marcadorFinalSummary(d, espnId) {
  if (String(d?.header?.id) !== String(espnId)) return null
  const c = d.header.competitions?.[0]
  const t = c?.status?.type
  // No convertir suspensiones, cancelaciones ni resultados provisionales.
  if (t?.state !== 'post' || t.completed !== true || t.name !== 'STATUS_FULL_TIME') return null
  const home = c.competitors?.find(x => x.homeAway === 'home')
  const away = c.competitors?.find(x => x.homeAway === 'away')
  return normalizarMarcador({ local: home?.score, visitante: away?.score })
}

export function indicesParaReconciliar(q, ahora = Date.now()) {
  return (q.partidos ?? []).flatMap((p, i) => {
    const r = q.resultados?.[i]
    const edad = ahora - new Date(p.hora).getTime()
    return p.espnId && p.ligaId && normalizarMarcador(r) && !r.cancelado &&
      r.fuente !== 'manual' && edad >= 0 && edad <= 7 * 86400000 ? [i] : []
  })
}

export function decidirReconciliacion(guardado, oficial, pendiente, ahora = Date.now()) {
  if (!normalizarMarcador(guardado) || !oficial || guardado.cancelado || guardado.fuente === 'manual') return 'ignorar'
  if (mismaPuntuacion(guardado, oficial)) return 'verificar'
  // Un resultado antiguo sin procedencia podría ser una corrección manual.
  if (guardado.fuente !== 'espn') return 'revisar'
  if (pendiente?.espnId && pendiente?.primeraVez &&
      mismaPuntuacion(pendiente.anterior, guardado) && mismaPuntuacion(pendiente.propuesto, oficial) &&
      ahora - new Date(pendiente.primeraVez).getTime() >= 120000) return 'corregir'
  return 'confirmar'
}

export function cambiosResultados(antes = {}, despues = {}) {
  return [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .filter(i => !mismaPuntuacion(antes[i], despues[i]) ||
      (antes[i]?.resultado ?? null) !== (despues[i]?.resultado ?? null))
    .map(i => ({ indice: i, anterior: antes[i] ?? null, nuevo: despues[i] ?? null }))
}
