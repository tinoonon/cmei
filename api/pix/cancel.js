/* Gera PIX para cancelamento de MEI - mesmo sistema do create.js */
const { SERVICE_PRICE_CENTS, validate } = require("../../js/mei.js");
const { createPix, toClientError } = require("../_lib/profanus");
const { notifyPixCreated } = require("../_lib/discord");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { orderId, declaration } = req.body;
    if (!UUID.test(orderId)) throw new Error("orderId inválido");
    if (!declaration) throw new Error("declaration obrigatória");
    const errors = validate(declaration);
    if (Object.keys(errors).length > 0) throw new Error("Dados inválidos");
    
    const pix = await createPix(orderId, SERVICE_PRICE_CENTS, declaration);
    await notifyPixCreated(req, { orderId, amount: SERVICE_PRICE_CENTS, d: declaration });
    return res.json(pix);
  } catch (e) {
    const msg = toClientError(e.message);
    return res.status(400).json({ error: msg });
  }
};
