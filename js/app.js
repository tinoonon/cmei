/* App MEI Digital: roteamento por hash + telas. O rascunho fica só em memória (não persiste dados pessoais). */
const state = { data: EMPTY_DECLARATION(), touched: {}, cepStatus: "", cepBusy: false,
  order: null /* { id, pix, status, busy, error } */ };
let payTimer = null;
let cepController = null;

const $app = document.getElementById("app");
const $dialog = document.getElementById("dialog");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const isValid = () => Object.keys(validate(state.data)).length === 0;
const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- Diálogos ---------- */
const MODALS = {
  terms: ["Termos de Uso", "MEI Digital — serviço privado de assessoria.",
    "O serviço de assessoria custa R$ 97,90 e não é uma taxa governamental. Pagamento não significa declaração protocolada. As condições finais e a identificação jurídica da empresa serão publicadas antes da contratação."],
  privacy: ["Política de Privacidade", "MEI Digital — serviço privado de assessoria.",
    "Neste formulário, os dados ficam apenas na memória desta sessão e são descartados ao recarregar a página. O CEP é consultado no ViaCEP. Ao gerar o PIX, seus dados são validados em nosso servidor; o gateway de pagamento recebe apenas o valor e um identificador do pedido. Registramos o endereço IP e a localização aproximada de quem acessa o site, para segurança e prevenção a fraudes. Após a confirmação do pagamento, os dados são enviados à nossa equipe por um canal interno para execução do serviço e não ficam armazenados no site. O consentimento para campanhas é opcional. Antes da contratação, serão informados o responsável pelo tratamento, os canais para acesso e exclusão e a política final de retenção, limitada a seis meses após a entrega."],
  cnpj: ["Como encontrar seu CNPJ", "Consulte seu Certificado da Condição de Microempreendedor Individual (CCMEI) no Portal do Empreendedor.",
    "O CNPJ aparece no seu certificado CCMEI. Não realizamos busca automática de CNPJ por CPF nesta etapa."],
  support: ["Como podemos ajudar?", "Para dúvidas sobre o serviço, fale com a equipe responsável.",
    "O canal de suporte será disponibilizado antes da abertura dos pagamentos."],
};
function openModal(key) {
  const [title, desc, body] = MODALS[key];
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-desc").textContent = desc;
  document.getElementById("dialog-body").textContent = body;
  $dialog.showModal();
}
document.getElementById("dialog-close").innerHTML = icon("x", 16);
document.getElementById("dialog-close").onclick = () => $dialog.close();
document.getElementById("dialog-ok").onclick = () => $dialog.close();
$dialog.addEventListener("click", (e) => { if (e.target === $dialog) $dialog.close(); });

/* ---------- Casca comum (header, stepper, footer) ---------- */
const STEPS = [["Seus dados", "user"], ["Revisão", "clipboard-check"], ["Pagamento", "qr-code"]];
const INTRO = ["Preencha seus dados para continuar.", "Confira suas informações antes de continuar.", "Você está a um passo de concluir sua solicitação."];
const CAPTION = ["Vamos começar", "Quase lá", "Última etapa"];

