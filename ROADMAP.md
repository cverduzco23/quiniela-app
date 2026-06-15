# ROADMAP — QuinielApp

> **Última actualización: 2026-06-15** (lote de mejoras de UX — ver §4.bis).
> Auditoría completa de código, seguridad y costos: 2026-06-11 (§3).
> Este documento es la fuente de verdad para retomar el proyecto en cualquier momento:
> qué busca el proyecto, qué está hecho, qué está pendiente, por qué, y en qué orden.

---

## 1. Visión final (lo que buscamos)

**Meta:** una app que cualquier organizador pueda usar de punta a punta **sin que César
tenga que gestionar casi nada** — solo recibir el pago correspondiente por el uso.

Eso implica, en estado final:
1. **Auto-alta de clientes** (self-service): el cliente se registra y paga solo, sin WhatsApp manual.
2. **Pagos automáticos**: checkout de MercadoPago + webhook que activa la cuenta/quiniela sin intervención.
3. **Resultados automáticos**: sincronización ESPN programada (sin botón ⚡ manual).
4. **Seguridad de producción**: lecturas protegidas, cuotas duras del lado servidor, App Check.

**Restricciones permanentes:**
- **Costo ~$0 sin clientes.** No gastar dinero fijo mientras el uso sea familiar/amigos.
  Cualquier infraestructura nueva debe caber en capas gratuitas (Spark/Blaze free tier, Vercel hobby).
- **Marco legal (SEGOB):** el modelo con dinero como premio queda confinado a **grupos privados
  de conocidos**. Si algún día se abre a público general, el modelo debe ser de **puntos
  canjeables + anuncios/membresía** (sin dinero como premio). Nunca mezclar.

---

## 2. Cómo se opera HOY (manual, por diseño)

| Tarea | Cómo se hace hoy | Automatización futura |
|---|---|---|
| Alta de clientes | WhatsApp → César crea cuenta desde el panel | Self-service con pago primero (post-Mundial) |
| Cobro | Link MercadoPago manual + César marca pagado en panel | Checkout + webhook (post-Mundial) |
| Cuota "1 gratis, luego paga" | Conteo client-side (suave, burlable) | Cloud Function con cuota dura (post-Mundial) |
| Resultados de partidos | Botón "⚡ Sincronizar ESPN" en el panel | Función programada (post-Mundial) |
| Respaldos | **No hay** ⚠️ | Export programado; mientras tanto, manual |

Precios vigentes: **$49 MXN por quiniela** (lanzamiento) + **$199 Pase Mundial**.
WhatsApp Business: `525652491143`. Detalle del flujo de onboarding: [PLAN_ONBOARDING_CLIENTES.md](PLAN_ONBOARDING_CLIENTES.md).

---

## 3. Auditoría 2026-06-11 — hallazgos de seguridad y costos

Estado al momento de la auditoría: 727 tests pasando, lint limpio en `src/` (los errores
de lint que aparecen vienen de worktrees viejos en `.claude/worktrees/`, no del código real).

### 3.1 Lo que YA está bien (no retrabajar)

- **Reglas de Firestore** ([firestore.rules](firestore.rules)): gate duro `activo` para crear
  quinielas; clientes no pueden auto-otorgarse plan/cuota/temporada (campos congelados en rules);
  `movimientos` (caja) solo super admin; predicciones inmutables (`update: false`) y el **cierre
  se valida server-side** (nadie puede enviar picks tarde ni con DevTools).
- Contraseñas: política mínima (8 + letra + número), cambio forzado al primer ingreso,
  recuperación por correo, anti fuerza bruta de Firebase.
- `noindex/nofollow` + disclaimer recreativo + home sin montos (separación legal).
- ESPN se consulta desde el navegador del usuario → costo cero para nosotros; polling con
  pausa cuando la pestaña no está visible.

### 3.2 Riesgos conocidos y ACEPTADOS por ahora (documentados, no resueltos)

