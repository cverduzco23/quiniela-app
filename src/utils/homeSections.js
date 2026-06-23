/**
 * Secciones configurables de la página de inicio (home).
 *
 * El super admin puede, desde su panel, mostrar/ocultar cada sección y cambiar
 * su orden. Esa configuración vive en Firestore: doc `config/home` con:
 *   - un booleano por clave (ausente o true = visible; false = oculta)
 *   - `orden`: arreglo de claves en el orden deseado
 *
 * Mantener este archivo como única fuente de verdad evita que admin.jsx y
 * home.jsx se desincronicen al agregar o renombrar secciones.
 */

// Orden por defecto (cuando `config/home.orden` no existe).
export const ORDEN_SECCIONES_HOME = [
  'mostrarCodigo',
  'mostrarComoFunciona',
  'mostrarCrearQuiniela',
  'mostrarActiva',
  'mostrarJugandose',
  'mostrarTerminada',
  'mostrarImagen',
  'mostrarPromo',
]

// Etiquetas legibles para el panel del super admin.
export const LABELS_SECCIONES_HOME = {
  mostrarCodigo:        '¿Tienes un código de acceso?',
  mostrarComoFunciona:  '¿Cómo funciona? (3 pasos)',
  mostrarCrearQuiniela: '¿Quieres crear tu propia quiniela?',
  mostrarActiva:        'Quiniela abierta',
  mostrarJugandose:     'Jugándose ahora',
  mostrarTerminada:     'Última quiniela terminada',
  mostrarImagen:        'Imagen decorativa',
  mostrarPromo:         '¿Quieres tu propia quiniela? (promo final)',
}

/**
 * Devuelve el orden efectivo de las secciones a partir de la config guardada.
 * - Respeta el orden guardado en `config/home.orden`.
 * - Ignora claves desconocidas (limpieza defensiva).
 * - Agrega al final cualquier sección nueva que aún no esté en el orden guardado.
 */
export function ordenSeccionesHome(config) {
  const guardado = Array.isArray(config?.orden) ? config.orden : []
  const validas = guardado.filter(k => ORDEN_SECCIONES_HOME.includes(k))
  const faltantes = ORDEN_SECCIONES_HOME.filter(k => !validas.includes(k))
  return [...validas, ...faltantes]
}
