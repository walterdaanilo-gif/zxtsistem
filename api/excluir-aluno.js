// POST /api/excluir-aluno  { aluno_id, motivo }   (só o admin)
// 1) cancela no Asaas a assinatura e as cobranças em aberto do aluno (para não continuar cobrando)
// 2) exclui conta e dados pessoais; mensalidades pagas e inscrições ficam no financeiro com o nome
const { asaas, sb, rpc, usuarioDoToken, responder, lerCorpo } = require('./_lib');

async function apagarNoAsaas(caminho) {
  try { await asaas(caminho, { method: 'DELETE' }); }
  catch (e) { if (e.status !== 404) throw e; }   // já não existia: segue
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  try {
    const user = await usuarioDoToken(req);
    if (!user || !user.id) return responder(res, 401, { erro: 'Entre na sua conta.' });
    const papeis = (await sb('/rest/v1/user_roles?select=papel&user_id=eq.' + user.id)).map(x => x.papel);
    if (!papeis.includes('admin')) return responder(res, 403, { erro: 'Só a administração exclui cadastros.' });
    const corpo = await lerCorpo(req);
    const id = String(corpo.aluno_id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return responder(res, 400, { erro: 'Aluno inválido.' });
    if (id === user.id) return responder(res, 400, { erro: 'Você não pode excluir a própria conta por aqui.' });

    const ps = await sb('/rest/v1/profiles?select=id,nome,asaas_subscription_id,tipo_cadastro&id=eq.' + id);
    const p = ps && ps[0];
    if (!p) return responder(res, 404, { erro: 'Aluno não encontrado.' });
    const alvoPapeis = (await sb('/rest/v1/user_roles?select=papel&user_id=eq.' + id)).map(x => x.papel);
    if (p.tipo_cadastro === 'professor' || alvoPapeis.includes('professor') || alvoPapeis.includes('admin'))
      return responder(res, 400, { erro: 'Professor não é excluído por aqui. Use a aba Professores.' });

    // Asaas primeiro: se falhar, nada é apagado
    if (p.asaas_subscription_id) await apagarNoAsaas('/subscriptions/' + p.asaas_subscription_id);
    const abertas = await sb('/rest/v1/cobrancas?select=provider_id&aluno_id=eq.' + id + '&status=in.(em_aberto,atrasado)&provider_id=not.is.null');
    for (const c of abertas || []) await apagarNoAsaas('/payments/' + c.provider_id);

    const r = await rpc('excluir_aluno', { p_aluno: id, p_por: user.id, p_motivo: corpo.motivo ? String(corpo.motivo).slice(0, 300) : null });
    return responder(res, 200, r);
  } catch (e) {
    console.error('excluir-aluno:', e.message);
    return responder(res, e.status && e.status < 500 ? 400 : 500, { erro: e.message || 'Não deu para excluir agora.' });
  }
};
