const { getPix, toClientError } = require("../_lib/profanus");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).setHeader("Allow", "GET").json({ error: "Método não permitido." });
  const orderId = String((req.query && req.query.orderId) || "");
  if (!UUID.test(orderId)) return res.status(400).json({ error: "Pedido inválido." });
  try {
    // Se ainda "pending", a própria API consulta o gateway (conforme a documentação).
    const prefix = req.query && req.query.type === "cancel" ? "cancel" : "mei";
    const t = await getPix(`${prefix}-${orderId.toLowerCase()}`);
    return res.status(200).json({ status: t.status, paid_at: t.paid_at || null, expires_at: t.expires_at });
  } catch (err) {
    const [status, message] = toClientError(err);
    return res.status(status).json({ error: message });
  }
};
