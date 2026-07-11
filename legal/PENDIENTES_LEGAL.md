# Pendientes para dejar lo legal al 100%

Checklist de integración de los documentos legales en la app. Los textos fuente
viven en esta carpeta: `AVISO_DE_PRIVACIDAD.md` y `TERMINOS_Y_CONDICIONES.md`.

## 1. Completar los únicos datos faltantes en los documentos

- [x] Responsable: César Verduzco Uribe (rellenado 2026-07-11).
- [x] Domicilio y jurisdicción: Querétaro, Querétaro (rellenado 2026-07-11).

## 2. Publicar los documentos en la app

- [ ] Crear rutas `/privacidad` y `/terminos` que rendericen los dos documentos (páginas estáticas con el mismo estilo del sitio).
- [ ] Agregar enlaces "Términos" y "Privacidad" en el `Footer` (aparece en todas las páginas públicas).

## 3. Aviso de privacidad simplificado en los puntos de captura de datos

La LFPDPPP pide que el aviso esté disponible **al momento de recabar** los datos.
Basta una línea con enlace al aviso integral:

- [ ] **Formulario de predicciones** (`predicciones.jsx`, junto al botón de enviar):
  > Al enviar aceptas los [Términos](/terminos). Tu nombre y predicciones serán visibles públicamente en el ranking. [Aviso de Privacidad](/privacidad).
- [ ] **Registro de organizadores** (`admin.jsx`, formulario de crear cuenta):
  > Al crear tu cuenta aceptas los [Términos y Condiciones](/terminos) y el [Aviso de Privacidad](/privacidad).
  (Opcional pero recomendado: checkbox obligatorio en vez de solo la leyenda.)
- [ ] **Página de donativos** (`donar.jsx`, bajo el botón de donar):
  > Donativo voluntario, no reembolsable y no deducible. Procesado por Stripe. [Términos](/terminos) · [Privacidad](/privacidad).

## 4. Atribución de reCAPTCHA (App Check)

reCAPTCHA v3 corre invisible en todas las páginas. Los términos de Google piden
avisar al usuario. Agregar en el Footer (letra pequeña):

- [ ] > Este sitio está protegido por reCAPTCHA; aplican la [Política de Privacidad](https://policies.google.com/privacy) y los [Términos](https://policies.google.com/terms) de Google.

Nota: a partir de abril de 2026 Google relajó este requisito (pasó a rol de
encargado), pero mantener la leyenda sigue siendo la práctica recomendada y no
cuesta nada.

## 5. Verificación final

- [ ] Confirmar que los datos descritos en el Aviso siguen coincidiendo con lo que la app captura realmente (hoy: nombre+picks de jugadores, email/nombre/teléfono de organizadores, email+monto de donantes vía Stripe, Google Analytics, reCAPTCHA, analítica propia agregada, localStorage).
- [ ] Si algún día se agrega: fotos de perfil, login con Google, notificaciones push, auth anónimo para self-edit, o cualquier dato nuevo → **actualizar el Aviso de Privacidad y su fecha** antes de desplegar la función.
- [ ] Revisar una vez al año la fecha de "última actualización" y la vigencia de los enlaces.

## Fundamentos usados (referencia)

- Nueva LFPDPPP (DOF 20-mar-2025, vigente desde 21-mar-2025): art. 15 — identidad y domicilio del responsable, datos tratados, finalidades primarias/secundarias, decisiones automatizadas, plazos de conservación, mecanismos ARCO, cambios al aviso. La autoridad ahora es la Secretaría Anticorrupción y Buen Gobierno (ya no el INAI).
- Ley Federal de Juegos y Sorteos: por eso los Términos §1 deslindan explícitamente a la plataforma de apuestas/sorteos y de cualquier dinero entre participantes (mismo enfoque que usa Quiniela PRO, competidor directo).
- Términos de Google reCAPTCHA / Analytics y de Stripe: divulgación de terceros en el Aviso §2.4, §5.
