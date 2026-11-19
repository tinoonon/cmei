/* Avisa a equipe que o cancelamento foi pago. Mesmo fluxo do notify.js. */
const { validate } = require("../../js/mei.js");
const { getPix, toClientError } = require("../_lib/profanus");
const { notifyPaid } = require("../_lib/discord");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* Nada é guardado: o servidor confirma com o gateway que o pedido está pago e só então envia os dados ao Discord. */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error: "Método não permitido." });
  const { orderId, declaration } = req.body || {};
  if (typeof orderId !== "string" || !UUID.test(orderId)) return res.status(400).json({ error: "Pedido inválido." });
  if (!declaration || typeof declaration !== "object" || Object.keys(validate(declaration)).length) return res.status(400).json({ error: "Dados inválidos." });
  try {
    const t = await getPix(`cancel-${orderId.toLowerCase()}`);
    if (t.status !== "paid") return res.status(409).json({ error: "Pagamento ainda não confirmado." }); // impede notificação falsa
    await notifyPaid(req, { orderId, t, d: declaration, kind: "cancel" });
    return res.status(200).json({ notified: true });
  } catch (err) {
    if (err && err.status !== undefined) { const [s, m] = toClientError(err); return res.status(s).json({ error: m }); }
    console.error("[notify-cancel]", err.message);
    return res.status(502).json({ error: "Falha ao notificar a equipe." });
  }
};
