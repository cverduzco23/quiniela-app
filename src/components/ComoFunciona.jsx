/**
 * Guía "¿Cómo funciona?" para administradores.
 * Modal con los conceptos clave: crear, puntos, cierre/finalización, resultados.
 * Se abre desde el header del panel y es siempre accesible.
 */
import { waLink, mensajeReporteProblema } from '../utils/whatsapp'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '5vh 1rem', overflowY: 'auto',
}
const modal = {
  background: 'var(--card)', borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
  maxWidth: 560, width: '100%', padding: '1.5rem',
}
const seccion = {
  background: 'var(--bg-soft)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '1rem 1.1rem', marginBottom: 12,
}
const h = { fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8 }
const p = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 6 }
const strong = { color: 'var(--text)', fontWeight: 700 }
const list = { margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }
const li = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }
const link = { color: 'var(--green)', fontWeight: 700 }
const marca = { color: 'var(--text-strong)', fontWeight: 900 }

export function ComoFunciona({ onClose }) {
  const sugerirLigaLink = waLink('¡Hola! ¿Podrían agregar la liga/torneo de ... a QuinielApp?')
  const reporteLink = waLink(mensajeReporteProblema())

  return (
    <div className="como-funciona-overlay" style={overlay} onClick={onClose}>
      <div className="como-funciona-modal" style={modal} onClick={e => e.stopPropagation()}>
        <div className="como-funciona-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>
            ¿Cómo funciona?
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'var(--neutral-bg)', border: '1px solid var(--border)', color: 'var(--text)', width: 32, height: 32, borderRadius: 'var(--radius-sm)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div className="como-funciona-layout">
        <aside className="como-funciona-toc" aria-label="Contenido del centro de ayuda">
          <p>EN ESTA PÁGINA</p>
          <nav>
            <a href="#ayuda-crear">Crear tu quiniela</a>
            <a href="#ayuda-puntos">Cómo se miden los puntos</a>
            <a href="#ayuda-resultados">Cierre y resultados</a>
            <a href="#ayuda-compartir">Compartir</a>
            <a href="#ayuda-comunidad">Ranking y comunidad</a>
            <a href="#ayuda-participantes">Gestionar participantes</a>
            <a href="#ayuda-soporte">Soporte</a>
          </nav>
        </aside>
        <div className="como-funciona-grid">
        <div id="ayuda-crear" className="como-funciona-section" style={seccion}>
          <p style={h}>1. Crear tu quiniela</p>
          <ul style={list}>
            <li style={li}>Ponle un <span style={strong}>nombre claro</span> a tu quiniela.</li>
            <li style={li}>
              Usa el <span style={strong}>buscador de partidos</span>: selecciona la liga o torneo, toca <span style={strong}>Buscar</span> y marca los partidos que quieras agregar. Si no la encuentras,{' '}
              <a href={sugerirLigaLink} target="_blank" rel="noreferrer" style={link}>sugiere que la agreguemos</a>.
            </li>
            <li style={li}>Los partidos se agregan con su fecha y hora. Puedes eliminar o agregar más antes de que alguien registre predicciones.</li>
            <li style={li}>La fecha de cierre se sugiere automáticamente <span style={strong}>5 minutos antes del primer partido</span>. Puedes editarla.</li>
            <li style={li}>Se genera un <span style={strong}>código de acceso</span>. Puedes cambiarlo y compartirlo con tus participantes; ellos pueden entrar desde quinielapp.fun usando ese código. Si quieres, también puedes compartir el enlace directo.</li>
            <li style={li}>Define el premio: premio fijo, cuota por participante, ambos combinados, o déjalos en cero para jugar solo por diversión.</li>
            <li style={li}>La gestión de pagos entre participantes y organizador se hace fuera de <span style={marca}>Quiniel<span style={{ color: 'var(--green)' }}>App</span></span>.</li>
          </ul>
        </div>

        <div id="ayuda-puntos" className="como-funciona-section" style={seccion}>
          <p style={h}>2. Cómo se miden los puntos</p>
          <ul style={list}>
            <li style={li}><span style={strong}>1 punto</span> por acertar el resultado: local, empate o visitante.</li>
            <li style={li}><span style={strong}>+2 puntos extra</span> si además aciertas el marcador exacto. Máximo <span style={strong}>3 puntos por partido</span>.</li>
            <li style={li}>Los partidos <span style={strong}>cancelados</span> no cuentan para nadie.</li>
            <li style={li}>Gana quien acumule más puntos. Si hay empate, comparten posición y, si aplica, premio.</li>
          </ul>
        </div>

        <div id="ayuda-resultados" className="como-funciona-section" style={seccion}>
          <p style={h}>3. Cierre y resultados</p>
          <ul style={list}>
            <li style={li}>La quiniela se <span style={strong}>cierra</span> (deja de recibir registros de jugadores) automáticamente a la hora de cierre. Ya nadie puede entrar a jugar ni cambiar sus picks.</li>
            <li style={li}>
              Los marcadores se llenan y guardan <span style={strong}>automáticamente</span>. Espera unos minutos después de cada partido; si no se actualizan,{' '}
              <a href={reporteLink} target="_blank" rel="noreferrer" style={link}>reporta el problema por WhatsApp</a>.
            </li>
            <li style={li}>Durante los partidos, el <span style={strong}>ranking se actualiza en vivo</span> cada minuto. Cuando todos terminan, la quiniela queda <span style={strong}>finalizada</span> y se ve el ganador.</li>
          </ul>
        </div>

        <div id="ayuda-compartir" className="como-funciona-section" style={seccion}>
          <p style={h}>4. Compartir</p>
          <p style={p}>Desde la pestaña <span style={strong}>Compartir</span> de cada quiniela copias el enlace y el código para mandarlos por WhatsApp a tus participantes.</p>
        </div>

        <div id="ayuda-comunidad" className="como-funciona-section" style={seccion}>
          <p style={h}>5. Ranking y comunidad</p>
          <ul style={list}>
            <li style={li}>En el ranking, los jugadores pueden <span style={strong}>reaccionar</span> a partidos en vivo o finalizados con un emoji. Cada dispositivo puede elegir una reacción por partido y cambiarla cuando quiera.</li>
            <li style={li}>La sección <span style={strong}>Comentarios</span> permite conversar usando el nombre registrado en la quiniela. Quien aún no se identifica puede elegir su nombre; si la quiniela sigue abierta, también puede registrarse desde ahí.</li>
            <li style={li}>Puedes activar o desactivar los comentarios desde <span style={strong}>Editar → Comentarios de la quiniela</span>. Como organizador también puedes borrar comentarios cuando sea necesario.</li>
          </ul>
        </div>

        <div id="ayuda-participantes" className="como-funciona-section" style={seccion}>
          <p style={h}>6. Gestionar participantes</p>
          <ul style={list}>
            <li style={li}>Usa el botón de <span style={strong}>lápiz</span> para corregir el nombre de un participante. Sus predicciones, puntos y posición se conservan, y el nombre se actualiza también en ranking, comentarios y temporadas.</li>
            <li style={li}><span style={strong}>Ocultar</span> lo quita del ranking público sin borrar su registro. Puedes volver a mostrarlo después.</li>
            <li style={li}>Si alguien quiere cambiar sus predicciones, <span style={strong}>elimina</span> su registro y pídele que se registre otra vez. Sólo podrá hacerlo mientras la quiniela siga abierta.</li>
          </ul>
        </div>

        <div id="ayuda-soporte" className="como-funciona-section como-funciona-section--support" style={seccion}>
          <p style={h}>¿Algo no funciona?</p>
          <p style={{ ...p, marginBottom: 0 }}>
            Si un marcador no llegó o viste cualquier falla,{' '}
            <a
              href={reporteLink}
              target="_blank" rel="noreferrer"
              style={link}
            >
              reporta un problema por WhatsApp
            </a>{' '}
            y lo revisamos.
          </p>
        </div>
        </div>

        <button
          className="como-funciona-primary"
          onClick={onClose}
          style={{ width: '100%', marginTop: 6, padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg, var(--green), var(--green-light))', color: '#07120A', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >
          Entendido
        </button>
        </div>
      </div>
    </div>
  )
}
