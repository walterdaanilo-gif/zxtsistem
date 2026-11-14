// POST /api/pagar  (portal do aluno, logado)
//   { acao: "cobranca", cobranca_id, forma: "PIX"|"BOLETO"|"CREDIT_CARD" }  -> paga uma mensalidade
//   { acao: "forma", forma }                                               -> troca a forma da assinatura
// O cartão é sempre digitado na página segura do Asaas: o sistema nunca recebe dado de cartão.
const { asaas, sb, rpc, usuarioDoToken, hojeFortaleza, responder, lerCorpo } = require('./_lib');
const FORMAS = ['PIX', 'CREDIT_CARD', 'BOLETO'];

async function garantirCliente(alunoId) {
  const ps = await sb('/rest/v1/profiles?select=id,nome,email,cpf,whatsapp,responsavel_nome,responsavel_cpf,asaas_customer_id&id=eq.' + alunoId);
  const p = ps && ps[0];
  if (!p) throw Object.assign(new Error('Cadastro não encontrado.'), { status: 404 });
  if (p.asaas_customer_id) return p.asaas_customer_id;
  // menor de idade paga no CPF do responsável
  const cpf = (p.responsavel_cpf || p.cpf || '').replace(/\D/g, '');
  if (!cpf) throw Object.assign(new Error('Falta o CPF no seu cadastro. Atualize em Perfil ou fale com a recepção.'), { status: 400 });
  const c = await asaas('/customers', { method: 'POST', body: {
    name: p.responsavel_cpf ? (p.responsavel_nome || p.nome) : (p.nome || p.email), cpfCnpj: cpf, email: p.email,
    mobilePhone: String(p.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''), externalReference: p.id
  } });
  return c.id;
}

async function comoPagar(payment, forma) {
  const saida = { forma, valor: payment.value, vencimento: payment.dueDate, link: payment.invoiceUrl, boleto: payment.bankSlipUrl || null };
  if (forma === 'PIX') {
    const pix = await asaas('/payments/' + payment.id + '/pixQrCode');
    saida.pix = { imagem: pix.encodedImage, copiaCola: pix.payload, expira: pix.expirationDate };
  }
  return saida;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  try {
    const user = await usuarioDoToken(req);
    if (!user || !user.id) return responder(res, 401, { erro: 'Entre na sua conta.' });
    const corpo = await lerCorpo(req);
    const forma = String(corpo.forma || '').toUpperCase();
    if (!FORMAS.includes(forma)) return responder(res, 400, { erro: 'Escolha Pix, cartão ou boleto.' });

    // ---------- pagar uma mensalidade ----------
    if (corpo.acao === 'cobranca') {
      const cs = await sb('/rest/v1/cobrancas?select=id,aluno_id,pagador_id,status,valor_final_centavos,vencimento,descricao,provider_id&id=eq.' + encodeURIComponent(corpo.cobranca_id || ''));
      const c = cs && cs[0];
      if (!c || (c.aluno_id !== user.id && c.pagador_id !== user.id)) return responder(res, 404, { erro: 'Mensalidade não encontrada.' });
      if (!['em_aberto', 'atrasado'].includes(c.status)) return responder(res, 400, { erro: 'Essa mensalidade não está em aberto.' });
      if (c.valor_final_centavos < 500) return responder(res, 400, { erro: 'Valor abaixo do mínimo do Asaas (R$ 5,00). Pague na recepção.' });

      let pg;
      if (c.provider_id) {
        pg = await asaas('/payments/' + c.provider_id);
        if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(pg.status)) return responder(res, 200, { pago: true });
        if (pg.billingType !== forma) pg = await asaas('/payments/' + c.provider_id, { method: 'POST', body: { billingType: forma } });
      } else {
        const cliente = await garantirCliente(c.aluno_id);
        const hoje = hojeFortaleza();
        pg = await asaas('/payments', { method: 'POST', body: {
          customer: cliente, billingType: forma, value: c.valor_final_centavos / 100,
          dueDate: c.vencimento > hoje ? c.vencimento : hoje, description: 'ZXT · ' + c.descricao, externalReference: c.id
        } });
        await rpc('vincular_cobranca_asaas', { p_cobranca: c.id, p_payment: pg.id, p_customer: cliente, p_link: pg.invoiceUrl || null, p_boleto: pg.bankSlipUrl || null });
      }
      return responder(res, 200, await comoPagar(pg, forma));
    }

    // ---------- trocar a forma de pagamento da assinatura ----------
    if (corpo.acao === 'forma') {
      const ps = await sb('/rest/v1/profiles?select=id,asaas_subscription_id&id=eq.' + user.id);
      const p = ps && ps[0];
      if (!p || !p.asaas_subscription_id) return responder(res, 400, { erro: 'Sua mensalidade não é cobrada pelo Asaas. Fale com a recepção para ativar o pagamento automático.' });
      await asaas('/subscriptions/' + p.asaas_subscription_id, { method: 'POST', body: { billingType: forma, updatePendingPayments: true } });
      await rpc('definir_forma_pagamento', { p_aluno: p.id, p_forma: forma });
      let link = null;
      if (forma === 'CREDIT_CARD') {
        const lista = await asaas('/subscriptions/' + p.asaas_subscription_id + '/payments');
        const prox = (lista.data || []).filter(x => ['PENDING', 'OVERDUE'].includes(x.status)).sort((a, b) => a.dueDate < b.dueDate ? -1 : 1)[0];
        link = prox ? prox.invoiceUrl : null;
      }
      return responder(res, 200, { ok: true, forma, link });
    }

    return responder(res, 400, { erro: 'Ação inválida.' });
  } catch (e) {
    console.error('pagar:', e.message);
    return responder(res, e.status && e.status < 500 ? 400 : 500, { erro: e.message || 'Não deu para falar com o Asaas agora.' });
  }
};
