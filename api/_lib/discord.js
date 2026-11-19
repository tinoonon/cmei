/* Avisos no Discord feitos direto pelo código do projeto (somente servidor). */
const config = require("./config");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_OK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const cut = (v, n = 300) => (String(v ?? "").slice(0, n) || "—");
const field = (name, value, inline = true) => ({ name, value: cut(value), inline });

/* IP, localização e aparelho de quem fez a requisição. */
async function clientInfo(req) {
  const h = req.headers || {};
  const ip = String(h["x-forwarded-for"] || h["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim() || "desconhecido";
  const dec = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
  let city = h["x-vercel-ip-city"] && dec(h["x-vercel-ip-city"]);
  let region = h["x-vercel-ip-country-region"];
  let country = h["x-vercel-ip-country"];
  let isp = "";
  if (!city && /^[\da-f.:]+$/i.test(ip) && ip !== "desconhecido") { // fora da Vercel: consulta pública por IP
    try {
      const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(3000) });
      const g = await r.json();
      if (g.success) { city = g.city; region = g.region_code || g.region; country = g.country_code; isp = (g.connection && g.connection.isp) || ""; }
    } catch { /* localização é opcional */ }
  }
  const where = [city, region, country].filter(Boolean).join(", ") || "não identificada";
  return { ip, where, isp, ua: cut(h["user-agent"], 180), referer: cut(h.referer || "direto", 120) };
}
const clientFields = (c) => [field("IP", c.ip), field("Localização", c.where), ...(c.isp ? [field("Provedor", c.isp)] : []), field("Aparelho", c.ua, false)];

async function sendEmbed(embed, { urlEnv = "DISCORD_WEBHOOK_URL" } = {}) {
  const url = config[urlEnv] || config.DISCORD_WEBHOOK_URL;
  if (!url || !URL_OK.test(url)) throw new Error("DISCORD_WEBHOOK_URL ausente ou inválida em api/_lib/config.js");
  const body = { allowed_mentions: { parse: [] }, embeds: [{ timestamp: new Date().toISOString(), ...embed }] }; // sem @menções vindas de dados do usuário
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
      if (res.status !== 429 && res.status < 500) throw new Error(`Discord ${res.status}`);
      if (attempt === 3) throw new Error(`Discord ${res.status}`);
      const wait = res.status === 429 ? Number((await res.json().catch(() => ({}))).retry_after) * 1000 : 0;
      await sleep(Math.min(wait > 0 ? wait : 500 * 2 ** attempt, 5000));
    } catch (e) {
      if (/^Discord 4/.test(e.message) || attempt === 3) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
}

const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
const person = (d) => [field("Nome", d.name, false), field("CPF", d.cpf), field("CNPJ", d.cnpj), field("E-mail", d.email), field("Celular", d.mobile)];

/* Nunca derruba o fluxo do cliente: erro de Discord só vai para o log. */
const safe = (p) => p.catch((e) => console.error("[discord]", e.message));

const notifyVisit = (req) => clientInfo(req).then((c) => sendEmbed({
  title: "👀 Novo acesso ao site", color: 0x3498db,
  fields: [...clientFields(c), field("Veio de", c.referer, false)],
}, { urlEnv: "DISCORD_ACCESS_WEBHOOK_URL" })).catch((e) => console.error("[discord]", e.message));

const notifyPixCreated = (req, { orderId, amount, d, kind }) => clientInfo(req).then((c) => sendEmbed({
  title: kind === "cancel" ? "🧾 PIX gerado — CANCELAMENTO de MEI (aguardando pagamento)" : "🧾 PIX gerado (aguardando pagamento)", color: 0xf39c12,
  fields: [field("Valor", brl(amount)), field("Pedido", orderId), ...person(d), ...clientFields(c)],
})).catch((e) => console.error("[discord]", e.message));

const notifyPaid = async (req, { orderId, t, d, kind }) => {
  const c = await clientInfo(req);
  await sendEmbed({
    title: kind === "cancel" ? "✅ Pagamento confirmado — CANCELAMENTO de MEI" : "✅ Pagamento confirmado — MEI 2026", color: 0x2ecc71, timestamp: t.paid_at || undefined,
    fields: [
      field("Valor", brl(t.amount)), field("Pedido", orderId),
      field("Quem pagou (banco)", `${t.payer_name || "—"} · ${t.payer_document || "—"}`, false),
      ...person(d),
      field("Nascimento", d.birth.split("-").reverse().join("/")), field("Sexo", d.sex), field("Telefone", d.phone),
      field("Endereço", `${d.street}, ${d.number}${d.complement ? ` - ${d.complement}` : ""}\n${d.neighborhood} — ${d.city}/${d.state}\nCEP ${d.cep}`, false),
      field("Aceita campanhas", d.marketing ? "Sim" : "Não"),
      ...clientFields(c),
    ],
  });
};

module.exports = { notifyVisit, notifyPixCreated, notifyPaid, safe };
