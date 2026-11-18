const { SERVICE_PRICE_CENTS, validate } = require("../../js/mei.js");
const { createPix, toClientError } = require("../_lib/profanus");
const { notifyPixCreated } = require("../_lib/discord");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPIRATION_SECONDS = 15 * 60;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error: "Método não permitido." });

  const { orderId, declaration } = req.body || {};
  if (typeof orderId !== "string" || !UUID.test(orderId)) return res.status(400).json({ error: "Pedido inválido." });
  // Mesmas regras do formulário: o servidor nunca confia no navegador.
  if (!declaration || typeof declaration !== "object" || Object.keys(validate(declaration)).length) {
    return res.status(400).json({ error: "Dados da declaração inválidos. Revise o formulário." });
  }

  const payload = {
    amount: SERVICE_PRICE_CENTS / 100, // preço definido no servidor, nunca vindo do cliente
    description: "Assessoria declaração anual MEI 2026",
    external_id: `mei-${orderId.toLowerCase()}`, // idempotência: repetir não cobra duas vezes
    expiration: EXPIRATION_SECONDS,
  };
  // Dados pessoais (CPF/CNPJ etc.) não são enviados ao gateway.

  try {
    const { transaction: t } = await createPix(payload);
    if (!t || !t.pix_copia_cola || !t.qr_code_base64) throw Object.assign(new Error("resposta incompleta"), { status: 502 });
    await notifyPixCreated(req, { orderId, amount: t.amount, d: declaration });
    return res.status(200).json({
      orderId,
      status: t.status,
      amount: t.amount,
      pix_copia_cola: t.pix_copia_cola,
      qr_code_base64: t.qr_code_base64,
      expires_at: t.expires_at,
    });
  } catch (err) {
    const [status, message] = toClientError(err);
    return res.status(status).json({ error: message });
  }
};
