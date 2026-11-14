// POST /api/assinar  { forma: "PIX" | "CREDIT_CARD" | "BOLETO" }
// Cria (ou reaproveita) o cliente e a assinatura do aluno no Asaas e devolve como pagar.
const { asaas, sb, rpc, usuarioDoToken, hojeFortaleza, responder, lerCorpo } = require('./_lib');

const CICLO = { mensal: 'MONTHLY', trimestral: 'QUARTERLY', semestral: 'SEMIANNUALLY', anual: 'YEARLY' };
const FORMAS = ['PIX', 'CREDIT_CARD', 'BOLETO'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  try {
    const user = await usuarioDoToken(req);
    if (!user || !user.id) return responder(res, 401, { erro: 'Entre na sua conta para pagar.' });
    const corpo = await lerCorpo(req);
    const forma = String(corpo.forma || '').toUpperCase();
    if (!FORMAS.includes(forma)) return responder(res, 400, { erro: 'Escolha Pix, cartão ou boleto.' });

    const perfis = await sb('/rest/v1/profiles?select=id,nome,email,cpf,whatsapp,status,tipo_cadastro,plano_escolhido_id,turmas_escolhidas,asaas_customer_id,asaas_subscription_id,pagamento_forma&id=eq.' + user.id);
    const p = perfis && perfis[0];
    if (!p) return responder(res, 404, { erro: 'Cadastro não encontrado.' });
    if (p.tipo_cadastro !== 'aluno') return responder(res, 400, { erro: 'Cadastro de professor não paga mensalidade.' });
    if (p.status !== 'pendente') return responder(res, 400, { erro: 'Seu acesso já está liberado.' });
    if (!p.plano_escolhido_id) return responder(res, 400, { erro: 'Escolha um plano antes de pagar.' });

    const planos = await sb('/rest/v1/planos?select=id,nome,valor_centavos,periodicidade,max_turmas,turmas_livres,ativo&id=eq.' + p.plano_escolhido_id);
    const plano = planos && planos[0];
    if (!plano || !plano.ativo) return responder(res, 400, { erro: 'Esse plano não está mais disponível. Fale com a recepção.' });
    if (!plano.turmas_livres) {
      const n = (p.turmas_escolhidas || []).length;
      if (!n) return responder(res, 400, { erro: 'Escolha a turma do seu plano.' });
      if (plano.max_turmas && n > plano.max_turmas) return responder(res, 400, { erro: 'Seu plano dá direito a ' + plano.max_turmas + ' turma(s).' });
    }

    // cliente no Asaas
    let cliente = p.asaas_customer_id;
    if (!cliente) {
      const c = await asaas('/customers', { method: 'POST', body: {
        name: p.nome || p.email, cpfCnpj: p.cpf, email: p.email,
        mobilePhone: String(p.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''),
        externalReference: p.id, notificationDisabled: false
      } });
      cliente = c.id;
    }

    // assinatura no Asaas (reaproveita se já existe; troca a forma se mudou)
    let assinatura = p.asaas_subscription_id;
    if (!assinatura) {
      const s = await asaas('/subscriptions', { method: 'POST', body: {
        customer: cliente, billingType: forma, value: plano.valor_centavos / 100,
        nextDueDate: hojeFortaleza(), cycle: CICLO[plano.periodicidade] || 'MONTHLY',
        description: 'ZXT · ' + plano.nome, externalReference: p.id
      } });
      assinatura = s.id;
    } else if (p.pagamento_forma !== forma) {
      await asaas('/subscriptions/' + assinatura, { method: 'POST', body: { billingType: forma, updatePendingPayments: true } });
    }
    await rpc('registrar_inicio_pagamento', { p_aluno: p.id, p_customer: cliente, p_subscription: assinatura, p_forma: forma });

    // primeira cobrança em aberto
    const lista = await asaas('/subscriptions/' + assinatura + '/payments');
    const pg = (lista.data || []).filter(x => ['PENDING', 'OVERDUE'].includes(x.status)).sort((a, b) => a.dueDate < b.dueDate ? -1 : 1)[0]
            || (lista.data || [])[0];
    if (!pg) return responder(res, 502, { erro: 'O Asaas ainda está gerando a cobrança. Tente de novo em alguns segundos.' });
    if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(pg.status)) return responder(res, 200, { pago: true });

    const saida = { forma, plano: plano.nome, valor: pg.value, vencimento: pg.dueDate, link: pg.invoiceUrl, boleto: pg.bankSlipUrl || null };
    if (forma === 'PIX') {
      const pix = await asaas('/payments/' + pg.id + '/pixQrCode');
      saida.pix = { imagem: pix.encodedImage, copiaCola: pix.payload, expira: pix.expirationDate };
    }
    return responder(res, 200, saida);
  } catch (e) {
    console.error('assinar:', e.message);
    return responder(res, e.status && e.status < 500 ? 400 : 500, { erro: e.message || 'Não deu para gerar o pagamento agora.' });
  }
};
