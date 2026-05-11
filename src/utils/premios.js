export const TIPO_PREMIO = {
  SIN_PREMIO: 'sinPremio',
  FIJO: 'fijo',
  BOTE: 'bote',
}

export const MODELO_PREMIO = {
  GANADOR_UNICO: 'ganadorUnico',
  PODIO: 'podio',
}

export function tienePremio(quiniela) {
  if (!quiniela) return false
  return quiniela.tipoPremio === TIPO_PREMIO.FIJO || quiniela.tipoPremio === TIPO_PREMIO.BOTE
}

export function calcularBote(quiniela, numParticipantes) {
  if (!quiniela) return 0
  if (quiniela.tipoPremio === TIPO_PREMIO.FIJO) return Number(quiniela.premioFijo) || 0
  if (quiniela.tipoPremio === TIPO_PREMIO.BOTE) {
    const cuota = Number(quiniela.cuota) || 0
    return cuota * numParticipantes
  }
  return 0
}

const PORCENTAJES_PODIO = [0.7, 0.2, 0.1]

// jugadores: array ordenado por puntos descendente con al menos { nombre, puntos }
// Devuelve { ganadores, premioPorNombre, bote }.
// Empates en puntos comparten ese nivel del premio. Si nadie tiene puntos > 0, no hay ganadores.
export function calcularGanadores(jugadores, quiniela, numParticipantes) {
  const bote = calcularBote(quiniela, numParticipantes)
  if (!tienePremio(quiniela) || bote <= 0 || quiniela?.boteDevuelto || !jugadores || jugadores.length === 0) {
    return { ganadores: [], premioPorNombre: {}, bote }
  }

  // Agrupar por puntos (los jugadores ya vienen ordenados desc)
  const grupos = []
  jugadores.forEach(j => {
    const last = grupos[grupos.length - 1]
    if (last && last.puntos === j.puntos) last.jugadores.push(j)
    else grupos.push({ puntos: j.puntos, jugadores: [j] })
  })

  const modelo = quiniela.modeloPremio === MODELO_PREMIO.PODIO
    ? MODELO_PREMIO.PODIO
    : MODELO_PREMIO.GANADOR_UNICO

  const ganadores = []
  const premioPorNombre = {}

  if (modelo === MODELO_PREMIO.GANADOR_UNICO) {
    const grupo = grupos[0]
    if (grupo.puntos > 0) {
      const premio = bote / grupo.jugadores.length
      grupo.jugadores.forEach(j => {
        ganadores.push({ nombre: j.nombre, puntos: j.puntos, posicion: 1, premio })
        premioPorNombre[j.nombre] = premio
      })
    }
  } else {
    grupos.slice(0, 3).forEach((g, idx) => {
      if (g.puntos <= 0) return
      const premio = (bote * PORCENTAJES_PODIO[idx]) / g.jugadores.length
      g.jugadores.forEach(j => {
        ganadores.push({ nombre: j.nombre, puntos: j.puntos, posicion: idx + 1, premio })
        premioPorNombre[j.nombre] = (premioPorNombre[j.nombre] ?? 0) + premio
      })
    })
  }

  return { ganadores, premioPorNombre, bote }
}

export function formatearMXN(monto) {
  if (monto == null || isNaN(monto)) return '$0'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    maximumFractionDigits: monto % 1 === 0 ? 0 : 2,
  }).format(monto)
}

export function descripcionRegla(quiniela) {
  if (!tienePremio(quiniela)) return ''
  const podio = quiniela.modeloPremio === MODELO_PREMIO.PODIO
  return podio
    ? 'Premio para 1°, 2° y 3° lugar (70% / 20% / 10%). Si hay empates en un nivel, se reparten esa parte.'
    : 'Gana el 1° lugar. Si hay empates en puntos, se reparten el premio en partes iguales.'
}
