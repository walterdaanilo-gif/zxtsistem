(function () {
  var Z = window.ZXT;
  var DIAS = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
  function $(id) { return document.getElementById(id); }
  function dias(d) { var n = d.map(function (x) { return DIAS[x]; }); return n.length > 1 ? n.slice(0, -1).join(", ") + " e " + n[n.length - 1] : n[0]; }

  var form = $("form-exp");
  var params = new URLSearchParams(location.search);

  // modalidades (+ sparring não entra: é para quem já é aluno)
  $("op-modalidade").innerHTML = Z.modalidades.map(function (m) {
    return '<label class="opcao"><input type="radio" name="modalidade" value="' + m.id + '" required><span>' + m.nome + "</span></label>";
  }).join("");

  function turmas(mod) {
    var lista = Z.grade.filter(function (g) { return g.modalidade === mod; });
    var campo = $("campo-turma");
    campo.hidden = false;
    if (!lista.length) {
      $("op-turma").innerHTML = '<label class="opcao turma-op"><input type="radio" name="turma" value="Quero saber os horários" checked><span><b>Horários em breve</b>A gente te passa os horários na conversa</span></label>';
      return;
    }
    $("op-turma").innerHTML = lista.map(function (g, i) {
      var v = g.turma + " · " + dias(g.dias) + " às " + g.hora;
      return '<label class="opcao turma-op"><input type="radio" name="turma" value="' + v + '"' + (i === 0 ? " required" : "") + "><span><b>" + g.turma + "</b>" + dias(g.dias) + " às " + g.hora + "</span></label>";
    }).join("");
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "modalidade") turmas(e.target.value);
    if (e.target.id === "origem") $("campo-indicacao").hidden = e.target.value !== "Indicação de aluno";
  });
  $("idade").addEventListener("input", function () {
    var v = parseInt(this.value, 10);
    $("aviso-menor").hidden = !(v > 0 && v < 18);
  });

  // origem vinda do link (ex.: /experimental?origem=instagram) já marca o campo
  var o = (params.get("origem") || params.get("utm_source") || "").toLowerCase();
  var mapa = { instagram: "Instagram", ig: "Instagram", whatsapp: "WhatsApp", wa: "WhatsApp", indicacao: "Indicação de aluno", evento: "Evento" };
  if (mapa[o]) $("origem").value = mapa[o];
  if (params.get("indicou")) { $("origem").value = "Indicação de aluno"; $("campo-indicacao").hidden = false; $("indicou").value = params.get("indicou"); }
  var pm = params.get("modalidade");
  if (pm) { var r = form.querySelector('input[name="modalidade"][value="' + pm + '"]'); if (r) { r.checked = true; turmas(pm); } }

  $("dica-envio").textContent = Z.whatsapp
    ? "Ao enviar, abrimos o WhatsApp da ZXT com a sua mensagem pronta."
    : "Ao enviar, copiamos sua mensagem e abrimos o direct da ZXT no Instagram.";

  // grava a aula experimental no funil do portal (não bloqueia a mensagem se falhar)
  var SB = { url: "https://gsfvgdhjlqwrysgruyaj.supabase.co", chave: "sb_publishable_P2_9ELbKtSrUllu_S7NdGw_jxM-5r1C" };
  var ORIGEM = { "Instagram": "instagram", "WhatsApp": "whatsapp", "Indicação de aluno": "indicacao", "Evento": "evento", "Passei na frente": "passou_na_frente", "Outro": "outro" };
  function rest(caminho, corpo) {
    return fetch(SB.url + caminho, { method: corpo ? "POST" : "GET", keepalive: true,
      headers: { apikey: SB.chave, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  }
  function registrarLead(f, modNome, idade) {
    var turmaTxt = String(f.get("turma") || ""), nomeTurma = modNome + " · " + turmaTxt.split(" · ")[0];
    rest("/rest/v1/turmas?select=id&nome=eq." + encodeURIComponent(nomeTurma)).then(function (r) { return r.json(); }).catch(function () { return []; })
      .then(function (ts) {
        return rest("/rest/v1/rpc/criar_lead", {
          p_nome: String(f.get("nome")).trim(), p_whatsapp: String(f.get("whats")).trim(), p_idade: idade,
          p_modalidade: f.get("modalidade"), p_turma: (ts && ts[0] && ts[0].id) || null,
          p_origem: ORIGEM[f.get("origem")] || "site", p_indicacao: null,
          p_experiencia: String(f.get("exp") || ""), p_saude: String(f.get("obs") || "").trim() || null
        });
      }).catch(function () {});
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(form);
    var nome = (f.get("nome") || "").trim();
    var idade = parseInt(f.get("idade"), 10);
    var modId = f.get("modalidade");
    var faltando = [];
    if (nome.length < 3) faltando.push("nome");
    if ((f.get("whats") || "").replace(/\D/g, "").length < 10) faltando.push("WhatsApp com DDD");
    if (!(idade >= 4 && idade <= 99)) faltando.push("idade");
    if (!modId) faltando.push("modalidade");
    if (modId && !f.get("turma")) faltando.push("turma");
    if (!f.get("exp")) faltando.push("se já treinou");
    if (!f.get("origem")) faltando.push("como conheceu");
    if (faltando.length) { $("erro").textContent = "Falta preencher: " + faltando.join(", ") + "."; return; }
    $("erro").textContent = "";

    var mod = Z.modalidades.filter(function (m) { return m.id === modId; })[0].nome;
    var origem = f.get("origem") + (f.get("origem") === "Indicação de aluno" && f.get("indicou") ? " (" + f.get("indicou").trim() + ")" : "");
    var linhas = [
      "Olá, ZXT! Quero agendar uma aula experimental 🥊",
      "",
      "Nome: " + nome,
      "WhatsApp: " + f.get("whats"),
      "Idade: " + idade + (idade < 18 ? " (vou com meu responsável)" : ""),
      "Modalidade: " + mod,
      "Turma: " + f.get("turma"),
      "Experiência: " + f.get("exp"),
      "Conheci pelo(a): " + origem
    ];
    var obs = (f.get("obs") || "").trim();
    if (obs) linhas.push("Saúde/lesão: " + obs);
    var msg = linhas.join("\n");

    registrarLead(f, mod, idade);
    if (Z.whatsapp) {
      window.open("https://wa.me/" + Z.whatsapp + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
      return;
    }
    var link = "https://ig.me/m/" + Z.instagram;
    $("msg-pronta").textContent = msg;
    $("abrir-direct").href = link;
    $("ok-box").classList.add("mostrar");
    var abrir = function () { window.open(link, "_blank", "noopener"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(abrir, abrir);
    } else { abrir(); }
    $("ok-box").scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
