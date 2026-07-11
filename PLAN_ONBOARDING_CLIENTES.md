# Plan de onboarding de clientes (admins): QuinielApp

> Estado: **IMPLEMENTADO y en producción (2026-06-05).** Fases A+B+C pusheadas a `main`
> (deploy automático a Vercel). Pendiente: Fase D (ver §12).
> Objetivo: permitir que empresas/usuarios soliciten una cuenta de admin por WhatsApp,
> paguen, y operen su propia quiniela. Listo para clientes reales: **seguro y escalable**.
> Fecha de redacción: 2026-06-05.

> ℹ️ **2026-06-11:** los pendientes de seguridad/infra se consolidaron y repriorizaron en
> [ROADMAP.md](ROADMAP.md) (incluye la auditoría completa de seguridad y costos). Ese
> documento manda sobre esta sección.

## ⏳ Pendiente (Fase D: post-lanzamiento, opcional)
- **Automatizar sincronización de resultados ESPN** (Cloud Function programada, plan Blaze).
  Hoy es manual: el admin da "⚡ Sincronizar ESPN" al terminar los partidos.
- **App Check (reCAPTCHA v3)** para endurecer seguridad antes de abrir a público amplio.
- **Cloud Function para cuota dura** (hoy el conteo "1 gratis" es client-side / suave).
- Sistema de **pagos en-app** completo (ver [[project_pending_payments]]): hoy el cobro es
  100% manual (link MercadoPago + validación + marcar pagado en el panel).
- Opcional: mini-tour de bienvenida con pasos; script Admin SDK para altas masivas.

---

## 0. Resumen ejecutivo

El usuario manda WhatsApp → César valida y crea la cuenta a mano (Firebase Console) →
el cliente entra a `/admin`, cambia su contraseña forzosamente, ve un mini-tour, y crea
su **primera quiniela gratis** → al terminar, la app le ofrece comprar **por quiniela** o
**pase de temporada** → la elección abre WhatsApp con mensaje pre-armado → César valida el
pago y marca el plan desde su **panel de clientes** → el cliente puede crear más.

Lo bueno: **la arquitectura multi-admin ya existe** (`ownerUid` por quiniela, super admin,
filtrado por dueño en reglas y en `admin.jsx`). Solo hay que construir lo de arriba encima.

---

## 1. Lo que YA existe (no se reconstruye)

- **Roles** en [`firestore.rules`](firestore.rules): `isSuperAdmin()` (César) + `esDuenoDeQuiniela()` + `ownerUid` por quiniela.
- **Login** email/contraseña en [`admin.jsx`](src/pages/admin.jsx) (`signInWithEmailAndPassword`, `onAuthStateChanged`).
- **Filtrado por dueño**: `esMia(q)`: un admin normal solo ve/edita sus quinielas.
- **CTA comercial** ya presente: [`PromoCTA.jsx`](src/components/PromoCTA.jsx) y [`Footer.jsx`](src/components/Footer.jsx) (hoy apuntan a `quinielapp.fun`, NO a WhatsApp).
- **Signups públicos deshabilitados** en Firebase Auth (correcto).
- **Tracking** vía `track()` en [`firebase.js`](src/firebase.js).

---

## 2. Lo que FALTA construir (4 piezas)

1. **Colección `admins/{uid}`**: perfil + derechos (plan, cuota, activo, flag de cambio de contraseña).
2. **Cambio de contraseña forzado** en primer ingreso + **"Olvidé mi contraseña"**.
3. **Mini-tour / onboarding** + **paywall post-primera-quiniela** con deep-links a WhatsApp.
4. **Panel de Clientes** (solo super admin) para crear/activar clientes y marcar pagos.

---

## 3. Modelo de datos: `admins/{uid}`

