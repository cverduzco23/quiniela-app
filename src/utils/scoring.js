// Convierte un marcador (local, visitante) en uno de: 'home' | 'draw' | 'away' | null
export function goalsToResultado(local, visitante) {
  const l = Number(local), v = Number(visitante)
  if (isNaN(l) || isNaN(v) || String(local).trim() === '' || String(visitante).trim() === '') return null
  return l > v ? 'home' : l === v ? 'draw' : 'away'
}

// Extrae el resultado (home/draw/away) de un objeto resultado almacenado
export function getResultado(r) {
  if (!r) return null
  if (r.resultado) return r.resultado
  return goalsToResultado(r.local, r.visitante)
}

// Extrae el resultado de un pick (puede venir como objeto {local, visitante} o como string legado)
export function getPickResultado(pick) {
  if (!pick) return null
  if (typeof pick === 'object') return goalsToResultado(pick.local, pick.visitante)
  return pick
}

// Devuelve el resultado efectivo del partido: live si está en curso/terminado, sino el guardado
export function getEfectivo(partido, idx, resultados, liveScores) {
  const live = partido?.espnId ? liveScores?.[partido.espnId] : null
  if (live && (live.state === 'in' || live.state === 'post') &&
      live.local !== '' && live.visitante !== '') {
    return { local: live.local, visitante: live.visitante, resultado: goalsToResultado(live.local, live.visitante) }
  }
  return resultados?.[idx] ?? resultados?.[String(idx)] ?? null
}

// Calcula puntos: 1 pt por resultado correcto, +2 pts por marcador exacto.
// Ignora partidos cancelados (resultado.cancelado === true).
export function calcularPuntos(picks, resultados, liveScores, partidos) {
  let puntos = 0, aciertos = 0, exactos = 0
  partidos.forEach((p, i) => {
    const res  = getEfectivo(p, i, resultados, liveScores)
    if (res?.cancelado) return
    const pick = picks?.[i] ?? picks?.[String(i)]
    if (!res || !pick) return
    const resR  = getResultado(res)
    const pickR = getPickResultado(pick)
    if (!resR || !pickR) return
    if (resR === pickR) {
      puntos += 1; aciertos++
      if (typeof pick === 'object' && pick !== null &&
          Number(res.local) === Number(pick.local) &&
          Number(res.visitante) === Number(pick.visitante)) {
        puntos += 2; exactos++
      }
    }
  })
  return { puntos, aciertos, exactos }
}
