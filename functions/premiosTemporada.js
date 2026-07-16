const MODELO_PODIO = 'podio'

function tienePremio(quiniela) {
  if (!quiniela) return false
  if (!quiniela.tipoPremio) {
    return (Number(quiniela.premioFijo) || 0) > 0 || (Number(quiniela.cuota) || 0) > 0
  }
  return quiniela.tipoPremio === 'fijo' || quiniela.tipoPremio === 'bote'
}

export function calcularBoteDeJornada(quiniela, numParticipantes) {
  if (!quiniela) return 0
  if (!quiniela.tipoPremio) {
    return (Number(quiniela.premioFijo) || 0) + (Number(quiniela.cuota) || 0) * numParticipantes
  }
  if (quiniela.tipoPremio === 'fijo') return Number(quiniela.premioFijo) || 0
  if (quiniela.tipoPremio === 'bote') return (Number(quiniela.cuota) || 0) * numParticipantes
  return 0
}

// Mantiene exactamente las mismas reglas de src/utils/premios.js, pero devuelve
// el premio por índice para no depender del texto del nombre como identificador.
export function calcularPremiosDeJornada(jugadores, quiniela) {
  const premios = jugadores.map(() => 0)
  const bote = calcularBoteDeJornada(quiniela, jugadores.length)
  if (!tienePremio(quiniela) || bote <= 0 || quiniela?.boteDevuelto || jugadores.length === 0) return premios

  const grupos = []
  jugadores.forEach((jugador, indice) => {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.puntos === jugador.puntos) ultimo.indices.push(indice)
    else grupos.push({ puntos: jugador.puntos, indices: [indice] })
  })

  if (quiniela.modeloPremio !== MODELO_PODIO) {
    const lideres = grupos[0]
    if (lideres.puntos > 0) {
      const premio = bote / lideres.indices.length
      lideres.indices.forEach(indice => { premios[indice] = premio })
    }
    return premios
  }

  const porcentajes = [0.7, 0.2, 0.1]
  grupos.slice(0, 3).forEach((grupo, indiceGrupo) => {
    if (grupo.puntos <= 0) return
    const premio = (bote * porcentajes[indiceGrupo]) / grupo.indices.length
    grupo.indices.forEach(indice => { premios[indice] = premio })
  })
  return premios
}