```
admins/{uid}: {
  email:               string,        // espejo del email de Auth (para que lo veas en tu panel)
  nombre:              string,        // nombre de la persona
  empresa:             string|null,   // opcional
  telefono:            string|null,   // su WhatsApp (para tu seguimiento)
  activo:              boolean,       // 🔒 GATE DURO: si es false, NO puede crear quinielas (reglas)
  debeCambiarPassword: boolean,       // true al crear → fuerza cambio en primer ingreso
  plan:                'trial' | 'por_quiniela' | 'temporada' | 'ninguno',
  quinielasPermitidas: number,        // cuántas puede crear en total (trial = 1)
  quinielasCreadas:    number,        // contador (lo incrementa el cliente al crear)
  temporadaHasta:      Timestamp|null,// si tiene pase de temporada, hasta cuándo
  creado:              Timestamp,
  notas:               string|null,   // notas internas tuyas (ej. "pagó por SPEI 5/jun")
}
```

### Lógica de "puede crear quiniela" (cliente)
```
temporadaVigente = temporadaHasta != null && ahora < temporadaHasta
puedeCrear = activo && ( temporadaVigente || quinielasCreadas < quinielasPermitidas )
```
- **Trial**: `plan='trial'`, `quinielasPermitidas=1`, `activo=true`.
- **+1 quiniela** (pago por quiniela): César hace `quinielasPermitidas += 1`.
- **Pase de temporada**: César pone `temporadaHasta = <fecha>` y `plan='temporada'`.

---

## 4. Seguridad: qué es gate DURO y qué es suave (honestidad total)

> Esta es la parte que el usuario pidió cuidar. Hay un trade-off real que conviene entender.

### 🔒 Gate DURO (lo enforzan las reglas de Firestore, no se puede saltar desde el navegador)
- **Crear quiniela exige `admins/{uid}.activo == true`.** Si no marcas al cliente como activo,
  no puede crear NADA. Tú tienes el switch de encendido/apagado del lado servidor.
- Cada cliente solo lee/edita su propio doc `admins/{uid}` y solo sus campos no-monetarios.
- Los campos de dinero (`plan`, `quinielasPermitidas`, `activo`, `temporadaHasta`) **solo los
  cambia el super admin**. El cliente no puede auto-otorgarse derechos.

### 🟡 Gate SUAVE (se valida en el navegador; un usuario técnico podría burlarlo)
- El **conteo** "1 gratis y luego paga" (`quinielasCreadas` vs `quinielasPermitidas`) se mantiene
  del lado cliente. Un cliente con conocimientos técnicos *podría* manipularlo para crear una
  quiniela extra sin pagar.
- **Por qué es aceptable para lanzar:** (1) son clientes que pagan y ya validaste por WhatsApp;
  (2) tú ves TODAS las quinielas en tu panel, así que detectas abuso; (3) el `activo` te deja
  apagar a cualquiera al instante; (4) burlarlo requiere abrir DevTools y saber del SDK de
  Firestore: desproporcionado para ahorrarse ~$79.
- **Endurecimiento futuro (Fase D, opcional):** mover la creación de quinielas a una **Cloud
  Function** (plan Blaze de Firebase, con costo) que descuente la cuota del lado servidor. Solo
  vale la pena si el volumen/abuso lo justifica. Documentado, no bloquea el lanzamiento.

### Otras notas de seguridad
- El link a `/admin` desde el home es seguro: la pantalla está protegida por Firebase Auth.
  Firebase ya trae protección anti-fuerza-bruta en el login.
- **App Check (reCAPTCHA v3)** sigue pendiente (ya estaba en notas). Recomendado activarlo
  antes de abrir a público amplio. No bloquea este lanzamiento.

---

## 5. Reglas de Firestore: cambios

```js
// Helper nuevo
function adminDoc(uid) {
  return get(/databases/$(database)/documents/admins/$(uid)).data;
}
function adminActivo() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
    && adminDoc(request.auth.uid).activo == true;
}

match /admins/{uid} {
  // Cada quien lee su doc; el super admin lee todos.
  allow read: if isSignedIn() && (request.auth.uid == uid || isSuperAdmin());

  // Solo el super admin crea/borra clientes.
  allow create, delete: if isSuperAdmin();

  // Update: super admin todo; el dueño solo campos NO monetarios.
  allow update: if isSuperAdmin() || (
    request.auth.uid == uid &&
    request.resource.data.plan                == resource.data.plan &&
    request.resource.data.quinielasPermitidas == resource.data.quinielasPermitidas &&
    request.resource.data.activo              == resource.data.activo &&
    request.resource.data.temporadaHasta      == resource.data.temporadaHasta &&
    request.resource.data.email               == resource.data.email
    // puede modificar: debeCambiarPassword, quinielasCreadas, nombre, empresa, telefono
  );
}

// quinielas: crear exige activo (super admin exento)
match /quinielas/{quinielaId} {
  allow create: if isSignedIn() && (
    isSuperAdmin() ||
    ( request.resource.data.ownerUid == request.auth.uid && adminActivo() )
  );
  // update/delete: sin cambios (super admin o dueño)
}
```

