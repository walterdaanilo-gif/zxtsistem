/**
 * ZXT · Envia as respostas do Google Forms da graduação para o sistema.
 * Onde colar: na planilha "GRADUAÇÃO ZXT 2026 (respostas)" > Extensões > Apps Script.
 * Depois: rode "instalar" uma vez (autorize) e depois "enviarTodas" uma vez.
 * A partir daí, cada resposta nova entra sozinha no sistema.
 */
var ZXT = {
  url: 'https://zxtsistem.vercel.app/api/forms',
  token: 'COLE_O_TOKEN_AQUI',
  evento: 'graduacao-2026',
  aba: 'Form Responses 1'
};

function instalar() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'aoResponder') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aoResponder').forSpreadsheet(ss).onFormSubmit().create();
  Logger.log('Pronto: cada resposta nova vai para o sistema.');
}

function aoResponder(e) { enviarLinha_(e.range.getValues()[0]); }

function enviarTodas() {
  var aba = SpreadsheetApp.getActive().getSheetByName(ZXT.aba);
  var linhas = aba.getDataRange().getValues().slice(1);
  var ok = 0, erros = [];
  linhas.forEach(function (l, i) {
    var r = enviarLinha_(l);
    if (r === true) ok++; else if (r) erros.push('linha ' + (i + 2) + ': ' + r);
  });
  Logger.log(ok + ' enviadas. ' + (erros.length ? 'Erros: ' + erros.join(' | ') : 'Sem erros.'));
}

function data_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Fortaleza', 'yyyy-MM-dd');
  var m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : null;
}

// colunas: Data/hora, Nome, CPF, Nascimento, Professor, Graduação, Pagamento, Atenção
function enviarLinha_(l) {
  if (!l[1] || !l[5]) return null;
  var obs = [l[6], l[7]].map(function (x) { return String(x || '').trim(); }).filter(function (x) { return x && x.length > 2; }).join(' · ');
  var corpo = {
    token: ZXT.token, slug: ZXT.evento, nome: String(l[1]).trim(), cpf: String(l[2] || ''), nascimento: data_(l[3]),
    professor: String(l[4] || ''), opcao: String(l[5] || ''), obs: obs ? 'Forms: ' + obs : null,
    criado_em: l[0] instanceof Date ? l[0].toISOString() : null
  };
  var r = UrlFetchApp.fetch(ZXT.url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true });
  if (r.getResponseCode() === 200) return true;
  return r.getContentText();
}
