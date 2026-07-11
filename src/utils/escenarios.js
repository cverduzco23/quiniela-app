import { goalsToResultado, getResultado, getPickResultado, getEfectivo } from './scoring'
import { normalizarNombre } from './nombres'

// ¿Quién gana según el marcador del último partido?
//
// Cuando queda EXACTAMENTE un partido sin definir, el desenlace de toda la
// quiniela depende solo de ese marcador. El espacio de posibilidades es finito
// y se puede enumerar:
// • El punto por RESULTADO solo depende de Local / Empate / Visitante.
// • El +2 por EXACTO solo lo puede ganar quien pronosticó ESE marcador.
// Por eso basta simular: cada marcador que algún jugador pronosticó para ese
// partido + tres casos genéricos ("cualquier otra" victoria local / empate /
// victoria visitante). Eso cubre el 100% de los desenlaces sin tablas infinitas.

const ORDEN_RESULTADO = { home: 0, draw: 1, away: 2 }

// Orden de marcadores: primero los exactos (por total de goles ascendente, y a
// igual total el local primero → 0-0, 1-0, 0-1, 2-0, 1-1, 0-2…), luego los
// genéricos (local / empate / visitante).
function compararEscenario(a, b) {
  if (a.tipo !== b.tipo) return a.tipo === 'exacto' ? -1 : 1
  if (a.tipo === 'exacto') {
    return (a.local + a.visitante) - (b.local + b.visitante) || (b.local - a.local)
  }
  return ORDEN_RESULTADO[a.resultado] - ORDEN_RESULTADO[b.resultado]
}

// Compara dos tablas (jugadores ordenados) usando el mismo criterio que el
// ranking: puntos, luego exactos, luego aciertos.
function comparar(a, b) {
  return b.puntos - a.puntos || b.exactos - a.exactos || b.aciertos - a.aciertos
}

// Devuelve null si NO queda exactamente un partido por definir.
// liveScores permite tratar como "en juego" (pendiente) un partido en curso.
export function simularUltimoPartido(quiniela, predicciones, liveScores = {}) {
  const partidos   = quiniela?.partidos ?? []
  const resultados = quiniela?.resultados ?? {}
  if (partidos.length === 0 || !predicciones || predicciones.length === 0) return null

  // Clasificar: un partido está "decidido" si ya tiene resultado final o está
  // cancelado. Un partido en curso (ESPN state === 'in') cuenta como pendiente,
  // porque su marcador aún puede cambiar, justo lo que queremos simular.
  const pendientes = []
  partidos.forEach((p, i) => {
    const live = p?.espnId ? liveScores?.[p.espnId] : null
    const enCurso = live?.state === 'in'
    const res = getEfectivo(p, i, resultados, liveScores)
    if (res?.cancelado) return // cancelado: no cuenta, se trata como decidido
    const decidido = !enCurso && !!res && getResultado(res) !== null
    if (!decidido) pendientes.push(i)
  })

  if (pendientes.length !== 1) return null
  const idx = pendientes[0]

  // Puntos base de cada jugador a partir de los partidos YA decididos.
  const jugadores = predicciones.map(pr => {
    const picks = pr.picks
    let base = 0, exactosBase = 0, aciertosBase = 0
    partidos.forEach((p, i) => {
      if (i === idx) return
      const res = getEfectivo(p, i, resultados, liveScores)
      if (res?.cancelado) return
      const resR = getResultado(res)
      if (!resR) return
      const pick  = picks?.[i] ?? picks?.[String(i)]
      const pickR = getPickResultado(pick)
      if (!pickR) return
      if (resR === pickR) {
        base += 1; aciertosBase++
        if (typeof pick === 'object' && pick &&
            Number(res.local) === Number(pick.local) &&
            Number(res.visitante) === Number(pick.visitante)) {
          base += 2; exactosBase++
        }
      }
    })
    return {
      nombre: normalizarNombre(pr.nombre),
      pickPend: picks?.[idx] ?? picks?.[String(idx)],
      base, exactosBase, aciertosBase,
    }
  })

  // Escenarios a simular: cada marcador exacto pronosticado + 3 genéricos.
  const distintos = new Map() // "l-v" -> { local, visitante, resultado }
  jugadores.forEach(j => {
    const pk = j.pickPend
    if (pk && typeof pk === 'object' &&
        String(pk.local).trim() !== '' && String(pk.visitante).trim() !== '') {
      const l = Number(pk.local), v = Number(pk.visitante)
      if (!Number.isNaN(l) && !Number.isNaN(v)) {
        distintos.set(`${l}-${v}`, { local: l, visitante: v, resultado: goalsToResultado(l, v) })
      }
    }
  })

  const escenarios = []
  distintos.forEach(s => escenarios.push({ tipo: 'exacto', ...s }))
  ;['home', 'draw', 'away'].forEach(r => escenarios.push({ tipo: 'generico', resultado: r }))

  // Evalúa un escenario: devuelve los líderes (1er lugar) que produce.
  const evaluar = (esc) => {
    const tabla = jugadores.map(j => {
      let puntos = j.base, exactos = j.exactosBase, aciertos = j.aciertosBase
      const pickR = getPickResultado(j.pickPend)
      if (pickR && pickR === esc.resultado) {
        puntos += 1; aciertos++
        if (esc.tipo === 'exacto' && typeof j.pickPend === 'object' && j.pickPend &&
            Number(j.pickPend.local) === esc.local &&
            Number(j.pickPend.visitante) === esc.visitante) {
          puntos += 2; exactos++
        }
      }
      return { nombre: j.nombre, puntos, exactos, aciertos }
    }).sort(comparar)

    const top = tabla[0]?.puntos ?? 0
    const lideres = tabla.filter(t => t.puntos === top).map(t => t.nombre)
    return { lideres, top }
  }

  // Agrupar escenarios que producen el mismo conjunto de líderes.
  const grupos = []
  escenarios.forEach(esc => {
    const { lideres, top } = evaluar(esc)
    const key = lideres.slice().sort().join('|') + '@' + top
    let g = grupos.find(x => x.key === key)
    if (!g) { g = { key, lideres, top, escenarios: [] }; grupos.push(g) }
    g.escenarios.push(esc)
  })

  // Orden dentro de cada grupo: por marcador (exactos primero, genéricos al final).
  grupos.forEach(g => g.escenarios.sort(compararEscenario))

  // Orden de los grupos: por su marcador más pequeño, para que la lista completa
  // quede ordenada por marcador (0-0, 1-0, 0-1, …).
  grupos.sort((a, b) => compararEscenario(a.escenarios[0], b.escenarios[0]))

  // Lista plana: una fila por escenario (marcador → ganador), ordenada por
  // marcador. Más cómoda para una vista compacta tipo tabla.
  const filas = grupos
    .flatMap(g => g.escenarios.map(esc => ({ esc, lideres: g.lideres, top: g.top, empate: g.lideres.length > 1 })))
    .sort((a, b) => compararEscenario(a.esc, b.esc))

  return { idx, partido: partidos[idx], grupos, filas, numJugadores: jugadores.length }
}