function shell(step, content) {
  const stepper = STEPS.map(([label, ic], i) => {
    const cls = step === i + 1 ? "current" : step > i + 1 ? "complete" : "";
    return `<div class="step ${cls}" ${step === i + 1 ? 'aria-current="step"' : ""}>
      <span class="step-circle">${step > i + 1 ? icon("check", 17) : icon(ic, 17)}</span><span>${label}</span>${i < 2 ? '<span class="step-line"></span>' : ""}</div>`;
  }).join("");
  return `
  <header class="site-header"><div class="header-inner">
    <a href="#/" class="brand"><img src="https://cdn.discordapp.com/attachments/1567379229388185620/1572441924638351520/images-removebg-preview.png?ex=6afe6229&is=6afd10a9&hm=4a531396337b577f2c377d422c0b5034c70b14ab5a63af7bbfe3bec469c9a4af" alt="RegularizeMei" class="brand-logo">
      <span>Declare<span class="text-primary">Mei</span><small>Seu negócio em dia.</small></span></a>
    <div class="header-actions">
      <span class="secure-header">${icon("shield-check", 15)} Ambiente seguro</span>
      <button type="button" class="btn btn-ghost" data-modal="support">${icon("headphones")} Precisa de ajuda?</button>
    </div></div></header>
  <main class="flow-main">
    <div class="page-intro"><span class="year-label"><span></span> DECLARAÇÃO ANUAL · 2026</span>
      <h1>Declare seu MEI agora</h1><p>${INTRO[step - 1]}</p></div>
    <nav class="stepper" aria-label="Progresso da declaração">${stepper}</nav>
    <div class="step-caption"><span>Etapa ${step} de 3</span><span>${CAPTION[step - 1]}</span></div>
    ${content}
    <div class="trust-footer">${icon("lock", 14)}<span>Seus dados merecem cuidado e privacidade.</span></div>
    <p class="independent-note">Serviço privado de assessoria, sem vínculo com o Governo Federal.<br>A declaração também pode ser feita gratuitamente no portal oficial.</p>
  </main>
  <footer class="site-footer"><span>© 2026 MEI Digital</span><span>Feito para quem empreende.</span><span>${icon("shield-check", 14)} Privacidade em primeiro lugar</span></footer>`;
}

const emptyDraft = () => `<div class="form-panel empty-state">${icon("clipboard-check", 38)}
  <h2>Vamos começar pelos seus dados</h2><p>Preencha o formulário para revisar sua solicitação.</p>
  <a class="btn btn-primary" href="#/">Preencher meus dados ${icon("arrow-right")}</a></div>`;

/* ---------- Telas ---------- */
function formField(key, label, placeholder, { pattern, full = false, type = "text", disabled = false } = {}) {
  return `<div class="field ${full ? "full" : ""}">
    <label for="${key}">${label}${key !== "complement" ? '<span class="required">*</span>' : ""}</label>
    <input id="${key}" name="${key}" type="${type}" value="${esc(state.data[key])}" placeholder="${esc(placeholder)}"
      maxlength="${pattern ? pattern.length : 160}" ${pattern ? 'inputmode="numeric"' : ""} ${disabled ? "disabled" : ""}
      ${pattern ? `data-mask="${pattern}"` : ""} autocomplete="off">
    <p class="field-error" id="${key}-error" hidden></p></div>`;
}

