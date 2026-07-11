// Flujo de donativos con Stripe.
//
// Dos funciones HTTPS (gen2, misma región que sincronizarResultados):
//   - crearSesionDonativo: el frontend le manda un monto en pesos MXN y recibe
//     de vuelta la URL de Stripe Checkout a la que redirigir al usuario.
//   - webhookDonativos: Stripe le avisa cuando el pago se completó; ahí (y
//     solo ahí) se guarda el donativo en Firestore. El cliente nunca escribe
//     donativos directamente (ver firestore.rules).
//
// El frontend está en Vercel, no en Firebase Hosting, así que estas funciones
// se llaman por URL directa y necesitan CORS propio.

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import Stripe from 'stripe'
import cors from 'cors'

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')

const ORIGEN_PRODUCCION = 'https://quinielapp.fun'
// Cualquier puerto de localhost cuenta como permitido (dev con Vite: el
// puerto cambia según qué config de .claude/launch.json esté en uso).
const ES_LOCALHOST = /^http:\/\/localhost:\d+$/

function esOrigenPermitido(origin) {
  return origin === ORIGEN_PRODUCCION || ES_LOCALHOST.test(origin ?? '')
}

const corsHandler = cors({
  origin: (origin, callback) => callback(null, esOrigenPermitido(origin)),
})

const MONTO_MIN = 10
const MONTO_MAX = 50000

function origenPermitido(req) {
  const origin = req.get('origin')
  return esOrigenPermitido(origin) ? origin : ORIGEN_PRODUCCION
}

export const crearSesionDonativo = onRequest(
  { region: 'us-central1', secrets: [STRIPE_SECRET_KEY] },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido' })
        return
      }

      const monto = Number(req.body?.monto)
      if (!Number.isInteger(monto) || monto < MONTO_MIN || monto > MONTO_MAX) {
        res.status(400).json({ error: `El monto debe ser un entero entre ${MONTO_MIN} y ${MONTO_MAX} MXN` })
        return
      }

      const origen = origenPermitido(req)
      const stripe = new Stripe(STRIPE_SECRET_KEY.value())

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'mxn',
              product_data: { name: 'Donativo QuinielApp' },
              unit_amount: monto * 100,
            },
            quantity: 1,
          }],
          success_url: `${origen}/donar?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origen}/donar`,
        })
        res.status(200).json({ url: session.url })
      } catch (err) {
        logger.error(`Stripe checkout.sessions.create falló: ${err.message}`)
        res.status(500).json({ error: 'No se pudo iniciar el pago' })
      }
    })
  }
)

export const webhookDonativos = onRequest(
  { region: 'us-central1', secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value())
    const firma = req.get('stripe-signature')

    let event
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, firma, STRIPE_WEBHOOK_SECRET.value())
    } catch (err) {
      logger.warn(`Firma de webhook inválida: ${err.message}`)
      res.status(400).send('Firma inválida')
      return
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      try {
        const db = getFirestore()
        await db.collection('donativos').doc(session.id).set({
          monto: (session.amount_total ?? 0) / 100,
          moneda: session.currency ?? 'mxn',
          email: session.customer_details?.email ?? null,
          fecha: FieldValue.serverTimestamp(),
          estado: 'completado',
        }, { merge: true })
      } catch (err) {
        logger.error(`No se pudo guardar el donativo ${session.id}: ${err.message}`)
        res.status(500).send('Error al guardar')
        return
      }
    }

    res.status(200).send('ok')
  }
)
