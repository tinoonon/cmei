/* Notifica o pagamento de cancelamento de MEI - mesmo sistema do notify.js */
const { validate } = require("../../js/mei.js");
const { getPix, toClientError } = require("../_lib/profanus");
const { notifyPaid } = require("../_lib/discord");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* Chamado pelo site quando detecta o pagamento de cancelamento. Nada é guardado: o servidor confirma com o gateway
   que o pedido está pago e só então envia os dados ao Discord da equipe. */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { orderId, declaration } = req.body;
    if (!UUID.test(orderId)) throw new Error("orderId inválido");
    if (!declaration) throw new Error("declaration obrigatória");
    const errors = validate(declaration);
    if (Object.keys(errors).length > 0) throw new Error("Dados inválidos");
    
    const t = await getPix(orderId); // vai dar erro se não for pago
    if (t.status !== "paid") throw new Error("Pedido não pago");
    
    await notifyPaid(req, { orderId, t, d: declaration });
    return res.json({ ok: true });
  } catch (e) {
    const msg = toClientError(e.message);
    return res.status(400).json({ error: msg });
  }
};