function viewIndex() {
  const cepOk = digits(state.data.cep).length === 8;
  const addr = { disabled: !cepOk };
  const opts = (list, sel) => list.map((s) => `<option ${s === sel ? "selected" : ""}>${s}</option>`).join("");
  return shell(1, `<form class="form-panel" id="form" novalidate>
    <div class="panel-heading"><span class="heading-icon">${icon("user", 20)}</span><div><h2>Vamos conhecer você</h2><p>Campos com <span class="required">*</span> são obrigatórios.</p></div></div>
    <div class="form-body">
      <section class="form-section"><h3 class="section-title">${icon("user")} Dados pessoais</h3><div class="form-grid">
        ${formField("name", "Nome completo", "Ex: Maria da Silva", { full: true })}
        ${formField("cpf", "CPF", "000.000.000-00", { pattern: "###.###.###-##" })}
        ${formField("birth", "Data de nascimento", "", { type: "date" })}
        <div class="field"><label for="sex">Sexo<span class="required">*</span></label>
          <select id="sex"><option value="" disabled ${state.data.sex ? "" : "selected"}>Selecione uma opção</option>${opts(["Masculino","Feminino","Outro"], state.data.sex)}</select>
          <p class="field-error" id="sex-error" hidden></p></div>
        ${formField("email", "E-mail", "seu@email.com", { type: "email" })}
        ${formField("phone", "Telefone", "(00) 0000-0000", { pattern: "(##) ####-####" })}
        ${formField("mobile", "Celular", "(00) 00000-0000", { pattern: "(##) #####-####" })}
      </div></section>
      <section class="form-section"><h3 class="section-title">${icon("building")} Dados do MEI</h3>
        <div class="form-grid">${formField("cnpj", "CNPJ a ser declarado", "00.000.000/0000-00", { pattern: "##.###.###/####-##", full: true })}</div>
        <button class="btn btn-link cnpj-help" type="button" data-modal="cnpj">${icon("info", 12)} Não sei o número do meu CNPJ</button></section>
      <section class="form-section"><h3 class="section-title">${icon("map-pin")} Endereço residencial</h3><div class="form-grid">
        ${formField("cep", "CEP", "00000-000", { pattern: "#####-###" })}
        <div class="field-helper self-center" id="cep-status" aria-live="polite"></div>
        ${formField("street", "Endereço", "Rua, avenida…", { full: true, ...addr })}
        ${formField("number", "Número", "Ex: 123", addr)}
        ${formField("complement", "Complemento", "Apto, bloco (opcional)", addr)}
        ${formField("neighborhood", "Bairro", "Seu bairro", { full: true, ...addr })}
        ${formField("city", "Cidade", "Sua cidade", addr)}
        <div class="field"><label for="state">Estado<span class="required">*</span></label>
          <select id="state" ${cepOk ? "" : "disabled"}><option value="">Selecione o estado</option>${opts(UFS, state.data.state)}</select>
          <p class="field-error" id="state-error" hidden></p></div>
      </div></section>
      <div class="consent">
        <label class="check-row"><input type="checkbox" id="marketing" ${state.data.marketing ? "checked" : ""}><span>Desejo receber notícias e campanhas da MEI Digital.</span></label>
        <div class="check-row"><input id="terms" type="checkbox" ${state.data.terms ? "checked" : ""}>
          <label for="terms">Li e aceito os <button type="button" class="btn btn-link inline-link" data-modal="terms">Termos de Uso</button> e a <button type="button" class="btn btn-link inline-link" data-modal="privacy">Política de Privacidade</button> deste site.<span class="required">*</span></label></div>
      </div>
    </div>
    <div class="form-actions"><span>${icon("lock", 13)} Informações protegidas</span>
      <button class="btn btn-primary btn-flow" type="submit" id="submit">Próximo ${icon("arrow-right")}</button></div>
  </form>`);
}

/* Atualiza erros/estado dos botões sem recriar o formulário (preserva foco do teclado) */
function refreshForm() {
  const errors = validate(state.data);
  for (const key in RULES) {
    const el = document.getElementById(key + "-error");
    const input = document.getElementById(key);
    if (!el) continue;
    const show = state.touched[key] && errors[key];
    el.hidden = !show;
    el.textContent = show ? errors[key] : "";
    if (input) { input.setAttribute("aria-invalid", show ? "true" : "false"); }
  }
  const cepOk = digits(state.data.cep).length === 8;
  ["street", "number", "complement", "neighborhood", "city", "state"].forEach((k) => {
    const el = document.getElementById(k);
    if (el) el.disabled = !cepOk;
  });
  const status = document.getElementById("cep-status");
  if (status) {
    status.innerHTML = state.cepBusy ? `<span class="flex-center">${icon("loader", 14, "spin")} Buscando endereço…</span>` : esc(state.cepStatus || "Seu endereço será preenchido a partir do CEP.");
  }
  const submit = document.getElementById("submit");
  if (submit) submit.disabled = Object.keys(errors).length > 0 || state.cepBusy;
}

function lookupCep() {
  const cep = digits(state.data.cep);
  if (cepController) cepController.abort();
  if (cep.length !== 8) { state.cepStatus = ""; state.cepBusy = false; return; }
  const controller = (cepController = new AbortController());
  state.cepBusy = true; state.cepStatus = "";
  refreshForm();
  fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((a) => {
      if (a.erro) { state.cepStatus = "CEP não encontrado. Confira o número ou preencha o endereço."; return; }
      Object.assign(state.data, { street: a.logradouro || "", neighborhood: a.bairro || "", city: a.localidade || "", state: a.uf || "" });
      ["street", "neighborhood", "city", "state"].forEach((k) => { const el = document.getElementById(k); if (el) el.value = state.data[k]; });
      state.cepStatus = "Endereço localizado. Confira os dados abaixo.";
    })
    .catch((e) => { if (e.name !== "AbortError") state.cepStatus = "Não foi possível consultar o CEP. Preencha o endereço manualmente."; })
    .finally(() => { if (!controller.signal.aborted) { state.cepBusy = false; refreshForm(); } });
}

