/* Cliente da API Profanus Pay (somente servidor). A chave vem de PROFANUS_API_KEY. */
const BASE_URL = "https://profanuspay.com";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GatewayError extends Error {
  constructor(status, detail) {
    super(`Profanus ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

/* Retry exponencial com jitter. Seguro para POST /pix/create porque external_id é chave de idempotência. */
async function call(method, path, body, { retries = 3 } = {}) {
  const key = process.env.PROFANUS_API_KEY;
  if (!key) throw new GatewayError(0, "PROFANUS_API_KEY não configurada");
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE_URL + path, {
        method,
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
      if (res.ok) return json;
      lastErr = new GatewayError(res.status, json || text.slice(0, 300));
      if (!RETRYABLE.has(res.status) || attempt === retries) throw lastErr;
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      await sleep(Math.min(retryAfter > 0 ? retryAfter : 500 * 2 ** attempt, 5000) + Math.random() * 250);
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      lastErr = new GatewayError(-1, String(err && err.name)); // timeout / rede
      if (attempt === retries) throw lastErr;
      await sleep(500 * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastErr;
}

const createPix = (payload) => call("POST", "/api/pix/create", payload);
const getPix = (id) => call("GET", `/api/pix/${encodeURIComponent(id)}`, null, { retries: 1 });

/* Traduz erro do gateway em resposta segura para o navegador (sem vazar detalhes/credenciais). */
function toClientError(err) {
  const s = err && err.status;
  console.error("[profanus]", s, err && err.detail);
  if (s === 404) return [404, "Cobrança não encontrada."];
  if (s === 409) return [409, "Seu pedido ainda está sendo processado. Tente novamente em instantes."];
  if (s === 429) return [429, "Muitas tentativas. Aguarde alguns segundos e tente de novo."];
  if (s === 400) return [502, "Não foi possível gerar a cobrança. Tente novamente."];
  // 401/config/500/502/rede: erro nosso ou do gateway, nunca culpa do usuário
  return [503, "Pagamento temporariamente indisponível. Tente novamente em alguns minutos."];
}

module.exports = { createPix, getPix, toClientError, GatewayError };
