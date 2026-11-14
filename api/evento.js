// /api/evento  (formulário público de inscrição em eventos)
//   GET  ?slug=graduacao-2026            -> dados do evento e opções
//   GET  ?i=<código>                     -> situação da inscrição
//   POST { acao: "inscrever", slug, opcao_id, nome, cpf, nascimento, whatsapp, email, respostas }
//   POST { acao: "pagar", codigo, forma: "PIX"|"BOLETO"|"CREDIT_CARD" }
// O cartão é digitado na página segura do Asaas: o sistema nunca recebe dado de cartão.
const { asaas, sb, rpc, usuarioDoToken, hojeFortaleza, responder, lerCorpo } = require('./_lib');
const FORMAS = ['PIX', 'CREDIT_CARD', 'BOLETO'];

function cpfValido(c) {
  c = String(c || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
function somarDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

async function eventoPublico(slug) {
  const evs = await sb('/rest/v1/eventos?select=id,slug,tipo,titulo,descricao,inicio,fim,local_nome,endereco,referencia,vagas,inscricoes_abertas,inscricoes_ate,pagamento,campos,mensagem_confirmacao,arte_url,doacao_descricao&slug=eq.' + encodeURIComponent(slug));
  const e = evs && evs[0];
  if (!e) return null;
  e.opcoes = await sb('/rest/v1/evento_opcoes?select=id,nome,descricao,valor_centavos,ordem&ativa=eq.true&evento_id=eq.' + e.id + '&order=ordem');
  if (e.vagas) {
    const ins = await sb('/rest/v1/evento_inscricoes?select=id&status=neq.cancelado&evento_id=eq.' + e.id);
    e.vagas_restantes = Math.max(0, e.vagas - (ins || []).length);
  }
  return e;
}

async function situacao(codigo) {
  const s = await rpc('situacao_inscricao', { p_codigo: String(codigo || '') });
  return s || null;
}
function publica(s) {
  // o que volta para o navegador (sem ids do Asaas)
  return { codigo: s.codigo, nome: s.nome, status: s.status, valor_centavos: s.valor_centavos, opcao: s.opcao,
    link_pagamento: s.link_pagamento, recibo_url: s.recibo_url, tem_cpf: !!s.cpf, evento: s.evento };
}

async function garantirCliente(s, cpfInformado) {
  if (s.asaas_customer_id) return s.asaas_customer_id;
  const cpf = String(s.cpf || cpfInformado || '').replace(/\D/g, '');
  if (!cpfValido(cpf)) throw Object.assign(new Error('Informe um CPF válido para gerar o pagamento.'), { status: 400 });
  const achados = await asaas('/customers?cpfCnpj=' + cpf);
  if (achados.data && achados.data[0]) return achados.data[0].id;
  const c = await asaas('/customers', { method: 'POST', body: {
    name: s.nome, cpfCnpj: cpf, email: s.email || undefined,
    mobilePhone: String(s.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') || undefined,
    externalReference: 'evt:' + s.id
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
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      if (url.searchParams.get('i')) {
        const s = await situacao(url.searchParams.get('i'));
        return s ? responder(res, 200, publica(s)) : responder(res, 404, { erro: 'Inscrição não encontrada.' });
      }
      const e = await eventoPublico(url.searchParams.get('slug') || '');
      return e ? responder(res, 200, e) : responder(res, 404, { erro: 'Evento não encontrado.' });
    }
    if (req.method !== 'POST') return responder(res, 405, { erro: 'Use GET ou POST' });
    const corpo = await lerCorpo(req);

    // ---------- inscrever ----------
    if (corpo.acao === 'inscrever') {
      const cpf = String(corpo.cpf || '').replace(/\D/g, '');
      if (cpf && !cpfValido(cpf)) return responder(res, 400, { erro: 'Esse CPF não é válido. Confira os números.' });
      const user = await usuarioDoToken(req).catch(() => null);
      const r = await rpc('inscrever_evento', { p: {
        slug: String(corpo.slug || ''), opcao_id: corpo.opcao_id || null, nome: String(corpo.nome || '').slice(0, 120),
        cpf, nascimento: corpo.nascimento || null, whatsapp: String(corpo.whatsapp || '').slice(0, 20),
        email: String(corpo.email || '').slice(0, 120), respostas: corpo.respostas && typeof corpo.respostas === 'object' ? corpo.respostas : {},
        aluno_id: user && user.id ? user.id : null, origem: 'formulario'
      } });
      const s = await situacao(r.codigo);
      return responder(res, 200, Object.assign(publica(s), { ja_inscrito: !!r.ja_inscrito }));
    }

    // ---------- pagar ----------
    if (corpo.acao === 'pagar') {
      const forma = String(corpo.forma || '').toUpperCase();
      if (!FORMAS.includes(forma)) return responder(res, 400, { erro: 'Escolha Pix, cartão ou boleto.' });
      const s = await situacao(corpo.codigo);
      if (!s) return responder(res, 404, { erro: 'Inscrição não encontrada.' });
      if (s.status === 'pago' || s.status === 'isento') return responder(res, 200, { pago: true });
      if (s.status !== 'pendente') return responder(res, 400, { erro: 'Essa inscrição foi cancelada. Fale com a equipe ZXT.' });
      if (s.evento.pagamento !== 'online') return responder(res, 400, { erro: 'O pagamento deste evento é feito direto na academia.' });
      if (s.valor_centavos == null) return responder(res, 400, { erro: 'O valor da sua opção ainda vai ser confirmado. Fale com seu professor.' });
      if (s.valor_centavos < 500) return responder(res, 400, { erro: 'Valor abaixo do mínimo para pagamento online (R$ 5,00). Pague na academia.' });

      let pg;
      if (s.asaas_payment_id) {
        pg = await asaas('/payments/' + s.asaas_payment_id);
        if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(pg.status)) {
          await rpc('processar_pagamento_evento', { p: { evento: 'PAYMENT_RECEIVED', payment_id: pg.id, forma: pg.billingType, recibo_url: pg.transactionReceiptUrl || null, pago_em: pg.clientPaymentDate || pg.paymentDate || null } });
          return responder(res, 200, { pago: true });
        }
        if (Math.round(pg.value * 100) !== s.valor_centavos || pg.deleted) pg = null;          // valor mudou: gera outra
        else if (pg.billingType !== forma) pg = await asaas('/payments/' + pg.id, { method: 'POST', body: { billingType: forma } });
      }
      if (!pg) {
        const cliente = await garantirCliente(s, corpo.cpf);
        const hoje = hojeFortaleza();
        const diaEvento = String(s.evento.inicio || '').slice(0, 10);
        let venc = somarDias(hoje, 2);
        if (diaEvento && diaEvento >= hoje && venc > diaEvento) venc = diaEvento;
        pg = await asaas('/payments', { method: 'POST', body: {
          customer: cliente, billingType: forma, value: s.valor_centavos / 100, dueDate: venc,
          description: 'ZXT · ' + s.evento.titulo + (s.opcao ? ' · ' + s.opcao : '') + ' · ' + s.nome, externalReference: 'evt:' + s.id
        } });
        await rpc('vincular_pagamento_evento', { p_inscricao: s.id, p_payment: pg.id, p_customer: cliente, p_link: pg.invoiceUrl || null, p_forma: forma });
      }
      return responder(res, 200, await comoPagar(pg, forma));
    }

    return responder(res, 400, { erro: 'Ação inválida.' });
  } catch (e) {
    console.error('evento:', e.message);
    const m = String(e.message || '');
    const doUsuario = /^(Informe|Escolha|Responda|As inscrições|O prazo|As vagas|Evento não|Esse CPF)/.test(m);
    return responder(res, doUsuario || (e.status && e.status < 500) ? 400 : 500, { erro: doUsuario || e.status < 500 ? m : 'Não deu para concluir agora. Tente de novo em instantes.' });
  }
};