function bindForm() {
  const form = document.getElementById("form");
  refreshForm();
  form.addEventListener("input", (e) => {
    const el = e.target; const key = el.id || el.name;
    if (!(key in state.data)) return;
    if (el.type === "checkbox") state.data[key] = el.checked;
    else {
      const pattern = el.dataset.mask;
      state.data[key] = pattern ? mask(el.value, pattern) : el.value;
      if (pattern && el.value !== state.data[key]) el.value = state.data[key];
    }
    if (state.order && state.order.status !== "paid") state.order = null; // dados mudaram: novo pedido
    if (key === "cep") lookupCep();
    refreshForm();
  });
  form.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") { state.data[e.target.id] = e.target.value; refreshForm(); } });
  form.addEventListener("focusout", (e) => { const key = e.target.id; if (key in state.data) { state.touched[key] = true; refreshForm(); } });
  form.addEventListener("submit", (e) => { e.preventDefault(); if (isValid()) location.hash = "#/revisao"; });
}

function viewReview() {
  if (!isValid()) return shell(2, emptyDraft());
  const d = state.data;
  const sections = [
    ["Dados pessoais", [["Nome completo", d.name], ["CPF", d.cpf], ["Data de nascimento", d.birth.split("-").reverse().join("/")], ["Sexo", d.sex], ["E-mail", d.email], ["Telefone", d.phone], ["Celular", d.mobile]]],
    ["Dados do MEI", [["CNPJ a declarar", d.cnpj]]],
    ["Endereço residencial", [["Endereço", `${d.street}, ${d.number}${d.complement ? `, ${d.complement}` : ""}`], ["Bairro", d.neighborhood], ["Cidade / Estado", `${d.city} / ${d.state}`], ["CEP", d.cep]]],
    ["Consentimento", [["Notícias e campanhas", d.marketing ? "Sim, desejo receber" : "Não desejo receber"], ["Termos e privacidade", "Aceitos"]]],
  ].map(([title, items]) => `<section class="review-section"><div class="review-heading"><h3>${title}</h3>
      <a class="btn btn-link btn-sm" href="#/">${icon("pencil")} Editar</a></div>
      <dl class="review-grid">${items.map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`).join("");
  return shell(2, `<div class="form-panel"><div class="panel-heading"><span class="heading-icon">${icon("clipboard-check", 20)}</span><div><h2>Revise seus dados</h2><p>Certifique-se de que tudo está correto.</p></div></div>
    ${sections}
    <div class="form-actions"><a class="btn btn-outline btn-flow" href="#/">${icon("arrow-left")} Voltar</a>
      <a class="btn btn-primary btn-flow" href="#/checkout">Prosseguir para pagamento ${icon("arrow-right")}</a></div></div>`);
}

function viewCheckout() {
  if (!isValid()) return shell(3, emptyDraft());
  const d = state.data;
  return shell(3, `<div class="form-panel"><div class="panel-heading"><span class="heading-icon">${icon("clipboard-check", 20)}</span><div><h2>Resumo do pedido</h2><p>Declaração Anual MEI 2026</p></div></div>
    <div class="order-body"><h3>Assessoria para sua declaração anual</h3>
      <p>Preparação, revisão e protocolamento da declaração pela equipe responsável. Serviço privado, não se trata de uma taxa do governo.</p>
      <dl class="review-grid mt-5"><div><dt>CPF do solicitante</dt><dd>${esc(d.cpf)}</dd></div><div><dt>CNPJ a declarar</dt><dd>${esc(d.cnpj)}</dd></div></dl>
      <div class="price-row"><span>Valor total<br><small class="text-muted">Pagamento único</small></span><strong>${brl(SERVICE_PRICE_CENTS)}</strong></div>
      <h3>Escolha a forma de pagamento</h3>
      <label class="payment-method"><input type="radio" name="payment" checked>${icon("qr-code", 24)}<span><strong>PIX</strong><small>Transferência imediata via PIX</small></span></label>
      <label class="payment-method unavailable"><input type="radio" name="payment" disabled>${icon("credit-card", 24)}<span>Cartão de crédito<small>Parcelado em até 3x</small></span><span class="soon">EM BREVE</span></label>
      <div class="notice">${icon("info", 17)}<span>O pagamento é feito por PIX. O QR Code será gerado na próxima etapa e vale por 15 minutos.</span></div></div>
    <div class="form-actions"><a class="btn btn-outline btn-flow" href="#/revisao">${icon("arrow-left")} Voltar</a>
      <a class="btn btn-primary btn-flow" href="#/pagamento">Gerar PIX ${icon("arrow-right")}</a></div></div>`);
}

