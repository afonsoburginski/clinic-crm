import { createHmac, timingSafeEqual } from "node:crypto"
import { Hono } from "hono"

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
function validSignature(raw: string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false
  const expected = createHmac("sha256", appSecret).update(raw).digest()
  const received = Buffer.from(header.slice("sha256=".length), "hex")
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * WhatsApp Cloud API webhook. Public on purpose (outside `/api/v1`, no session): Meta authenticates through the
 * verify token on the handshake and through the HMAC signature on every delivery.
 */
export const whatsappWebhookRouter = new Hono()
  .get("/api/webhooks/whatsapp", (c) => {
    const verifyToken = Bun.env.WHATSAPP_VERIFY_TOKEN
    const given = c.req.query("hub.verify_token") ?? ""
    const challenge = c.req.query("hub.challenge")
    const matches =
      !!verifyToken &&
      given.length === verifyToken.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(verifyToken))
    if (c.req.query("hub.mode") === "subscribe" && matches && challenge) return c.text(challenge, 200)
    return c.text("forbidden", 403)
  })
  .post("/api/webhooks/whatsapp", async (c) => {
    const appSecret = Bun.env.WHATSAPP_APP_SECRET
    if (!appSecret) return c.json({ error: { code: "webhook_unconfigured" } }, 503)
    const raw = await c.req.text()
    if (!validSignature(raw, c.req.header("x-hub-signature-256"), appSecret)) return c.text("forbidden", 403)
    // Reply handling (button taps → appointment transitions) plugs in here; Meta only needs a fast 200.
    return c.json({ received: true })
  })
