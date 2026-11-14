// Funções compartilhadas das rotas /api (arquivos com _ não viram rota na Vercel).
// Variáveis de ambiente (configuradas na Vercel, nunca no código):
//   ASAAS_API_KEY            chave da API do Asaas (secreta)
//   ASAAS_BASE_URL           https://api-sandbox.asaas.com/v3 (teste) ou https://api.asaas.com/v3 (produção)
//   ASAAS_WEBHOOK_TOKEN      token que você define no webhook do Asaas (secreto)
//   SUPABASE_URL             https://gsfvgdhjlqwrysgruyaj.supabase.co
//   SUPABASE_PUBLISHABLE_KEY chave pública (sb_publishable_...)
//   SUPABASE_SECRET_KEY      chave secreta do servidor (sb_secret_...)

const env = (k, padrao) => process.env[k] || padrao;
const ASAAS = () => env('ASAAS_BASE_URL', 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
const SB = () => (env('SUPABASE_URL', '') || env('NEXT_PUBLIC_SUPABASE_URL', '') || 'https://gsfvgdhjlqwrysgruyaj.supabase.co').replace(/\/$/, '');

async function asaas(caminho, opcoes = {}) {
  const r = await fetch(ASAAS() + caminho, {
    method: opcoes.method || 'GET',
    headers: { 'access_token': env('ASAAS_API_KEY', ''), 'Content-Type': 'application/json', 'User-Agent': 'zxt-portal' },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  const txt = await r.text();
  let dados; try { dados = txt ? JSON.parse(txt) : {}; } catch (e) { dados = { bruto: txt }; }
  if (!r.ok) {
    const msg = (dados.errors && dados.errors.map(e => e.description).join(' ')) || ('Asaas respondeu ' + r.status);
    const erro = new Error(msg); erro.status = r.status; throw erro;
  }
  return dados;
}

// chamadas ao banco com a chave secreta (ignoram RLS: use só para o necessário)
async function sb(caminho, opcoes = {}) {
  // aceita a chave nova (sb_secret_...) ou a que a integração Vercel + Supabase cria (SUPABASE_SERVICE_ROLE_KEY)
  const chave = env('SUPABASE_SECRET_KEY', '') || env('SUPABASE_SERVICE_ROLE_KEY', '');
  const cab = { apikey: chave, 'Content-Type': 'application/json' };
  if (/^eyJ/.test(chave)) cab.Authorization = 'Bearer ' + chave;   // chave antiga em formato JWT
  const r = await fetch(SB() + caminho, {
    method: opcoes.method || 'GET',
    headers: Object.assign(cab, opcoes.headers || {}),
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  const txt = await r.text();
  let dados; try { dados = txt ? JSON.parse(txt) : null; } catch (e) { dados = txt; }
  if (!r.ok) { const erro = new Error((dados && dados.message) || ('Banco respondeu ' + r.status)); erro.status = r.status; throw erro; }
  return dados;
}
const rpc = (nome, args) => sb('/rest/v1/rpc/' + nome, { method: 'POST', body: args });

// confere o login do aluno pelo token que o navegador envia
async function usuarioDoToken(req) {
  const auth = req.headers['authorization'] || '';
  if (!/^Bearer\s+/i.test(auth)) return null;
  const r = await fetch(SB() + '/auth/v1/user', { headers: { apikey: env('SUPABASE_PUBLISHABLE_KEY', '') || env('SUPABASE_ANON_KEY', '') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY', ''), Authorization: auth } });
  if (!r.ok) return null;
  return r.json();
}

function hojeFortaleza() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
}

function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const partes = []; for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch (e) { return {}; }
}

module.exports = { asaas, sb, rpc, usuarioDoToken, hojeFortaleza, responder, lerCorpo, env };