/* ---------- Pagamento PIX (integração real via /api) ---------- */
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

async function api(path, options) {
  const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json" } });
  let json = null; try { json = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error((json && json.error) || "Não foi possível concluir a operação. Tente novamente.");
  return json;
}

async function generatePix() {
  if (!state.order) state.order = { id: uuid(), pix: null, status: "new", busy: false, error: "" };
  const o = state.order;
  if (o.busy) return;
  o.busy = true; o.error = ""; paintPayment();
  try {
    // Mesmo orderId = mesma cobrança (idempotência), então reenviar nunca cobra duas vezes.
    const pix = await api("/api/pix/create", { method: "POST", body: JSON.stringify({ orderId: o.id, declaration: state.data }) });
    o.pix = pix; o.status = pix.status || "pending";
    startPolling();
  } catch (e) { o.error = e.message; }
  o.busy = false; paintPayment();
}

/* Avisa a equipe no Discord (via servidor). Tenta algumas vezes; o cliente já pagou, então nunca bloqueia a confirmação. */
async function notifyTeam(o) {
  for (let i = 0; i < 3; i++) {
    try { await api("/api/pix/notify", { method: "POST", body: JSON.stringify({ orderId: o.id, declaration: state.data }) }); return; }
    catch { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); }
  }
}

function startPolling() {
  clearInterval(payTimer);
  let tick = 0;
  payTimer = setInterval(async () => {
    const o = state.order;
    if (!o || !o.pix || o.status !== "pending") return clearInterval(payTimer);
    const left = Math.max(0, Math.floor((new Date(o.pix.expires_at) - Date.now()) / 1000));
    const el = document.getElementById("countdown");
    if (el) el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    if (left === 0) { o.status = "expired"; clearInterval(payTimer); return paintPayment(); }
    if (++tick % 4) return; // consulta o status a cada ~4s
    try {
      const s = await api(`/api/pix/status?orderId=${o.id}`);
      if (s.status !== "pending" && state.order === o) {
        o.status = s.status; clearInterval(payTimer);
        if (s.status === "paid") { await notifyTeam(o); location.hash = "#/confirmacao"; } else paintPayment();
      }
    } catch { /* falha de rede momentânea: tenta de novo no próximo ciclo */ }
  }, 1000);
}

