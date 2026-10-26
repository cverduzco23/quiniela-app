# Corrección de MXJ14 y reconciliación de marcadores

## Datos ya corregidos en producción

El 26 de octubre de 2026 se corrigió, con autorización del organizador, el índice 3 de `quinielas/m5zo56mzhCqEdELqFg5Z`: Monterrey–Guadalajara pasó de 1–1 a 0–1. La escritura usó una precondición de versión y registró el antes/después atómicamente en `historialResultados/correccion-mxj14-20261026`. Se conserva respaldo local en `tmp/investigacion-mxj14/`.

Verificación posterior: Norma 6, Juan Manuel 5, César 4, Javier 1. La temporada vinculada se actualizó después de la corrección.

## Cambios preparados

- El marcador final guardado alimenta puntos, oráculo y tarjetas de partido. Un marcador distinto recibido por un navegador no sustituye ese final.
- `sincronizarResultados` y el botón de actualización del administrador escriben los marcadores nuevos en una transacción. Conservan resultados que otro proceso ya haya guardado y etiquetan la fuente ESPN.
- `reconciliarResultados`: cada 30 minutos consulta la ficha individual de partidos terminados en los últimos siete días, incluso cuando la quiniela está finalizada. Una discrepancia de origen ESPN requiere dos observaciones iguales separadas al menos dos minutos. Una respuesta incompleta, suspendida o de otro ID se descarta. Las confirmaciones iguales no generan escrituras periódicas innecesarias.
- Resultados con `fuente: 'manual'` quedan protegidos. Los resultados antiguos sin procedencia que difieren de ESPN se registran como pendientes de revisión, sin sobrescribirlos. Si coinciden se marcan como verificados.
- `auditarResultados`: registra altas, cambios y borrados de resultados con fecha, actor disponible, partido y valores anterior/nuevo. El ID del evento evita duplicados por reintento. Los cambios de metadatos no generan entradas.
- El administrador puede abrir el historial y ver discrepancias pendientes. Solo el dueño/superadministrador puede leer estas subcolecciones; los clientes no pueden escribirlas.

## Publicación pendiente de autorización específica

La revisión automática rechazó una petición de despliegue sin destino explícito. No se publicó código nuevo durante esta sesión.

Destinos revisados:

- Firebase: `quiniela-app-24896`, base `(default)`, región `us-central1`.
- Alcance de Functions: `sincronizarResultados`, `auditarResultados`, `reconciliarResultados`.
- Reglas de Firestore: lectura de historial/revisiones solo para organizador y superadministrador.
- Vercel producción: proyecto `quiniela-app` / `prj_T6JFunQlD4tU6Y9vywMQyTdLuZ1U`, equipo `team_dVzXMIQX4QDY8fZ034sKE70S`, dominio `quinielapp.fun`.

Publicar primero las funciones y reglas; después el frontend. Verificar una ejecución del reconciliador, el historial de MXJ14 y el ranking en producción. No incluir respaldos locales en commits ni en el despliegue web.

## Validación

407 pruebas en 28 archivos, incluida reproducción de las seis filas del oráculo y la clasificación con/sin una respuesta divergente en el navegador. Compilación Vite de producción exitosa. ESLint de archivos modificados y `git diff --check` sin errores. Vite mantiene su aviso de tamaño del bundle.