---

## 6. Flujo del CLIENTE (paso a paso, con pantallas)

1. **Entra a `quinielapp.fun`** (home).
2. Ve un bloque **"Crea tu propia quiniela"** (mejorar el `PromoCTA` actual) → botón abre
   **WhatsApp** con mensaje pre-armado (ver §8).
3. (Fuera de la app: César valida y crea la cuenta en Firebase Console + doc `admins/{uid}`.)
4. César le manda por WhatsApp: **link `/admin`, su correo, contraseña temporal**, y el aviso
   de que en el primer ingreso deberá cambiarla.
5. En el home hay un acceso discreto **"Soy organizador → Entrar"** que lleva a `/admin`.
6. **Login** con las credenciales temporales.
7. La app detecta `debeCambiarPassword == true` → **pantalla obligatoria de cambio de contraseña**
   (no deja avanzar sin cambiarla). Al guardar: `updatePassword()` + pone el flag en `false`.
8. **Mini-tour** (3 pasos) explicando: cómo crear una quiniela, cómo compartir el código, cómo
   ver el ranking en vivo. Descartable y re-abrible desde "¿Cómo funciona?".
9. **Crea su primera quiniela** (flujo de admin que ya existe). Al guardar, el cliente
   incrementa `quinielasCreadas`.
10. **Al terminar**, si ya usó su cuota (`quinielasCreadas >= quinielasPermitidas` y sin
    temporada), ve una pantalla: *"🎉 ¡Tu primera quiniela gratis quedó lista! Para crear más,
    elige tu plan:"* con dos opciones:
    - **Por quiniela**: $XX
    - **Pase de temporada**: $XXX
11. Cada opción abre **WhatsApp** con mensaje pre-armado según el plan (ver §8).
12. (César valida el pago y marca el plan en su panel.)
13. El cliente ya puede crear más quinielas (por 1 más, o ilimitadas hasta la fecha del pase).

### "Olvidé mi contraseña"
- Link en la pantalla de login → `sendPasswordResetEmail(auth, email)`. Firebase manda el correo
  de reseteo (sin código nuestro). Mensaje en UI: *"Te enviamos un correo para restablecerla.
  Si no llega, escríbenos por WhatsApp."*

---

## 7. Flujo del SUPER ADMIN (César): panel de Clientes

Nuevo tab **"Clientes"** en `/admin`, visible solo si `soySuper`:
- **Lista de clientes**: nombre, empresa, email, plan, `quinielasCreadas/quinielasPermitidas`,
  estado (activo/inactivo), temporada hasta.
- **Acciones por cliente**:
  - ✅ **Activar / desactivar** (`activo`).
  - ➕ **+1 quiniela** (incrementa `quinielasPermitidas`): tras validar pago por quiniela.
  - 🏆 **Dar pase de temporada** (set `temporadaHasta` con date-picker + `plan='temporada'`).
  - 📝 Editar notas internas.
- **Crear cliente desde el panel**: formulario que registra el doc `admins/{uid}`.
  > ⚠️ La cuenta de **Auth** (email+contraseña) se sigue creando a mano en Firebase Console
  > (decisión confirmada). El panel solo crea el doc de perfil/derechos. Para vincularlos,
  > César pega el **UID** que Console le dio. (Alternativa futura: script con Admin SDK que
  > cree Auth + doc en un paso: Fase D.)

> **Pagos**: 100% manual por ahora (link MercadoPago genérico + validación en su dashboard +
> botón "marcar pagado" en el panel). Sin webhooks. Coincide con el plan de pagos ya documentado.

---

## 8. Mensajes de WhatsApp (borradores: ajustar tono)

