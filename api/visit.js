const { notifyVisit } = require("./_lib/discord");
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget/i;

/* O site chama uma vez por sessão do navegador ao abrir. */
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").end();
  const origin = req.headers.origin;
  if (origin && req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).end(); // só o próprio site
  if (!BOT.test(req.headers["user-agent"] || "bot")) await notifyVisit(req);
  return res.status(204).end();
};
