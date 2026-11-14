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
  var picker = null;
  carregarDadosPlano().then(function (dp) {
    picker = PlanoPicker($("#c-plano"), { planos: dp.planos, turmas: dp.turmas, modalidades: dp.modalidades, planoId: params.get("plano") });
  });
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
    var erroPlano = picker ? picker.erro() : "aguarde os planos carregarem";
    if (erroPlano) falta.push(erroPlano.replace(/\.$/, "").toLowerCase());
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
          modalidades_interesse: picker.modalidadesSlugs(), plano_escolhido_id: d.escolha.plano, turmas_escolhidas: d.escolha.turmas,contato_emergencia_nome: d.emergNome, contato_emergencia_telefone: d.emergTel,
          saude_obs: d.saude || null, aceite_termo_em: agora, aceite_privacidade_em: agora,
          versao_termos_aceita: textos.versao_termos || 1
        };
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