function paintPayment() {
  const box = document.getElementById("pay-panel");
  if (!box) return;
  const o = state.order;
  const err = o && o.error ? `<p class="field-error pay-error" role="alert">${esc(o.error)}</p>` : "";
  const back = `<a class="btn btn-link" href="#/checkout">${icon("arrow-left")} Voltar ao resumo</a>`;
  if (!o || o.status === "new" || (!o.pix && o.status !== "expired")) {
    box.innerHTML = `${icon("qr-code", 44)}<h2>Pagar com PIX</h2>
      <p>Valor: <strong>${brl(SERVICE_PRICE_CENTS)}</strong><br>O QR Code vale por 15 minutos.</p>
      <button class="btn btn-primary btn-flow" id="gen" ${o && o.busy ? "disabled" : ""}>${o && o.busy ? icon("loader", 16, "spin") + " Gerando…" : "Gerar QR Code PIX"}</button>
      ${err}<p class="field-helper mt-5">Nenhuma cobrança é criada antes de você clicar no botão.</p>${back}`;
    const g = document.getElementById("gen"); if (g) g.onclick = generatePix;
    return;
  }
  if (o.status === "expired" || o.status === "cancelled") {
    box.innerHTML = `${icon("clock", 44)}<h2>Este PIX expirou</h2><p>Nenhum pagamento foi identificado. Gere um novo QR Code para continuar.</p>
      <button class="btn btn-primary btn-flow" id="regen">Gerar novo PIX</button>${back}`;
    document.getElementById("regen").onclick = () => { state.order = null; generatePix(); };
    return;
  }
  const img = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(o.pix.qr_code_base64) ? o.pix.qr_code_base64 : "";
  box.innerHTML = `<h2>Escaneie o QR Code</h2><p>Abra o app do seu banco, escolha pagar com PIX e leia o código.</p>
    ${img ? `<img class="qr" src="${img}" alt="QR Code PIX" width="220" height="220">` : ""}
    <p class="pay-timer">Expira em <strong id="countdown">--:--</strong></p>
    <label class="copy-label" for="pix-code">Ou use o PIX copia e cola</label>
    <textarea id="pix-code" class="pix-code" readonly rows="3">${esc(o.pix.pix_copia_cola)}</textarea>
    <button class="btn btn-outline btn-flow" id="copy">Copiar código</button>
    <p class="field-helper mt-5" aria-live="polite" id="pay-wait">${icon("loader", 14, "spin")} Aguardando confirmação do pagamento…</p>${back}`;
  const left = Math.max(0, Math.floor((new Date(o.pix.expires_at) - Date.now()) / 1000));
  document.getElementById("countdown").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  document.getElementById("copy").onclick = async (e) => {
    const ta = document.getElementById("pix-code");
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand("copy"); }
    e.currentTarget.textContent = "Código copiado!";
  };
}

function viewPayment() {
  if (!isValid()) return shell(3, emptyDraft());
  return shell(3, `<section class="form-panel empty-state" id="pay-panel"></section>`);
}

function viewConfirmation() {
  const paid = state.order && state.order.status === "paid";
  if (paid) return shell(3, `<section class="form-panel empty-state">${icon("check", 44, "ok")}
    <h2>Pagamento confirmado</h2><p>Recebemos o seu pagamento. Sua solicitação entrou na fila da equipe responsável.<br>Pagamento não significa declaração protocolada: você será avisado quando ela for concluída.</p>
    <a class="btn btn-primary btn-flow" href="#/">Voltar para o início</a></section>`);
  return shell(3, `<section class="form-panel empty-state">${icon("clock", 44)}
    <h2>Nenhum pagamento confirmado</h2><p>A confirmação aparece somente após a verificação do pagamento. Nenhuma declaração foi registrada ou protocolada.</p>
    <a class="btn btn-primary btn-flow" href="#/">Voltar para o início</a></section>`);
}

/* ---------- Roteador ---------- */
const ROUTES = {
  "/": [viewIndex, "Declare seu MEI agora", bindForm],
  "/revisao": [viewReview, "Revise seus dados"],
  "/checkout": [viewCheckout, "Checkout PIX"],
  "/pagamento": [viewPayment, "Pagamento PIX", () => { paintPayment(); if (state.order && state.order.status === "pending") startPolling(); }],
  "/confirmacao": [viewConfirmation, "Status da solicitação"],
};
function render() {
  clearInterval(payTimer);
  const path = location.hash.replace(/^#/, "") || "/";
  const [view, title, after] = ROUTES[path] || ROUTES["/"];
  $app.innerHTML = view();
  document.title = `${title} | MEI Digital`;
  if (after) after();
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-modal]");
  if (b) openModal(b.dataset.modal);
});
/* Avisa a equipe de um novo acesso (1x por sessão do navegador). */
try {
  if (!sessionStorage.getItem("seen")) { sessionStorage.setItem("seen", "1"); fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => {}); }
} catch { /* sessionStorage indisponível: ignora */ }
window.addEventListener("hashchange", render);
render();
