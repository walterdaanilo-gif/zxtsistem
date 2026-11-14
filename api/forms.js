// POST /api/forms  (chamado pelo Apps Script da planilha de respostas do Google Forms)
// Enquanto o formulário antigo estiver no ar, cada resposta nova entra sozinha no sistema.
// corpo: { token, slug, nome, cpf, nascimento (AAAA-MM-DD), professor, opcao (texto da graduação), obs, criado_em }
// O token fica no Apps Script e na variável FORMS_WEBHOOK_TOKEN da Vercel. Ele só permite criar inscrição.
const { sb, rpc, responder, lerCorpo, env } = require('./_lib');
const crypto = require('crypto');

function tokenOk(t) {
  const esperado = env('FORMS_WEBHOOK_TOKEN', '');
  if (!esperado || !t) return false;
  const a = Buffer.from(String(t)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/r\$.*$/, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

// "AMARELO E BRANCO - R$ 120,00" -> opção "Amarelo ponta branca (3º Khan)"
function acharOpcao(opcoes, texto) {
  const t = norm(texto).replace(/ e branco$/, ' ponta branca').replace(/^apenas participar do exame$/, 'so participar do exame');
  if (!t) return null;
  const limpa = o => norm(o.nome.replace(/\(.*\)/, ''));
  return opcoes.find(o => limpa(o) === t) || opcoes.find(o => limpa(o).startsWith(t)) || null;
}
const MINUSC = ['de', 'da', 'do', 'das', 'dos', 'e'];
function titulo(s) {
  return String(s || '').trim().toLowerCase().split(/\s+/).map((w, i) => i && MINUSC.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  const c = await lerCorpo(req);
  if (!tokenOk(c.token)) return responder(res, 401, { erro: 'Token inválido' });
  const cpfDig = String(c.cpf || '').replace(/\D/g, '');
  if (cpfDig && /^(\d)\1+$/.test(cpfDig)) return responder(res, 200, { ok: true, ignorado: 'resposta de teste' });
  try {
    const evs = await sb('/rest/v1/eventos?select=id,campos&slug=eq.' + encodeURIComponent(c.slug || ''));
    const ev = evs && evs[0];
    if (!ev) return responder(res, 404, { erro: 'Evento não encontrado' });
    const opcoes = await sb('/rest/v1/evento_opcoes?select=id,nome&evento_id=eq.' + ev.id);
    const op = acharOpcao(opcoes || [], c.opcao);
    if (!op) return responder(res, 400, { erro: 'Opção não reconhecida: ' + c.opcao });
    const nasc = /^\d{4}-\d{2}-\d{2}$/.test(c.nascimento || '') && c.nascimento < new Date().toISOString().slice(0, 10) ? c.nascimento : null;
    const r = await rpc('inscrever_evento', { p: {
      evento_id: ev.id, opcao_id: op.id, nome: titulo(c.nome).slice(0, 120), cpf: String(c.cpf || '').replace(/\D/g, ''),
      nascimento: nasc, respostas: c.professor ? { professor: titulo(c.professor) } : {}, origem: 'google_forms', importacao: true,
      obs: c.obs ? String(c.obs).slice(0, 300) : null, criado_em: c.criado_em || null
    } });
    return responder(res, 200, { ok: true, ja_inscrito: !!r.ja_inscrito, opcao: op.nome });
  } catch (e) {
    console.error('forms:', e.message);
    return responder(res, 500, { erro: e.message });
  }
};
