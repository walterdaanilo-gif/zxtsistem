// POST /api/asaas-webhook  (configurado no painel do Asaas → Integrações → Webhooks)
// O Asaas manda o token definido no painel no cabeçalho "asaas-access-token".
const { rpc, responder, lerCorpo, env } = require('./_lib');
const crypto = require('crypto');

function tokenValido(recebido) {
  const esperado = env('ASAAS_WEBHOOK_TOKEN', '');
  if (!esperado || !recebido) return false;
  const a = Buffer.from(String(recebido)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  if (!tokenValido(req.headers['asaas-access-token'])) return responder(res, 401, { erro: 'Token inválido' });
  const corpo = await lerCorpo(req);
  const evento = corpo.event || '';
  const pg = corpo.payment;
  if (!/^PAYMENT_/.test(evento) || !pg) return responder(res, 200, { ok: true, ignorado: evento });
  try {
    const resultado = await rpc('processar_evento_asaas', { p: {
      evento, payment_id: pg.id, subscription_id: pg.subscription || null, customer_id: pg.customer || null,
      valor_centavos: Math.round(Number(pg.value || 0) * 100), vencimento: pg.dueDate || null, forma: pg.billingType || null,
      invoice_url: pg.invoiceUrl || null, boleto_url: pg.bankSlipUrl || null,
      pago_em: pg.clientPaymentDate || pg.paymentDate || pg.confirmedDate || null
    } });
    return responder(res, 200, { ok: true, resultado });
  } catch (e) {
    console.error('webhook:', evento, pg.id, e.message);
    return responder(res, 500, { erro: 'falha ao processar' });   // o Asaas tenta de novo
  }
};
