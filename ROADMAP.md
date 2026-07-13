# ROADMAP: QuinielApp

> **Última actualización: 2026-07-12** (código LISTO PARA LANZAR: ver §0.bis).
> Pivote de modelo de negocio (2026-07-04): §0. Mejoras de UX: 2026-06-15 (§4.bis).
> Auditoría de código/seguridad/costos: 2026-06-11 (§3).
> Este documento es la fuente de verdad para retomar el proyecto en cualquier momento:
> qué busca el proyecto, qué está hecho, qué está pendiente, por qué, y en qué orden.
>
> ⚠️ **§0 y §0.bis (abajo) son el estado vigente y MANDAN sobre cualquier referencia a
> "planes", "Pase Mundial", "$49/$199" o "cobro por quiniela" que quede en este doc.**

---

## 0. Pivote de modelo de negocio (2026-07-04): ESTADO VIGENTE

**Decisión.** Se abandona el modelo SaaS de vender quinielas/planes. Razones (del dueño):
el negocio no crecería sin invertir tiempo en ventas (que no lo hay), no le gana a competidores
(algunos regalan quinielas o transmiten partidos), y los caminos "públicos con premio" o
"puntos canjeables" chocan con la regulación (SEGOB). El proyecto se mantiene porque el dueño
lo usa con familia y amigos; se busca un **ingreso ligero pasivo**, no una fuente principal.

**Modelo nuevo (por fases):**
1. **Ahora: 100% gratis + botón "Apoya el proyecto"** (donativo voluntario, previsto vía **link
   de Mercado Pago**, sin construir sistema de pagos). Cubrir el costo de operación ya es meta válida.
2. **Si algún día crece de forma orgánica:** evaluar **freemium** (todo lo esencial gratis; el pase
   opcional desbloquea comodidades, nunca candados) y/o **anuncios**. El pase, si vuelve, se
   enmarca como **cuota por la herramienta (software)**, no como cuota de juego ni tajada del bote.

**Descartado explícitamente:** retransmisión de partidos (piratería de derechos, riesgo legal
alto al monetizar; no se hace). Quinielas públicas con premio en dinero. Puntos canjeables por
regalos como producto público.

**Qué se distingue (importante):** la **cuota/bote/premio DENTRO de una quiniela** (entre amigos,
"marcar pagado", `premios.js`) **se conserva**: es función de juego, no modelo de negocio, y es
legal en pools privados de conocidos.

### 0.1 Limpieza de código ya ejecutada (2026-07-04)

Se eliminó toda la capa SaaS de planes/pagos, front y back:
- **Borrados:** `src/components/Paywall.jsx`, `src/utils/entitlements.js`.
- **`admin.jsx`:** fuera el gate de cuota (`puedeCrearQuiniela` → ahora `puedeCrear = soySuper ||
  adminDoc.activo`, quinielas **ilimitadas** para cualquier cliente activo); fuera `darQuinielaExtra`
  ($49) y `darPaseMundial` ($199); fuera banner de upsell, bloques "Tu plan / Mi cuenta", columna
  "Plan" en la lista de clientes y el contador `quinielasCreadas`. El alta de cliente ya no escribe
  `plan/quinielasPermitidas/quinielasCreadas/temporadaHasta`.
- **`whatsapp.js`:** fuera mensajes `comprarQuiniela` y `paseMundial`.
- **`firestore.rules`:** el update del propio admin ya no congela `plan/quinielasPermitidas/
  temporadaHasta` (no existen); **sigue congelando `activo` y `email`** (gate de acceso).
  ⚠️ **Pendiente del dueño: re-desplegar reglas** (`firebase deploy --only firestore:rules`).
- Docs viejos de clientes en Firestore quedan con campos `plan`, etc. sin uso: inofensivos, se ignoran.
- Verificado: 744 tests ✓, build ✓. Se **conserva** el módulo "Clientes" (alta manual) hasta implementar auto-registro.

### 0.2 Siguientes pasos acordados (en orden)

1. ✅ **Limpiar la app de planes/pagos** (hecho, §0.1).
2. ✅ **Auto-registro de usuarios** (hecho 2026-07-09, ver §0.bis).
3. ✅ **Botón "Apoya el proyecto"** (hecho: al final se implementó con Stripe Checkout
   en vez de link de Mercado Pago, ver §0.bis).

