// POST /api/baixa  { cobrancas: [ids], forma: "dinheiro"|"pix_direto"|"cartao"|"outro", obs }   (admin ou professor)
// Pagamento recebido em mãos: se a cobrança também existe no Asaas, marca lá como "recebida em dinheiro"
// (assim o link do Asaas para de cobrar e o aluno não paga duas vezes) e depois dá baixa no sistema.
const { asaas, sb, rpc, usuarioDoToken, hojeFortaleza, responder, lerCorpo } = require('./_lib');
const FORMAS = ['dinheiro', 'pix_direto', 'cartao', 'outro'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  try {
    const user = await usuarioDoToken(req);
    if (!user || !user.id) return responder(res, 401, { erro: 'Entre na sua conta.' });
    const papeis = (await sb('/rest/v1/user_roles?select=papel&user_id=eq.' + user.id)).map(x => x.papel);
    if (!papeis.includes('admin') && !papeis.includes('professor')) return responder(res, 403, { erro: 'Só a equipe dá baixa.' });
    if (!papeis.includes('admin')) {
      const eu = await sb('/rest/v1/profiles?select=status&id=eq.' + user.id);
      if (!eu[0] || eu[0].status !== 'ativo') return responder(res, 403, { erro: 'Seu acesso de professor ainda não está ativo.' });
    }
    const corpo = await lerCorpo(req);
    const forma = String(corpo.forma || '');
    if (!FORMAS.includes(forma)) return responder(res, 400, { erro: 'Escolha a forma de pagamento.' });
    const ids = (Array.isArray(corpo.cobrancas) ? corpo.cobrancas : []).filter(x => /^[0-9a-f-]{36}$/.test(x)).slice(0, 24);
    if (!ids.length) return responder(res, 400, { erro: 'Escolha a mensalidade.' });
    const cs = await sb('/rest/v1/cobrancas?select=id,provider_id,status,valor_final_centavos&id=in.(' + ids.join(',') + ')');
    const obs = corpo.obs ? String(corpo.obs).slice(0, 200) : null;
    const feitas = [], falhas = [];
    for (const c of cs) {
      if (!['em_aberto', 'atrasado'].includes(c.status)) continue;
      // professor só dá baixa em mensalidade de aluno da própria turma
      if (!papeis.includes('admin') && (await rpc('prof_pode_baixar', { p_prof: user.id, p_cobranca: c.id })) !== true) {
        falhas.push({ id: c.id, erro: 'Esta mensalidade é de um aluno de outra turma.' }); continue;
      }
      if (c.provider_id) {
        try {
          await asaas('/payments/' + c.provider_id + '/receiveInCash', { method: 'POST', body: { paymentDate: hojeFortaleza(), value: c.valor_final_centavos / 100, notifyCustomer: false } });
        } catch (e) {
          // cobrança já removida no Asaas: segue com a baixa. Outro erro: não dá baixa para não ficar cobrança aberta lá.
          if (e.status !== 404 && !/removid|deleted|não encontrad/i.test(e.message)) { falhas.push({ id: c.id, erro: e.message }); continue; }
        }
      }
      await rpc('baixa_manual_servidor', { p_cobranca: c.id, p_forma: forma, p_obs: obs, p_por: user.id });
      feitas.push(c.id);
    }
    return responder(res, falhas.length && !feitas.length ? 400 : 200, { ok: true, feitas: feitas.length, falhas,
      erro: falhas.length ? (/outra turma/.test(falhas[0].erro) ? falhas[0].erro : 'Não deu para marcar no Asaas: ' + falhas[0].erro) : undefined });
  } catch (e) {
    console.error('baixa:', e.message);
    return responder(res, e.status && e.status < 500 ? 400 : 500, { erro: e.message || 'Não deu para dar baixa agora.' });
  }
};