Se arman como links `https://wa.me/<NUMERO>?text=<mensaje-encodeado>`.
> ✅ **Número WhatsApp Business: `525652491143`** (+52 56 5249 1143). Se guarda como
> constante `WHATSAPP_NUMERO` en `src/utils/whatsapp.js`.

**A) Desde el home: "Quiero crear mi quiniela":**
> ¡Hola! 👋 Quiero crear mi propia quiniela en QuinielApp.fun. ¿Me ayudas a empezar?

**B) Plantilla que César responde (manual, para tener lista): datos + alta:**
> ¡Hola! Con gusto te creamos tu quiniela 🎉
> Para darte de alta necesito:
> 1) Nombre de quien la organiza
> 2) Nombre de tu empresa o grupo (opcional)
> Te creo tu cuenta y te paso tus accesos. Tu primera quiniela es **gratis** 🙌

**C) César entrega accesos (manual):**
> ¡Listo! 🥳 Estos son tus accesos a QuinielApp:
> 🔗 Entrar: https://quinielapp.fun/admin
> 📧 Correo: ____
> 🔑 Contraseña temporal: ____
> 👉 Al entrar la primera vez, la app te pedirá **cambiar tu contraseña**. Después te damos un
> mini-tour y creas tu primera quiniela. ¡Cualquier duda, aquí estoy!

**D) Desde el paywall: "Por quiniela":**
> ¡Hola! Quiero adquirir **una quiniela más** en QuinielApp. ¿Me pasas el link de pago?

**E) Desde el paywall: "Pase de temporada":**
> ¡Hola! Quiero el **pase de temporada** de QuinielApp (quinielas ilimitadas). ¿Me pasas el link de pago?

---

## 9. Precios (propuesta: bajos, para captar clientes)

| Plan | Para quién | Precio (MXN) |
|------|-----------|----------------------|
| **Primera quiniela** | Todos | **Gratis** |
| **Por quiniela** (precio de lanzamiento) | Uso ocasional | **$49** |
| **Pase Mundial** (ilimitadas durante el torneo) | Gancho inmediato | **$299** |

> ✅ Confirmado. **Pase de temporada queda FUERA por ahora** (se puede añadir después).
> Solo dos productos de pago: **por quiniela ($49)** y **Pase Mundial ($299)**.

---

## 10. Onboarding / tour: recomendación

