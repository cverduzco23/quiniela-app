# QuinielApp: Guía de estilo (Ranking / pantallas móviles)

Sistema visual "Armonía" aplicado en `Ranking - Armonia.dc.html`. Respetar en todas las pantallas nuevas para mantener el look moderno y premium.

## 1. Base oscura con glow contenido
- Fondo app: `#070d18`. Superficies: `#0B1220` / `#111827`.
- El brillo premium es sutil y va arriba de la pantalla (verde + dorado muy tenues) desvanecido con máscara. No usar gradientes llamativos de fondo. Todo lo demás, sólido y calmado.

## 2. Color con significado (regla más importante)
El color es semántico, nunca decorativo:
- **Verde `#22C55E`** (claro `#86EFAC`) = marca, acierto, acción, "en juego".
- **Dorado `#FACC15` / `#F4D27E`** = RESERVADO solo para dinero y 1er lugar. Nunca de adorno.
- **Rojo `#EF4444`** (texto `#FCA5A5`) = en vivo / penales.
- **Grises** (`#9CA3AF`, `#6B7280`, `#4B5563`) = secundario, estados neutros / pendientes.
- Texto principal `#F9FAFB`.

## 3. Tipografía con roles fijos
- **Rajdhani** (500/600/700) para números, marcadores, puntos y montos, con aire de scoreboard.
- **Inter** para todo texto de lectura.
- Los números SIEMPRE en Rajdhani; no mezclar roles.

## 4. Una sola receta de tarjeta, repetida
Firma común en todas las superficies:
- `background: linear-gradient(135deg, rgba(30,41,59,0.92), rgba(15,24,40,0.95))`
- `border: 1px solid rgba(255,255,255,0.10)`
- `border-radius: 12 a 14px`
- `box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.32)` (luz interior + sombra proyectada).

## 5. Jerarquía por "apex" (intensidad de glow)
- La card "Si terminara ahora" es el punto culminante: único borde verde `rgba(134,239,172,0.36)`, doble glow (verde+dorado) y brillo animado.
- Todo lo demás baja de intensidad hacia abajo.
- Sub-niveles desplegados (detalles de partido, predicciones) van en paneles hundidos: fondo `rgba(6,12,24,0.55)`, borde `rgba(255,255,255,0.07)`.

## 6. Detalles vivos con mesura
Micro-animaciones puntuales y lentas (punto rojo que late en vivo, brillo que cruza la fila del líder y la card de premio). Nunca distraen.

## 7. Consistencia de estructura
- Marcadores siempre en grid `1fr auto 1fr` (marcador centrado, nombres largos con todo el ancho).
- Estados como pills redondeados (`border-radius:999px`) de tamaño y forma uniformes.
- Chevron simple para desplegar.
- Badges de estado con mismo tamaño/forma en toda la pantalla.

## 8. Redacción natural
- No usar guiones largos, ni em dash ni en dash, en títulos, párrafos, etiquetas, mensajes, documentación o texto visible de la interfaz.
- Separar ideas con punto, coma, dos puntos o paréntesis.
- Esta regla aplica a todo texto nuevo y a cualquier texto existente que se edite.

**En una frase:** superficie oscura calmada + color estrictamente semántico (dorado = dinero) + tipografía de scoreboard para números + una sola receta de tarjeta con jerarquía por intensidad de glow.
