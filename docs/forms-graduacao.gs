/**
 * ZXT · Envia as respostas do Google Forms da graduação para o sistema.
 * Onde colar: na planilha "GRADUAÇÃO ZXT 2026 (respostas)" > Extensões > Apps Script.
 * Depois: troque COLE_O_TOKEN_AQUI pelo token, rode "instalar" uma vez (autorize) e pronto.
 * Duas travas de segurança: (1) cada resposta nova é enviada na hora; (2) a cada 5 minutos o script confere a aba
 * de respostas e envia o que ficou para trás. O sistema ignora resposta repetida (mesmo CPF), então não duplica.
 * Para conferir se está rodando: menu Executar > "situacao" e veja o Registro de execução.
 */
var ZXT = {
  url: 'https://zxtsistem.vercel.app/api/forms',
  token: 'COLE_O_TOKEN_AQUI',
  evento: 'graduacao-2026',
  aba: 'Form Responses 1'
};

function instalar() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'aoResponder' || f === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoResponder').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create();
  Logger.log('Pronto: resposta nova vai na hora e, a cada 5 minutos, o script reenvia o que faltou.');
  sincronizar();
}

// envia as linhas que ainda não foram confirmadas pelo sistema (guarda até onde já foi)
function sincronizar() {
  var props = PropertiesService.getScriptProperties();
  var aba = SpreadsheetApp.getActive().getSheetByName(ZXT.aba);
  var ultima = aba.getLastRow();
  var feita = parseInt(props.getProperty('linhaEnviada') || '1', 10);
  if (ultima <= feita) return;
  var linhas = aba.getRange(feita + 1, 1, ultima - feita, aba.getLastColumn()).getValues();
  for (var i = 0; i < linhas.length; i++) {
    var r = enviarLinha_(linhas[i]);
    if (typeof r === 'string') {
      Logger.log('Linha ' + (feita + 1 + i) + ': ' + r);
      if (r.indexOf('PARAR') === 0) return;   // erro do servidor ou token errado: tenta de novo daqui a 5 min
    }                                         // resposta recusada (ex.: graduação não reconhecida): registra e segue
    props.setProperty('linhaEnviada', String(feita + 1 + i));
  }
}

function situacao() {
  var aba = SpreadsheetApp.getActive().getSheetByName(ZXT.aba);
  var feita = PropertiesService.getScriptProperties().getProperty('linhaEnviada') || '1';
  var gatilhos = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', ') || 'NENHUM (rode instalar)';
  Logger.log('Respostas na planilha: ' + (aba.getLastRow() - 1) + ' | enviadas até a linha ' + feita + ' | gatilhos: ' + gatilhos);
}

function aoResponder(e) { sincronizar(); }

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
  var cod = r.getResponseCode();
  if (cod === 200) return true;
  return (cod >= 500 || cod === 401 ? 'PARAR ' : 'PULAR ') + cod + ': ' + r.getContentText();
}
