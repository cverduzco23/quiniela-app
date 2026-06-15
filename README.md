# QuinielApp ⚽

Quinielas privadas de futbol para equipos, empresas y grupos de amigos.
Los participantes entran **sin cuenta** con un código de acceso, registran sus
predicciones antes del cierre y siguen el ranking en vivo (marcadores de ESPN).

- **Producción:** https://quinielapp.fun (deploy automático: push a `main` → Vercel)
- **Estado, pendientes y prioridades:** ver [ROADMAP.md](ROADMAP.md) ← empezar aquí para retomar
- **Flujo de clientes y cobro (manual, vigente):** [PLAN_ONBOARDING_CLIENTES.md](PLAN_ONBOARDING_CLIENTES.md)

## Stack

React 19 + Vite (JSX, estilos inline — sin frameworks CSS, decisión deliberada),
React Router, Firebase (Firestore + Auth + Analytics, plan Spark gratuito), Vercel.
Sin backend propio: la app habla directo con Firestore y con la API pública de ESPN
desde el navegador.

## Estructura

```
src/
  pages/
    home.jsx          # Inicio público: buscador por código, lista de quinielas
    predicciones.jsx  # Form de predicción del participante (sin login)
    ranking.jsx       # Ranking en vivo con polling ESPN (90s)
    admin.jsx         # Panel: login, crear/editar quinielas, clientes (super), caja
  components/         # RankingTable, Paywall, TourBienvenida, Dialogs, etc.
  utils/              # scoring, cierre, premios, espn, entitlements, etc. (con tests)
  firebase.js         # Config + helpers (track, crearUsuarioAislado)
firestore.rules       # Seguridad real (server-side), comentada
scripts/              # Utilidades locales (generar-predicciones.mjs)
```

## Modelo de datos (Firestore)

| Colección | Qué guarda | Acceso |
|---|---|---|
| `quinielas/{id}` | Nombre, partidos, cierre, resultados, premio/cuota, `ownerUid`, `codigoAcceso` | Lectura pública; escribe dueño/super admin |
| `predicciones/{id}` | `quinielaId`, nombre del jugador, picks, fecha | Lectura pública; crea cualquiera **antes del cierre** (validado en rules); inmutables |
| `admins/{uid}` | Perfil + derechos del cliente (`activo`, plan, cuota) | Cada quien su doc; derechos solo los cambia el super admin |
| `movimientos/{id}` | Caja interna | Solo super admin |

**Roles:** super admin (UID fijo en `firestore.rules` y `admin.jsx`, mantener sincronizados),
admins-cliente (doc en `admins/`, gate duro `activo`), participantes (anónimos, sin cuenta).

**Puntaje:** 1 pt resultado correcto, +2 pts marcador exacto. Desempates y partidos
cancelados: ver `src/utils/scoring.js` y sus tests.

## Comandos

```bash
npm run dev        # desarrollo local
npm test           # vitest (727 tests)
npm run lint       # eslint (ignorar errores de .claude/worktrees/, no son del código)
npm run build      # build de producción
```

No hay variables de entorno: la config de Firebase es pública por diseño (la seguridad
vive en `firestore.rules`, no en ocultar las llaves).

## Reglas de oro del proyecto

1. **Costo ~$0** mientras el uso sea familiar/amigos — todo debe caber en capas gratuitas.
2. **Dinero como premio solo en grupos privados de conocidos** (tema regulatorio SEGOB);
   para público general el modelo futuro es puntos + anuncios, nunca cash.
3. Estilos inline, español, sin dependencias pesadas.
4. Durante torneos activos (ej. Mundial 2026): **solo cambios seguros y aditivos**.
