/**
 * Helpers para abrir WhatsApp con un mensaje pre-armado.
 *
 * Número oficial de QuinielApp Business: +52 56 5249 1143.
 * En formato wa.me va sin "+", sin espacios y con lada de país (52 = México).
 *
 * Escalabilidad: si algún día hay varios números (soporte, ventas, etc.) o el
 * número se mueve a una variable de entorno, solo se cambia aquí — toda la app
 * arma los links desde estos helpers, no con strings sueltos.
 */
export const WHATSAPP_NUMERO = '525652491143'

/**
 * Construye un link de WhatsApp con un mensaje pre-llenado.
 * @param {string} mensaje  Texto que aparecerá ya escrito en el chat.
 * @param {string} [numero] Número destino (default: el oficial de QuinielApp).
 * @returns {string} URL https://wa.me/...
 */
export function waLink(mensaje = '', numero = WHATSAPP_NUMERO) {
  const base = `https://wa.me/${numero}`
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base
}

/**
 * Mensajes pre-armados que el cliente envía desde la app.
 * Mantenerlos centralizados facilita ajustar el tono sin tocar componentes.
 */
export const MENSAJES_WA = {
  // Desde el home: quiere dar de alta su quiniela.
  // Sin emojis a propósito: algunos dispositivos los muestran como "�" en wa.me.
  crearQuiniela:
    '¡Hola! Quiero crear mi propia quiniela en QuinielApp.fun. ¿Me ayudas a empezar?',

  // Soporte genérico.
  soporte:
    '¡Hola! Tengo una duda sobre QuinielApp.',
}

/**
 * Mensaje para reportar un problema, con contexto pre-llenado para poder
 * diagnosticar sin interrogar al admin. Todo es opcional: sin argumentos
 * produce el reporte genérico.
 * @param {object} [ctx]
 * @param {string} [ctx.correo]   Correo de la cuenta del admin que reporta.
 * @param {string} [ctx.quiniela] Nombre de la quiniela afectada.
 * @param {string} [ctx.enlace]   Enlace a la quiniela afectada.
 */
export function mensajeReporteProblema({ correo = '', quiniela = '', enlace = '' } = {}) {
  let msg = 'Hola, quiero reportar un problema en QuinielApp.'
  if (correo) msg += ` Mi cuenta: ${correo}.`
  if (quiniela) msg += ` Quiniela: "${quiniela}"${enlace ? ` (${enlace})` : ''}.`
  msg += ' Qué pasó: '
  return msg
}
