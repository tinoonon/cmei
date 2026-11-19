/* Regras de negócio: preço, máscaras e validação (porte do src/lib/mei.ts) */
const SERVICE_PRICE_CENTS = 7990;
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const digits = (v) => String(v).replace(/\D/g, "");

function validCPF(value) {
  const n = digits(value);
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  const check = (len) => {
    const sum = [...n.slice(0, len)].reduce((s, v, i) => s + Number(v) * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    return (r === 10 ? 0 : r) === Number(n[len]);
  };
  return check(9) && check(10);
}

function validCNPJ(value) {
  const n = digits(value);
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const check = (len) => {
    const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const rem = [...n.slice(0, len)].reduce((s, v, i) => s + Number(v) * (w[i] || 0), 0) % 11;
    return (rem < 2 ? 0 : 11 - rem) === Number(n[len]);
  };
  return check(12) && check(13);
}

function mask(value, pattern) {
  const max = [...pattern].filter((c) => c === "#").length;
  const n = digits(value).slice(0, max);
  let i = 0, out = "";
  for (const c of pattern) {
    if (i >= n.length) break;
    out += c === "#" ? n[i++] : c;
  }
  return out;
}

const EMPTY_DECLARATION = () => ({
  name: "", cpf: "", birth: "", sex: "", email: "", phone: "", mobile: "", cnpj: "",
  cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
  marketing: false, terms: false,
});

/* Cada campo: lista de [teste, mensagem]. A última regra que falha define a mensagem (como no zod original). */
const req = (v) => String(v).trim().length >= 1;
const max160 = (v) => String(v).trim().length <= 160;
const RULES = {
  name:  [[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"],[(v)=>v.trim().length>=3,"Informe seu nome completo"]],
  cpf:   [[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"],[validCPF,"Informe um CPF válido"]],
  birth: [[req,"Campo obrigatório"],[(v)=>{
            const d = new Date(v);
            return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v && d <= new Date();
          },"Informe uma data válida"]],
  sex:   [[(v)=>["Masculino","Feminino","Outro"].includes(v),"Selecione uma opção"]],
  email: [[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"],[(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),"Informe um e-mail válido"]],
  phone: [[req,"Campo obrigatório"],[(v)=>digits(v).length===10,"Informe o telefone com DDD"]],
  mobile:[[req,"Campo obrigatório"],[(v)=>digits(v).length===11,"Informe o celular com DDD"]],
  cnpj:  [[req,"Campo obrigatório"],[validCNPJ,"Informe um CNPJ válido"]],
  cep:   [[req,"Campo obrigatório"],[(v)=>digits(v).length===8,"Informe um CEP válido"]],
  street:[[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"]],
  number:[[req,"Campo obrigatório"],[(v)=>/^\d{1,8}$/.test(v.trim()),"Informe um número válido"]],
  complement:[[max160,"Máximo de 160 caracteres"]],
  neighborhood:[[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"]],
  city:  [[req,"Campo obrigatório"],[max160,"Máximo de 160 caracteres"]],
  state: [[req,"Campo obrigatório"],[(v)=>UFS.includes(v),"Selecione o estado"]],
  terms: [[(v)=>v===true,"Aceite os termos para continuar"]],
};

function validate(data) {
  const errors = {};
  const src = data && typeof data === "object" ? data : {};
  for (const key in RULES) {
    // campos ausentes/de tipo errado (requisição malformada) viram valor vazio em vez de quebrar a validação
    const raw = src[key];
    const value = key === "terms" ? raw : typeof raw === "string" ? raw : "";
    for (const [test, msg] of RULES[key]) if (!test(value)) errors[key] = msg;
  }
  return errors;
}

/* Permite reutilizar as mesmas regras no servidor (funções /api da Vercel) */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SERVICE_PRICE_CENTS, UFS, digits, validCPF, validCNPJ, mask, validate, EMPTY_DECLARATION };
}
