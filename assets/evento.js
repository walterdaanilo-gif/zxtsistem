// Formulário público de inscrição em evento: /evento/<slug>  (situação: /evento/<slug>?i=<código>)
(function () {
  var $ = U.$, esc = U.esc;
  var caixa = $("#ev");
  var LOGO = '<a href="/"><img class="auth-logo" src="/assets/logo-zxt-completo.png" alt="Zulu Xtreme Team" width="120" height="115"></a>';
  var partes = location.pathname.split("/").filter(Boolean);
  var params = new URLSearchParams(location.search);
  var slug = params.get("e") || (partes[0] === "evento" ? partes[1] : "") || "";
  var EV = null, timer = null, token = null;

  function api(metodo, corpo, qs) {
    var h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return fetch("/api/evento" + (qs || ""), { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.erro || "Tente de novo em instantes."); return j; }); });
  }
  function chave() { return "zxt_ev_" + slug; }
  function guardar(c) { try { localStorage.setItem(chave(), c); } catch (e) {} if (history.replaceState) history.replaceState(null, "", "/evento/" + slug + "?i=" + c); }
  function esquecer() { try { localStorage.removeItem(chave()); } catch (e) {} if (history.replaceState) history.replaceState(null, "", "/evento/" + slug); }
  function valorTxt(v) { return v == null ? "Valor a confirmar" : v === 0 ? "Gratuito" : U.reais(v); }
  function quando(iso) {
    var d = new Date(iso);
    var dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "2-digit", month: "long" });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ", às " + U.hora(iso).replace(":00", "h").replace(":", "h");
  }
  function cabecalho(e) {
    return LOGO + '<p class="olho" style="text-align:center;margin:0 0 6px">Inscrição</p><h1>' + esc(e.titulo) + "</h1>" +
      '<div class="cartao ev-info"><p><b>📅 ' + esc(quando(e.inicio)) + "</b></p>" +
      (e.endereco || e.local_nome ? "<p>📍 " + esc([e.local_nome && e.local_nome !== "Local externo" ? e.local_nome : "", e.endereco].filter(Boolean).join(" · ")) + "</p>" : "") +
      (e.descricao ? '<p class="ev-desc">' + esc(e.descricao) + "</p>" : "") +
      (e.doacao_descricao ? "<p>🤝 Leve: " + esc(e.doacao_descricao) + "</p>" : "") + "</div>";
  }

  // ------------------------------------------------------------ formulário
  function formulario(e, pre) {
    pre = pre || {};
    var c = e.campos || {}, opcoes = e.opcoes || [], extras = c.extras || [];
    var fechado = !e.inscricoes_abertas || (e.inscricoes_ate && new Date(e.inscricoes_ate) < new Date()) || (e.vagas && e.vagas_restantes === 0);
    if (fechado) {
      caixa.innerHTML = cabecalho(e) + '<div class="vazio-box" style="margin-top:14px">As inscrições deste evento estão encerradas. Fale com seu professor.</div>' + rodape();
      return;
    }
    function campo(id, rot, tipo, extra) {
      return '<div class="campo"><label for="' + id + '">' + rot + "</label><input id=\"" + id + '" type="' + (tipo || "text") + '"' + (extra || "") + "></div>";
    }
    caixa.innerHTML = cabecalho(e) +
      '<form class="form" id="f-ev" novalidate style="margin-top:14px">' +
      '<div class="grupo"><p>Seus dados</p>' +
      campo("ev-nome", "Nome completo", "text", ' autocomplete="name" value="' + esc(pre.nome || "") + '"') +
      (c.cpf || c.nascimento ? '<div class="linha2">' +
        (c.cpf ? campo("ev-cpf", "CPF", "text", ' inputmode="numeric" placeholder="000.000.000-00" value="' + esc(pre.cpf || "") + '"') : "") +
        (c.nascimento ? campo("ev-nasc", "Nascimento", "date", ' value="' + esc(pre.nasc || "") + '"') : "") + "</div>" : "") +
      (c.whatsapp || c.email ? '<div class="linha2">' +
        (c.whatsapp ? campo("ev-whats", "WhatsApp", "tel", ' inputmode="tel" autocomplete="tel" placeholder="(84) 9 9999-9999" value="' + esc(pre.whats || "") + '"') : "") +
        (c.email ? campo("ev-email", "E-mail", "email", ' autocomplete="email" value="' + esc(pre.email || "") + '"') : "") + "</div>" : "") +
      extras.map(function (x) {
        var id = "ev-x-" + esc(x.id);
        if (x.tipo === "opcoes") return '<div class="campo"><label for="' + id + '">' + esc(x.rotulo) + (x.obrigatorio ? "" : " <small>(opcional)</small>") + '</label><select class="sel" id="' + id + '" data-extra="' + esc(x.id) + '"><option value="">Escolha</option>' +
          (x.opcoes || []).map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></div>";
        return '<div class="campo"><label for="' + id + '">' + esc(x.rotulo) + (x.obrigatorio ? "" : " <small>(opcional)</small>") + '</label><input id="' + id + '" data-extra="' + esc(x.id) + '"></div>';
      }).join("") + "</div>" +
      (opcoes.length ? '<div class="grupo"><p>' + (e.tipo === "exame_graduacao" ? "Qual prajied você vai fazer?" : "Escolha sua inscrição") + "</p>" +
        '<div class="ev-opcoes">' + opcoes.map(function (o) {
          return '<label class="tipo-op"><input type="radio" name="opcao" value="' + o.id + '"><span><b>' + esc(o.nome) + "</b><small>" + valorTxt(o.valor_centavos) +
            (o.valor_centavos == null ? " com seu professor" : "") + (o.descricao ? " · " + esc(o.descricao) : "") + "</small></span></label>";
        }).join("") + "</div>" +
        (e.tipo === "exame_graduacao" ? '<p class="dica" style="margin:0">Na dúvida sobre o prajied, confirme com seu professor antes de pagar.</p>' : "") + "</div>" : "") +
      (e.vagas ? '<p class="dica">Restam ' + e.vagas_restantes + " vaga(s).</p>" : "") +
      '<p class="erro" id="ev-erro" role="alert"></p>' +
      '<button class="btn btn-vermelho btn-bloco" type="submit" id="ev-enviar">Fazer minha inscrição</button>' +
      '<p class="dica">' + (e.pagamento === "online" ? "Depois da inscrição você paga aqui mesmo: Pix, cartão ou boleto." : "O pagamento é feito direto na academia.") +
      " Seus dados são usados só para organizar o evento.</p></form>" + rodape();

    var cpf = $("#ev-cpf");
    if (cpf) cpf.addEventListener("input", function () {
      var d = U.soDigitos(cpf.value).slice(0, 11);
      cpf.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    });
    $("#f-ev").onsubmit = function (ev) {
      ev.preventDefault();
      var erro = $("#ev-erro"); erro.textContent = "";
      var d = { acao: "inscrever", slug: slug, nome: $("#ev-nome").value.trim(), respostas: {} };
      var falta = [];
      if (d.nome.split(" ").filter(Boolean).length < 2) falta.push("nome completo");
      if (c.cpf) { d.cpf = U.soDigitos(cpf.value); if (!U.cpfValido(d.cpf)) falta.push("CPF válido"); }
      if (c.nascimento) { d.nascimento = $("#ev-nasc").value; var id = U.idade(d.nascimento); if (!d.nascimento || id === null || id < 2 || id > 100) falta.push("data de nascimento"); }
      if (c.whatsapp) { d.whatsapp = $("#ev-whats").value.trim(); if (U.soDigitos(d.whatsapp).length < 10) falta.push("WhatsApp com DDD"); }
      if (c.email) { d.email = $("#ev-email").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) falta.push("e-mail"); }
      U.$$("[data-extra]").forEach(function (el) {
        var x = extras.filter(function (y) { return y.id === el.getAttribute("data-extra"); })[0];
        d.respostas[x.id] = el.value.trim();
        if (x.obrigatorio && !el.value.trim()) falta.push(x.rotulo.toLowerCase());
      });
      if (opcoes.length) { var op = $('input[name="opcao"]:checked'); if (!op) falta.push("a opção de inscrição"); else d.opcao_id = op.value; }
      if (falta.length) { erro.textContent = "Falta preencher: " + falta.join(", ") + "."; return; }
      var bt = $("#ev-enviar"); bt.disabled = true; bt.textContent = "Enviando...";
      api("POST", d).then(function (s) {
        guardar(s.codigo);
        situacao(s, s.ja_inscrito ? "Você já estava inscrito(a) com esses dados. Aqui está sua inscrição." : null);
      }).catch(function (e) { erro.textContent = e.message; bt.disabled = false; bt.textContent = "Fazer minha inscrição"; });
    };
  }

  // ------------------------------------------------------------ situação e pagamento
  function situacao(s, aviso) {
    clearInterval(timer);
    var e = EV || {};
    var pagavel = s.status === "pendente" && s.evento.pagamento === "online" && s.valor_centavos != null && s.valor_centavos >= 500;
    var titulo = s.status === "pago" ? "Pagamento <em>confirmado</em>" : s.status === "isento" ? "Inscrição <em>confirmada</em>" :
      s.status === "cancelado" ? "Inscrição <em>cancelada</em>" : pagavel ? "Falta o <em>pagamento</em>" : "Inscrição <em>recebida</em>";
    var tags = { pago: '<span class="tag ok">✅ Pago</span>', isento: '<span class="tag ok">✅ Confirmada</span>', pendente: '<span class="tag atencao">⏳ Pagamento pendente</span>', cancelado: '<span class="tag risco">Cancelada</span>' };
    caixa.innerHTML = LOGO + '<p class="olho" style="text-align:center;margin:0 0 6px">' + esc(s.evento.titulo) + "</p><h1>" + titulo + "</h1>" +
      (aviso ? '<p class="sub">' + esc(aviso) + "</p>" : '<p class="sub">' + esc(quando(s.evento.inicio)) + "</p>") +
      '<div class="cartao"><p class="olho" style="margin:0 0 4px">Inscrição de</p><h2 style="margin:0 0 8px">' + esc(s.nome) + "</h2>" +
      (s.opcao ? '<p style="margin:0 0 6px;color:var(--cinza)">' + esc(s.opcao) + "</p>" : "") +
      '<p style="margin:0 0 10px"><b style="font-size:22px">' + valorTxt(s.valor_centavos) + "</b></p>" + (tags[s.status] || "") + "</div>" +
      (s.status === "pendente" && s.valor_centavos == null ? '<div class="cartao"><span class="tag atencao">Valor a confirmar</span> O valor dessa opção ainda vai ser confirmado pela equipe. Fale com seu professor; quando o valor sair, volte neste link para pagar.</div>' : "") +
      (s.status === "pendente" && s.evento.pagamento !== "online" && s.valor_centavos ? '<div class="cartao">O pagamento é feito direto na academia, com seu professor ou na recepção.</div>' : "") +
      (pagavel ? '<p class="pp-titulo" style="margin-top:22px">Como você quer pagar?</p><div class="formas">' +
        '<button class="forma" data-forma="PIX"><b>Pix</b><span>Confirma em segundos</span></button>' +
        '<button class="forma" data-forma="CREDIT_CARD"><b>Cartão de crédito</b><span>Página segura do Asaas</span></button>' +
        '<button class="forma" data-forma="BOLETO"><b>Boleto</b><span>Compensa em 1 a 3 dias úteis</span></button></div><div id="pagar-area"></div>' +
        (s.tem_cpf ? "" : '<div class="campo" style="margin-top:12px"><label for="pg-cpf">CPF de quem paga</label><input id="pg-cpf" inputmode="numeric" placeholder="000.000.000-00"></div>') +
        '<p class="dica" style="margin-top:14px">Pagamento processado pelo Asaas. Esta tela confere o pagamento sozinha.</p>' : "") +
      (s.status === "pago" && s.recibo_url ? '<a class="btn btn-borda btn-bloco" style="margin-top:12px" target="_blank" rel="noopener" href="' + esc(s.recibo_url) + '">Ver comprovante</a>' : "") +
      ((s.status === "pago" || s.status === "isento") && e.mensagem_confirmacao ? '<div class="cartao">' + esc(e.mensagem_confirmacao) + "</div>" : "") +
      '<p class="dica" style="margin-top:16px">Guarde este link para ver sua inscrição depois.</p>' +
      '<button class="link" id="outra">Fazer outra inscrição (ex.: filho ou outro aluno)</button>' + rodape();

    $("#outra").onclick = function () { clearInterval(timer); esquecer(); formulario(EV); };
    if (s.status === "pendente") timer = setInterval(function () {
      api("GET", null, "?i=" + encodeURIComponent(s.codigo)).then(function (n) { if (n.status !== s.status) situacao(n, n.status === "pago" ? "Recebemos seu pagamento. Te vejo no evento! 🔥" : null); }).catch(function () {});
    }, 6000);
    caixa.onclick = function (ev) {
      var b = ev.target.closest("[data-forma]"); if (!b) return;
      U.$$(".forma").forEach(function (x) { x.classList.toggle("sel", x === b); });
      gerar(s, b.getAttribute("data-forma"));
    };
  }

  function gerar(s, forma) {
    var area = $("#pagar-area"), cpfEl = $("#pg-cpf");
    if (cpfEl && !U.cpfValido(cpfEl.value)) { U.toast("Informe o CPF de quem paga.", "erro"); cpfEl.focus(); return; }
    area.innerHTML = '<p class="carregando">Gerando seu pagamento...</p>';
    api("POST", { acao: "pagar", codigo: s.codigo, forma: forma, cpf: cpfEl ? U.soDigitos(cpfEl.value) : undefined }).then(function (d) {
      if (d.pago) return api("GET", null, "?i=" + encodeURIComponent(s.codigo)).then(function (n) { situacao(n, "Pagamento confirmado. Te vejo no evento! 🔥"); });
      var h;
      if (forma === "PIX" && d.pix) {
        h = '<div class="cartao pix"><p style="margin:0 0 10px"><b>Pague ' + U.reais(Math.round(d.valor * 100)) + " no Pix</b>. Abra o app do banco e escaneie o QR ou use o copia e cola.</p>" +
          '<img class="pix-qr" src="data:image/png;base64,' + d.pix.imagem + '" alt="QR code Pix">' +
          '<div class="busca" style="margin:12px 0 0"><input readonly id="pix-cc" value="' + esc(d.pix.copiaCola) + '"><button class="btn-mini" id="pix-copiar" type="button">Copiar código</button></div></div>';
      } else if (forma === "BOLETO") {
        h = '<div class="cartao"><p style="margin:0 0 12px">Boleto de <b>' + U.reais(Math.round(d.valor * 100)) + "</b> com vencimento em " + U.data(d.vencimento) + ".</p>" +
          '<a class="btn btn-vermelho" target="_blank" rel="noopener" href="' + esc(d.boleto || d.link) + '">Abrir boleto</a></div>';
      } else {
        h = '<div class="cartao"><p style="margin:0 0 12px">Você vai para a página segura do Asaas para digitar o cartão. Depois de pagar, volte para esta tela.</p>' +
          '<a class="btn btn-vermelho" target="_blank" rel="noopener" href="' + esc(d.link) + '">Pagar com cartão</a></div>';
      }
      area.innerHTML = h;
      var cp = $("#pix-copiar");
      if (cp) cp.onclick = function () { navigator.clipboard.writeText($("#pix-cc").value).then(function () { U.toast("Código Pix copiado"); }); };
    }).catch(function (e) { area.innerHTML = '<div class="cartao"><span class="tag risco">Não gerado</span> ' + esc(e.message) + "</div>"; });
  }

  function rodape() { return '<a class="voltar-site" href="/">Conheça a ZXT</a>'; }

  // ------------------------------------------------------------ início
  if (!slug) { caixa.innerHTML = LOGO + '<div class="vazio-box">Link de evento incompleto. Peça o link certo ao seu professor.</div>'; return; }
  var cod = params.get("i"); if (!cod) try { cod = localStorage.getItem(chave()); } catch (e) {}
  sb.auth.getSession().then(function (r) {
    var ses = r.data && r.data.session;
    if (ses) token = ses.access_token;
    return Promise.all([
      api("GET", null, "?slug=" + encodeURIComponent(slug)),
      ses ? sb.from("profiles").select("nome,cpf,whatsapp,email,data_nascimento").eq("id", ses.user.id).single().then(function (x) { return x.data; }) : null
    ]);
  }).then(function (res) {
    EV = res[0]; var p = res[1];
    document.title = EV.titulo + " | Inscrição ZXT";
    var pre = p ? { nome: p.nome, cpf: p.cpf, whats: p.whatsapp, email: p.email, nasc: p.data_nascimento } : null;
    if (!cod) return formulario(EV, pre);
    return api("GET", null, "?i=" + encodeURIComponent(cod)).then(function (s) {
      if (s.evento.slug !== slug) return formulario(EV, pre);
      situacao(s);
    }).catch(function () { esquecer(); formulario(EV, pre); });
  }).catch(function (e) {
    caixa.innerHTML = LOGO + '<div class="vazio-box">' + esc(e.message || "Evento não encontrado.") + "</div>" + rodape();
  });
})();
