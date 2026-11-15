(function () {
  var $ = U.$, params = new URLSearchParams(location.search);
  var indicacao = params.get("ref") || "";
  var textos = {};

  // já logado? vai direto para o portal
  sb.auth.getSession().then(function (r) { if (r.data.session) location.replace("/app"); });

  function aba(qual) {
    $("#aba-entrar").setAttribute("aria-selected", qual === "entrar");
    $("#aba-cadastro").setAttribute("aria-selected", qual === "cadastro");
    $("#f-entrar").hidden = qual !== "entrar";
    $("#f-cadastro").hidden = qual !== "cadastro";
  }
  $("#aba-entrar").onclick = function () { aba("entrar"); };
  $("#aba-cadastro").onclick = function () { aba("cadastro"); };
  if (params.get("modo") === "cadastro" || indicacao) aba("cadastro");

  // modalidades e textos legais vindos do banco
  // planos e turmas: escolher o plano libera a escolha das turmas
  var picker = null, dadosProf = null;
  carregarDadosPlano().then(function (dp) {
    picker = PlanoPicker($("#c-plano"), { planos: dp.planos, turmas: dp.turmas, modalidades: dp.modalidades, planoId: params.get("plano"), explicar: true });
    return sb.from("graduacao_niveis").select("id,modalidade_id,nome,ordem,graus_max,infantil").eq("infantil", false).order("ordem").then(function (rn) {
      dadosProf = { turmas: dp.turmas.filter(function (t) { return !t.coletiva; }), modalidades: dp.modalidades, niveis: rn.data || [] };
      montarProf();
    });
  });

  // ---- cadastro de professor: turmas que dá aula + graduação ----
  var DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function montarProf() {
    var d = dadosProf;
    $("#c-prof-turmas").innerHTML = d.modalidades.map(function (m) {
      var ts = d.turmas.filter(function (t) { return t.modalidade_id === m.id; });
      if (!ts.length) return "";
      return '<p class="pp-mod">' + U.esc(m.nome) + "</p>" + ts.map(function (t) {
        return '<label class="check pp-turma"><input type="checkbox" name="prof-turma" value="' + t.id + '"> <span><b>' + U.esc(t.nome.replace(m.nome + " · ", "")) + "</b> · " +
          (t.dias_semana || []).map(function (x) { return DIAS[x]; }).join(" e ") + " às " + String(t.hora_inicio).slice(0, 5).replace(":00", "h").replace(":", "h") + "</span></label>";
      }).join("");
    }).join("") + '<p class="pp-aviso">Sua turma não está na lista? Cadastre assim mesmo e avise a equipe na experiência.</p>';
    $("#c-prof-grad").innerHTML = d.modalidades.map(function (m) {
      var ns = d.niveis.filter(function (n) { return n.modalidade_id === m.id; });
      if (!ns.length) return "";
      var termo = m.slug === "muay-thai" ? "prajied" : m.slug === "jiu-jitsu" ? "faixa" : "nível";
      return '<div class="linha2 prof-grad" data-mod="' + m.id + '"><div class="campo"><label>' + U.esc(m.nome) + '</label><select class="sel" data-nivel>' +
        '<option value="">Sem ' + termo + " nessa modalidade</option>" + ns.map(function (n) { return '<option value="' + n.id + '" data-graus="' + n.graus_max + '">' + U.esc(n.nome) + "</option>"; }).join("") +
        '</select></div><div class="campo" data-grau-box hidden><label>Grau</label><select class="sel" data-grau></select></div></div>';
    }).join("");
  }
  document.addEventListener("change", function (e) {
    if (e.target.name === "tipo") {
      var prof = e.target.value === "professor";
      $("#g-plano").hidden = prof; $("#g-prof").hidden = !prof;
    }
    if (e.target.matches && e.target.matches("[data-nivel]")) {
      var box = e.target.closest(".prof-grad"), opt = e.target.selectedOptions[0];
      var mx = parseInt(opt && opt.getAttribute("data-graus"), 10) || 0;
      box.querySelector("[data-grau-box]").hidden = !mx;
      var h = ""; for (var i = 0; i <= mx; i++) h += '<option value="' + i + '">' + (i ? i + "º grau" : "Sem grau") + "</option>";
      box.querySelector("[data-grau]").innerHTML = h;
    }
  });
  if (params.get("atual") === "1") { var ca = document.getElementById("c-atual"); if (ca) ca.checked = true; }
  if (params.get("tipo") === "professor") setTimeout(function () { var r = document.querySelector('input[name="tipo"][value="professor"]'); if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); } }, 0);
  function ehProfessor() { var r = document.querySelector('input[name="tipo"]:checked'); return r && r.value === "professor"; }
  function dadosDoProfessor() {
    var turmas = U.$$('input[name="prof-turma"]:checked').map(function (i) { return i.value; });
    var grad = U.$$(".prof-grad").map(function (b) {
      var n = b.querySelector("[data-nivel]").value; if (!n) return null;
      return { modalidade_id: b.getAttribute("data-mod"), nivel_id: n, grau: parseInt((b.querySelector("[data-grau]") || {}).value, 10) || 0 };
    }).filter(Boolean);
    var mods = (dadosProf ? dadosProf.modalidades : []).filter(function (m) {
      return turmas.some(function (t) { return (dadosProf.turmas.filter(function (x) { return x.id === t; })[0] || {}).modalidade_id === m.id; });
    }).map(function (m) { return m.slug; });
    return { turmas: turmas, grad: grad, mods: mods, exp: $("#c-exp").value.trim() };
  }
  sb.from("academia_config").select("termo_responsabilidade,politica_privacidade,versao_termos").single().then(function (r) {
    if (r.data) textos = r.data;
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-texto]");
    if (!a) return;
    e.preventDefault();
    var t = a.getAttribute("data-texto") === "termo" ? textos.termo_responsabilidade : textos.politica_privacidade;
    var f = document.createElement("div");
    f.className = "modal-fundo";
    f.innerHTML = '<div class="modal"><h3>' + (a.getAttribute("data-texto") === "termo" ? "Termo de responsabilidade" : "Política de privacidade") +
      "</h3><pre>" + U.esc(t || "Carregando...") + '</pre><div class="rodape-modal"><button class="btn-mini">Fechar</button></div></div>';
    f.onclick = function (ev) { if (ev.target === f || ev.target.tagName === "BUTTON") f.remove(); };
    document.body.appendChild(f);
  });

  // menor de idade mostra o bloco do responsável
  $("#c-nasc").addEventListener("change", function () {
    var i = U.idade(this.value);
    $("#g-resp").hidden = !(i !== null && i < 18);
  });

  // ENTRAR
  $("#f-entrar").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = this.querySelector("button[type=submit]"); b.disabled = true;
    sb.auth.signInWithPassword({ email: $("#e-email").value.trim(), password: $("#e-senha").value })
      .then(function (r) {
        b.disabled = false;
        if (r.error) return U.erro(r.error);
        try {
          localStorage.setItem("zxt_lembrar", $("#e-lembrar").checked ? "1" : "0");
          sessionStorage.setItem("zxt_sessao", "1");
        } catch (er) {}
        location.replace("/app");
      });
  });

  $("#esqueci").onclick = function () {
    var email = $("#e-email").value.trim();
    if (!email) return U.toast("Digite seu e-mail no campo acima e toque de novo.", "erro");
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/app#nova-senha" }).then(function (r) {
      if (r.error) return U.erro(r.error);
      U.toast("Se o e-mail tiver cadastro, enviamos o link para criar nova senha.");
    });
  };

  // CADASTRO
  $("#f-cadastro").addEventListener("submit", function (e) {
    e.preventDefault();
    var erro = $("#c-erro"), falta = [];
    var d = {
      nome: $("#c-nome").value.trim(), email: $("#c-email").value.trim(), whats: $("#c-whats").value.trim(),
      nasc: $("#c-nasc").value, cpf: $("#c-cpf").value.trim(), senha: $("#c-senha").value,
      emergNome: $("#c-emerg-nome").value.trim(), emergTel: $("#c-emerg-tel").value.trim(), saude: $("#c-saude").value.trim(),
      escolha: picker ? picker.valor() : { plano: null, turmas: [] }
    };
    var idade = U.idade(d.nasc), menor = idade !== null && idade < 18;
    if (d.nome.split(" ").length < 2) falta.push("nome completo");
    if (!/^\S+@\S+\.\S+$/.test(d.email)) falta.push("e-mail válido");
    if (U.soDigitos(d.whats).length < 10) falta.push("WhatsApp com DDD");
    if (!d.nasc || idade < 3 || idade > 100) falta.push("data de nascimento");
    if (!U.cpfValido(d.cpf)) falta.push("CPF válido");
    if (d.senha.length < 8) falta.push("senha com 8 caracteres");
    var prof = ehProfessor(), dp = prof ? dadosDoProfessor() : null;
    if (prof) {
      if (!dp.turmas.length) falta.push("pelo menos uma turma em que você dá aula");
    } else {
      var erroPlano = picker ? picker.erro() : "aguarde os planos carregarem";
      if (erroPlano) falta.push(erroPlano.replace(/\.$/, "").toLowerCase());
    }
    if (!d.emergNome || U.soDigitos(d.emergTel).length < 10) falta.push("contato de emergência");
    if (menor) {
      if (!$("#r-nome").value.trim()) falta.push("nome do responsável");
      if (!U.cpfValido($("#r-cpf").value)) falta.push("CPF do responsável");
      if (U.soDigitos($("#r-whats").value).length < 10) falta.push("WhatsApp do responsável");
      if (!$("#r-aceite").checked) falta.push("autorização do responsável");
    }
    if (!$("#c-termo").checked) falta.push("aceite do termo");
    if (!$("#c-priv").checked) falta.push("aceite da política de privacidade");
    if (falta.length) { erro.textContent = "Confira: " + falta.join(", ") + "."; return; }
    erro.textContent = "";

    var b = this.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Criando...";
    var meta = { nome: d.nome, whatsapp: d.whats };
    if (indicacao) meta.indicacao = indicacao;
    sb.auth.signUp({ email: d.email, password: d.senha, options: { data: meta, emailRedirectTo: location.origin + "/app" } })
      .then(function (r) {
        if (r.error) throw r.error;
        if (!r.data.session) { // projeto exigindo confirmação de e-mail
          U.toast("Conta criada. Confirme pelo link no seu e-mail e depois entre.");
          aba("entrar"); return null;
        }
        var agora = new Date().toISOString();
        var perfil = {
          nome: d.nome, whatsapp: d.whats, data_nascimento: d.nasc, cpf: U.soDigitos(d.cpf),
          contato_emergencia_nome: d.emergNome, contato_emergencia_telefone: d.emergTel,
          saude_obs: d.saude || null, aceite_termo_em: agora, aceite_privacidade_em: agora,
          versao_termos_aceita: textos.versao_termos || 1
        };
        if (prof) {
          perfil.tipo_cadastro = "professor"; perfil.turmas_professor = dp.turmas; perfil.graduacao_declarada = dp.grad;
          perfil.experiencia = dp.exp || null; perfil.modalidades_interesse = dp.mods;
        } else {
          perfil.tipo_cadastro = "aluno"; perfil.modalidades_interesse = picker.modalidadesSlugs();
          perfil.aluno_existente = !!(document.getElementById("c-atual") || {}).checked;
          perfil.plano_escolhido_id = d.escolha.plano; perfil.turmas_escolhidas = d.escolha.turmas;
        }
        if (menor) {
          perfil.responsavel_nome = $("#r-nome").value.trim();
          perfil.responsavel_cpf = U.soDigitos($("#r-cpf").value);
          perfil.responsavel_whatsapp = $("#r-whats").value.trim();
          perfil.responsavel_aceite_em = agora;
        }
        return sb.from("profiles").update(perfil).eq("id", r.data.user.id).then(function (u) {
          if (u.error) throw u.error;
          location.replace("/app");
        });
      })
      .catch(function (err) { U.erro(err); })
      .finally(function () { b.disabled = false; b.textContent = "Criar minha conta"; });
  });
})();
