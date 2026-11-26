// POST /api/pagamento-aluno  { aluno_id }   (admin, ou professor do aluno)
// Só LEITURA no Asaas: devolve as cobranças da assinatura do aluno para a equipe conferir. Não cobra nem altera nada.
const { asaas, sb, rpc, usuarioDoToken, responder, lerCorpo } = require('./_lib');

const ST = { PENDING: 'aguardando', RECEIVED: 'pago', CONFIRMED: 'pago', RECEIVED_IN_CASH: 'pago', OVERDUE: 'vencida', REFUNDED: 'estornada', REFUND_REQUESTED: 'estornada' };
const FORMA = { PIX: 'Pix', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto', UNDEFINED: 'A definir' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  try {
    const user = await usuarioDoToken(req);
    if (!user || !user.id) return responder(res, 401, { erro: 'Entre na sua conta.' });
    const corpo = await lerCorpo(req);
    const alunoId = String(corpo.aluno_id || '');
    if (!/^[0-9a-f-]{36}$/.test(alunoId)) return responder(res, 400, { erro: 'Aluno inválido.' });
    const papeis = (await sb('/rest/v1/user_roles?select=papel&user_id=eq.' + user.id)).map(x => x.papel);
    if (!papeis.includes('admin')) {
      if (!papeis.includes('professor')) return responder(res, 403, { erro: 'Só a equipe confere pagamentos.' });
      if ((await rpc('prof_pode_ver_aluno', { p_prof: user.id, p_aluno: alunoId })) !== true) return responder(res, 403, { erro: 'Esse aluno é de outra turma.' });
    }
    const ps = await sb('/rest/v1/profiles?select=nome,status,tipo_cadastro,aluno_existente,pagamento_forma,pagamento_iniciado_em,asaas_subscription_id&id=eq.' + alunoId);
    const p = ps && ps[0];
    if (!p) return responder(res, 404, { erro: 'Aluno não encontrado.' });
    if (!p.asaas_subscription_id) return responder(res, 200, { iniciado: false, status: p.status, aluno_existente: !!p.aluno_existente });
    const lista = await asaas('/subscriptions/' + p.asaas_subscription_id + '/payments');
    const cobrancas = (lista.data || []).slice(0, 8).map(x => ({
      status: ST[x.status] || String(x.status || '').toLowerCase(), valor: x.value, vencimento: x.dueDate, forma: FORMA[x.billingType] || x.billingType,
      link: x.invoiceUrl || null, pago_em: x.paymentDate || x.clientPaymentDate || null
    }));
    return responder(res, 200, { iniciado: true, status: p.status, forma: p.pagamento_forma, iniciado_em: p.pagamento_iniciado_em, cobrancas });
  } catch (e) {
    console.error('pagamento-aluno:', e.message);
    return responder(res, e.status && e.status < 500 ? 400 : 500, { erro: e.message || 'Não deu para consultar o Asaas agora.' });
  }
};
