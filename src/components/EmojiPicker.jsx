import { useState, useRef, useEffect } from 'react'

/**
 * Selector de emojis tipo "teclado de celular" (sin librerías).
 *
 * Pensado para quien no tiene teclado de emojis a la mano (ej. en computadora):
 * un ícono 😀 a la derecha del input abre un panel desplazable con cientos de
 * emojis organizados por categoría. Al dar clic se inserta el emoji en la
 * posición del cursor dentro del input indicado por `inputId` (si no se puede
 * leer la posición, lo agrega al final).
 *
 * Props:
 *   - inputId:  id del <input> al que se inserta el emoji.
 *   - value:    valor actual del campo (string controlado).
 *   - onChange: setter del valor (recibe el nuevo string).
 */

// Catálogo amplio por categoría. Se mantiene curado (no generado por rangos
// Unicode) para evitar "cajitas" de glifos no asignados en algunos sistemas.
const CATEGORIAS = [
  { nombre: 'Sugeridos', emojis: ['⚽','🏆','🥇','🥈','🥉','🏅','🎖️','🌍','🌎','🌏','🥅','👟','🧤','🚩','🏁','📅','🗓️','⏱️','🔥','💪','⭐','🌟','🎯','🎲','🏟️','📊','💰','🤑','🎉','🥳','👑','🆚','💥','✨','🍀','🇲🇽'] },
  { nombre: 'Caras', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','🤖'] },
  { nombre: 'Gestos', emojis: ['👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','💪','🦾','🖕','✍️','🤳','💅','👀','👁️','👅','👄','🧠','🦷','🦴','💋','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💯','💢','💥','💫','💦','💨','🔥','✨','⭐','🌟','💫'] },
  { nombre: 'Personas', emojis: ['👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🏃','💃','🕺','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','👨‍👩‍👧','👪'] },
  { nombre: 'Animales', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦂','🐢','🐍','🦎','🐙','🦑','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦏','🐪','🐫','🦒','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🕊️','🐇','🐁','🐀','🐿️','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🌾','🌺','🌻','🌹','🌷','🌸','💐','🍄'] },
  { nombre: 'Comida', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'] },
  { nombre: 'Deportes', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','⛷️','🏂','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'] },
  { nombre: 'Viajes', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🛴','🚲','🛵','🏍️','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🚁','🚀','🛸','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🗺️','🗽','🗼','🏰','🏯','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏢','🏬','🏣','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🌆','🌇','🌉','🌁'] },
  { nombre: 'Objetos', emojis: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','💽','💾','💿','📷','📸','📹','🎥','📞','☎️','📟','📺','📻','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧰','🧲','🔫','💣','🧨','🔪','🗡️','⚔️','🛡️','🚬','🔭','🔬','💊','💉','🩺','🚪','🛏️','🛋️','🚽','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🪑','🛒','🎁','🎈','🎉','🎊','🎄','🎀','🪄','🔮','📿','🧧','✉️','📩','📨','📧','📦','📪','📫','📬','📭','📮','📜','📃','📄','📑','📊','📈','📉','🗒️','🗓️','📆','📅','📇','🗃️','🗄️','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗑️','🔒','🔓','🔑','🗝️','🔨','📖','📚','📓','📔','📒','📕','📗','📘','📙','🔖','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝'] },
  { nombre: 'Símbolos', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','✴️','❇️','✳️','❎','✅','💠','🌀','➿','🌐','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❓','❔','❗','❕','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔰','♨️','🎦','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','⛔','📵','🚫','💯','💢','♠️','♥️','♦️','♣️','🃏','🀄','🎴','🔇','🔈','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♾️','⭐','🌟','✨','⚡','☄️','💥','🔥','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','☔','🌊'] },
  { nombre: 'Banderas', emojis: ['🏳️','🏴','🏁','🚩','🏳️‍🌈','🇲🇽','🇦🇷','🇧🇷','🇺🇸','🇨🇦','🇪🇸','🇫🇷','🇬🇧','🇩🇪','🇮🇹','🇵🇹','🇳🇱','🇧🇪','🇨🇭','🇸🇪','🇳🇴','🇩🇰','🇵🇱','🇷🇺','🇺🇦','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇦🇺','🇨🇱','🇨🇴','🇵🇪','🇺🇾','🇪🇨','🇻🇪','🇨🇷','🇬🇹','🇭🇳','🇸🇻','🇵🇦','🇩🇴','🇨🇺','🇵🇾','🇧🇴'] },
]

export function EmojiPicker({ inputId, value, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const wrapRef = useRef(null)

  // Cerrar al hacer clic fuera del panel.
  useEffect(() => {
    if (!abierto) return
    const alClicFuera = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClicFuera)
    return () => document.removeEventListener('mousedown', alClicFuera)
  }, [abierto])

  const insertar = (emoji) => {
    const el = document.getElementById(inputId)
    const actual = value ?? ''
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart
      const end = el.selectionEnd
      const nuevo = actual.slice(0, start) + emoji + actual.slice(end)
      onChange(nuevo)
      // Restaurar el cursor justo después del emoji insertado.
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + emoji.length
        try { el.setSelectionRange(pos, pos) } catch { /* noop */ }
      })
    } else {
      onChange(actual + emoji)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-label="Agregar emoji"
        aria-expanded={abierto}
        style={{
          height: '100%', minHeight: 42, width: 46, padding: 0, fontSize: 20, lineHeight: 1,
          borderRadius: 'var(--radius-md)', cursor: 'pointer',
          border: `1px solid ${abierto ? 'var(--green)' : 'var(--border-strong)'}`,
          background: abierto ? 'var(--green-bg)' : 'var(--card-light)',
        }}
      >
        😀
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            width: 300, maxWidth: '90vw', maxHeight: 300, overflowY: 'auto',
            background: 'var(--card)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '8px 10px',
          }}
        >
          {CATEGORIAS.map(cat => (
            <div key={cat.nombre} style={{ marginBottom: 6 }}>
              <p style={{
                position: 'sticky', top: -8, background: 'var(--card)',
                fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 0', margin: 0,
              }}>
                {cat.nombre}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))', gap: 2 }}>
                {cat.emojis.map((e, i) => (
                  <button
                    key={cat.nombre + i}
                    type="button"
                    // mousedown + preventDefault para no quitar el foco/cursor del input.
                    onMouseDown={ev => { ev.preventDefault(); insertar(e) }}
                    aria-label={`Insertar ${e}`}
                    style={{
                      width: 30, height: 30, padding: 0, lineHeight: 1, fontSize: 19,
                      border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6,
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