**Recomendado: enfoque ligero y a prueba de fallos**, sin librerías pesadas de tour
(react-joyride añade peso y bugs; contra el objetivo "nada debe fallar"). En su lugar:
1. **Modal de bienvenida** (3 tarjetas: "Crea tu quiniela" → "Comparte el código" → "Mira el
   ranking en vivo"), descartable, con "No volver a mostrar".
2. **Empty states claros**: cuando no tiene quinielas, un mensaje grande "Aún no tienes
   quinielas. Toca **Nueva quiniela** para empezar." con flecha al botón.
3. Link **"¿Cómo funciona?"** siempre visible que reabre el modal.
4. (Opcional futuro) un video corto de 60s enlazado.

> ✅ Confirmado: modal de bienvenida de 3 pasos + empty states.

---

## 11. Archivos a tocar / crear

| Archivo | Cambio |
|---------|--------|
| `firestore.rules` | Reglas de `admins/{uid}` + gate `activo` en crear quiniela |
| `src/pages/admin.jsx` | Cargar doc `admins`; pantalla cambio de contraseña; "olvidé contraseña"; mini-tour; gate de creación; incremento `quinielasCreadas`; paywall post-quiniela; tab Clientes (super) |
| `src/pages/home.jsx` | Bloque "Crea tu quiniela" → WhatsApp; acceso discreto "Soy organizador" → `/admin` |
| `src/components/PromoCTA.jsx` | Apuntar a WhatsApp (o nuevo componente CTA) |
| `src/components/CambioPassword.jsx` *(nuevo)* | Pantalla de cambio forzado |
| `src/components/TourBienvenida.jsx` *(nuevo)* | Modal de 3 pasos |
| `src/components/Paywall.jsx` *(nuevo)* | Pantalla de planes con deep-links WhatsApp |
| `src/utils/whatsapp.js` *(nuevo)* | Helper para armar links `wa.me` con mensajes |
| `src/utils/entitlements.js` *(nuevo)* | `puedeCrear()`, lógica de plan |

---

## 12. Plan por fases

### Fase A: Mínimo para vender YA (prioridad por el Mundial)
- [ ] Colección `admins/{uid}` + reglas (gate `activo`, perfil, self-update acotado).
- [ ] Pantalla de **cambio de contraseña forzado** + **"Olvidé mi contraseña"**.
- [ ] CTA del home → **WhatsApp** + acceso "Soy organizador".
- [ ] Helper `whatsapp.js` + mensajes.
- [ ] **Ocultar botón "💰 Caja"** para admins normales (envolver en `soySuper`):
      la colección `movimientos` es solo super admin; si un cliente le pica, truena.
- [ ] Crear 1-2 cuentas de prueba a mano (Console) y validar el flujo completo.

→ Con esto ya puedes dar de alta clientes y cobrar manualmente (Pase Mundial).

### Fase B: Monetización en-app
- [ ] Lógica de entitlements + incremento `quinielasCreadas`.
- [ ] **Paywall** post-primera-quiniela con deep-links de plan.
- [ ] **Tab Clientes** (super admin): activar, +1 quiniela, dar temporada, notas.
- [ ] Mini-tour de bienvenida.

### Fase C: Pulido
- [ ] Empty states, textos de ayuda, "¿Cómo funciona?".
- [ ] Métricas (`track`) de cada paso del embudo.

### Fase D: Endurecimiento (opcional, post-lanzamiento)
- [ ] App Check (reCAPTCHA v3).
- [ ] Cloud Function para crear quinielas server-side (cuota dura): requiere Blaze.
- [ ] Script Admin SDK para crear Auth + doc en un paso.

---

## 13. Checklist de pruebas antes de soltar a clientes reales

- [ ] Cliente nuevo: login con temporal → fuerza cambio → no puede saltarlo.
- [ ] Tras cambiar contraseña, vuelve a entrar y **no** se le pide de nuevo.
- [ ] "Olvidé contraseña" envía correo y permite recuperar.
- [ ] Cliente `activo:false` **no** puede crear quiniela (probar que la regla lo bloquea de verdad).
- [ ] Cliente solo ve SUS quinielas; no las de otros clientes.
- [ ] Cliente NO puede editar `quinielasPermitidas`/`activo`/`plan` de su propio doc (probar en consola).
- [ ] Tras 1ª quiniela, aparece el paywall; los links de WhatsApp abren con el mensaje correcto.
- [ ] Super admin: marcar +1 quiniela / dar temporada surte efecto inmediato para el cliente.
- [ ] Participantes (sin login) siguen entrando con código y haciendo predicciones (no se rompió nada).

---

## 14. Decisiones: estado

1. ✅ **WhatsApp:** `525652491143`.
2. ✅ **Precios:** $49 por quiniela (lanzamiento) + $299 Pase Mundial. Sin pase de temporada.
3. ✅ **Tour:** modal de bienvenida de 3 pasos.
4. ✅ **Caja:** ocultar para admins normales.
5. ⏳ **Alcance inmediato:** propuesto arrancar **solo Fase A** (pendiente luz verde final).
6. ⏳ **Datos del cliente:** por definir (ver §15).

---

## 15. Datos del cliente a guardar (recomendación)

**Mínimo necesario (Fase A):**
- `nombre`: quién organiza.
- `email`: identificador de login (espejo de Auth).
- `telefono`: su WhatsApp, para tu seguimiento.

**Útil pero opcional:**
- `empresa`: si aplica.
- `notas`: campo libre tuyo (ej. "pagó por SPEI 5/jun", "cliente de Monterrey").

**NO recomiendo guardar por ahora:**
- **RFC / razón social:** solo si vas a **facturar**. Si no emites facturas todavía, no lo pidas
  (más fricción en el alta, y son datos fiscales que implican responsabilidad de resguardo).
  Se añade fácil después cuando factures.
- Dirección, fecha de nacimiento, etc.: innecesarios para el servicio.

> Principio: pedir lo mínimo. Cada campo extra es fricción en el alta y un dato más que cuidas.