| Riesgo | Por qué se acepta | Cuándo deja de ser aceptable |
|---|---|---|
| **Picks crudos legibles pre-cierre**: `predicciones` tiene `allow read: if true`; alguien técnico puede leer picks ajenos antes del cierre vía API de Firebase y copiar/optimizar | En pools privados chicos de conocidos, el esfuerzo de trampa no compensa | Botes grandes o quinielas con desconocidos → requiere backend que filtre lecturas (tarea #11) |
| **Código de acceso cosmético**: vive en el doc público de la quiniela, se valida client-side | Protege contra curiosos casuales, que es el caso real | Igual que arriba; no venderlo nunca como seguridad real |
| **Cuota "1 gratis" suave**: el conteo `quinielasCreadas` lo escribe el cliente | Clientes validados por WhatsApp; César ve todas las quinielas y tiene el switch `activo` | Self-service con desconocidos → cuota dura server-side (tarea #9) |

### 3.3 Hallazgos NUEVOS de esta auditoría (pendientes de resolver)

**H1 — Agotamiento de cuota gratuita = caída del sitio (riesgo #1 real). 🔴**
[home.jsx:103](src/pages/home.jsx:103) y [admin.jsx:665](src/pages/admin.jsx:665) leen **la
colección completa de `predicciones`** en cada visita. Con lecturas públicas y sin App Check,
cualquiera puede consumir las 50,000 lecturas/día del plan Spark en minutos → **la app se apaga
para todos el resto del día** (en Spark no cobra: corta el servicio). Además el costo por visita
crece con cada predicción acumulada (500 predicciones × 100 visitas/día = 50,000 lecturas).
*Fix barato:* `getCountFromServer` (agregación: contar 1,000 docs = 1 lectura) para los conteos
de participantes en home y predicciones. No requiere Blaze ni backend.

**H2 — Spam de predicciones sin freno. 🟠**
Las reglas permiten a cualquier anónimo crear predicciones ilimitadas en una quiniela abierta
(el anti-duplicado por nombre es client-side y tiene race condition). Un atacante puede inflar
un ranking con cientos de nombres basura. *Mitigación parcial:* App Check; el admin puede borrar
desde el panel. *Solución real:* backend (post-Mundial).

**H3 — Valores de `picks` sin validar en reglas. 🟠**
`firestore.rules` valida que `picks` sea map de ≤30 llaves, pero **no qué contienen los
valores**: se pueden guardar strings de casi 1 MB por documento (infla el storage gratuito de
1 GB). *Fix:* ~5 líneas en rules validando estructura/tamaño de cada pick. Aditivo, sin riesgo.

**H4 — Registro público de cuentas Auth probablemente habilitado. 🟡**
`crearUsuarioAislado` en [firebase.js:62](src/firebase.js:62) crea cuentas desde el navegador,
lo cual solo funciona si el signup email/password está **habilitado para cualquiera** (el plan
de onboarding decía "deshabilitado" — contradicción a verificar en Firebase Console).
No es crítico: una cuenta sin doc en `admins/` no tiene ningún permiso. Pero cualquiera puede
crear cuentas Auth en el proyecto. *Solución limpia:* crear cuentas vía Admin SDK (post-Mundial).

**H5 — Sin headers de seguridad en Vercel. 🟡**
[vercel.json](vercel.json) solo tiene el rewrite de SPA. Faltan `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy` (gratis, aditivo, sin riesgo). CSP completo NO
se hará: chocaría con los estilos inline (preferencia de diseño deliberada).

**H6 — Sin respaldos. 🟠**
No existe ningún respaldo de Firestore. Una corrupción o borrado accidental pierde todo.
El export automático requiere Blaze; mientras tanto, hacer export manual (o script JSON)
antes de cada quiniela grande.

**H7 — Limpieza menor. ⚪**
Worktrees viejos en `.claude/worktrees/` ensucian el lint global. Borrarlos cuando se pueda.
Nota de comportamiento (no bug): el auto-`finalizada` en [ranking.jsx:120](src/pages/ranking.jsx:120)
solo surte efecto cuando el dueño/super admin tiene el ranking abierto (para anónimos la regla
lo rechaza en silencio — esperado).

---

## 4. Plan priorizado

> **⚠️ CONGELAMIENTO ACTIVO:** el Mundial 2026 arrancó (11 jun – 19 jul 2026). Durante el
> torneo **solo cambios seguros y aditivos**; nada de refactors ni infraestructura nueva.

### Fase AHORA (durante el Mundial — seguro y aditivo, costo $0)

| # | Tarea | Por qué | Resuelve |
|---|---|---|---|
| 1 | **App Check (reCAPTCHA v3) en modo "monitoreo"** (lo activa César en Firebase Console; NO enforce todavía) | Medir tráfico ilegítimo sin riesgo de bloquear usuarios reales en pleno Mundial | Prepara H1, H2 |
| 2 | **Validar valores de `picks` en firestore.rules** | 5 líneas, cero impacto en UI | H3 |
| 3 | **Headers de seguridad en vercel.json** | Gratis, sin riesgo | H5 |
| 4 | **Conteos con `getCountFromServer`** en home y predicciones | Corta el 90%+ de lecturas; reduce mucho la superficie del DoS por cuota. Toca el home → hacerlo con tests y entre jornadas | H1 |
| 5 | **Respaldo manual** de quinielas+predicciones (export o script JSON) antes de quinielas grandes | Hoy no hay ningún respaldo | H6 |

### §4.bis — Mejoras de UX hechas el 2026-06-15 (seguras y aditivas, costo $0)

Lote de pulido para uso casero (la app la usa César con familia/amigos). Nada de esto
toca seguridad ni infraestructura; todo es client-side y sin lecturas nuevas a Firestore.

- **Orden automático de partidos**: al agregarlos desde el buscador (crear y editar) se
  ordenan por fecha/hora; los manuales sin hora van al final. ([admin.jsx](src/pages/admin.jsx))
- **Secciones del inicio configurables** (solo super admin): tarjeta "🏠 Secciones del inicio"
  para mostrar/ocultar y **reordenar** cada bloque del home (código, cómo funciona, crear
  quiniela, quiniela activa, jugándose, terminada, imagen, promo). Config en **`config/home`**
  (doc nuevo: lectura pública, escritura super admin — regla agregada en [firestore.rules](firestore.rules),
  ya desplegada). Util único: [src/utils/homeSections.js](src/utils/homeSections.js). El home usa
  flexbox `order`; default = todo visible en orden estándar.
- **Panel super admin**: quinielas de otros admins ocultas por defecto (desplegables), mis
  finalizadas ocultas por defecto, activas/jugándose top 2 con "ver más".
- **Caja**: ordenar saldos por nombre o por monto.
- **Mensaje para compartir**: enlace `https://quinielapp.fun` (clickeable) + línea de cuota.
- **Selector de emojis** para el nombre de la quiniela (ícono 😀 a la derecha del input, panel
  por categorías con "Sugeridos" arriba). [src/components/EmojiPicker.jsx](src/components/EmojiPicker.jsx)
- **Cuenta regresiva** (HH:MM:SS) en inicio (Quiniela activa) y ranking (banner de no-registrados)
  cuando faltan <24h para el cierre. [src/components/CuentaRegresiva.jsx](src/components/CuentaRegresiva.jsx)
- **Indicador "Partido en vivo"** en "Jugándose ahora" del inicio. Hoy es **heurística por
  horario** (`hayPartidoEnVivo` en [src/utils/cierre.js](src/utils/cierre.js)): en vivo = pasó la
  hora de inicio, dentro de ~2.5h, sin marcador final. ⚠️ No exacto (no contempla retrasos).
  **Mejora futura ligada a la tarea #10**: cuando exista la Cloud Function que consulta ESPN,
  guardar el estado real de cada partido en Firestore y que el indicador lo lea (preciso y sin
  llamadas a ESPN desde cada navegador). `hayPartidoEnVivo` solo pasaría de calcular por horario
  a leer ese campo; la UI no cambia.

### Fase POST-MUNDIAL (rumbo a la app autónoma)

| # | Tarea | Por qué / qué buscamos |
|---|---|---|
| 6 | **Migrar a Blaze + alertas de presupuesto ($5/$20)** | Prerequisito de Functions/pagos. Blaze incluye la misma capa gratis: a bajo volumen sigue costando ~$0; las alertas son el seguro |
| 7 | **Pagos automáticos**: Checkout MercadoPago + webhook (Cloud Function) que activa cuenta/derechos | Elimina "César valida y marca pagado". Plan detallado ya escrito (memoria `project_pending_payments`) |
| 8 | **Auto-alta self-service** (registro con pago primero) | Junto con #7 es el corazón de "solo recibir el pago". Elimina el alta por WhatsApp |
| 9 | **Cuota dura server-side** (Cloud Function crea las quinielas) | El "1 gratis" deja de ser burlable; necesario cuando los clientes ya no son conocidos |
| 10 | **Auto-sync ESPN** (función programada) | Elimina el botón ⚡ manual. Ojo: duplica lógica de scoring server-side → hacerlo con tests contra el contrato real de ESPN (hay spike local propuesto en memoria `project_plan_tecnico`). **Aprovechar para guardar el estado en vivo de cada partido en Firestore** y que el indicador "Partido en vivo" del inicio (hoy heurística por horario, ver §4.bis) sea exacto y sin llamadas a ESPN por visitante |
| 11 | **Cerrar lectura pública de picks pre-cierre** | El riesgo de trampa escala con botes/desconocidos. Requiere backend (posible con #6). Es el pendiente de seguridad más profundo |
| 12 | **App Check en enforce** + **refactor de admin.jsx** (3,506 líneas) + cuentas vía Admin SDK (H4) | Endurecimiento y mantenibilidad cuando ya no haya presión de torneo |

### Descartado / decidido NO hacer
- Mover estilos inline a CSS/frameworks (preferencia deliberada del usuario).
- Métricas/dashboard propio (descartado 2026-06-07).
- Edición de predicciones por jugadores, push notifications, TypeScript (ver memoria de fases).
- Pase de temporada como producto (solo por-quiniela y Pase Mundial).

---

## 5. Modelo de costos (referencia rápida)

- **Hoy:** Spark (gratis) + Vercel hobby (gratis) + ESPN client-side (gratis). **$0 fijo.**
- **Límites Spark que importan:** 50K lecturas/día, 20K escrituras/día, 1 GB storage.
  El riesgo de toparlos es H1 (lecturas), no el uso legítimo.
- **Blaze (futuro):** misma capa gratuita incluida; a este volumen ~$0. Activar SIEMPRE con
  alertas de presupuesto y después de App Check, para que nadie más gaste nuestra cuota.

---

## 6. Para retomar el proyecto (mapa de documentación)

- **Este archivo** — visión, auditoría, prioridades.
- [README.md](README.md) — qué es la app, stack, estructura, cómo correr y desplegar.
- [PLAN_ONBOARDING_CLIENTES.md](PLAN_ONBOARDING_CLIENTES.md) — flujo de alta/cobro manual vigente (implementado) + su Fase D.
- [GUIONES_WHATSAPP.md](GUIONES_WHATSAPP.md) — mensajes para clientes.
- [firestore.rules](firestore.rules) — la seguridad real (comentada línea por línea).
- Memoria de Claude (sesiones previas): planes de pagos, rollout, decisiones de estilo y
  seguridad — índice en `~/.claude/projects/-Users-cesarverduzco-quiniela-app/memory/MEMORY.md`.
