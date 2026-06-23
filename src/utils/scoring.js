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
  const stored = resultados?.[idx] ?? resultados?.[String(idx)] ?? null
  if (stored?.cancelado) return stored
  const live = partido?.espnId ? liveScores?.[partido.espnId] : null
  // ESPN puede reportar partidos cancelados / pospuestos con state="post" y score 0-0.
  // Si el polling lo marcó como cancelado, propagamos esa señal para que el scoring lo skip.
  if (live?.cancelado) return { cancelado: true }
  if (live && (live.state === 'in' || live.state === 'post') &&
      live.local !== '' && live.visitante !== '') {
    return { local: live.local, visitante: live.visitante, resultado: goalsToResultado(live.local, live.visitante) }
  }
  return stored
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

// Racha actual: partidos consecutivos (de los ya finalizados, de más reciente
// hacia atrás) en los que el jugador le atinó al resultado, y cuántos de esos
// además fueron marcador exacto. Ignora partidos cancelados o sin terminar
// (no rompen la racha, solo se saltan). Un partido en vivo NO cuenta como
// finalizado todavía.
export function calcularRacha(picks, resultados, liveScores, partidos) {
  let correctas = 0, exactas = 0, exactasActivas = true
  for (let i = partidos.length - 1; i >= 0; i--) {
    const p = partidos[i]
    const live = p?.espnId ? liveScores?.[p.espnId] : null
    if (live?.state === 'in' && !live?.cancelado) continue // en vivo: aún no cuenta
    const res = getEfectivo(p, i, resultados, liveScores)
    if (!res) continue
    if (res.cancelado) continue
    const resR = getResultado(res)
    const pick = picks?.[i] ?? picks?.[String(i)]
    const pickR = getPickResultado(pick)
    if (!resR || !pickR || resR !== pickR) break
    correctas++
    const exacto = typeof pick === 'object' && pick !== null &&
      Number(res.local) === Number(pick.local) && Number(res.visitante) === Number(pick.visitante)
    if (exactasActivas && exacto) exactas++
    else exactasActivas = false
  }
  return { correctas, exactas }
}
