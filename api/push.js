// POST /api/push  { token, id }   (chamado pelo banco quando nasce uma notificação)
// Envia a notificação para os celulares/computadores que a pessoa ativou. Remove aparelhos que não existem mais.
// Variáveis: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_TOKEN
const webpush = require('web-push');
const crypto = require('crypto');
const { sb, responder, lerCorpo, env } = require('./_lib');

function tokenOk(t) {
  const esperado = env('PUSH_WEBHOOK_TOKEN', '');
  if (!esperado || !t) return false;
  const a = Buffer.from(String(t)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  const c = await lerCorpo(req);
  if (!tokenOk(c.token)) return responder(res, 401, { erro: 'Token inválido' });
  try {
    webpush.setVapidDetails('https://zxtsistem.vercel.app', env('VAPID_PUBLIC_KEY', ''), env('VAPID_PRIVATE_KEY', ''));
    const ns = await sb('/rest/v1/notificacoes?select=id,user_id,tipo,titulo,corpo,link&id=eq.' + encodeURIComponent(c.id || ''));
    const n = ns && ns[0];
    if (!n) return responder(res, 404, { erro: 'Notificação não encontrada' });
    const subs = await sb('/rest/v1/push_inscricoes?select=id,endpoint,p256dh,auth&user_id=eq.' + n.user_id);
    if (!subs || !subs.length) return responder(res, 200, { ok: true, enviados: 0 });
    const naoLidas = (await sb('/rest/v1/notificacoes?select=id&lida=eq.false&user_id=eq.' + n.user_id)).length;
    const payload = JSON.stringify({ titulo: n.titulo, corpo: n.corpo || '', url: n.link || '/app#/notificacoes', tag: n.tipo + '-' + n.id, naoLidas });
    let enviados = 0;
    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
        enviados++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await sb('/rest/v1/push_inscricoes?id=eq.' + s.id, { method: 'DELETE' });
        else console.error('push:', e.statusCode, e.body || e.message);
      }
    }));
    return responder(res, 200, { ok: true, enviados });
  } catch (e) {
    console.error('push:', e.message);
    return responder(res, 500, { erro: e.message });
  }
};
