(function () {
  var $ = U.$, esc = U.esc;
  var S = { user: null, perfil: null, papeis: [], modo: null, tokenCheckin: null, ultimoCheckin: null };
  var tela = $("#tela");

  // ---------------------------------------------------------------- ícones
  var I = {
    casa: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
    dinheiro: '<rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/>',
    faixa: '<path d="M2 10h20v4H2zM10 14l-3 7M14 14l3 7"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    chamada: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/>',
    grupo: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.4 2.2 4 5"/>',
    painel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    aprovar: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    funil: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[n] + "</svg>"; }

  var MENUS = {
    aluno: [["inicio", "Início", "casa"], ["agenda", "Agenda", "agenda"], ["checkin", "Check-in", "qr"], ["financeiro", "Mensalidades", "dinheiro"], ["graduacao", "Graduação", "faixa"], ["perfil", "Perfil", "perfil"]],
    professor: [["chamada", "Chamada", "chamada"], ["alunos", "Alunos", "grupo"], ["perfil", "Perfil", "perfil"]],
    admin: [["painel", "Painel", "painel"], ["aprovacoes", "Aprovações", "aprovar"], ["alunos", "Alunos", "grupo"], ["chamada", "Chamada", "chamada"], ["cobrancas", "Financeiro", "dinheiro"], ["leads", "Experimentais", "funil"], ["qr", "QR recepção", "qr"]]
  };
  var NOME_PAPEL = { aluno: "Aluno", professor: "Professor", admin: "Administração" };

  // ---------------------------------------------------------------- utilidades de tela
  function modal(titulo, corpoHtml, botoes) {
    var f = document.createElement("div");
    f.className = "modal-fundo";
    f.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>' + esc(titulo) + "</h3><div class=\"modal-corpo\">" + corpoHtml +
      '</div><div class="rodape-modal"></div></div>';
    var rod = f.querySelector(".rodape-modal");
    (botoes || [["Fechar", null, "claro"]]).forEach(function (b) {
      var el = document.createElement("button");
      el.className = "btn-mini " + (b[2] || "");
      el.textContent = b[0];
      el.onclick = function () {
        var r = b[1] ? b[1](f) : true;
        Promise.resolve(r).then(function (fechar) { if (fechar !== false) f.remove(); });
      };
      rod.appendChild(el);
    });
    f.addEventListener("click", function (e) { if (e.target === f) f.remove(); });
    document.body.appendChild(f);
    return f;
  }
  function tagStatus(s) {
    var m = { pago: "ok", isento: "ok", em_aberto: "atencao", atrasado: "risco", cancelado: "neutro",
      ativo: "ok", pendente: "atencao", recusado: "risco", trancado: "neutro", inativo: "neutro",
      reservada: "info", espera: "atencao", presente: "ok", falta: "risco", cancelada: "neutro",
      agendada: "info", compareceu: "atencao", matriculou: "ok", nao_compareceu: "risco", desistiu: "neutro" };
    var nomes = { em_aberto: "Em aberto", nao_compareceu: "Não veio", espera: "Lista de espera" };
    return '<span class="tag ' + (m[s] || "neutro") + '">' + esc(nomes[s] || (s.charAt(0).toUpperCase() + s.slice(1))) + "</span>";
  }
  function primeiroNome(n) { return (n || "Guerreiro").split(" ")[0]; }
  function inicioMes() { var h = U.hojeISO(); return h.slice(0, 8) + "01"; }
  function chk(r) { if (r.error) throw r.error; return r.data; }
  function falhou(e) { tela.innerHTML = '<div class="vazio-box">Não deu para carregar agora. ' + esc(e.message || e) + "</div>"; }

  // ---------------------------------------------------------------- sessão e papéis
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === "PASSWORD_RECOVERY") novaSenha();
    if (ev === "SIGNED_OUT") location.replace("/entrar");
  });
  $("#sair").onclick = function () { sb.auth.signOut(); };

  function iniciar() {
    // token de check-in vindo do QR (sobrevive ao login)
    var mh = decodeURIComponent(location.hash).match(/[?&]t=([a-z0-9-]+)/i);
    if (mh) { S.tokenCheckin = mh[1]; try { sessionStorage.setItem("zxt_checkin", mh[1]); } catch (e) {} }
    if (!S.tokenCheckin) try { S.tokenCheckin = sessionStorage.getItem("zxt_checkin"); } catch (e) {}
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) { location.replace("/entrar"); return; }
      S.user = r.data.session.user;
      return Promise.all([
        sb.from("profiles").select("*").eq("id", S.user.id).single(),
        sb.from("user_roles").select("papel").eq("user_id", S.user.id)
      ]).then(function (res) {
        S.perfil = chk(res[0]);
        S.papeis = chk(res[1]).map(function (p) { return p.papel; });
        $("#quem-nome").textContent = primeiroNome(S.perfil.nome || S.user.email);
        var staff = S.papeis.indexOf("admin") >= 0 || S.papeis.indexOf("professor") >= 0;
        if (!staff && S.perfil.status !== "ativo") return telaBloqueio();
        var modos = ["admin", "professor", "aluno"].filter(function (p) { return S.papeis.indexOf(p) >= 0; });
        if (!modos.length) modos = ["aluno"];
        var salvo = null; try { salvo = localStorage.getItem("zxt_modo"); } catch (e) {}
        S.modo = modos.indexOf(salvo) >= 0 ? salvo : modos[0];
        if (S.tokenCheckin && modos.indexOf("aluno") >= 0) S.modo = "aluno";
        $("#troca-papel").innerHTML = modos.length > 1 ? modos.map(function (m) {
          return '<button data-modo="' + m + '" aria-pressed="' + (m === S.modo) + '">' + NOME_PAPEL[m] + "</button>";
        }).join("") : "";
        $("#troca-papel").onclick = function (e) {
          var b = e.target.closest("[data-modo]"); if (!b) return;
          S.modo = b.getAttribute("data-modo");
          try { localStorage.setItem("zxt_modo", S.modo); } catch (er) {}
          U.$$("#troca-papel button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
          location.hash = "#/" + MENUS[S.modo][0][0];
          montarMenu(); rotear();
        };
        montarMenu();
        if (S.tokenCheckin && S.modo === "aluno" && history.replaceState) history.replaceState(null, "", "/app#/checkin");
        rotear();
      });
    }).catch(falhou);
  }

  function telaBloqueio() {
    $("#nav").hidden = true;
    var p = S.perfil;
    var recusado = p.status === "recusado";
    tela.innerHTML = '<div class="aguardando">' +
      '<img src="/assets/logo-zxt-completo.png" alt="ZXT">' +
      "<h1>" + (recusado ? "Cadastro <em>não aprovado</em>" : "Aguardando <em>aprovação</em>") + "</h1>" +
      '<p class="sub">' + (recusado
        ? "Motivo: " + esc(p.motivo_recusa || "não informado") + ". Fale com a equipe para resolver."
        : p.status === "pendente"
          ? "Recebemos seu cadastro, " + esc(primeiroNome(p.nome)) + ". A equipe ZXT confere seus dados e libera seu acesso. Assim que aprovar, é só entrar de novo."
          : "Seu acesso está " + esc(p.status) + ". Fale com a recepção para reativar.") + "</p>" +
      '<a class="btn btn-vermelho" target="_blank" rel="noopener" href="https://ig.me/m/zxtoficial">Falar com a ZXT</a>' +
      '<button class="link" id="recarregar">Já fui aprovado? Atualizar</button></div>';
    $("#recarregar").onclick = function () { location.reload(); };
  }

  function montarMenu() {
    $("#quem-papel").textContent = NOME_PAPEL[S.modo];
    $("#nav").innerHTML = MENUS[S.modo].map(function (m) {
      return '<a href="#/' + m[0] + '" data-r="' + m[0] + '">' + ic(m[2]) + "<span>" + m[1] + '</span><span class="bolha" hidden></span></a>';
    }).join("");
    if (S.modo === "admin") sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pendente").then(function (r) {
      var b = $('#nav [data-r="aprovacoes"] .bolha');
      if (b && r.count) { b.hidden = false; b.textContent = r.count; }
    });
  }

  var VIEWS = {};
  function rotear() {
    var r = (location.hash.replace(/^#\/?/, "").split("?")[0]) || MENUS[S.modo][0][0];
    if (r === "nova-senha") return novaSenha();
    var permitido = MENUS[S.modo].some(function (m) { return m[0] === r; });
    if (!permitido) r = MENUS[S.modo][0][0];
    U.$$("#nav a").forEach(function (a) { a.classList.toggle("ativo", a.getAttribute("data-r") === r); });
    tela.innerHTML = '<p class="carregando">Carregando...</p>';
    window.scrollTo(0, 0);
    Promise.resolve().then(function () { return VIEWS[r](); }).catch(falhou);
  }
  window.addEventListener("hashchange", function () { if (S.modo) rotear(); });

  function novaSenha() {
    modal("Criar nova senha", '<div class="campo"><label for="ns">Nova senha (mínimo 8)</label><input id="ns" type="password" minlength="8"></div>',
      [["Salvar", function (f) {
        var v = f.querySelector("#ns").value;
        if (v.length < 8) { U.toast("A senha precisa de 8 caracteres.", "erro"); return false; }
        return sb.auth.updateUser({ password: v }).then(function (r) {
          if (r.error) { U.erro(r.error); return false; }
          U.toast("Senha atualizada 🔥"); location.hash = "";
        });
      }]]);
  }

  // =================================================================== ALUNO
  function cartaoPlano(planos) {
    if (!planos || !planos.length) return "";
    return planos.map(function (p) {
      var lim = p.aulas_semana, usadas = p.usadas || 0;
      var pct = lim ? Math.min(100, Math.round(usadas / lim * 100)) : 0;
      return '<div class="cartao" style="margin-bottom:12px"><p style="margin:0 0 6px;color:var(--cinza);font-size:14px">Seu plano</p>' +
        '<h3 style="margin:0 0 6px;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:22px">' + esc(p.plano) + "</h3>" +
        '<p style="margin:0 0 10px;color:var(--cinza);font-size:14px">' + esc(p.modalidades.length ? p.modalidades.join(", ") : "Todas as modalidades") + " · sparring de sexta liberado</p>" +
        (lim ? '<p style="margin:0 0 6px"><b>' + usadas + " de " + lim + "</b> aulas usadas nesta semana (seg a dom)</p><div class=\"barra\"><i style=\"width:" + pct + '%"></i></div>'
             : "<p style=\"margin:0\"><b>Aulas livres</b> na semana</p>") + "</div>";
    }).join("");
  }

  function minhasMatriculas() {
    return sb.from("matriculas").select("turma_id, turmas(id,nome,modalidade_id,coletiva,sparring,dias_semana,hora_inicio, modalidades(nome,slug))").eq("aluno_id", S.user.id).then(chk);
  }

  VIEWS.inicio = function () {
    var agora = new Date().toISOString();
    return Promise.all([
      sb.from("reservas").select("status, aulas!inner(id,inicio,status, turmas(nome))").eq("aluno_id", S.user.id).in("status", ["reservada", "espera"]).gte("aulas.inicio", agora).order("created_at"),
      sb.from("reservas").select("id, aulas!inner(inicio)", { count: "exact", head: true }).eq("aluno_id", S.user.id).eq("status", "presente").gte("aulas.inicio", inicioMes()),
      sb.from("cobrancas").select("id,descricao,vencimento,valor_final_centavos,status").eq("aluno_id", S.user.id).in("status", ["em_aberto", "atrasado"]).order("vencimento"),
      sb.from("graduacoes_aluno").select("data, grau, graduacao_niveis(nome,cor), modalidades(nome)").eq("aluno_id", S.user.id).order("data", { ascending: false }),
      sb.from("reservas").select("id, aulas!inner(inicio)", { count: "exact", head: true }).eq("aluno_id", S.user.id).eq("status", "presente"),
      sb.rpc("meu_plano")
    ]).then(function (r) {
      var planoHtml = cartaoPlano(r[5].data);
      var prox = chk(r[0]).sort(function (a, b) { return a.aulas.inicio < b.aulas.inicio ? -1 : 1; });
      var mes = r[1].count || 0, total = r[4].count || 0;
      var abertas = chk(r[2]), grads = chk(r[3]);
      var atual = {}; grads.forEach(function (g) { if (!atual[g.modalidades.nome]) atual[g.modalidades.nome] = g; });
      var marcos = [10, 50, 100, 200, 500], prox_m = marcos.filter(function (m) { return m > total; })[0] || total;
      var linkInd = location.origin + "/entrar?ref=" + S.perfil.codigo_indicacao;
      tela.innerHTML =
        "<h1>Bora treinar, <em>" + esc(primeiroNome(S.perfil.nome)) + "</em> 🥊</h1>" +
        '<p class="sub">Disciplina também é respeito por você.</p>' + planoHtml +
        '<div class="kpis">' +
        '<div class="kpi"><b>' + mes + "</b><span>Treinos no mês</span></div>" +
        '<div class="kpi"><b>' + total + "</b><span>Treinos no total</span></div>" +
        '<div class="kpi"><b>' + prox.length + "</b><span>Aulas reservadas</span></div>" +
        '<div class="kpi' + (abertas.length ? " alerta" : "") + '"><b>' + abertas.length + "</b><span>Mensalidades abertas</span></div></div>" +
        '<div class="cartao" style="margin-top:12px"><p style="margin:0 0 8px;color:var(--cinza)">Próxima conquista: <b style="color:#fff">' + prox_m + " treinos</b></p>" +
        '<div class="barra"><i style="width:' + Math.min(100, Math.round(total / prox_m * 100)) + '%"></i></div></div>' +
        "<h2>Próximas aulas</h2>" +
        (prox.length ? '<div class="lista">' + prox.slice(0, 4).map(function (x) {
          return '<div class="item destaque"><div><h3>' + esc(x.aulas.turmas.nome) + "</h3><p>" + esc(U.diaSemana(x.aulas.inicio)) + " às " + U.hora(x.aulas.inicio) + "</p></div>" + tagStatus(x.status) + "</div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhuma aula reservada. <a href="#/agenda" style="color:#fff">Reservar agora</a></div>') +
        (abertas.length ? "<h2>Mensalidades</h2><div class=\"lista\">" + abertas.map(function (c) {
          return '<div class="item"><div><h3>' + U.reais(c.valor_final_centavos) + "</h3><p>" + esc(c.descricao) + " · vence " + U.data(c.vencimento) + "</p></div>" + tagStatus(c.status) + "</div>";
        }).join("") + "</div>" : "") +
        "<h2>Graduação</h2>" +
        (Object.keys(atual).length ? '<div class="lista">' + Object.keys(atual).map(function (k) {
          var g = atual[k];
          return '<div class="item"><div><h3>' + esc(k) + "</h3><p>" + esc(g.graduacao_niveis.nome) + (g.grau ? " · " + g.grau + "º grau" : "") + " desde " + U.data(g.data) + "</p></div>" +
            '<span style="width:28px;height:28px;border:1px solid #444;background:' + esc(g.graduacao_niveis.cor || "#333") + '"></span></div>';
        }).join("") + "</div>" : '<div class="vazio-box">Sua graduação aparece aqui quando o professor registrar.</div>') +
        "<h2>Indique um amigo</h2>" +
        '<div class="cartao"><p style="margin:0 0 12px;color:var(--cinza)">Mande seu link. Quem se cadastrar por ele fica registrado como sua indicação.</p>' +
        '<div class="busca"><input readonly value="' + esc(linkInd) + '" id="link-ind"><button class="btn-mini" id="copiar-ind">Copiar</button>' +
        '<a class="btn-mini claro" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent("Bora treinar comigo na ZXT! 🥊 Faz teu cadastro: " + linkInd) + '">WhatsApp</a></div></div>';
      $("#copiar-ind").onclick = function () { navigator.clipboard.writeText(linkInd).then(function () { U.toast("Link copiado"); }); };
    });
  };

  VIEWS.agenda = function () {
    var agora = new Date(), ate = new Date(agora.getTime() + 8 * 864e5);
    return Promise.all([minhasMatriculas(), sb.rpc("meu_plano")]).then(function (pr) {
      var mats = pr[0], planoHtml = cartaoPlano(pr[1].data);
      var planos = pr[1].data || [];
      var cobre = function (mod) { return !planos.length || planos.some(function (p) { return !p.modalidade_ids.length || p.modalidade_ids.indexOf(mod) >= 0; }); };
      var turmasMinhas = mats.map(function (m) { return m.turma_id; });
      var modsMinhas = mats.map(function (m) { return m.turmas.modalidade_id; });
      return sb.from("aulas").select("id,inicio,fim,status,turma_id, turmas(nome,coletiva,sparring,modalidade_id)")
        .gte("inicio", agora.toISOString()).lte("inicio", ate.toISOString()).order("inicio").then(chk).then(function (aulas) {
          aulas = aulas.filter(function (a) {
            return a.turmas.coletiva || turmasMinhas.indexOf(a.turma_id) >= 0 || modsMinhas.indexOf(a.turmas.modalidade_id) >= 0;
          });
          var ids = aulas.map(function (a) { return a.id; });
          return (ids.length ? sb.from("reservas").select("aula_id,status").eq("aluno_id", S.user.id).in("aula_id", ids).then(chk) : Promise.resolve([]))
            .then(function (res) {
              var st = {}; res.forEach(function (x) { st[x.aula_id] = x.status; });
              var dia = "", html = "<h1>Minha <em>agenda</em></h1><p class=\"sub\">Próximos 7 dias das suas turmas e do sparring de sexta. Cancelamento até 2h antes.</p>" + planoHtml;
              if (!mats.length) html += '<div class="vazio-box" style="margin-bottom:16px">Você ainda não está matriculado em nenhuma turma. Fale com a recepção.</div>';
              if (!aulas.length) html += '<div class="vazio-box">Nenhuma aula nos próximos dias.</div>';
              html += '<div class="lista">';
              aulas.forEach(function (a) {
                var d = U.diaSemana(a.inicio);
                if (d !== dia) { html += '<p class="dia-sep">' + esc(d) + "</p>"; dia = d; }
                var s = st[a.id], cancelada = a.status === "cancelada";
                var botao = cancelada ? tagStatus("cancelada")
                  : (s === "reservada" || s === "espera") ? tagStatus(s) + ' <button class="btn-mini claro" data-cancelar="' + a.id + '">Cancelar</button>'
                  : s === "presente" ? tagStatus("presente")
                  : (!a.turmas.coletiva && !cobre(a.turmas.modalidade_id)) ? '<span class="tag neutro">Fora do plano</span>'
                  : '<button class="btn-mini" data-reservar="' + a.id + '">Reservar</button>';
                html += '<div class="item' + (s === "reservada" ? " destaque" : "") + '"><div><h3>' + U.hora(a.inicio) + " · " + esc(a.turmas.nome) + "</h3><p>" +
                  (a.turmas.sparring ? "Treino coletivo de toda a equipe" : "Até " + U.hora(a.fim)) + "</p></div><div class=\"acoes\">" + botao + "</div></div>";
              });
              tela.innerHTML = html + "</div>";
              tela.onclick = function (e) {
                var r = e.target.closest("[data-reservar]"), c = e.target.closest("[data-cancelar]");
                if (r) { r.disabled = true; sb.rpc("reservar_aula", { p_aula: r.getAttribute("data-reservar") }).then(function (x) {
                  if (x.error) { r.disabled = false; return U.erro(x.error); }
                  U.toast(x.data.status === "espera" ? "Turma cheia: você entrou na lista de espera." : "Vaga garantida, guerreiro 🔥"); rotear(); }); }
                if (c) { c.disabled = true; sb.rpc("cancelar_reserva", { p_aula: c.getAttribute("data-cancelar") }).then(function (x) {
                  if (x.error) { c.disabled = false; return U.erro(x.error); }
                  U.toast("Reserva cancelada."); rotear(); }); }
              };
            });
        });
    });
  };

  VIEWS.checkin = function () {
    var tok = S.tokenCheckin;
    S.tokenCheckin = null;
    try { sessionStorage.removeItem("zxt_checkin"); } catch (e) {}
    tela.innerHTML = "<h1>Check-<em>in</em></h1>" +
      '<p class="sub">Na recepção, aponte a câmera do celular para o QR code da ZXT. O check-in abre 30 minutos antes da aula e vai até o fim dela.</p>' +
      '<div class="cartao" id="ck-res"></div>' +
      '<h2>Sem câmera?</h2><div class="cartao"><p style="margin:0 0 10px;color:var(--cinza)">Peça o código à recepção e digite aqui.</p>' +
      '<div class="busca"><input id="ck-cod" placeholder="Código do QR" autocomplete="off" autocapitalize="off"><button class="btn-mini" id="ck-ok">Fazer check-in</button></div></div>';
    function mostrar(html) { S.ultimoCheckin = html; var el = $("#ck-res"); if (el) el.innerHTML = html; }
    function fazer(t) {
      mostrar('<p class="carregando" style="padding:0">Registrando seu check-in...</p>');
      return sb.rpc("fazer_checkin", { p_token: String(t).trim().toLowerCase() }).then(function (x) {
        if (x.error) {
          var dica = /Nenhuma aula/.test(x.error.message) ? "<br><small style=\"color:var(--cinza)\">Confira o horário da sua turma na Agenda. Se a aula já começou, peça ao professor para marcar sua presença na chamada.</small>" : "";
          return mostrar('<p style="margin:0"><span class="tag risco">Não registrado</span> ' + esc(x.error.message) + dica + "</p>");
        }
        mostrar('<h3 style="margin:0;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:28px">Check-in feito, guerreiro 🔥</h3><p style="color:var(--cinza);margin:6px 0 0">Presença registrada às ' + U.hora(x.data.checkin_em) + ". Bom treino!</p>");
      });
    }
    $("#ck-ok").onclick = function () { var v = $("#ck-cod").value; if (v) fazer(v); };
    if (tok) return fazer(tok);
    $("#ck-res").innerHTML = S.ultimoCheckin || '<p style="margin:0;color:var(--cinza)">Aguardando leitura do QR code da recepção.</p>';
  };

  VIEWS.financeiro = function () {
    return sb.from("cobrancas").select("*").eq("aluno_id", S.user.id).order("vencimento", { ascending: false }).then(chk).then(function (cs) {
      tela.innerHTML = "<h1>Minhas <em>mensalidades</em></h1><p class=\"sub\">Pagamento online por Pix, boleto e cartão entra na próxima etapa. Por enquanto, pague na recepção ou pelo Pix da academia.</p>" +
        (cs.length ? '<div class="lista">' + cs.map(function (c) {
          return '<div class="item' + (c.status === "atrasado" ? " destaque" : "") + '"><div><h3>' + U.reais(c.valor_final_centavos) + "</h3><p>" + esc(c.descricao) +
            " · vence " + U.data(c.vencimento) + (c.desconto_centavos ? " · desconto de " + U.reais(c.desconto_centavos) : "") +
            (c.pago_em ? " · pago em " + U.data(c.pago_em) : "") + "</p></div>" + tagStatus(c.status) + "</div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhuma mensalidade lançada ainda.</div>');
    });
  };

  VIEWS.graduacao = function () {
    return minhasMatriculas().then(function (mats) {
      var mods = {}; mats.forEach(function (m) { mods[m.turmas.modalidade_id] = m.turmas.modalidades.nome; });
      var ids = Object.keys(mods);
      if (!ids.length) { tela.innerHTML = '<h1>Minha <em>graduação</em></h1><div class="vazio-box">Matricule-se numa turma para acompanhar sua graduação.</div>'; return; }
      return Promise.all([
        sb.from("graduacao_niveis").select("*").in("modalidade_id", ids).eq("infantil", false).order("ordem").then(chk),
        sb.from("graduacoes_aluno").select("*, graduacao_niveis(nome,ordem,cor)").eq("aluno_id", S.user.id).order("data", { ascending: false }).then(chk),
        sb.from("graduacao_requisitos").select("*").order("ordem").then(chk),
        sb.from("aluno_tecnicas").select("requisito_id").eq("aluno_id", S.user.id).then(chk),
        sb.from("reservas").select("aulas!inner(inicio, turmas!inner(modalidade_id))").eq("aluno_id", S.user.id).eq("status", "presente").then(chk)
      ]).then(function (r) {
        var niveis = r[0], hist = r[1], reqs = r[2], feitas = r[3].map(function (x) { return x.requisito_id; }), pres = r[4];
        var html = '<h1>Minha <em>graduação</em></h1><p class="sub">Muay Thai gradua por prajied. Jiu-Jitsu por faixa e grau. Boxe e MMA por nível.</p>';
        ids.forEach(function (mid) {
          var atual = hist.filter(function (h) { return h.modalidade_id === mid; })[0];
          var lista = niveis.filter(function (n) { return n.modalidade_id === mid; });
          var ordemAtual = atual ? atual.graduacao_niveis.ordem : 0;
          var prox = lista.filter(function (n) { return n.ordem > ordemAtual; })[0];
          var desde = atual ? atual.data : (S.perfil.aprovado_em || S.perfil.created_at).slice(0, 10);
          var aulas = pres.filter(function (p) { return p.aulas.turmas.modalidade_id === mid && p.aulas.inicio.slice(0, 10) >= desde; }).length;
          var meses = Math.floor((Date.now() - new Date(desde + "T12:00:00")) / (30.44 * 864e5));
          html += '<div class="cartao"><h2 style="margin:0 0 6px">' + esc(mods[mid]) + "</h2>" +
            '<p style="margin:0 0 14px;color:var(--cinza)">Atual: <b style="color:#fff">' + (atual ? esc(atual.graduacao_niveis.nome) + (atual.grau ? " · " + atual.grau + "º grau" : "") : "Sem graduação registrada") + "</b></p>";
          if (prox) {
            var rq = reqs.filter(function (q) { return q.nivel_id === prox.id; });
            var ok = rq.filter(function (q) { return feitas.indexOf(q.id) >= 0; }).length;
            var partes = [], soma = 0, n = 0;
            if (prox.tempo_minimo_meses) { partes.push("Tempo: " + Math.min(meses, prox.tempo_minimo_meses) + "/" + prox.tempo_minimo_meses + " meses"); soma += Math.min(1, meses / prox.tempo_minimo_meses); n++; }
            if (prox.aulas_minimas) { partes.push("Aulas: " + Math.min(aulas, prox.aulas_minimas) + "/" + prox.aulas_minimas); soma += Math.min(1, aulas / prox.aulas_minimas); n++; }
            if (rq.length) { partes.push("Técnicas: " + ok + "/" + rq.length); soma += ok / rq.length; n++; }
            var pct = n ? Math.round(soma / n * 100) : 0;
            html += '<p style="margin:0 0 8px">Próximo: <b>' + esc(prox.nome) + "</b> · " + pct + "% pronto</p>" +
              '<div class="barra"><i style="width:' + pct + '%"></i></div>' +
              '<p style="margin:10px 0 0;color:var(--cinza);font-size:14px">' + (partes.length ? esc(partes.join(" · ")) : "Os requisitos desse nível ainda não foram configurados pela equipe.") + "</p>" +
              (rq.length ? '<ul style="margin:12px 0 0;padding-left:18px;color:var(--cinza);font-size:14px">' + rq.map(function (q) {
                return "<li>" + (feitas.indexOf(q.id) >= 0 ? "✅ " : "⬜ ") + esc(q.descricao) + "</li>"; }).join("") + "</ul>" : "");
          } else if (atual) { html += "<p style=\"margin:0\">Graduação máxima da modalidade 🔥</p>"; }
          html += "</div>";
        });
        var h = hist.length ? '<h2>Histórico</h2><div class="lista">' + hist.map(function (g) {
          return '<div class="item"><div><h3>' + esc(g.graduacao_niveis.nome) + (g.grau ? " · " + g.grau + "º grau" : "") + "</h3><p>" + U.data(g.data) + " · certificado " + esc(g.certificado_codigo) + "</p></div></div>";
        }).join("") + "</div>" : "";
        tela.innerHTML = html + h;
      });
    });
  };

  VIEWS.perfil = function () {
    var p = S.perfil;
    function campo(id, rot, val, tipo) { return '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" type="' + (tipo || "text") + '" value="' + esc(val || "") + '"></div>'; }
    tela.innerHTML = "<h1>Meu <em>perfil</em></h1><p class=\"sub\">" + esc(S.user.email) + "</p>" +
      '<form class="form" id="f-perfil">' + campo("p-nome", "Nome", p.nome) +
      '<div class="linha2">' + campo("p-whats", "WhatsApp", p.whatsapp, "tel") + campo("p-nasc", "Nascimento", p.data_nascimento, "date") + "</div>" +
      '<div class="linha2">' + campo("p-en", "Contato de emergência", p.contato_emergencia_nome) + campo("p-et", "Telefone de emergência", p.contato_emergencia_telefone, "tel") + "</div>" +
      '<div class="campo"><label for="p-saude">Lesões ou condições de saúde</label><textarea id="p-saude" rows="2">' + esc(p.saude_obs || "") + "</textarea></div>" +
      campo("p-fed", "Federação (ex.: FAMERN)", p.federacao) +
      '<button class="btn btn-vermelho" type="submit">Salvar</button></form>' +
      "<h2>Seus dados (LGPD)</h2><div class=\"cartao\"><p style=\"margin:0 0 12px;color:var(--cinza)\">Baixe uma cópia de tudo que a ZXT guarda sobre você, ou peça a exclusão da conta.</p>" +
      '<div class="busca"><button class="btn-mini claro" id="exportar">Baixar meus dados</button><button class="btn-mini claro" id="trocar-senha">Trocar senha</button>' +
      '<button class="btn-mini" id="excluir">' + (p.exclusao_solicitada_em ? "Exclusão solicitada em " + U.data(p.exclusao_solicitada_em) : "Pedir exclusão da conta") + "</button></div></div>";
    $("#f-perfil").onsubmit = function (e) {
      e.preventDefault();
      var dados = { nome: $("#p-nome").value.trim(), whatsapp: $("#p-whats").value.trim(), data_nascimento: $("#p-nasc").value || null,
        contato_emergencia_nome: $("#p-en").value.trim(), contato_emergencia_telefone: $("#p-et").value.trim(),
        saude_obs: $("#p-saude").value.trim() || null, federacao: $("#p-fed").value.trim() || null };
      sb.from("profiles").update(dados).eq("id", S.user.id).select().single().then(function (r) {
        if (r.error) return U.erro(r.error);
        S.perfil = r.data; $("#quem-nome").textContent = primeiroNome(r.data.nome); U.toast("Perfil salvo");
      });
    };
    $("#exportar").onclick = function () {
      sb.rpc("exportar_meus_dados").then(function (r) {
        if (r.error) return U.erro(r.error);
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
        a.download = "meus-dados-zxt.json"; a.click();
      });
    };
    $("#trocar-senha").onclick = novaSenha;
    $("#excluir").onclick = function () {
      if (p.exclusao_solicitada_em) return;
      modal("Pedir exclusão da conta", "<p style=\"color:var(--cinza)\">A equipe ZXT vai excluir seus dados pessoais. Registros financeiros obrigatórios por lei ficam guardados pelo prazo legal. Confirma?</p>",
        [["Voltar", null, "claro"], ["Confirmar pedido", function () {
          return sb.from("profiles").update({ exclusao_solicitada_em: new Date().toISOString() }).eq("id", S.user.id).select().single().then(function (r) {
            if (r.error) return U.erro(r.error); S.perfil = r.data; U.toast("Pedido registrado."); rotear();
          });
        }]]);
    };
  };

  // =================================================================== PROFESSOR
  VIEWS.chamada = function () {
    var dia = (location.hash.match(/dia=(\d{4}-\d{2}-\d{2})/) || [])[1] || U.hojeISO();
    var ini = new Date(dia + "T00:00:00-03:00"), fim = new Date(dia + "T23:59:59-03:00");
    var q = sb.from("aulas").select("id,inicio,fim,status,turma_id, turmas!inner(nome,professor_id,coletiva,sparring)").gte("inicio", ini.toISOString()).lte("inicio", fim.toISOString()).order("inicio");
    return q.then(chk).then(function (aulas) {
      if (S.modo === "professor") aulas = aulas.filter(function (a) { return !a.turmas.professor_id || a.turmas.professor_id === S.user.id; });
      tela.innerHTML = "<h1><em>Chamada</em></h1><p class=\"sub\">Escolha a aula para marcar presença. O check-in por QR aparece aqui na hora.</p>" +
        '<div class="busca"><input type="date" id="ch-dia" value="' + dia + '"></div>' +
        (aulas.length ? '<div class="lista">' + aulas.map(function (a) {
          return '<div class="item"><div><h3>' + U.hora(a.inicio) + " · " + esc(a.turmas.nome) + "</h3><p>" + (a.status === "cancelada" ? "Cancelada" : "Até " + U.hora(a.fim)) + "</p></div>" +
            '<div class="acoes"><button class="btn-mini" data-aula="' + a.id + '">Abrir chamada</button></div></div>';
        }).join("") + "</div>" : '<div class="vazio-box">Nenhuma aula nesse dia.</div>');
      $("#ch-dia").onchange = function () { location.hash = "#/chamada?dia=" + this.value; };
      tela.onclick = function (e) { var b = e.target.closest("[data-aula]"); if (b) abrirChamada(aulas.filter(function (a) { return a.id === b.getAttribute("data-aula"); })[0]); };
    });
  };

  function abrirChamada(aula) {
    var t = aula.turmas;
    Promise.all([
      sb.from("matriculas").select("aluno_id, profiles(id,nome,whatsapp,saude_obs)").eq("turma_id", aula.turma_id).then(chk),
      sb.from("reservas").select("aluno_id,status,fez_sparring,checkin_metodo, profiles!reservas_aluno_id_fkey(id,nome,whatsapp,saude_obs)").eq("aula_id", aula.id).then(chk)
    ]).then(function (r) {
      var alunos = {}, res = {};
      r[0].forEach(function (m) { if (m.profiles) alunos[m.aluno_id] = m.profiles; });
      r[1].forEach(function (x) { res[x.aluno_id] = x; if (x.profiles) alunos[x.aluno_id] = x.profiles; });
      var ids = Object.keys(alunos).sort(function (a, b) { return (alunos[a].nome || "").localeCompare(alunos[b].nome || ""); });
      var pres = r[1].filter(function (x) { return x.status === "presente"; }).length;
      tela.innerHTML = '<button class="link" id="voltar">← Voltar</button><h1 style="margin-top:10px">' + esc(t.nome) + "</h1>" +
        '<p class="sub">' + esc(U.diaSemana(aula.inicio)) + " às " + U.hora(aula.inicio) + " · <b>" + pres + "</b> presentes de " + ids.length + "</p>" +
        (t.coletiva ? '<div class="busca"><input id="add-busca" placeholder="Adicionar aluno de outra turma (nome)"><button class="btn-mini claro" id="add-ok">Buscar</button></div><div id="add-res"></div>' : "") +
        '<div class="cartao">' + (ids.length ? ids.map(function (id) {
          var a = alunos[id], x = res[id] || {};
          return '<div class="chamada-linha"><div><b>' + esc(a.nome || "Sem nome") + "</b> " + (x.status ? tagStatus(x.status) : "") +
            (x.checkin_metodo === "qr" ? ' <span class="tag info">QR</span>' : "") +
            (a.saude_obs ? '<p style="margin:4px 0 0;color:#f2a20c;font-size:13px">⚠ ' + esc(a.saude_obs) + "</p>" : "") + "</div>" +
            '<div class="botoes">' + (t.sparring ? '<label class="check" style="font-size:13px"><input type="checkbox" data-sp="' + id + '"' + (x.fez_sparring ? " checked" : "") + "> Sparring</label>" : "") +
            '<button class="btn-mini verde" data-p="' + id + '">Presente</button><button class="btn-mini claro" data-f="' + id + '">Falta</button>' +
            '<button class="btn-mini claro" data-obs="' + id + '" title="Observação">Obs.</button></div></div>';
        }).join("") : '<p class="vazio">Nenhum aluno matriculado ou com reserva nessa aula.</p>') + "</div>";
      $("#voltar").onclick = function () { VIEWS.chamada(); };
      ids.forEach(function (id) {
        if (t.coletiva) return;
        sb.rpc("alerta_plano", { p_aluno: id, p_aula: aula.id }).then(function (x) {
          var st = res[id] && res[id].status;
          if (!x.data || st === "presente" || st === "reservada") return;
          var el = tela.querySelector('[data-p="' + id + '"]');
          if (el) el.closest(".chamada-linha").querySelector("div").insertAdjacentHTML("beforeend", '<p style="margin:4px 0 0;color:#f2a20c;font-size:13px">Acima do plano: ' + esc(x.data) + "</p>");
        });
      });
      function marcar(id, presente) {
        var sp = tela.querySelector('[data-sp="' + id + '"]');
        sb.rpc("marcar_presenca", { p_aula: aula.id, p_aluno: id, p_presente: presente, p_sparring: !!(sp && sp.checked) }).then(function (x) {
          if (x.error) return U.erro(x.error); U.toast(presente ? "Presença marcada" : "Falta marcada"); abrirChamada(aula);
        });
      }
      tela.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-p]"))) marcar(b.getAttribute("data-p"), true);
        if ((b = e.target.closest("[data-f]"))) marcar(b.getAttribute("data-f"), false);
        if ((b = e.target.closest("[data-obs]"))) observacao(b.getAttribute("data-obs"), alunos[b.getAttribute("data-obs")].nome);
        if ((b = e.target.closest("[data-add]"))) marcar(b.getAttribute("data-add"), true);
        if (e.target.id === "add-ok") {
          var nome = $("#add-busca").value.trim(); if (nome.length < 2) return;
          sb.from("profiles").select("id,nome").eq("status", "ativo").ilike("nome", "%" + nome + "%").limit(8).then(function (r) {
            $("#add-res").innerHTML = '<div class="lista" style="margin-bottom:12px">' + (r.data || []).map(function (p) {
              return '<div class="item"><div><h3>' + esc(p.nome) + '</h3></div><button class="btn-mini" data-add="' + p.id + '">Marcar presente</button></div>'; }).join("") + "</div>";
          });
        }
      };
    }).catch(falhou);
  }

  function observacao(id, nome) {
    sb.from("profiles").select("observacoes_professor").eq("id", id).single().then(function (r) {
      modal("Observação · " + (nome || ""), '<div class="campo"><label for="obs-t">Visível só para a equipe</label><textarea id="obs-t" rows="5">' + esc((r.data || {}).observacoes_professor || "") + "</textarea></div>",
        [["Cancelar", null, "claro"], ["Salvar", function (f) {
          return sb.rpc("salvar_observacao_professor", { p_aluno: id, p_texto: f.querySelector("#obs-t").value }).then(function (x) {
            if (x.error) { U.erro(x.error); return false; } U.toast("Observação salva");
          });
        }]]);
    });
  }

  VIEWS.alunos = function () {
    var admin = S.modo === "admin";
    return sb.from("profiles").select("id,nome,email,whatsapp,status,data_nascimento,saude_obs,created_at,aprovado_em,modalidades_interesse").order("nome").then(chk).then(function (ps) {
      tela.innerHTML = "<h1><em>Alunos</em></h1><p class=\"sub\">" + ps.length + " cadastros.</p>" +
        '<div class="busca"><input id="a-busca" placeholder="Buscar por nome"><select id="a-status"><option value="">Todos os status</option>' +
        ["ativo", "pendente", "trancado", "inativo", "recusado"].map(function (s) { return '<option value="' + s + '"' + (s === "ativo" && !admin ? " selected" : "") + ">" + s + "</option>"; }).join("") +
        '</select><select id="a-aniv"><option value="">Todos</option><option value="1">Aniversariantes do mês</option></select>' + (admin ? '<button class="btn-mini claro" id="a-csv">Exportar CSV</button>' : "") + "</div><div class=\"lista\" id=\"a-lista\"></div>";
      var mesAtual = U.hojeISO().slice(5, 7);
      function filtrar() {
        var b = $("#a-busca").value.toLowerCase(), s = $("#a-status").value, an = $("#a-aniv").value;
        var l = ps.filter(function (p) {
          return (!b || (p.nome || "").toLowerCase().indexOf(b) >= 0) && (!s || p.status === s) && (!an || (p.data_nascimento || "").slice(5, 7) === mesAtual);
        });
        $("#a-lista").innerHTML = l.length ? l.map(function (p) {
          return '<div class="item"><div><h3>' + esc(p.nome || p.email) + "</h3><p>" + esc((p.modalidades_interesse || []).join(", ")) + (p.saude_obs ? " · ⚠ saúde" : "") + "</p></div>" +
            '<div class="acoes">' + tagStatus(p.status) + ' <button class="btn-mini claro" data-ficha="' + p.id + '">Ficha</button>' +
            (p.whatsapp ? ' <a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(p.whatsapp, "Olá, " + primeiroNome(p.nome) + "! Aqui é da ZXT 🥊") + '">WhatsApp</a>' : "") + "</div></div>";
        }).join("") : '<div class="vazio-box">Ninguém encontrado.</div>';
      }
      ["a-busca", "a-status", "a-aniv"].forEach(function (id) { $("#" + id).oninput = filtrar; });
      filtrar();
      if (admin) $("#a-csv").onclick = function () {
        var linhas = [["nome", "email", "whatsapp", "status", "nascimento", "modalidades"]].concat(ps.map(function (p) {
          return [p.nome, p.email, p.whatsapp, p.status, p.data_nascimento, (p.modalidades_interesse || []).join(" ")]; }));
        var csv = linhas.map(function (l) { return l.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n");
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "alunos-zxt.csv"; a.click();
      };
      tela.onclick = function (e) { var f = e.target.closest("[data-ficha]"); if (f) ficha(f.getAttribute("data-ficha")); };
    });
  };

  function ficha(id) {
    var admin = S.modo === "admin";
    Promise.all([
      sb.from("profiles").select("*").eq("id", id).single().then(chk),
      sb.from("matriculas").select("turmas(nome)").eq("aluno_id", id).then(chk),
      sb.from("reservas").select("id, aulas!inner(inicio)", { count: "exact", head: true }).eq("aluno_id", id).eq("status", "presente").gte("aulas.inicio", inicioMes()),
      sb.from("user_roles").select("papel").eq("user_id", id).then(chk)
    ]).then(function (r) {
      var p = r[0], papeis = r[3].map(function (x) { return x.papel; });
      var idade = U.idade(p.data_nascimento);
      function l(rot, v) { return v ? "<p style=\"margin:0 0 6px\"><span style=\"color:var(--cinza-2)\">" + rot + ":</span> " + esc(v) + "</p>" : ""; }
      var html = l("Status", p.status) + l("E-mail", p.email) + l("WhatsApp", p.whatsapp) + l("Idade", idade !== null ? idade + " anos" : "") +
        (admin ? l("CPF", p.cpf) : "") + l("Turmas", r[1].map(function (m) { return m.turmas.nome; }).join(", ")) + l("Treinos no mês", String(r[2].count || 0)) +
        l("Emergência", [p.contato_emergencia_nome, p.contato_emergencia_telefone].filter(Boolean).join(" · ")) + l("Saúde", p.saude_obs) +
        l("Responsável", [p.responsavel_nome, p.responsavel_whatsapp].filter(Boolean).join(" · ")) + l("Federação", p.federacao) +
        l("Observações do professor", p.observacoes_professor) + l("Papéis", papeis.join(", "));
      if (admin) html += '<div class="campo" style="margin-top:12px"><label for="f-st">Mudar status</label><select class="sel" id="f-st">' +
        ["ativo", "trancado", "inativo", "pendente", "recusado"].map(function (s) { return '<option' + (s === p.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div>";
      var bots = [["Fechar", null, "claro"], ["Observação", function () { observacao(id, p.nome); }, "claro"]];
      if (admin) {
        bots.push([papeis.indexOf("professor") >= 0 ? "Tirar de professor" : "Tornar professor", function () {
          var q = papeis.indexOf("professor") >= 0 ? sb.from("user_roles").delete().eq("user_id", id).eq("papel", "professor") : sb.from("user_roles").insert({ user_id: id, papel: "professor" });
          return q.then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Papel atualizado"); });
        }, "claro"]);
        bots.push(["Salvar status", function (f) {
          return sb.from("profiles").update({ status: f.querySelector("#f-st").value }).eq("id", id).then(function (x) {
            if (x.error) { U.erro(x.error); return false; } U.toast("Status atualizado"); rotear();
          });
        }]);
      }
      modal(p.nome || "Aluno", html, bots);
    }).catch(function (e) { U.erro(e); });
  }

  // =================================================================== ADMIN
  VIEWS.painel = function () {
    var mes = inicioMes(), h14 = new Date(Date.now() - 14 * 864e5).toISOString();
    return Promise.all([
      sb.from("profiles").select("id,nome,whatsapp,status,aprovado_em"),
      sb.from("cobrancas").select("valor_final_centavos,status,vencimento,pago_em"),
      sb.from("reservas").select("aluno_id, aulas!inner(inicio)").eq("status", "presente").gte("aulas.inicio", h14),
      sb.from("leads").select("status,created_at").gte("created_at", mes),
      sb.from("reservas").select("aula_id, aulas!inner(inicio, turmas(nome))").eq("status", "presente").gte("aulas.inicio", mes)
    ]).then(function (r) {
      var ps = chk(r[0]), cs = chk(r[1]), rec = chk(r[2]), leads = chk(r[3]), presMes = chk(r[4]);
      var ativos = ps.filter(function (p) { return p.status === "ativo"; });
      var pend = ps.filter(function (p) { return p.status === "pendente"; }).length;
      var novos = ps.filter(function (p) { return p.aprovado_em && p.aprovado_em.slice(0, 10) >= mes; }).length;
      var soma = function (l) { return l.reduce(function (s, c) { return s + c.valor_final_centavos; }, 0); };
      var recebido = soma(cs.filter(function (c) { return c.status === "pago" && c.pago_em && c.pago_em.slice(0, 10) >= mes; }));
      var previsto = soma(cs.filter(function (c) { return c.vencimento >= mes && c.vencimento.slice(0, 7) === mes.slice(0, 7) && c.status !== "cancelado" && c.status !== "isento"; }));
      var atraso = cs.filter(function (c) { return c.status === "atrasado"; });
      var comTreino = {}; rec.forEach(function (x) { comTreino[x.aluno_id] = 1; });
      var risco = ativos.filter(function (p) { return !comTreino[p.id]; });
      var porTurma = {}; presMes.forEach(function (x) { var n = x.aulas.turmas.nome; porTurma[n] = (porTurma[n] || 0) + 1; });
      var top = Object.keys(porTurma).sort(function (a, b) { return porTurma[b] - porTurma[a]; }).slice(0, 5);
      tela.innerHTML = "<h1>Painel <em>ZXT</em></h1><p class=\"sub\">Visão do mês até agora.</p>" +
        '<div class="kpis"><div class="kpi"><b>' + ativos.length + '</b><span>Alunos ativos</span></div><div class="kpi' + (pend ? " alerta" : "") + '"><b>' + pend + "</b><span>Aguardando aprovação</span></div>" +
        '<div class="kpi"><b>' + novos + '</b><span>Novos no mês</span></div><div class="kpi"><b>' + leads.length + "</b><span>Experimentais no mês</span></div></div>" +
        '<div class="kpis" style="margin-top:10px"><div class="kpi"><b>' + U.reais(recebido) + '</b><span>Recebido no mês</span></div><div class="kpi"><b>' + U.reais(previsto) + "</b><span>Previsto no mês</span></div>" +
        '<div class="kpi' + (atraso.length ? " alerta" : "") + '"><b>' + U.reais(soma(atraso)) + "</b><span>Em atraso (" + atraso.length + ')</span></div><div class="kpi"><b>' + presMes.length + "</b><span>Presenças no mês</span></div></div>" +
        "<h2>Em risco de desistência</h2><p style=\"margin:-6px 0 12px;color:var(--cinza);font-size:14px\">Ativos sem treino nos últimos 14 dias.</p>" +
        (risco.length ? '<div class="lista">' + risco.slice(0, 15).map(function (p) {
          return '<div class="item"><div><h3>' + esc(p.nome) + "</h3></div>" + (p.whatsapp ? '<a class="btn-mini" target="_blank" rel="noopener" href="' + U.wa(p.whatsapp, "Fala, " + primeiroNome(p.nome) + "! Sentimos sua falta no treino 🥊 Bora voltar essa semana?") + '">Chamar no WhatsApp</a>' : "") + "</div>";
        }).join("") + "</div>" : '<div class="vazio-box">Ninguém em risco agora 🔥</div>') +
        "<h2>Aulas mais cheias no mês</h2>" + (top.length ? '<div class="lista">' + top.map(function (n) { return '<div class="item"><div><h3>' + esc(n) + "</h3></div><b>" + porTurma[n] + " presenças</b></div>"; }).join("") + "</div>" : '<div class="vazio-box">Sem presenças registradas ainda.</div>');
    });
  };

  VIEWS.aprovacoes = function () {
    return Promise.all([
      sb.from("profiles").select("*").eq("status", "pendente").order("created_at").then(chk),
      sb.from("planos").select("id,nome,valor_centavos,periodicidade,aulas_semana, plano_modalidades(modalidade_id)").eq("ativo", true).order("nome").then(chk),
      sb.from("turmas").select("id,nome,modalidade_id,coletiva").eq("ativa", true).eq("coletiva", false).order("nome").then(chk)
    ]).then(function (r) {
      var ps = r[0], planos = r[1], turmas = r[2];
      tela.innerHTML = "<h1><em>Aprovações</em></h1><p class=\"sub\">" + ps.length + " cadastro(s) aguardando. Aprove escolhendo plano e turma.</p>" +
        (ps.length ? '<div class="lista">' + ps.map(function (p) {
          var idade = U.idade(p.data_nascimento);
          return '<div class="cartao"><h3 style="margin:0;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:22px">' + esc(p.nome || p.email) + "</h3>" +
            '<p style="margin:6px 0;color:var(--cinza);font-size:14px">' + esc(p.email || "") + " · " + esc(p.whatsapp || "sem WhatsApp") + (idade !== null ? " · " + idade + " anos" : "") +
            " · cadastrado em " + U.data(p.created_at) + "</p>" +
            '<p style="margin:0 0 6px;font-size:14px">Interesse: <b>' + esc((p.modalidades_interesse || []).join(", ") || "não informado") + "</b></p>" +
            (p.saude_obs ? '<p style="margin:0 0 6px;font-size:14px;color:#f2a20c">⚠ ' + esc(p.saude_obs) + "</p>" : "") +
            (p.responsavel_nome ? '<p style="margin:0 0 6px;font-size:14px">Responsável: ' + esc(p.responsavel_nome) + " · " + esc(p.responsavel_whatsapp || "") + "</p>" : "") +
            '<p style="margin:0 0 12px;font-size:13px;color:var(--cinza-2)">Termo aceito: ' + (p.aceite_termo_em ? U.data(p.aceite_termo_em) : "não") + " · Privacidade: " + (p.aceite_privacidade_em ? U.data(p.aceite_privacidade_em) : "não") + "</p>" +
            '<div class="busca" style="margin:0"><button class="btn-mini verde" data-aprovar="' + p.id + '">Aprovar</button><button class="btn-mini claro" data-recusar="' + p.id + '">Recusar</button>' +
            (p.whatsapp ? '<a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(p.whatsapp) + '">WhatsApp</a>' : "") + "</div></div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhum cadastro aguardando 🔥</div>');
      tela.onclick = function (e) {
        var a = e.target.closest("[data-aprovar]"), rc = e.target.closest("[data-recusar]");
        if (a) {
          var id = a.getAttribute("data-aprovar");
          var fm = modal("Aprovar cadastro",
            '<div class="campo"><label for="ap-plano">Plano</label><select class="sel" id="ap-plano"><option value="">Sem plano por enquanto</option>' +
            planos.map(function (pl) { return '<option value="' + pl.id + '">' + esc(pl.nome) + " · " + U.reais(pl.valor_centavos) + " · " + (pl.aulas_semana ? pl.aulas_semana + "x/sem" : "livre") + "</option>"; }).join("") + "</select>" +
            (planos.length ? "" : '<small>Nenhum plano cadastrado ainda. Cadastre em Financeiro.</small>') + "</div>" +
            '<div class="campo" style="margin-top:14px"><label>Turmas</label>' + turmas.map(function (t) {
              return '<label class="check"><input type="checkbox" name="ap-t" value="' + t.id + '"> ' + esc(t.nome) + "</label>"; }).join("") + "</div>" +
            '<div class="campo" style="margin-top:14px"><label for="ap-dia">Dia de vencimento</label><input id="ap-dia" type="number" min="1" max="28" value="10"></div>' +
            '<p style="color:var(--cinza);font-size:13px;margin:10px 0 0">O sparring de sexta é liberado para todos. Turmas fora das modalidades do plano ficam bloqueadas.</p>',
            [["Cancelar", null, "claro"], ["Aprovar", function (f) {
              var ts = U.$$('input[name="ap-t"]:checked', f).map(function (i) { return i.value; });
              if (!ts.length) { U.toast("Escolha pelo menos uma turma.", "erro"); return false; }
              return sb.rpc("aprovar_aluno", { p_aluno: id, p_plano: f.querySelector("#ap-plano").value || null, p_turmas: ts, p_dia_vencimento: parseInt(f.querySelector("#ap-dia").value, 10) || 10 })
                .then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Aprovado. Bem-vindo à família ZxT 🥊"); montarMenu(); rotear(); });
            }, "verde"]]);
          var turmaMod = {}; turmas.forEach(function (t) { turmaMod[t.id] = t.modalidade_id; });
          var filtrarTurmas = function () {
            var pl = planos.filter(function (x) { return x.id === fm.querySelector("#ap-plano").value; })[0];
            var ok = pl ? (pl.plano_modalidades || []).map(function (x) { return x.modalidade_id; }) : [];
            U.$$('input[name="ap-t"]', fm).forEach(function (i) {
              var livre = !ok.length || ok.indexOf(turmaMod[i.value]) >= 0;
              i.disabled = !livre; if (!livre) i.checked = false;
              i.parentNode.style.opacity = livre ? 1 : .4;
            });
          };
          fm.querySelector("#ap-plano").onchange = filtrarTurmas; filtrarTurmas();
        }
        if (rc) {
          var idr = rc.getAttribute("data-recusar");
          modal("Recusar cadastro", '<div class="campo"><label for="rc-m">Motivo (o aluno vê)</label><textarea id="rc-m" rows="3"></textarea></div>',
            [["Cancelar", null, "claro"], ["Recusar", function (f) {
              var m = f.querySelector("#rc-m").value.trim(); if (!m) { U.toast("Escreva o motivo.", "erro"); return false; }
              return sb.rpc("recusar_aluno", { p_aluno: idr, p_motivo: m }).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Cadastro recusado"); montarMenu(); rotear(); });
            }]]);
        }
      };
    });
  };

  VIEWS.cobrancas = function () {
    var filtro = (location.hash.match(/st=(\w+)/) || [])[1] || "abertas";
    return Promise.all([
      sb.from("planos").select("*, plano_modalidades(modalidade_id, modalidades(nome))").order("nome").then(chk),
      sb.from("cobrancas").select("*, profiles!cobrancas_aluno_id_fkey(nome,whatsapp)").order("vencimento", { ascending: false }).limit(300).then(chk)
    ]).then(function (r) {
      var planos = r[0], cs = r[1];
      function modsDo(p) { return (p.plano_modalidades || []).map(function (x) { return x.modalidades.nome; }); }
      var lista = cs.filter(function (c) { return filtro === "todas" || (filtro === "abertas" ? (c.status === "em_aberto" || c.status === "atrasado") : c.status === filtro); });
      tela.innerHTML = "<h1><em>Financeiro</em></h1><p class=\"sub\">Planos, mensalidades e baixa manual. Só a administração vê esta área.</p>" +
        "<h2>Planos</h2>" + (planos.length ? '<div class="lista">' + planos.map(function (p) {
          var ms = modsDo(p);
          return '<div class="item"><div><h3>' + esc(p.nome) + "</h3><p>" + U.reais(p.valor_centavos) + " · " + p.periodicidade + " · " +
            (p.aulas_semana ? p.aulas_semana + " aula(s) por semana" : "aulas livres") + " · " + esc(ms.length ? ms.join(", ") : "todas as modalidades") + "</p></div>" +
            '<div class="acoes">' + tagStatus(p.ativo ? "ativo" : "inativo") + ' <button class="btn-mini claro" data-editar-plano="' + p.id + '">Editar</button></div></div>';
        }).join("") + "</div>" : '<div class="vazio-box">Nenhum plano. Cadastre com os valores da tabela vigente.</div>') +
        '<div class="busca" style="margin-top:10px"><button class="btn-mini claro" id="novo-plano">Novo plano</button><button class="btn-mini claro" id="gerar">Gerar mensalidades do mês</button></div>' +
        "<h2>Cobranças</h2>" +
        '<div class="busca"><select id="cb-f">' + [["abertas", "Em aberto e atrasadas"], ["atrasado", "Só atrasadas"], ["pago", "Pagas"], ["todas", "Todas"]].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === filtro ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
        (lista.length ? '<div class="lista">' + lista.map(function (c) {
          var nome = c.profiles ? c.profiles.nome : "";
          return '<div class="item' + (c.status === "atrasado" ? " destaque" : "") + '"><div><h3>' + esc(nome) + " · " + U.reais(c.valor_final_centavos) + "</h3><p>" + esc(c.descricao) + " · vence " + U.data(c.vencimento) +
            (c.baixa_manual_por ? " · baixa manual (" + esc(c.forma_pagamento) + ")" : "") + "</p></div><div class=\"acoes\">" + tagStatus(c.status) +
            ((c.status === "em_aberto" || c.status === "atrasado") ? ' <button class="btn-mini verde" data-baixa="' + c.id + '">Dar baixa</button>' +
              (c.profiles && c.profiles.whatsapp ? ' <a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(c.profiles.whatsapp, "Oi, " + primeiroNome(nome) + "! Passando pra lembrar da mensalidade da ZXT de " + U.reais(c.valor_final_centavos) + " com vencimento em " + U.data(c.vencimento) + ". Qualquer dúvida, chama aqui 🥊") + '">Cobrar no WhatsApp</a>' : "") : "") + "</div></div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nada nesse filtro.</div>');
      $("#cb-f").onchange = function () { location.hash = "#/cobrancas?st=" + this.value; };
      $("#gerar").onclick = function () {
        sb.rpc("gerar_mensalidades").then(function (x) { if (x.error) return U.erro(x.error); U.toast(x.data + " mensalidade(s) gerada(s)"); rotear(); });
      };
      function editorPlano(p) {
        p = p || { nome: "", valor_centavos: null, periodicidade: "mensal", aulas_semana: null, ativo: true, plano_modalidades: [] };
        var marcadas = (p.plano_modalidades || []).map(function (x) { return x.modalidade_id; });
        sb.from("modalidades").select("id,nome").eq("ativa", true).order("ordem").then(function (rm) {
          var mods = rm.data || [];
          modal(p.id ? "Editar plano" : "Novo plano",
            '<div class="campo"><label for="pl-n">Nome</label><input id="pl-n" placeholder="Ex.: Muay Thai 2x por semana" value="' + esc(p.nome) + '"></div>' +
            '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="pl-v">Valor (R$)</label><input id="pl-v" inputmode="decimal" placeholder="0,00" value="' +
              (p.valor_centavos != null ? (p.valor_centavos / 100).toFixed(2).replace(".", ",") : "") + '"></div>' +
            '<div class="campo"><label for="pl-p">Periodicidade</label><select class="sel" id="pl-p">' + ["mensal", "trimestral", "semestral", "anual"].map(function (o) {
              return "<option" + (o === p.periodicidade ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div></div>" +
            '<div class="campo" style="margin-top:12px"><label for="pl-a">Aulas por semana</label><input id="pl-a" type="number" min="1" max="14" placeholder="Vazio = livre" value="' + (p.aulas_semana || "") + '">' +
              "<small>Conta de segunda a domingo. Sparring de sexta não conta.</small></div>" +
            '<div class="campo" style="margin-top:12px"><label>Modalidades incluídas</label>' + mods.map(function (m) {
              return '<label class="check"><input type="checkbox" name="pl-m" value="' + m.id + '"' + (marcadas.indexOf(m.id) >= 0 ? " checked" : "") + "> " + esc(m.nome) + "</label>"; }).join("") +
              "<small>Nenhuma marcada = todas as modalidades.</small></div>" +
            (p.id ? '<label class="check" style="margin-top:12px"><input type="checkbox" id="pl-at"' + (p.ativo ? " checked" : "") + "> Plano ativo (aparece na aprovação)</label>" : "") +
            '<p style="color:#f2a20c;font-size:13px;margin:12px 0 0">Use só valores da tabela vigente aprovada.</p>',
            [["Cancelar", null, "claro"], ["Salvar", function (f) {
              var v = Math.round(parseFloat(f.querySelector("#pl-v").value.replace(/\./g, "").replace(",", ".")) * 100);
              var n = f.querySelector("#pl-n").value.trim();
              if (!n || !(v >= 0)) { U.toast("Preencha nome e valor.", "erro"); return false; }
              var dados = { nome: n, valor_centavos: v, periodicidade: f.querySelector("#pl-p").value, aulas_semana: parseInt(f.querySelector("#pl-a").value, 10) || null };
              if (p.id) dados.ativo = f.querySelector("#pl-at").checked;
              var ms = U.$$('input[name="pl-m"]:checked', f).map(function (i) { return i.value; });
              var q = p.id ? sb.from("planos").update(dados).eq("id", p.id).select().single() : sb.from("planos").insert(dados).select().single();
              return q.then(function (x) {
                if (x.error) throw x.error;
                return sb.from("plano_modalidades").delete().eq("plano_id", x.data.id).then(function (d) {
                  if (d.error) throw d.error;
                  return ms.length ? sb.from("plano_modalidades").insert(ms.map(function (m) { return { plano_id: x.data.id, modalidade_id: m }; })).then(function (i) { if (i.error) throw i.error; }) : null;
                });
              }).then(function () { U.toast("Plano salvo"); rotear(); }).catch(function (e) { U.erro(e); return false; });
            }]]);
        });
      }
      $("#novo-plano").onclick = function () { editorPlano(); };
      tela.onclick = function (e) {
        var ep = e.target.closest("[data-editar-plano]");
        if (ep) return editorPlano(planos.filter(function (p) { return p.id === ep.getAttribute("data-editar-plano"); })[0]);
        var b = e.target.closest("[data-baixa]"); if (!b) return;
        modal("Dar baixa manual", '<div class="campo"><label for="bx-f">Forma de pagamento</label><select class="sel" id="bx-f"><option value="dinheiro">Dinheiro</option><option value="pix_direto">Pix direto</option><option value="cartao">Cartão na maquininha</option><option value="outro">Outro</option></select></div>' +
          '<div class="campo" style="margin-top:12px"><label for="bx-o">Observação</label><input id="bx-o"></div><p style="color:var(--cinza);font-size:13px">Fica registrado quem deu a baixa e quando.</p>',
          [["Cancelar", null, "claro"], ["Confirmar baixa", function (f) {
            return sb.rpc("baixa_manual", { p_cobranca: b.getAttribute("data-baixa"), p_forma: f.querySelector("#bx-f").value, p_obs: f.querySelector("#bx-o").value || null })
              .then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Baixa registrada"); rotear(); });
          }, "verde"]]);
      };
    });
  };

  VIEWS.leads = function () {
    return sb.from("leads").select("*, modalidades(nome), turmas(nome)").order("created_at", { ascending: false }).limit(200).then(chk).then(function (ls) {
      var cont = {}; ls.forEach(function (l) { cont[l.status] = (cont[l.status] || 0) + 1; });
      var conv = (cont.matriculou || 0), base = (cont.matriculou || 0) + (cont.nao_compareceu || 0) + (cont.desistiu || 0) + (cont.compareceu || 0);
      tela.innerHTML = "<h1>Aulas <em>experimentais</em></h1><p class=\"sub\">Quem agendou pelo site. Atualize o status depois da aula.</p>" +
        '<div class="kpis"><div class="kpi"><b>' + (cont.agendada || 0) + '</b><span>Agendadas</span></div><div class="kpi"><b>' + (cont.compareceu || 0) + "</b><span>Compareceram</span></div>" +
        '<div class="kpi"><b>' + conv + '</b><span>Matricularam</span></div><div class="kpi"><b>' + (base ? Math.round(conv / base * 100) + "%" : "-") + "</b><span>Conversão</span></div></div>" +
        '<p style="color:var(--cinza-2);font-size:13px;margin:8px 0 0">Conversão = matricularam ÷ (matricularam + vieram e não fecharam + não vieram + desistiram). Agendadas ainda não entram.</p>' +
        "<h2>Lista</h2>" + (ls.length ? '<div class="lista">' + ls.map(function (l) {
          return '<div class="item"><div><h3>' + esc(l.nome) + (l.idade ? " · " + l.idade + " anos" : "") + "</h3><p>" + esc((l.modalidades || {}).nome || "") + (l.turmas ? " · " + esc(l.turmas.nome) : "") +
            " · " + esc(l.origem) + " · " + U.data(l.created_at) + (l.saude_obs ? " · ⚠ " + esc(l.saude_obs) : "") + "</p></div><div class=\"acoes\">" +
            '<select class="sel" data-lead="' + l.id + '">' + ["agendada", "compareceu", "matriculou", "nao_compareceu", "desistiu"].map(function (s) {
              return "<option" + (s === l.status ? " selected" : "") + ' value="' + s + '">' + s.replace("_", " ") + "</option>"; }).join("") + "</select>" +
            (l.whatsapp ? ' <a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(l.whatsapp, "Olá, " + primeiroNome(l.nome) + "! Aqui é da ZXT. Confirmando sua aula experimental 🥊") + '">WhatsApp</a>' : "") + "</div></div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhuma aula experimental agendada pelo site ainda.</div>');
      tela.onchange = function (e) {
        var s = e.target.closest("[data-lead]"); if (!s) return;
        sb.from("leads").update({ status: s.value }).eq("id", s.getAttribute("data-lead")).then(function (x) { if (x.error) return U.erro(x.error); U.toast("Status atualizado"); });
      };
    });
  };

  VIEWS.qr = function () {
    return sb.from("qr_tokens").select("*").gt("expira_em", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).then(chk).then(function (ts) {
      if (ts.length) return ts[0];
      return sb.from("qr_tokens").insert({ criado_por: S.user.id, expira_em: new Date(Date.now() + 30 * 864e5).toISOString() }).select().single().then(chk);
    }).then(function (t) {
      var url = location.origin + "/app#/checkin?t=" + t.token;
      var q = qrcode(0, "M"); q.addData(url); q.make();
      tela.innerHTML = "<h1>QR da <em>recepção</em></h1><p class=\"sub\">Imprima ou deixe esta tela aberta na recepção. O aluno aponta a câmera do celular e o check-in é feito sozinho. Válido até " + U.data(t.expira_em) + ".</p>" +
        '<div class="qr-grande">' + q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }) + "</div>" +
        '<p style="text-align:center;color:var(--cinza);margin:16px 0">Código para digitar: <b style="color:#fff;font-size:20px;letter-spacing:2px">' + esc(t.token) + "</b></p>" +
        '<div class="busca" style="justify-content:center"><button class="btn-mini claro" onclick="window.print()">Imprimir</button><button class="btn-mini" id="novo-qr">Gerar QR novo</button></div>' +
        '<p style="text-align:center;color:var(--cinza-2);font-size:13px">Gerar um novo invalida o antigo depois que ele vencer. Troque se o código vazar.</p>';
      $("#novo-qr").onclick = function () {
        sb.from("qr_tokens").update({ expira_em: new Date().toISOString() }).eq("token", t.token).then(function () {
          sb.from("qr_tokens").insert({ criado_por: S.user.id, expira_em: new Date(Date.now() + 30 * 864e5).toISOString() }).then(function () { U.toast("QR novo gerado"); rotear(); });
        });
      };
    });
  };

  iniciar();
})();