---

## 0.bis Estado al 2026-07-12: código LISTO PARA LANZAR (uso libre)

Todo lo de abajo ya está en `main` local. **No queda desarrollo bloqueante**; lo que
falta para lanzar es operación (checklist más abajo).

### Completado desde el pivote (§0)

- **Auto-registro de organizadores** (2026-07-09): tabs Entrar/Crear cuenta en `/admin`,
  verificación de correo obligatoria, cuota dura de 50 quinielas validada en rules
  (ID determinístico `{uid}-{N}` + contador en el mismo batch), moderación
  Pausar/Eliminar/Bloquear y auto-eliminación de cuenta. Reemplaza el alta manual por WhatsApp.
- **Sync automática de resultados** (2026-07-07, EN PRODUCCIÓN): Cloud Function
  `sincronizarResultados` corre cada 10 min; el botón "⚡ Sincronizar" se eliminó.
  El proyecto ya está en **Blaze** (tareas #6 y #10 del plan: hechas).
- **Donativos con Stripe** (`functions/stripe.js`: crearSesionDonativo + webhookDonativos;
  página `/donar` con montos preset). Reemplazó la idea del link de Mercado Pago.
- **Docs legales integrados** (2026-07-12): rutas `/privacidad` y `/terminos`, enlaces en
  footer, leyendas al capturar datos (predicciones, registro, donar) y atribución de
  reCAPTCHA. Checklist [legal/PENDIENTES_LEGAL.md](legal/PENDIENTES_LEGAL.md) al 100%.
- **Auditoría §3.3 cerrada en código** (2026-07-12):
  - **H1** ✅ conteos con `getCountFromServer` en home, panel admin y predicciones
    (ya nadie descarga la colección completa de `predicciones`).
  - **H3** ✅ rules validan cada pick (`picksValidos`: índices "0".."29", valores
    `{local, visitante}` strings ≤4) y acotan `quinielaId`/`fecha`/`codigoAcceso`.
  - **H5** ✅ headers de seguridad en `vercel.json`.
  - **H6** ◐ script de respaldo manual: `node scripts/respaldo.mjs` (dump JSON local de
    todas las colecciones; `--publico` para no pedir login). Correrlo antes de lanzar y de
    cada quiniela grande. El respaldo automático (export programado o PITR) sigue pendiente.
- **Indicador "Partido en vivo" EXACTO** (2026-07-12): la Cloud Function guarda en cada
  quiniela `enVivoEspnIds` + `enVivoActualizado`; `hayPartidoEnVivo` (cierre.js) usa ese
  dato si es fresco (≤25 min) y si no cae a la heurística por horario. Cierra la mejora
  anotada en §4.bis. **Requiere re-deploy de functions.**
- **Límite de 30 partidos por quiniela** en el panel (`MAX_PARTIDOS`, en sync con
  `picksValidos()` de rules): sin esto, una quiniela de 31+ partidos dejaba a los
  jugadores sin poder enviar.
- **App Check listo en código** (clave reCAPTCHA v3 en `src/firebase.js`); falta activarlo
  en consola (monitoreo → enforce).
- Rediseño visual "Armonía" completo (home, admin, donar, predicciones, ranking).
- **Campo `privada` congelado en rules** (2026-07-13, hallazgo S5 de la auditoría integral):
  el dueño ya no puede editar `privada` ni `ownerUid` (aparecer en el home público es
  decisión exclusiva del super admin) y el create exige nacer privada. El patch de edición
  en admin.jsx ya no re-escribe `privada: true` (de paso, editar una quiniela pública ya
  no la vuelve privada por accidente). Va en el mismo deploy de reglas del lanzamiento.

### CHECKLIST DÍA DE LANZAMIENTO (todo el mismo día, en este orden)

1. **Respaldo**: `node scripts/respaldo.mjs`.
2. **`git push`** (Vercel despliega el front solo).
3. **`npx firebase deploy --only firestore:rules`** — obligatorio el mismo día: las reglas
   de cuota del auto-registro y la validación de picks van en sync con el front nuevo.
4. **`npx firebase deploy --only functions`** — sube el estado "en vivo" y las funciones de
   Stripe. En el dashboard de Stripe: configurar webhook + clave live.
5. **Consola Firebase → Authentication**: habilitar sign-up Email/Password, plantillas de
   correo en español, protección contra enumeración de emails.
6. **Consola Firebase → App Check**: registrar la app en modo MONITOREO; tras ~1 semana sin
   falsos positivos, pasar a ENFORCE (cierra H2/spam y protege la cuota).

### Pendiente post-lanzamiento (sin prisa, ver también §4)

- **Indexación (tras validar producción):** quitar `noindex` SOLO de la portada y las
  páginas legales (index.html hoy es noindex global); quinielas y rankings siguen noindex.
  Acordado 2026-07-13; hacerlo después de validar que todo funciona en producción.
- **Ranking agregado en Cloud Function (semana del 20 jul, post-Mundial, antes de Liga MX):**
  la función escribe el ranking calculado en un doc por quiniela; el front lee 1 doc en vez
  de releer todas las predicciones cada 60s por espectador (hallazgo S2 de la auditoría
  integral). De paso habilita cerrar la lectura pública de picks pre-cierre (#11).
- #11 Cerrar lectura pública de picks pre-cierre (el pendiente de seguridad más profundo).
- #12 Refactor de `admin.jsx` (~5,900 líneas) + cuentas vía Admin SDK (H4).
- #13 Correo propio para restablecer contraseña (`noreply@quinielapp.fun`).
- Respaldo automático: export programado a Cloud Storage o activar PITR en consola (H6).
- Fases 3 (UX) y 4 (accesibilidad) especificadas en la memoria de Claude.
- Idea futura: self-edit de predicciones por el jugador (Firebase Anonymous Auth).

---

## 1. Visión final (lo que buscamos)

**Meta:** una app que cualquier organizador pueda usar de punta a punta **sin que César
tenga que gestionar casi nada**: solo recibir el pago correspondiente por el uso.

> ⚠️ **Revisado por §0 (2026-07-04):** la meta ya NO es "recibir el pago por el uso". Ahora es
> mantener la app **gratis** para familia/amigos con un **ingreso pasivo ligero** (donativos; y
> freemium/anuncios solo si crece solo). Los puntos 1-4 de abajo se releen así: el **auto-registro
> (1)** sigue siendo deseable, pero **sin pago** (ya no hay "paga solo"); los **pagos automáticos
> (2)** quedan descartados como producto SaaS (a lo más, un link de donativo). 3 y 4 siguen válidos.

Eso implica, en estado final:
1. **Auto-alta de clientes** (self-service): el cliente se registra solo, sin WhatsApp manual.
2. ~~**Pagos automáticos**~~ → descartado (ver §0); a lo más un link de donativo voluntario.
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
| Alta de clientes | ✅ Auto-registro self-service (2026-07-09, sin pago) | — hecha |
| Cobro | ✅ No hay cobro; donativos voluntarios vía Stripe | — hecha (modelo gratis §0) |
| Cuota "1 gratis, luego paga" | ✅ Cuota dura de 50 en firestore.rules | — hecha |
| Resultados de partidos | ✅ Cloud Function cada 10 min (2026-07-07) | — hecha |
| Respaldos | ◐ Script manual `node scripts/respaldo.mjs` | Export programado o PITR |

> ⚠️ **Obsoleto por §0 (2026-07-04):** ya NO se cobra por quiniela ni Pase Mundial. La app es
> gratis; el alta de clientes manual se conserva solo hasta el auto-registro. La tabla de arriba
> (cobro/cuota) queda como referencia histórica del modelo anterior.

WhatsApp Business: `525652491143`. Detalle del flujo de onboarding (histórico): [PLAN_ONBOARDING_CLIENTES.md](PLAN_ONBOARDING_CLIENTES.md).

---

## 3. Auditoría 2026-06-11: hallazgos de seguridad y costos

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

**H1: Agotamiento de cuota gratuita = caída del sitio (riesgo #1 real). 🔴 ✅ RESUELTO 2026-07-12 (ver §0.bis).**
[home.jsx:103](src/pages/home.jsx:103) y [admin.jsx:665](src/pages/admin.jsx:665) leen **la
colección completa de `predicciones`** en cada visita. Con lecturas públicas y sin App Check,
cualquiera puede consumir las 50,000 lecturas/día del plan Spark en minutos → **la app se apaga
para todos el resto del día** (en Spark no cobra: corta el servicio). Además el costo por visita
crece con cada predicción acumulada (500 predicciones × 100 visitas/día = 50,000 lecturas).
*Fix barato:* `getCountFromServer` (agregación: contar 1,000 docs = 1 lectura) para los conteos
de participantes en home y predicciones. No requiere Blaze ni backend.

**H2: Spam de predicciones sin freno. 🟠 (Mitigación lista: App Check en código; falta enforce en consola.)**
Las reglas permiten a cualquier anónimo crear predicciones ilimitadas en una quiniela abierta
(el anti-duplicado por nombre es client-side y tiene race condition). Un atacante puede inflar
un ranking con cientos de nombres basura. *Mitigación parcial:* App Check; el admin puede borrar
desde el panel. *Solución real:* backend (post-Mundial).

**H3: Valores de `picks` sin validar en reglas. 🟠 ✅ RESUELTO 2026-07-12 (falta re-deploy de reglas).**
`firestore.rules` valida que `picks` sea map de ≤30 llaves, pero **no qué contienen los
valores**: se pueden guardar strings de casi 1 MB por documento (infla el storage gratuito de
1 GB). *Fix:* ~5 líneas en rules validando estructura/tamaño de cada pick. Aditivo, sin riesgo.

**H4: Registro público de cuentas Auth probablemente habilitado. 🟡**
`crearUsuarioAislado` en [firebase.js:62](src/firebase.js:62) crea cuentas desde el navegador,
lo cual solo funciona si el signup email/password está **habilitado para cualquiera** (el plan
de onboarding decía "deshabilitado": contradicción a verificar en Firebase Console).
No es crítico: una cuenta sin doc en `admins/` no tiene ningún permiso. Pero cualquiera puede
crear cuentas Auth en el proyecto. *Solución limpia:* crear cuentas vía Admin SDK (post-Mundial).

**H5: Sin headers de seguridad en Vercel. 🟡 ✅ RESUELTO 2026-07-12.**
[vercel.json](vercel.json) solo tiene el rewrite de SPA. Faltan `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy` (gratis, aditivo, sin riesgo). CSP completo NO
se hará: chocaría con los estilos inline (preferencia de diseño deliberada).

**H6: Sin respaldos. 🟠 ◐ PARCIAL 2026-07-12: script manual `scripts/respaldo.mjs`; falta respaldo automático (export programado o PITR).**
No existe ningún respaldo de Firestore. Una corrupción o borrado accidental pierde todo.
El export automático requiere Blaze; mientras tanto, hacer export manual (o script JSON)
antes de cada quiniela grande.

**H7: Limpieza menor. ⚪**
Worktrees viejos en `.claude/worktrees/` ensucian el lint global. Borrarlos cuando se pueda.
Nota de comportamiento (no bug): el auto-`finalizada` en [ranking.jsx:120](src/pages/ranking.jsx:120)
solo surte efecto cuando el dueño/super admin tiene el ranking abierto (para anónimos la regla
lo rechaza en silencio: esperado).

---

## 4. Plan priorizado

> **⚠️ CONGELAMIENTO ACTIVO:** el Mundial 2026 arrancó (11 jun - 19 jul 2026). Durante el
> torneo **solo cambios seguros y aditivos**; nada de refactors ni infraestructura nueva.

### Fase AHORA (durante el Mundial: seguro y aditivo, costo $0)

| # | Tarea | Por qué | Resuelve |
|---|---|---|---|
| 1 | ◐ **App Check (reCAPTCHA v3) en modo "monitoreo"** — código listo, falta consola (checklist §0.bis) | Medir tráfico ilegítimo sin riesgo de bloquear usuarios reales | Prepara H1, H2 |
| 2 | ✅ **Validar valores de `picks` en firestore.rules** (2026-07-12; falta re-deploy de reglas) | 5 líneas, cero impacto en UI | H3 |
| 3 | ✅ **Headers de seguridad en vercel.json** (2026-07-12) | Gratis, sin riesgo | H5 |
| 4 | ✅ **Conteos con `getCountFromServer`** en home, admin y predicciones (2026-07-12) | Corta el 90%+ de lecturas; reduce mucho la superficie del DoS por cuota | H1 |
| 5 | ✅ **Respaldo manual**: `node scripts/respaldo.mjs` (2026-07-12; correrlo antes de lanzar) | Hoy no hay ningún respaldo | H6 (parcial) |

### §4.bis: Mejoras de UX hechas el 2026-06-15 (seguras y aditivas, costo $0)

Lote de pulido para uso casero (la app la usa César con familia/amigos). Nada de esto
toca seguridad ni infraestructura; todo es client-side y sin lecturas nuevas a Firestore.

- **Orden automático de partidos**: al agregarlos desde el buscador (crear y editar) se
  ordenan por fecha/hora; los manuales sin hora van al final. ([admin.jsx](src/pages/admin.jsx))
- **Secciones del inicio configurables** (solo super admin): tarjeta "🏠 Secciones del inicio"
  para mostrar/ocultar y **reordenar** cada bloque del home (código, cómo funciona, crear
  quiniela, quiniela activa, jugándose, terminada, imagen, promo). Config en **`config/home`**
  (doc nuevo: lectura pública, escritura super admin: regla agregada en [firestore.rules](firestore.rules),
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
- **Indicador "Partido en vivo"** en "Jugándose ahora" del inicio. ✅ **Desde 2026-07-12 es
  exacto**: la Cloud Function de sync guarda `enVivoEspnIds`/`enVivoActualizado` en la quiniela
  y `hayPartidoEnVivo` ([src/utils/cierre.js](src/utils/cierre.js)) lee ese dato si es fresco
  (≤25 min). Si no hay dato fresco cae a la heurística por horario original (pasó la hora de
  inicio, dentro de ~2.5h, sin marcador final).

### Fase POST-MUNDIAL (rumbo a la app autónoma)

| # | Tarea | Por qué / qué buscamos |
|---|---|---|
| 6 | ✅ **Migrar a Blaze** (hecho para la Cloud Function de sync). Revisar que las alertas de presupuesto ($5/$20) estén configuradas | Blaze incluye la misma capa gratis: a bajo volumen sigue costando ~$0; las alertas son el seguro |
| 7 | ~~**Pagos automáticos**~~ descartado por el pivote (§0); en su lugar: ✅ donativos con Stripe | — |
| 8 | ✅ **Auto-alta self-service** (2026-07-09, sin pago: la app es gratis) | Eliminó el alta por WhatsApp |
| 9 | ✅ **Cuota dura server-side** (en firestore.rules con contador + ID determinístico, no requirió Cloud Function) | El límite de 50 ya no es burlable |
| 10 | ✅ **Auto-sync ESPN** (2026-07-07) + **estado en vivo por partido en Firestore** (2026-07-12): el indicador "Partido en vivo" ya es exacto, sin llamadas a ESPN por visitante | — |
| 11 | **Cerrar lectura pública de picks pre-cierre** | El riesgo de trampa escala con botes/desconocidos. Requiere backend (posible con #6). Es el pendiente de seguridad más profundo |
| 12 | **App Check en enforce** + **refactor de admin.jsx** (3,506 líneas) + cuentas vía Admin SDK (H4) | Endurecimiento y mantenibilidad cuando ya no haya presión de torneo |
| 13 | **Correo propio para restablecer contraseña** | Firebase Console dejó las plantillas de Auth como no editables. Cuando se quiera mejorar el correo y usar `noreply@quinielapp.fun`, crear un endpoint en Vercel (`/api/password-reset`) que use Firebase Admin SDK para generar el link de reset y Resend/SendGrid para mandar un HTML propio con botón/logo, apuntando a una pantalla custom de recuperación |

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

- **Este archivo**: visión, auditoría, prioridades.
- [README.md](README.md): qué es la app, stack, estructura, cómo correr y desplegar.
- [PLAN_ONBOARDING_CLIENTES.md](PLAN_ONBOARDING_CLIENTES.md): flujo de alta/cobro manual vigente (implementado) + su Fase D.
- [GUIONES_WHATSAPP.md](GUIONES_WHATSAPP.md): mensajes para clientes.
- [firestore.rules](firestore.rules): la seguridad real (comentada línea por línea).
- Memoria de Claude (sesiones previas): planes de pagos, rollout, decisiones de estilo y
  seguridad: índice en `~/.claude/projects/-Users-cesarverduzco-quiniela-app/memory/MEMORY.md`.
