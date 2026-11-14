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
    funil: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
    comunidade: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    professor: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><path d="M9 14l3 3 3-3"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[n] + "</svg>"; }

  var MENUS = {
    aluno: [["comunidade", "Comunidade", "comunidade"], ["inicio", "Início", "casa"], ["agenda", "Agenda", "agenda"], ["checkin", "Check-in", "qr"], ["financeiro", "Mensalidades", "dinheiro"], ["graduacao", "Graduação", "faixa"], ["perfil", "Perfil", "perfil"]],
    professor: [["chamada", "Chamada", "chamada"], ["comunidade", "Comunidade", "comunidade"], ["alunos", "Alunos", "grupo"], ["perfil", "Perfil", "perfil"]],
    admin: [["painel", "Painel", "painel"], ["aprovacoes", "Aprovações", "aprovar"], ["alunos", "Alunos", "grupo"], ["professores", "Professores", "professor"], ["comunidade", "Comunidade", "comunidade"], ["chamada", "Chamada", "chamada"], ["cobrancas", "Financeiro", "dinheiro"], ["leads", "Experimentais", "funil"], ["graduacoes", "Graduação", "faixa"], ["qr", "QR recepção", "qr"], ["config", "Configurações", "config"], ["perfil", "Meu perfil", "perfil"]]
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
        mostrarQuem();
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
          ? (p.tipo_cadastro === "professor"
            ? "Recebemos seu cadastro de professor, " + esc(primeiroNome(p.nome)) + ". A equipe ZXT confere sua graduação e confirma as turmas. Assim que aprovar, seu acesso de professor é liberado."
            : "Recebemos seu cadastro, " + esc(primeiroNome(p.nome)) + ". A equipe ZXT confere seus dados e libera seu acesso. Assim que aprovar, é só entrar de novo.")
          : "Seu acesso está " + esc(p.status) + ". Fale com a recepção para reativar.") + "</p>" +
      '<a class="btn btn-vermelho" target="_blank" rel="noopener" href="https://ig.me/m/zxtoficial">Falar com a ZXT</a>' +
      '<button class="link" id="recarregar">Já fui aprovado? Atualizar</button></div>';
    $("#recarregar").onclick = function () { location.reload(); };
  }

  function mostrarQuem() {
    var nome = (S.perfil.nome || "").trim();
    $("#quem-nome").textContent = nome ? primeiroNome(nome) : "Equipe ZXT";
    if (!nome && !S.avisouNome) { S.avisouNome = true; setTimeout(function () { U.toast("Cadastre seu nome em Meu perfil para aparecer aqui no topo."); }, 800); }
    $("#topo-av").textContent = (nome || "ZXT").charAt(0).toUpperCase();
    var dt = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "2-digit", month: "long" });
    $("#topo-data").textContent = dt.charAt(0).toUpperCase() + dt.slice(1);
  }
  function montarMenu() {
    $("#quem-papel").textContent = NOME_PAPEL[S.modo];
    $("#portal-de").textContent = S.modo === "aluno" ? "Portal do aluno" : S.modo === "professor" ? "Portal do professor" : "Portal da equipe";
    $("#nav").innerHTML = MENUS[S.modo].map(function (m) {
      return '<a href="#/' + m[0] + '" data-r="' + m[0] + '">' + ic(m[2]) + "<span>" + m[1] + '</span><span class="bolha" hidden></span></a>';
    }).join("");
    if (S.modo === "admin") sb.from("profiles").select("tipo_cadastro").eq("status", "pendente").then(function (r) {
      var al = 0, pr = 0; (r.data || []).forEach(function (x) { if (x.tipo_cadastro === "professor") pr++; else al++; });
      [["aprovacoes", al], ["professores", pr]].forEach(function (c) {
        var b = $('#nav [data-r="' + c[0] + '"] .bolha');
        if (b) { b.hidden = !c[1]; b.textContent = c[1]; }
      });
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

  var NOME_MOD = { "muay-thai": "Muay Thai", "boxe": "Boxe", "mma": "MMA", "jiu-jitsu": "Jiu-Jitsu" };
  function nomesMods(l) { return (l || []).map(function (x) { return NOME_MOD[x] || x; }).join(", "); }

  // =================================================================== ALUNO
  function cartaoPlano(planos) {
    if (!planos || !planos.length) return "";
    return planos.map(function (p) {
      var lim = p.aulas_semana, usadas = p.usadas || 0;
      var pct = lim ? Math.min(100, Math.round(usadas / lim * 100)) : 0;
      var turmasTxt = p.turmas_livres ? "Todas as turmas e horários" : (p.turmas && p.turmas.length ? p.turmas.join(" + ") : "Turma ainda não definida, fale com a recepção");
      return '<div class="cartao" style="margin-bottom:12px"><p style="margin:0 0 6px;color:var(--cinza);font-size:14px">Seu plano</p>' +
        '<h3 style="margin:0 0 6px;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:22px">' + esc(p.plano) + "</h3>" +
        '<p style="margin:0;color:var(--cinza);font-size:14px"><b style="color:#fff">' + esc(turmasTxt) + "</b> · sparring de sexta liberado</p>" +
        (lim ? '<p style="margin:10px 0 6px"><b>' + usadas + " de " + lim + "</b> aulas usadas nesta semana (seg a dom)</p><div class=\"barra\"><i style=\"width:" + pct + '%"></i></div>' : "") + "</div>";
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
      sb.from("graduacoes_aluno").select("data, grau, graduacao_niveis(nome,cor,cor2,categoria), modalidades(nome)").eq("aluno_id", S.user.id).order("data", { ascending: false }),
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
            U.barraGrad(g.graduacao_niveis, 56) + "</div>";
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
      var livre = planos.some(function (p) { return p.turmas_livres; });
      return sb.from("aulas").select("id,inicio,fim,status,turma_id, turmas(nome,coletiva,sparring,modalidade_id)")
        .gte("inicio", agora.toISOString()).lte("inicio", ate.toISOString()).order("inicio").then(chk).then(function (aulas) {
          aulas = aulas.filter(function (a) {
            return a.turmas.coletiva || livre || turmasMinhas.indexOf(a.turma_id) >= 0;
          });
          var ids = aulas.map(function (a) { return a.id; });
          return (ids.length ? sb.from("reservas").select("aula_id,status").eq("aluno_id", S.user.id).in("aula_id", ids).then(chk) : Promise.resolve([]))
            .then(function (res) {
              var st = {}; res.forEach(function (x) { st[x.aula_id] = x.status; });
              var dia = "", html = "<h1>Minha <em>agenda</em></h1><p class=\"sub\">Próximos 7 dias das suas turmas e do sparring de sexta. Cancelamento até 2h antes.</p>" + planoHtml;
              if (!mats.length && !livre) html += '<div class="vazio-box" style="margin-bottom:16px">Você ainda não está matriculado em nenhuma turma. Fale com a recepção.</div>';
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
        sb.from("graduacoes_aluno").select("*, graduacao_niveis(nome,ordem,cor,cor2,categoria)").eq("aluno_id", S.user.id).order("data", { ascending: false }).then(chk),
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
            '<p style="margin:0 0 14px;color:var(--cinza)">Atual: <b style="color:#fff">' + (atual ? esc(atual.graduacao_niveis.nome) + (atual.grau ? " · " + atual.grau + "º grau" : "") + "</b> " + U.barraGrad(atual.graduacao_niveis, 56) : "Sem graduação registrada</b>") + "</p>";
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
        S.perfil = r.data; mostrarQuem(); U.toast("Perfil salvo");
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
    return Promise.all([
      sb.from("profiles").select("id,nome,email,whatsapp,status,data_nascimento,saude_obs,created_at,aprovado_em,modalidades_interesse,tipo_cadastro").order("nome").then(chk),
      sb.from("user_roles").select("user_id,papel").then(chk)
    ]).then(function (rr) {
      var papeis = {}; rr[1].forEach(function (x) { (papeis[x.user_id] = papeis[x.user_id] || []).push(x.papel); });
      // aba Alunos: só quem é aluno (professor que também treina aparece; equipe pura não)
      var ps = rr[0].filter(function (p) {
        var pp = papeis[p.id] || [];
        if (p.status === "pendente") return p.tipo_cadastro !== "professor";
        return pp.indexOf("aluno") >= 0;
      });
      tela.innerHTML = "<h1><em>Alunos</em></h1><p class=\"sub\">" + ps.length + " aluno(s). Professores ficam na aba Professores.</p>" +
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
          return '<div class="item"><div><h3>' + esc(p.nome || p.email) + "</h3><p>" + esc(nomesMods(p.modalidades_interesse)) + (p.saude_obs ? " · ⚠ saúde" : "") + "</p></div>" +
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
      var bots = [["Fechar", null, "claro"], ["Graduação", function () { graduacaoAluno(id, p); }, "verde"], ["Observação", function () { observacao(id, p.nome); }, "claro"]];
      if (admin) {
        bots.push(["Plano e turmas", function () { planoETurmas(id, p); }, "verde"]);
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
      sb.from("profiles").select("*").eq("status", "pendente").neq("tipo_cadastro", "professor").order("created_at").then(chk),
      carregarDadosPlano()
    ]).then(function (r) {
      var ps = r[0], dp = r[1], planos = dp.planos, turmas = dp.turmas;
      var nomePlano = {}; planos.forEach(function (x) { nomePlano[x.id] = x.nome; });
      var nomeTurma = {}; turmas.forEach(function (x) { nomeTurma[x.id] = x.nome; });
      tela.innerHTML = "<h1><em>Aprovações</em></h1><p class=\"sub\">" + ps.length + " cadastro(s) aguardando. O plano e as turmas escolhidos pelo aluno já vêm marcados: confira e aprove.</p>" +
        (ps.length ? '<div class="lista">' + ps.map(function (p) {
          var idade = U.idade(p.data_nascimento);
          return '<div class="cartao"><h3 style="margin:0;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:22px">' + esc(p.nome || p.email) + "</h3>" +
            '<p style="margin:6px 0;color:var(--cinza);font-size:14px">' + esc(p.email || "") + " · " + esc(p.whatsapp || "sem WhatsApp") + (idade !== null ? " · " + idade + " anos" : "") +
            " · cadastrado em " + U.data(p.created_at) + "</p>" +
            '<p style="margin:0 0 6px;font-size:14px">Escolheu: <b>' + esc(nomePlano[p.plano_escolhido_id] || "sem plano escolhido") + "</b>" +
              ((p.turmas_escolhidas || []).length ? " · " + esc(p.turmas_escolhidas.map(function (t) { return nomeTurma[t] || "turma removida"; }).join(" + ")) : "") + "</p>" +
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
          var perfilAp = ps.filter(function (x) { return x.id === id; })[0] || {};
          var pickAp = null;
          var fm = modal("Aprovar cadastro",
            (planos.length ? "" : '<p style="color:#f2a20c;font-size:14px">Nenhum plano ativo. Cadastre em Financeiro.</p>') +
            '<div id="ap-picker"></div>' +
            '<div class="campo" style="margin-top:14px"><label for="ap-dia">Dia de vencimento</label><input id="ap-dia" type="number" min="1" max="28" value="10"></div>',
            [["Cancelar", null, "claro"], ["Aprovar", function (f) {
              var er = pickAp.erro(); if (er) { U.toast(er, "erro"); return false; }
              var v = pickAp.valor();
              return sb.rpc("aprovar_aluno", { p_aluno: id, p_plano: v.plano, p_turmas: v.turmas, p_dia_vencimento: parseInt(f.querySelector("#ap-dia").value, 10) || 10 })
                .then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Aprovado. Bem-vindo à família ZxT 🥊"); montarMenu(); rotear(); });
            }, "verde"]]);
          pickAp = PlanoPicker(fm.querySelector("#ap-picker"), { planos: planos, turmas: turmas, modalidades: dp.modalidades, permitirSemPlano: true,
            planoId: perfilAp.plano_escolhido_id, turmaIds: (perfilAp.turmas_escolhidas || []).filter(function (t) { return nomeTurma[t]; }) });
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
      sb.from("planos").select("*, plano_modalidades(modalidade_id, modalidades(nome))").order("valor_centavos", { ascending: false }).then(chk),
      sb.from("cobrancas").select("*, profiles!cobrancas_aluno_id_fkey(nome,whatsapp)").order("vencimento", { ascending: false }).limit(300).then(chk)
    ]).then(function (r) {
      var planos = r[0], cs = r[1];
      function modsDo(p) { return (p.plano_modalidades || []).map(function (x) { return x.modalidades.nome; }); }
      var lista = cs.filter(function (c) { return filtro === "todas" || (filtro === "abertas" ? (c.status === "em_aberto" || c.status === "atrasado") : c.status === filtro); });
      tela.innerHTML = "<h1><em>Financeiro</em></h1><p class=\"sub\">Planos, mensalidades e baixa manual. Só a administração vê esta área.</p>" +
        "<h2>Planos</h2>" + (planos.length ? '<div class="lista">' + planos.map(function (p) {
          var ms = modsDo(p);
          var regraT = p.turmas_livres ? "todas as turmas" : p.max_turmas ? p.max_turmas + (p.max_turmas > 1 ? " turmas" : " turma") : "turmas definidas pela equipe";
          return '<div class="item"><div><h3>' + esc(p.nome) + "</h3><p>" + U.reais(p.valor_centavos) + " · " + p.periodicidade + " · " + regraT + " + sparring" +
            (p.aulas_semana ? " · limite de " + p.aulas_semana + " aula(s) por semana" : "") + (ms.length ? " · só " + esc(ms.join(", ")) : "") + "</p></div>" +
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
            '<div class="campo"><label for="pl-n">Nome</label><input id="pl-n" placeholder="Ex.: Plano básico" value="' + esc(p.nome) + '"></div>' +
            '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="pl-v">Valor (R$)</label><input id="pl-v" inputmode="decimal" placeholder="0,00" value="' +
              (p.valor_centavos != null ? (p.valor_centavos / 100).toFixed(2).replace(".", ",") : "") + '"></div>' +
            '<div class="campo"><label for="pl-p">Periodicidade</label><select class="sel" id="pl-p">' + ["mensal", "trimestral", "semestral", "anual"].map(function (o) {
              return "<option" + (o === p.periodicidade ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></div></div>" +
            '<div class="campo" style="margin-top:12px"><label for="pl-t">Turmas que o plano dá direito</label><select class="sel" id="pl-t">' +
              [["1", "1 turma à escolha"], ["2", "2 turmas à escolha (mesma ou outra modalidade)"], ["3", "3 turmas à escolha"], ["4", "4 turmas à escolha"], ["livre", "Todas as turmas e horários"]].map(function (o) {
                var sel = p.turmas_livres ? o[0] === "livre" : String(p.max_turmas || 1) === o[0];
                return '<option value="' + o[0] + '"' + (sel ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
              "<small>Cada turma tem 2 aulas por semana. O sparring de sexta é liberado em todos os planos.</small></div>" +
            (p.id ? '<label class="check" style="margin-top:12px"><input type="checkbox" id="pl-at"' + (p.ativo ? " checked" : "") + "> Plano ativo (aparece na aprovação)</label>" : "") +
            '<p style="color:#f2a20c;font-size:13px;margin:12px 0 0">Use só valores da tabela vigente aprovada.</p>',
            [["Cancelar", null, "claro"], ["Salvar", function (f) {
              var v = Math.round(parseFloat(f.querySelector("#pl-v").value.replace(/\./g, "").replace(",", ".")) * 100);
              var n = f.querySelector("#pl-n").value.trim();
              if (!n || !(v >= 0)) { U.toast("Preencha nome e valor.", "erro"); return false; }
              var tv = f.querySelector("#pl-t").value;
              var dados = { nome: n, valor_centavos: v, periodicidade: f.querySelector("#pl-p").value,
                turmas_livres: tv === "livre", max_turmas: tv === "livre" ? null : parseInt(tv, 10) };
              if (p.id) dados.ativo = f.querySelector("#pl-at").checked;
              var q = p.id ? sb.from("planos").update(dados).eq("id", p.id).select().single() : sb.from("planos").insert(dados).select().single();
              return q.then(function (x) {
                if (x.error) throw x.error;
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


  // =================================================================== COMUNIDADE
  var COM = { limite: 20, filtro: "", autores: null, mods: null };

  function comprimirImagem(file) {
    return new Promise(function (ok) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b || file); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(file); };
      img.src = url;
    });
  }

  function tempoAtras(iso) {
    var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "agora";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h";
    if (s < 7 * 86400) return Math.floor(s / 86400) + " d";
    return U.data(iso);
  }

  VIEWS.comunidade = function () {
    var staff = S.modo !== "aluno", admin = S.modo === "admin";
    var pAutores = COM.autores ? Promise.resolve(COM.autores) : sb.rpc("perfis_publicos").then(function (r) {
      COM.autores = {}; (r.data || []).forEach(function (p) { COM.autores[p.id] = p; }); return COM.autores;
    });
    var pMods = COM.mods ? Promise.resolve(COM.mods) : sb.from("modalidades").select("id,nome").eq("ativa", true).order("ordem").then(function (r) { COM.mods = r.data || []; return COM.mods; });
    var q = sb.from("posts").select("id,autor_id,texto,modalidade_id,fixado,oculto,created_at, post_midias(url,tipo,ordem), post_curtidas(user_id), comentarios(id,autor_id,texto,oculto,created_at)")
      .order("fixado", { ascending: false }).order("created_at", { ascending: false }).limit(COM.limite);
    var pDen = staff ? sb.from("denuncias").select("id,motivo,post_id,comentario_id,created_at").eq("resolvida", false) : Promise.resolve({ data: [] });
    return Promise.all([pAutores, pMods, q.then(chk), pDen]).then(function (r) {
      var autores = r[0], mods = r[1], posts = r[2], dens = (r[3].data || []);
      var nomeMod = {}; mods.forEach(function (m) { nomeMod[m.id] = m.nome; });
      var paths = []; posts.forEach(function (p) { (p.post_midias || []).forEach(function (m) { paths.push(m.url); }); });
      return (paths.length ? sb.storage.from("comunidade").createSignedUrls(paths, 3600) : Promise.resolve({ data: [] })).then(function (sr) {
        var urls = {}; (sr.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
        function quem(id) { var a = autores[id] || (id === S.user.id ? { nome: S.perfil.nome, foto_url: S.perfil.foto_url } : null); return a ? a : { nome: "Membro ZXT" }; }
        function avatar(a) {
          return a.foto_url ? '<img class="av" src="' + esc(a.foto_url) + '" alt="">' : '<span class="av">' + esc((a.nome || "?").charAt(0).toUpperCase()) + "</span>";
        }
        var denPorPost = {}; dens.forEach(function (d) { if (d.post_id) denPorPost[d.post_id] = (denPorPost[d.post_id] || 0) + 1; });

        var html = "<h1>Comunidade <em>ZxT</em></h1><p class=\"sub\">Treino, conquista, bastidor de aula. Posta aí, família ZxT 🥊</p>" +
          // composer
          '<form class="cartao post-novo" id="post-novo">' +
          '<textarea id="pn-texto" rows="3" maxlength="2000" placeholder="Como foi o treino hoje?"></textarea>' +
          '<div id="pn-prev" class="pn-prev"></div>' +
          '<div class="pn-barra"><label class="btn-mini claro pn-foto">📷 Foto ou vídeo<input type="file" id="pn-arq" accept="image/*,video/mp4,video/quicktime" multiple hidden></label>' +
          (admin ? '<label class="check" style="font-size:13px"><input type="checkbox" id="pn-fixar"> Fixar aviso</label>' : "") +
          '<button class="btn-mini" type="submit" id="pn-enviar" style="margin-left:auto">Publicar</button></div></form>' +
          '<div style="height:14px"></div>' +
          (staff && dens.length ? '<div class="cartao" style="border-color:#5a3a00;margin-bottom:12px"><b style="color:#f2a20c">⚠ ' + dens.length + " denúncia(s) aguardando análise.</b> Os posts denunciados estão marcados abaixo.</div>" : "");

        if (!posts.length) html += '<div class="vazio-box">Nenhuma postagem ainda. Abre os trabalhos 🔥</div>';
        html += '<div class="feed">' + posts.map(function (p) {
          var a = quem(p.autor_id), curtidas = (p.post_curtidas || []), curti = curtidas.some(function (c) { return c.user_id === S.user.id; });
          var midias = (p.post_midias || []).sort(function (x, y) { return x.ordem - y.ordem; });
          var coms = (p.comentarios || []).sort(function (x, y) { return x.created_at < y.created_at ? -1 : 1; });
          var meu = p.autor_id === S.user.id;
          return '<article class="post' + (p.fixado ? " fixado" : "") + (p.oculto ? " oculto" : "") + '" data-post="' + p.id + '">' +
            '<header class="post-topo">' + avatar(a) + '<div><b>' + esc(a.nome || "Membro ZXT") + "</b><span>" + tempoAtras(p.created_at) +
            "</span></div>" +
            (p.fixado ? '<span class="tag info">Fixado</span>' : "") + (p.oculto ? '<span class="tag neutro">Oculto</span>' : "") +
            (denPorPost[p.id] ? '<span class="tag atencao">' + denPorPost[p.id] + " denúncia(s)</span>" : "") +
            '<button class="post-menu" data-menu="' + p.id + '" aria-label="Opções">⋯</button></header>' +
            (p.texto ? '<p class="post-texto">' + esc(p.texto) + "</p>" : "") +
            (midias.length ? '<div class="post-midias n' + Math.min(midias.length, 4) + '">' + midias.map(function (m) {
              var u = urls[m.url]; if (!u) return "";
              return m.tipo === "video" ? '<video src="' + esc(u) + '" controls playsinline preload="metadata"></video>' : '<img src="' + esc(u) + '" alt="Foto da postagem" loading="lazy">';
            }).join("") + "</div>" : "") +
            '<div class="post-acoes"><button class="curtir' + (curti ? " on" : "") + '" data-curtir="' + p.id + '">' + (curti ? "🔥" : "🤍") + " " + curtidas.length + "</button>" +
            '<button data-abrir-com="' + p.id + '">💬 ' + coms.length + "</button></div>" +
            '<div class="post-coms" id="coms-' + p.id + '"' + (coms.length > 2 ? " data-recolhido" : "") + ">" +
            coms.map(function (c, i) {
              var ca = quem(c.autor_id);
              return '<p class="com' + (coms.length > 2 && i < coms.length - 2 ? " antigo" : "") + (c.oculto ? " oculto" : "") + '"><b>' + esc(ca.nome || "Membro ZXT") + "</b> " + esc(c.texto) +
                ((c.autor_id === S.user.id || staff) ? ' <button class="link-mini" data-com-menu="' + c.id + '" data-com-autor="' + c.autor_id + '">⋯</button>' : ' <button class="link-mini" data-denunciar-com="' + c.id + '">denunciar</button>') + "</p>";
            }).join("") +
            (coms.length > 2 ? '<button class="link-mini ver-todos" data-ver-todos="' + p.id + '">Ver os ' + coms.length + " comentários</button>" : "") +
            '<form class="com-novo" data-comentar="' + p.id + '"><input placeholder="Comentar..." maxlength="500"><button class="btn-mini">Enviar</button></form></div>' +
            (meu || staff ? "" : "") + "</article>";
        }).join("") + "</div>" +
          (posts.length >= COM.limite ? '<div style="text-align:center;margin-top:14px"><button class="btn-mini claro" id="ver-mais">Ver mais postagens</button></div>' : "");
        tela.innerHTML = html;

        // --- novo post ---
        var arquivos = [];
        $("#pn-arq").onchange = function () {
          Array.prototype.slice.call(this.files).forEach(function (f) {
            var video = /^video\//.test(f.type);
            if (video && f.size > 25 * 1024 * 1024) return U.toast("Vídeo acima de 25 MB. Corte um trecho menor.", "erro");
            if (!video && !/^image\//.test(f.type)) return;
            if (arquivos.length >= 4) return U.toast("Até 4 arquivos por postagem.", "erro");
            arquivos.push(f);
          });
          this.value = "";
          $("#pn-prev").innerHTML = arquivos.map(function (f, i) {
            var u = URL.createObjectURL(f);
            return '<div class="pn-item">' + (/^video\//.test(f.type) ? '<video src="' + u + '" muted></video>' : '<img src="' + u + '" alt="">') + '<button type="button" data-tirar="' + i + '">×</button></div>';
          }).join("");
        };
        $("#pn-prev").onclick = function (e) { var b = e.target.closest("[data-tirar]"); if (!b) return; arquivos.splice(+b.getAttribute("data-tirar"), 1); $("#pn-arq").onchange.call({ files: [], value: "" }); };
        $("#post-novo").onsubmit = function (e) {
          e.preventDefault();
          var texto = $("#pn-texto").value.trim();
          if (!texto && !arquivos.length) return U.toast("Escreva algo ou escolha uma foto.", "erro");
          var bt = $("#pn-enviar"); bt.disabled = true; bt.textContent = "Publicando...";
          var dados = { autor_id: S.user.id, texto: texto || null };
          if (admin && $("#pn-fixar") && $("#pn-fixar").checked) dados.fixado = true;
          sb.from("posts").insert(dados).select().single().then(function (r) {
            if (r.error) throw r.error;
            var post = r.data;
            return Promise.all(arquivos.map(function (f, i) {
              var video = /^video\//.test(f.type);
              return (video ? Promise.resolve(f) : comprimirImagem(f)).then(function (blob) {
                var ext = video ? (f.type === "video/quicktime" ? "mov" : "mp4") : "jpg";
                var path = S.user.id + "/" + post.id + "-" + i + "." + ext;
                return sb.storage.from("comunidade").upload(path, blob, { contentType: video ? f.type : "image/jpeg", upsert: false }).then(function (u) {
                  if (u.error) throw u.error;
                  return sb.from("post_midias").insert({ post_id: post.id, url: path, tipo: video ? "video" : "imagem", ordem: i }).then(function (m) { if (m.error) throw m.error; });
                });
              });
            }));
          }).then(function () { U.toast("Postado 🔥"); rotear(); })
            .catch(function (er) { U.erro(er); bt.disabled = false; bt.textContent = "Publicar"; });
        };

        // --- interações ---
        tela.onclick = function (e) {
          var b;
          if (e.target.id === "ver-mais") { COM.limite += 20; return rotear(); }
          if ((b = e.target.closest("[data-curtir]"))) {
            var pid = b.getAttribute("data-curtir"), on = b.classList.contains("on");
            var n = parseInt(b.textContent.replace(/\D/g, ""), 10) || 0;
            b.classList.toggle("on"); b.textContent = (on ? "🤍 " + (n - 1) : "🔥 " + (n + 1));
            (on ? sb.from("post_curtidas").delete().eq("post_id", pid).eq("user_id", S.user.id) : sb.from("post_curtidas").insert({ post_id: pid, user_id: S.user.id }))
              .then(function (x) { if (x.error) U.erro(x.error); });
            return;
          }
          if ((b = e.target.closest("[data-abrir-com]"))) { var inp = tela.querySelector('[data-comentar="' + b.getAttribute("data-abrir-com") + '"] input'); if (inp) inp.focus(); return; }
          if ((b = e.target.closest("[data-ver-todos]"))) { var box = $("#coms-" + b.getAttribute("data-ver-todos")); box.removeAttribute("data-recolhido"); b.remove(); return; }
          if ((b = e.target.closest("[data-menu]"))) return menuPost(posts.filter(function (p) { return p.id === b.getAttribute("data-menu"); })[0]);
          if ((b = e.target.closest("[data-denunciar-com]"))) return denunciar(null, b.getAttribute("data-denunciar-com"));
          if ((b = e.target.closest("[data-com-menu]"))) {
            var cid = b.getAttribute("data-com-menu"), dono = b.getAttribute("data-com-autor") === S.user.id;
            var bots = [["Fechar", null, "claro"]];
            if (staff) bots.push(["Ocultar comentário", function () { return sb.from("comentarios").update({ oculto: true }).eq("id", cid).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Comentário oculto"); rotear(); }); }, "claro"]);
            if (dono || admin) bots.push(["Apagar", function () { return sb.from("comentarios").delete().eq("id", cid).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Comentário apagado"); rotear(); }); }]);
            return modal("Comentário", '<p style="color:var(--cinza)">O que deseja fazer?</p>', bots);
          }
        };
        tela.onsubmit = function (e) {
          var f = e.target.closest("[data-comentar]"); if (!f) return;
          e.preventDefault();
          var inp = f.querySelector("input"), txt = inp.value.trim(); if (!txt) return;
          inp.disabled = true;
          sb.from("comentarios").insert({ post_id: f.getAttribute("data-comentar"), autor_id: S.user.id, texto: txt }).then(function (x) {
            inp.disabled = false; if (x.error) return U.erro(x.error); rotear();
          });
        };

        function denunciar(postId, comId) {
          modal("Denunciar", '<div class="campo"><label for="dn-m">O que está errado?</label><select class="sel" id="dn-m"><option>Ofensivo ou desrespeitoso</option><option>Conteúdo impróprio</option><option>Exposição de outra pessoa sem autorização</option><option>Spam ou propaganda</option><option>Outro</option></select></div>' +
            '<p style="color:var(--cinza);font-size:13px">A equipe ZXT recebe e analisa. Quem postou não sabe quem denunciou.</p>',
            [["Cancelar", null, "claro"], ["Enviar denúncia", function (g) {
              return sb.from("denuncias").insert({ post_id: postId, comentario_id: comId, autor_id: S.user.id, motivo: g.querySelector("#dn-m").value }).then(function (x) {
                if (x.error) { U.erro(/duplicate|unique/i.test(x.error.message) ? { message: "Você já denunciou isso. A equipe vai analisar." } : x.error); return false; }
                U.toast("Denúncia enviada. Obrigado por cuidar da família ZxT.");
              });
            }]]);
        }
        function menuPost(p) {
          var meu = p.autor_id === S.user.id, bots = [["Fechar", null, "claro"]];
          if (!meu) bots.push(["Denunciar", function () { denunciar(p.id, null); }, "claro"]);
          if (staff) bots.push([p.oculto ? "Mostrar de novo" : "Ocultar post", function () {
            return sb.from("posts").update({ oculto: !p.oculto }).eq("id", p.id).then(function (x) {
              if (x.error) { U.erro(x.error); return false; }
              if (!p.oculto) sb.from("denuncias").update({ resolvida: true }).eq("post_id", p.id).then(function () {});
              U.toast(p.oculto ? "Post visível de novo" : "Post oculto para os alunos"); rotear();
            });
          }, "claro"]);
          if (staff && denPorPost[p.id]) bots.push(["Manter e encerrar denúncias", function () {
            return sb.from("denuncias").update({ resolvida: true }).eq("post_id", p.id).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Denúncias encerradas"); rotear(); });
          }, "claro"]);
          if (admin) bots.push([p.fixado ? "Desafixar" : "Fixar no topo", function () {
            return sb.from("posts").update({ fixado: !p.fixado }).eq("id", p.id).then(function (x) { if (x.error) { U.erro(x.error); return false; } rotear(); });
          }, "claro"]);
          if (meu || admin) bots.push(["Apagar post", function () {
            var arqs = (p.post_midias || []).map(function (m) { return m.url; });
            return sb.from("posts").delete().eq("id", p.id).then(function (x) {
              if (x.error) { U.erro(x.error); return false; }
              if (arqs.length) sb.storage.from("comunidade").remove(arqs).then(function () {});
              U.toast("Post apagado"); rotear();
            });
          }]);
          modal("Postagem", '<p style="color:var(--cinza)">O que deseja fazer com esta postagem?</p>', bots);
        }
      });
    });
  };

  // =================================================================== PROFESSORES (admin)
  var DIAS_C = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function horarioTurma(t) {
    return (t.dias_semana || []).map(function (d) { return DIAS_C[d]; }).join(" e ") + " às " + String(t.hora_inicio || "").slice(0, 5).replace(":00", "h").replace(":", "h");
  }
  function modalTurmasProfessor(titulo, turmas, marcadas, profId, extraHtml, aoSalvar) {
    var nomeProf = {};
    return sb.rpc("professores_das_turmas").then(function (r) {
      (r.data || []).forEach(function (x) { nomeProf[x.turma_id] = x; });
      modal(titulo, '<p style="color:var(--cinza);font-size:14px;margin:0 0 10px">Marque as turmas em que essa pessoa é o professor responsável.</p>' +
        turmas.filter(function (t) { return t.ativa && !t.coletiva; }).map(function (t) {
          var atual = nomeProf[t.id];
          return '<label class="check pp-turma"><input type="checkbox" name="mt" value="' + t.id + '"' + (marcadas.indexOf(t.id) >= 0 ? " checked" : "") + "> <span><b>" + esc(t.nome) + "</b> · " + horarioTurma(t) +
            (atual && atual.professor_id !== profId ? ' <span style="color:#f2a20c">(hoje: ' + esc(atual.professor_nome || "outro professor") + ")</span>" : "") + "</span></label>";
        }).join("") + (extraHtml || ""),
        [["Cancelar", null, "claro"], ["Salvar", function (f) {
          return aoSalvar(U.$$('input[name="mt"]:checked', f).map(function (i) { return i.value; }), f);
        }, "verde"]]);
    });
  }

  VIEWS.professores = function () {
    return Promise.all([
      sb.from("profiles").select("*").order("nome").then(chk),
      sb.from("user_roles").select("user_id,papel").eq("papel", "professor").then(chk),
      sb.from("turmas").select("id,nome,modalidade_id,professor_id,ativa,coletiva,dias_semana,hora_inicio").order("nome").then(chk),
      sb.from("graduacao_niveis").select("id,nome,cor,cor2,modalidade_id,ordem").then(chk),
      sb.from("graduacoes_aluno").select("aluno_id,modalidade_id,nivel_id,grau,data").order("data", { ascending: false }).then(chk),
      sb.from("modalidades").select("id,nome").then(chk)
    ]).then(function (r) {
      var perfis = r[0], ehProf = {}, turmas = r[2], niveis = {}, mods = {};
      r[1].forEach(function (x) { ehProf[x.user_id] = true; });
      r[3].forEach(function (n) { niveis[n.id] = n; });
      r[5].forEach(function (m) { mods[m.id] = m.nome; });
      var nomeTurma = {}; turmas.forEach(function (t) { nomeTurma[t.id] = t.nome; });
      var pendentes = perfis.filter(function (p) { return p.status === "pendente" && p.tipo_cadastro === "professor"; });
      var ativos = perfis.filter(function (p) { return ehProf[p.id]; });
      function gradAtual(id) {
        var vistos = {}, out = [];
        r[4].filter(function (g) { return g.aluno_id === id; }).forEach(function (g) {
          if (vistos[g.modalidade_id]) return; vistos[g.modalidade_id] = 1;
          var n = niveis[g.nivel_id] || {}; out.push((mods[g.modalidade_id] || "") + ": " + esc(n.nome || "?") + (g.grau ? " " + g.grau + "º grau" : "") + " " + U.barraGrad(n, 36));
        });
        return out;
      }
      var linkConvite = location.origin + "/entrar?modo=cadastro&tipo=professor";
      var html = "<h1><em>Professores</em></h1><p class=\"sub\">Solicitações de professor, turmas de cada um e graduação.</p>" +
        '<div class="cartao" style="margin-bottom:16px"><p style="margin:0 0 10px;color:var(--cinza)">Link para um professor se cadastrar:</p>' +
        '<div class="busca" style="margin:0"><input readonly value="' + esc(linkConvite) + '"><button class="btn-mini" id="cp-convite">Copiar link</button></div></div>' +
        "<h2>Solicitações" + (pendentes.length ? ' <span class="tag atencao">' + pendentes.length + "</span>" : "") + "</h2>" +
        (pendentes.length ? '<div class="lista">' + pendentes.map(function (p) {
          var gd = (p.graduacao_declarada || []).map(function (g) { var n = niveis[g.nivel_id] || {}; return (mods[g.modalidade_id] || "") + ": " + esc(n.nome || "?") + (g.grau ? " " + g.grau + "º grau" : "") + " " + U.barraGrad(n, 36); });
          var idade = U.idade(p.data_nascimento);
          return '<div class="cartao"><h3 style="margin:0;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:22px">' + esc(p.nome || p.email) + "</h3>" +
            '<p style="margin:6px 0;color:var(--cinza);font-size:14px">' + esc(p.email || "") + " · " + esc(p.whatsapp || "") + (idade !== null ? " · " + idade + " anos" : "") + " · pediu em " + U.data(p.created_at) + "</p>" +
            '<p style="margin:0 0 6px;font-size:14px">Turmas pedidas: <b>' + esc((p.turmas_professor || []).map(function (t) { return nomeTurma[t] || "turma removida"; }).join(" + ") || "nenhuma") + "</b></p>" +
            '<p style="margin:0 0 6px;font-size:14px">Graduação declarada: ' + (gd.length ? gd.join(" · ") : "<b>não informada</b>") + "</p>" +
            (p.experiencia ? '<p style="margin:0 0 10px;font-size:14px;color:var(--cinza)">Experiência: ' + esc(p.experiencia) + "</p>" : "") +
            '<div class="busca" style="margin:0"><button class="btn-mini verde" data-aprovar-prof="' + p.id + '">Aprovar professor</button><button class="btn-mini claro" data-recusar-prof="' + p.id + '">Recusar</button>' +
            (p.whatsapp ? '<a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(p.whatsapp) + '">WhatsApp</a>' : "") + "</div></div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhuma solicitação de professor.</div>') +
        "<h2>Equipe de professores</h2>" +
        (ativos.length ? '<div class="lista">' + ativos.map(function (p) {
          var ts = turmas.filter(function (t) { return t.professor_id === p.id; });
          var g = gradAtual(p.id);
          return '<div class="item"><div><h3>' + esc(p.nome || p.email) + "</h3><p>" + (ts.length ? esc(ts.map(function (t) { return t.nome; }).join(" + ")) : "Sem turma definida") + "</p>" +
            (g.length ? '<p style="margin-top:4px">' + g.join(" · ") + "</p>" : "") + "</div>" +
            '<div class="acoes"><button class="btn-mini" data-turmas-prof="' + p.id + '">Turmas</button><button class="btn-mini claro" data-ficha="' + p.id + '">Ficha</button>' +
            (p.whatsapp ? '<a class="btn-mini claro" target="_blank" rel="noopener" href="' + U.wa(p.whatsapp) + '">WhatsApp</a>' : "") + "</div></div>";
        }).join("") + "</div>" : '<div class="vazio-box">Nenhum professor ainda. Mande o link acima para a equipe se cadastrar.</div>');
      tela.innerHTML = html;
      $("#cp-convite").onclick = function () { navigator.clipboard.writeText(linkConvite).then(function () { U.toast("Link copiado"); }); };
      tela.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-ficha]"))) return ficha(b.getAttribute("data-ficha"));
        if ((b = e.target.closest("[data-aprovar-prof]"))) {
          var p = perfis.filter(function (x) { return x.id === b.getAttribute("data-aprovar-prof"); })[0];
          return modalTurmasProfessor("Aprovar professor · " + (p.nome || ""), turmas, p.turmas_professor || [], p.id,
            '<label class="check" style="margin-top:12px"><input type="checkbox" id="ap-grad" checked> Registrar a graduação declarada no histórico dele</label>',
            function (sel, f) {
              return sb.rpc("aprovar_professor", { p_prof: p.id, p_turmas: sel, p_registrar_graduacao: f.querySelector("#ap-grad").checked }).then(function (x) {
                if (x.error) { U.erro(x.error); return false; } U.toast("Professor aprovado 🥊"); montarMenu(); rotear();
              });
            });
        }
        if ((b = e.target.closest("[data-recusar-prof]"))) {
          var idr = b.getAttribute("data-recusar-prof");
          return modal("Recusar professor", '<div class="campo"><label for="rp-m">Motivo (a pessoa vê)</label><textarea id="rp-m" rows="3"></textarea></div>',
            [["Cancelar", null, "claro"], ["Recusar", function (f) {
              var m = f.querySelector("#rp-m").value.trim(); if (!m) { U.toast("Escreva o motivo.", "erro"); return false; }
              return sb.rpc("recusar_aluno", { p_aluno: idr, p_motivo: m }).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Solicitação recusada"); montarMenu(); rotear(); });
            }]]);
        }
        if ((b = e.target.closest("[data-turmas-prof]"))) {
          var pid = b.getAttribute("data-turmas-prof"), pp = perfis.filter(function (x) { return x.id === pid; })[0];
          return modalTurmasProfessor("Turmas · " + (pp.nome || ""), turmas, turmas.filter(function (t) { return t.professor_id === pid; }).map(function (t) { return t.id; }), pid, "",
            function (sel) {
              return sb.rpc("definir_turmas_professor", { p_prof: pid, p_turmas: sel }).then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Turmas atualizadas"); rotear(); });
            });
        }
      };
    });
  };

  // =================================================================== CONFIGURAÇÕES (admin)
  VIEWS.config = function () {
    return Promise.all([
      sb.from("academia_config").select("*").single().then(chk),
      sb.from("turmas").select("*").order("ativa", { ascending: false }).order("nome").then(chk),
      sb.from("modalidades").select("*").order("ordem").then(chk),
      sb.from("user_roles").select("user_id").eq("papel", "professor").then(chk),
      sb.from("profiles").select("id,nome").then(chk)
    ]).then(function (r) {
      var c = r[0], turmas = r[1], mods = r[2], profIds = r[3].map(function (x) { return x.user_id; });
      var nomes = {}; r[4].forEach(function (p) { nomes[p.id] = p.nome; });
      var profs = profIds.map(function (id) { return { id: id, nome: nomes[id] || "Professor" }; });
      var nomeMod = {}; mods.forEach(function (m) { nomeMod[m.id] = m.nome; });
      function campo(id, rot, val, tipo, extra) { return '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" type="' + (tipo || "text") + '" value="' + esc(val == null ? "" : val) + '"' + (extra || "") + "></div>"; }
      tela.innerHTML = "<h1><em>Configurações</em></h1><p class=\"sub\">Dados da academia, regras do portal, turmas, modalidades e textos legais.</p>" +
        // academia
        '<h2>Academia</h2><form class="form" id="cf-acad">' + campo("cf-nome", "Nome", c.nome) + campo("cf-slogan", "Slogan", c.slogan) + campo("cf-end", "Endereço", c.endereco) +
        '<div class="linha2">' + campo("cf-whats", "WhatsApp da academia", c.whatsapp, "tel", ' placeholder="5584999999999"') + campo("cf-insta", "Instagram (sem @)", c.instagram) + "</div>" +
        '<button class="btn btn-vermelho" type="submit">Salvar dados</button></form>' +
        // regras
        '<h2>Regras do portal</h2><form class="form" id="cf-regras"><div class="linha2">' +
        campo("cf-cancel", "Cancelar reserva até (horas antes)", c.horas_cancelamento_reserva, "number", ' min="0" max="48"') +
        campo("cf-janela", "Check-in abre (minutos antes da aula)", c.janela_checkin_min, "number", ' min="0" max="120"') + "</div>" +
        campo("cf-bloq", "Bloquear check-in após quantos dias de atraso (vazio = não bloqueia)", c.dias_bloqueio_atraso, "number", ' min="1" max="90"') +
        '<button class="btn btn-vermelho" type="submit">Salvar regras</button></form>' +
        // turmas
        '<h2>Turmas</h2><div class="lista">' + turmas.map(function (t) {
          return '<div class="item' + (t.ativa ? "" : " inativa") + '"><div><h3>' + esc(t.nome) + "</h3><p>" + horarioTurma(t) + " · " + t.duracao_min + " min · até " + t.capacidade + " alunos · " +
            (t.coletiva ? "coletiva (toda a equipe)" : esc(nomeMod[t.modalidade_id] || "")) + " · " + (t.professor_id ? "Prof. " + esc(nomes[t.professor_id] || "") : "sem professor") + "</p></div>" +
            '<div class="acoes">' + tagStatus(t.ativa ? "ativo" : "inativo") + ' <button class="btn-mini claro" data-editar-turma="' + t.id + '">Editar</button></div></div>';
        }).join("") + '</div><div class="busca" style="margin-top:10px"><button class="btn-mini" id="nova-turma">Nova turma</button></div>' +
        // modalidades
        '<h2>Modalidades</h2><div class="lista">' + mods.map(function (m) {
          return '<div class="item"><div><h3>' + esc(m.nome) + "</h3><p>" + ({ prajied: "Gradua por prajied", faixa: "Gradua por faixa e grau", nivel: "Gradua por nível" })[m.sistema] + "</p></div>" +
            '<div class="acoes"><label class="check" style="font-size:14px"><input type="checkbox" data-mod-ativa="' + m.id + '"' + (m.ativa ? " checked" : "") + "> Ativa</label></div></div>";
        }).join("") + "</div>" +
        // textos
        '<h2>Textos legais</h2><form class="form" id="cf-textos">' +
        '<div class="campo"><label for="cf-termo">Termo de responsabilidade</label><textarea id="cf-termo" rows="8">' + esc(c.termo_responsabilidade) + "</textarea></div>" +
        '<div class="campo"><label for="cf-priv">Política de privacidade (LGPD)</label><textarea id="cf-priv" rows="8">' + esc(c.politica_privacidade) + "</textarea></div>" +
        '<p class="dica" style="margin:0">Versão atual: ' + c.versao_termos + ". Ao salvar, a versão sobe e os próximos cadastros aceitam o texto novo.</p>" +
        '<button class="btn btn-vermelho" type="submit">Salvar textos</button></form>';

      function salvarConfig(dados, msg) {
        return sb.from("academia_config").update(dados).eq("id", true).then(function (x) { if (x.error) return U.erro(x.error); U.toast(msg); rotear(); });
      }
      $("#cf-acad").onsubmit = function (e) {
        e.preventDefault();
        salvarConfig({ nome: $("#cf-nome").value.trim(), slogan: $("#cf-slogan").value.trim(), endereco: $("#cf-end").value.trim(),
          whatsapp: U.soDigitos($("#cf-whats").value) || null, instagram: $("#cf-insta").value.replace("@", "").trim() || null }, "Dados da academia salvos");
      };
      $("#cf-regras").onsubmit = function (e) {
        e.preventDefault();
        var bl = parseInt($("#cf-bloq").value, 10);
        salvarConfig({ horas_cancelamento_reserva: parseInt($("#cf-cancel").value, 10) || 0, janela_checkin_min: parseInt($("#cf-janela").value, 10) || 0,
          dias_bloqueio_atraso: bl > 0 ? bl : null }, "Regras salvas");
      };
      $("#cf-textos").onsubmit = function (e) {
        e.preventDefault();
        salvarConfig({ termo_responsabilidade: $("#cf-termo").value, politica_privacidade: $("#cf-priv").value, versao_termos: c.versao_termos + 1 }, "Textos salvos (versão " + (c.versao_termos + 1) + ")");
      };
      tela.onchange = function (e) {
        var m = e.target.closest("[data-mod-ativa]"); if (!m) return;
        sb.from("modalidades").update({ ativa: m.checked }).eq("id", m.getAttribute("data-mod-ativa")).then(function (x) { if (x.error) return U.erro(x.error); U.toast(m.checked ? "Modalidade ativada" : "Modalidade desativada"); });
      };
      function editorTurma(t) {
        t = t || { nome: "", modalidade_id: mods[0] && mods[0].id, dias_semana: [], hora_inicio: "19:00", duracao_min: 60, capacidade: 30, nivel: "todos", professor_id: null, ativa: true, coletiva: false, sparring: false };
        modal(t.id ? "Editar turma" : "Nova turma",
          '<div class="campo"><label for="tu-n">Nome</label><input id="tu-n" value="' + esc(t.nome) + '" placeholder="Ex.: Muay Thai · Turma 4"></div>' +
          '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="tu-m">Modalidade</label><select class="sel" id="tu-m">' +
            mods.map(function (m) { return '<option value="' + m.id + '"' + (m.id === t.modalidade_id ? " selected" : "") + ">" + esc(m.nome) + "</option>"; }).join("") + "</select></div>" +
          '<div class="campo"><label for="tu-p">Professor</label><select class="sel" id="tu-p"><option value="">Sem professor</option>' +
            profs.map(function (p) { return '<option value="' + p.id + '"' + (p.id === t.professor_id ? " selected" : "") + ">" + esc(p.nome) + "</option>"; }).join("") + "</select></div></div>" +
          '<div class="campo" style="margin-top:12px"><label>Dias da semana</label><div class="dias-sel">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
            return '<label class="opcao"><input type="checkbox" name="tu-d" value="' + d + '"' + ((t.dias_semana || []).indexOf(d) >= 0 ? " checked" : "") + "><span>" + DIAS_C[d] + "</span></label>"; }).join("") + "</div></div>" +
          '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="tu-h">Horário</label><input id="tu-h" type="time" value="' + String(t.hora_inicio).slice(0, 5) + '"></div>' +
          '<div class="campo"><label for="tu-du">Duração (min)</label><input id="tu-du" type="number" min="15" max="240" value="' + t.duracao_min + '"></div></div>' +
          '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="tu-c">Capacidade</label><input id="tu-c" type="number" min="1" max="200" value="' + t.capacidade + '"></div>' +
          '<div class="campo"><label for="tu-nv">Nível</label><select class="sel" id="tu-nv">' + [["todos", "Todos os níveis"], ["iniciante", "Iniciante"], ["intermediario", "Intermediário"], ["avancado", "Avançado"], ["kids", "Kids"], ["competicao", "Competição"]].map(function (o) {
            return '<option value="' + o[0] + '"' + (o[0] === t.nivel ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></div>" +
          '<label class="check" style="margin-top:12px"><input type="checkbox" id="tu-col"' + (t.coletiva ? " checked" : "") + "> Aula coletiva aberta a todos os planos (ex.: sparring de sexta)</label>" +
          '<label class="check" style="margin-top:6px"><input type="checkbox" id="tu-at"' + (t.ativa ? " checked" : "") + "> Turma ativa</label>" +
          '<p style="color:var(--cinza);font-size:13px;margin:10px 0 0">Ao salvar, a agenda dos próximos 14 dias é refeita. Aulas que já têm reserva ficam como estão.</p>',
          [["Cancelar", null, "claro"], ["Salvar turma", function (f) {
            var dias = U.$$('input[name="tu-d"]:checked', f).map(function (i) { return parseInt(i.value, 10); });
            var nome = f.querySelector("#tu-n").value.trim();
            if (!nome || !dias.length) { U.toast("Preencha o nome e pelo menos um dia.", "erro"); return false; }
            var col = f.querySelector("#tu-col").checked;
            var dados = { nome: nome, modalidade_id: col ? null : f.querySelector("#tu-m").value, dias_semana: dias, hora_inicio: f.querySelector("#tu-h").value,
              duracao_min: parseInt(f.querySelector("#tu-du").value, 10) || 60, capacidade: parseInt(f.querySelector("#tu-c").value, 10) || 30,
              nivel: f.querySelector("#tu-nv").value, professor_id: f.querySelector("#tu-p").value || null, ativa: f.querySelector("#tu-at").checked,
              coletiva: col, sparring: col };
            var q = t.id ? sb.from("turmas").update(dados).eq("id", t.id).select().single() : sb.from("turmas").insert(dados).select().single();
            return q.then(function (x) {
              if (x.error) { U.erro(x.error); return false; }
              return sb.rpc("atualizar_aulas_turma", { p_turma: x.data.id }).then(function () { U.toast("Turma salva e agenda atualizada"); rotear(); });
            });
          }, "verde"]]);
      }
      tela.onclick = function (e) {
        var b = e.target.closest("[data-editar-turma]");
        if (b) return editorTurma(turmas.filter(function (t) { return t.id === b.getAttribute("data-editar-turma"); })[0]);
        if (e.target.id === "nova-turma") editorTurma();
      };
    });
  };

  // troca de plano e turmas de quem já é aluno (admin)
  function planoETurmas(alunoId, perfil) {
    Promise.all([
      carregarDadosPlano(),
      sb.from("assinaturas").select("plano_id,dia_vencimento").eq("aluno_id", alunoId).eq("ativa", true).order("created_at", { ascending: false }).limit(1).then(chk),
      sb.from("matriculas").select("turma_id").eq("aluno_id", alunoId).then(chk)
    ]).then(function (r) {
      var dp = r[0], ass = r[1][0], mats = r[2].map(function (m) { return m.turma_id; });
      var pick = null;
      var f = modal("Plano e turmas · " + (perfil.nome || ""),
        '<div id="pt-picker"></div><div class="campo" style="margin-top:14px"><label for="pt-dia">Dia de vencimento</label><input id="pt-dia" type="number" min="1" max="28" value="' + ((ass && ass.dia_vencimento) || 10) + '"></div>' +
        '<p style="color:var(--cinza);font-size:13px;margin:10px 0 0">Trocar de plano encerra o plano atual hoje e começa o novo. As mensalidades já geradas não mudam.</p>',
        [["Cancelar", null, "claro"], ["Salvar", function (g) {
          var er = pick.erro(); if (er) { U.toast(er, "erro"); return false; }
          var v = pick.valor();
          return sb.rpc("trocar_plano", { p_aluno: alunoId, p_plano: v.plano, p_turmas: v.turmas, p_dia_vencimento: parseInt(g.querySelector("#pt-dia").value, 10) || 10 })
            .then(function (x) { if (x.error) { U.erro(x.error); return false; } U.toast("Plano e turmas atualizados"); });
        }, "verde"]]);
      pick = PlanoPicker(f.querySelector("#pt-picker"), { planos: dp.planos, turmas: dp.turmas, modalidades: dp.modalidades, permitirSemPlano: true,
        planoId: ass ? ass.plano_id : null, turmaIds: mats.filter(function (t) { return dp.turmas.some(function (x) { return x.id === t && !x.coletiva; }); }) });
    }).catch(function (e) { U.erro(e); });
  }

  // =================================================================== GRADUAÇÃO (equipe)
  var NOME_SIS = { prajied: "Prajied", faixa: "Faixa", nivel: "Nível" };

  function graduacaoAluno(alunoId, perfil) {
    var admin = S.modo === "admin";
    Promise.all([
      sb.from("modalidades").select("id,nome,sistema,ordem").eq("ativa", true).order("ordem").then(chk),
      sb.from("graduacao_niveis").select("*").order("ordem").then(chk),
      sb.from("graduacoes_aluno").select("*, professor:profiles!graduacoes_aluno_professor_id_fkey(nome)").eq("aluno_id", alunoId).order("data", { ascending: false }).then(chk),
      sb.from("graduacao_requisitos").select("*").order("ordem").then(chk),
      sb.from("aluno_tecnicas").select("requisito_id").eq("aluno_id", alunoId).then(chk),
      sb.from("matriculas").select("turmas(modalidade_id)").eq("aluno_id", alunoId).then(chk)
    ]).then(function (r) {
      var mods = r[0], niveis = r[1], hist = r[2], reqs = r[3], feitas = r[4].map(function (x) { return x.requisito_id; });
      var matMods = r[5].map(function (m) { return m.turmas && m.turmas.modalidade_id; });
      var idade = U.idade(perfil.data_nascimento), crianca = idade !== null && idade < 16;
      var nivelPorId = {}; niveis.forEach(function (n) { nivelPorId[n.id] = n; });
      // modalidades relevantes: matriculado, com histórico ou interesse
      var interesse = (perfil.modalidades_interesse || []);
      var relevantes = mods.filter(function (m) {
        return matMods.indexOf(m.id) >= 0 || hist.some(function (h) { return h.modalidade_id === m.id; }) ||
          interesse.indexOf((m.nome || "").toLowerCase().replace(/ /g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "")) >= 0;
      });
      if (!relevantes.length) relevantes = mods;
      function nomeGrad(h) { var n = nivelPorId[h.nivel_id] || {}; return (n.nome || "?") + (h.grau ? " · " + h.grau + "º grau" : ""); }

      var html = '<p style="margin:0 0 14px;color:var(--cinza);font-size:14px">' + esc(perfil.nome || "") + (idade !== null ? " · " + idade + " anos" : "") + "</p>";
      relevantes.forEach(function (m) {
        var atual = hist.filter(function (h) { return h.modalidade_id === m.id; })[0];
        var lista = niveis.filter(function (n) { return n.modalidade_id === m.id && (m.sistema !== "faixa" || n.infantil === crianca); });
        var ordemAtual = atual ? (nivelPorId[atual.nivel_id] || {}).ordem || 0 : 0;
        var prox = lista.filter(function (n) { return n.ordem > ordemAtual; })[0];
        var rq = prox ? reqs.filter(function (q) { return q.nivel_id === prox.id; }) : [];
        html += '<div class="cartao" style="margin-bottom:10px"><h3 style="margin:0 0 4px;font-family:var(--display);font-style:italic;text-transform:uppercase;font-size:20px">' + esc(m.nome) + "</h3>" +
          '<p style="margin:0 0 8px;font-size:14px">Atual: <b>' + (atual ? esc(nomeGrad(atual)) + "</b> " + U.barraGrad(nivelPorId[atual.nivel_id], 48) + " desde " + U.data(atual.data) : "sem registro</b>") + "</p>" +
          (prox ? '<p style="margin:0 0 6px;font-size:13px;color:var(--cinza)">Próximo: ' + esc(prox.nome) + (prox.tempo_minimo_meses ? " · mínimo " + prox.tempo_minimo_meses + " meses" : "") + (prox.aulas_minimas ? " · " + prox.aulas_minimas + " aulas" : "") + "</p>" : "") +
          (rq.length ? '<div style="margin:6px 0 4px">' + rq.map(function (q) {
            return '<label class="check" style="font-size:14px"><input type="checkbox" data-tec="' + q.id + '"' + (feitas.indexOf(q.id) >= 0 ? " checked" : "") + "> " + esc(q.descricao) + "</label>";
          }).join("") + "</div>" : (prox ? '<p style="margin:0;font-size:13px;color:var(--cinza-2)">Sem técnicas exigidas cadastradas para esse nível.</p>' : "")) +
          '<button class="btn-mini" style="margin-top:10px" data-registrar="' + m.id + '">Registrar ' + NOME_SIS[m.sistema].toLowerCase() + "</button></div>";
      });
      html += "<h3 style=\"margin:18px 0 8px;font-family:var(--display);font-style:italic;text-transform:uppercase\">Histórico</h3>" +
        (hist.length ? hist.map(function (h) {
          var m = mods.filter(function (x) { return x.id === h.modalidade_id; })[0] || {};
          return '<div class="item" style="margin-bottom:6px"><div><h3 style="font-size:16px">' + esc(m.nome || "") + " · " + esc(nomeGrad(h)) + "</h3><p>" + U.data(h.data) +
            (h.professor ? " · por " + esc(h.professor.nome) : "") + (h.obs ? " · " + esc(h.obs) : "") + "</p></div>" +
            (admin ? '<button class="btn-mini claro" data-apagar-grad="' + h.id + '">Apagar</button>' : "") + "</div>";
        }).join("") : '<p class="vazio">Nenhuma graduação registrada.</p>');

      var f = modal("Graduação", html);
      f.addEventListener("change", function (e) {
        var c = e.target.closest("[data-tec]"); if (!c) return;
        var q = c.checked ? sb.from("aluno_tecnicas").insert({ aluno_id: alunoId, requisito_id: c.getAttribute("data-tec"), marcado_por: S.user.id })
                          : sb.from("aluno_tecnicas").delete().eq("aluno_id", alunoId).eq("requisito_id", c.getAttribute("data-tec"));
        q.then(function (x) { if (x.error) { c.checked = !c.checked; return U.erro(x.error); } U.toast(c.checked ? "Técnica marcada" : "Técnica desmarcada"); });
      });
      f.addEventListener("click", function (e) {
        var b = e.target.closest("[data-registrar]"), d = e.target.closest("[data-apagar-grad]");
        if (d) {
          if (!confirmar(d)) return;
          sb.from("graduacoes_aluno").delete().eq("id", d.getAttribute("data-apagar-grad")).then(function (x) {
            if (x.error) return U.erro(x.error); U.toast("Registro apagado"); f.remove(); graduacaoAluno(alunoId, perfil);
          });
        }
        if (!b) return;
        var m = mods.filter(function (x) { return x.id === b.getAttribute("data-registrar"); })[0];
        var lista = niveis.filter(function (n) { return n.modalidade_id === m.id; }).sort(function (a, c) { return (a.infantil - c.infantil) || (a.ordem - c.ordem); });
        var ultimo = hist.filter(function (h) { return h.modalidade_id === m.id; })[0];
        modal("Registrar " + NOME_SIS[m.sistema].toLowerCase() + " · " + m.nome,
          '<div class="campo"><label for="g-n">' + NOME_SIS[m.sistema] + '</label><select class="sel" id="g-n">' + lista.map(function (n) {
            return '<option value="' + n.id + '" data-graus="' + n.graus_max + '"' + (ultimo && ultimo.nivel_id === n.id ? " selected" : "") + ">" + esc(n.nome) + (n.infantil ? " (infantil)" : "") + "</option>";
          }).join("") + "</select></div>" +
          '<div class="campo" style="margin-top:12px" id="g-grau-c"><label for="g-g">Grau</label><select class="sel" id="g-g"></select></div>' +
          '<div class="linha2" style="margin-top:12px"><div class="campo"><label for="g-d">Data</label><input id="g-d" type="date" value="' + U.hojeISO() + '"></div>' +
          '<div class="campo"><label for="g-o">Observação</label><input id="g-o" placeholder="Ex.: exame de 28/11"></div></div>' +
          '<p style="color:var(--cinza);font-size:13px;margin:12px 0 0">Fica registrado quem graduou e quando. Use também para lançar a graduação que o aluno já tinha.</p>',
          [["Cancelar", null, "claro"], ["Registrar", function (g) {
            var sel = g.querySelector("#g-n");
            return sb.from("graduacoes_aluno").insert({
              aluno_id: alunoId, modalidade_id: m.id, nivel_id: sel.value,
              grau: parseInt((g.querySelector("#g-g") || {}).value, 10) || 0,
              data: g.querySelector("#g-d").value || U.hojeISO(), professor_id: S.user.id, obs: g.querySelector("#g-o").value.trim() || null
            }).then(function (x) {
              if (x.error) { U.erro(x.error); return false; }
              U.toast("Graduação registrada 🔥"); f.remove(); graduacaoAluno(alunoId, perfil);
            });
          }, "verde"]]);
        var atualizaGraus = function () {
          var mx = parseInt(document.querySelector("#g-n").selectedOptions[0].getAttribute("data-graus"), 10) || 0;
          document.querySelector("#g-grau-c").hidden = !mx;
          var opts = ""; for (var i = 0; i <= mx; i++) opts += '<option value="' + i + '">' + (i ? i + "º grau" : "Sem grau") + "</option>";
          document.querySelector("#g-g").innerHTML = opts;
        };
        document.querySelector("#g-n").onchange = atualizaGraus; atualizaGraus();
      });
    }).catch(function (e) { U.erro(e); });
  }

  // confirmação em dois toques (sem alert/confirm do navegador)
  function confirmar(btn) {
    if (btn.getAttribute("data-conf") === "1") return true;
    btn.setAttribute("data-conf", "1"); var t = btn.textContent; btn.textContent = "Toque de novo";
    setTimeout(function () { btn.removeAttribute("data-conf"); btn.textContent = t; }, 3000);
    return false;
  }

  // ------------------------------------------------ configuração dos sistemas (admin)
  VIEWS.graduacoes = function () {
    var modSel = (location.hash.match(/mod=([0-9a-f-]+)/) || [])[1];
    return Promise.all([
      sb.from("modalidades").select("id,nome,sistema").eq("ativa", true).order("ordem").then(chk),
      sb.from("graduacao_niveis").select("*").order("infantil").order("ordem").then(chk),
      sb.from("graduacao_requisitos").select("*").order("ordem").then(chk)
    ]).then(function (r) {
      var mods = r[0], niveis = r[1], reqs = r[2];
      var m = mods.filter(function (x) { return x.id === modSel; })[0] || mods[0];
      var lista = niveis.filter(function (n) { return n.modalidade_id === m.id; });
      var termo = NOME_SIS[m.sistema];
      tela.innerHTML = "<h1>Sistema de <em>graduação</em></h1><p class=\"sub\">Defina " + (m.sistema === "prajied" ? "os prajieds" : m.sistema === "faixa" ? "as faixas" : "os níveis") +
        ", a ordem, o tempo mínimo, as aulas mínimas e as técnicas cobradas no exame. O aluno vê o progresso a partir daqui.</p>" +
        '<div class="filtros">' + mods.map(function (x) { return '<button class="filtro" data-mod="' + x.id + '" aria-pressed="' + (x.id === m.id) + '">' + esc(x.nome) + "</button>"; }).join("") + "</div>" +
        (m.sistema === "prajied" ? '<p style="color:#f2a20c;font-size:14px;margin:0 0 12px">Muay Thai gradua por prajied. Nunca use "faixa" nos nomes.</p>' : "") +
        '<div class="lista">' + lista.map(function (n) {
          var rq = reqs.filter(function (q) { return q.nivel_id === n.id; });
          return '<div class="cartao" data-nivel="' + n.id + '">' +
            '<div class="linha2"><div class="campo"><label>Nome</label><input data-c="nome" value="' + esc(n.nome) + '"></div>' +
            '<div class="campo"><label>Cor ' + U.barraGrad(n, 48) + '</label><input data-c="cor" type="color" value="' + esc(n.cor || "#888888") + '" style="height:46px;padding:4px"></div></div>' +
            '<div class="linha2" style="margin-top:10px"><div class="campo"><label><input type="checkbox" data-ponta' + (n.cor2 ? " checked" : "") + '> Ponta de outra cor</label>' +
              '<input data-c="cor2" type="color" value="' + esc(n.cor2 || "#ffffff") + '" style="height:46px;padding:4px"></div>' +
            '<div class="campo"></div></div>' +
            '<div class="linha2" style="margin-top:10px"><div class="campo"><label>Ordem</label><input data-c="ordem" type="number" value="' + n.ordem + '"></div>' +
            '<div class="campo"><label>Graus (0 = sem grau)</label><input data-c="graus_max" type="number" min="0" max="10" value="' + n.graus_max + '"></div></div>' +
            '<div class="linha2" style="margin-top:10px"><div class="campo"><label>Tempo mínimo (meses)</label><input data-c="tempo_minimo_meses" type="number" min="0" value="' + n.tempo_minimo_meses + '"></div>' +
            '<div class="campo"><label>Aulas mínimas</label><input data-c="aulas_minimas" type="number" min="0" value="' + n.aulas_minimas + '"></div></div>' +
            (m.sistema === "faixa" ? '<label class="check" style="margin-top:10px"><input type="checkbox" data-c="infantil"' + (n.infantil ? " checked" : "") + "> Faixa infantil</label>" : "") +
            '<p style="margin:14px 0 6px;font-family:var(--display);font-weight:700;letter-spacing:2px;font-size:13px;color:var(--vermelho);text-transform:uppercase">Técnicas exigidas para chegar aqui</p>' +
            (rq.length ? rq.map(function (q) { return '<div class="chamada-linha" style="padding:6px 0"><span>' + esc(q.descricao) + '</span><button class="btn-mini claro" data-del-req="' + q.id + '">Remover</button></div>'; }).join("") : '<p class="vazio" style="margin:0 0 6px;font-size:14px">Nenhuma técnica cadastrada.</p>') +
            '<div class="busca" style="margin:8px 0 0"><input data-novo-req placeholder="Nova técnica (ex.: chute circular com base)"><button class="btn-mini claro" data-add-req="' + n.id + '">Adicionar</button></div>' +
            '<div class="busca" style="margin:12px 0 0"><button class="btn-mini" data-salvar-nivel="' + n.id + '">Salvar ' + termo.toLowerCase() + '</button><button class="btn-mini claro" data-del-nivel="' + n.id + '">Excluir</button></div></div>';
        }).join("") + "</div>" +
        '<div class="busca" style="margin-top:14px"><button class="btn-mini" id="novo-nivel">Adicionar ' + termo.toLowerCase() + "</button></div>";

      tela.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-mod]"))) { location.hash = "#/graduacoes?mod=" + b.getAttribute("data-mod"); return; }
        if ((b = e.target.closest("[data-salvar-nivel]"))) {
          var card = b.closest("[data-nivel]"), d = {};
          U.$$("[data-c]", card).forEach(function (i) {
            var k = i.getAttribute("data-c");
            d[k] = i.type === "checkbox" ? i.checked : (i.type === "number" ? parseInt(i.value, 10) || 0 : i.value.trim());
          });
          if (!card.querySelector("[data-ponta]").checked) d.cor2 = null;
          if (m.sistema === "prajied" && /faixa/i.test(d.nome)) return U.toast('No Muay Thai é prajied, não "faixa".', "erro");
          sb.from("graduacao_niveis").update(d).eq("id", b.getAttribute("data-salvar-nivel")).then(function (x) { if (x.error) return U.erro(x.error); U.toast("Salvo"); });
        }
        if ((b = e.target.closest("[data-del-nivel]"))) {
          if (!confirmar(b)) return;
          sb.from("graduacao_niveis").delete().eq("id", b.getAttribute("data-del-nivel")).then(function (x) {
            if (x.error) return U.erro(/foreign key/i.test(x.error.message) ? { message: "Já tem aluno com essa graduação no histórico. Renomeie em vez de excluir." } : x.error);
            U.toast("Excluído"); rotear();
          });
        }
        if ((b = e.target.closest("[data-add-req]"))) {
          var inp = b.parentNode.querySelector("[data-novo-req]"), txt = inp.value.trim(); if (!txt) return;
          sb.from("graduacao_requisitos").insert({ nivel_id: b.getAttribute("data-add-req"), descricao: txt, ordem: reqs.length + 1 }).then(function (x) { if (x.error) return U.erro(x.error); rotear(); });
        }
        if ((b = e.target.closest("[data-del-req]"))) {
          sb.from("graduacao_requisitos").delete().eq("id", b.getAttribute("data-del-req")).then(function (x) { if (x.error) return U.erro(x.error); rotear(); });
        }
        if (e.target.id === "novo-nivel") {
          var maior = lista.reduce(function (a, n) { return n.infantil ? a : Math.max(a, n.ordem); }, 0);
          sb.from("graduacao_niveis").insert({ modalidade_id: m.id, nome: "Novo " + termo.toLowerCase(), cor: "#888888", ordem: maior + 1, graus_max: m.sistema === "faixa" ? 4 : 0 })
            .then(function (x) { if (x.error) return U.erro(x.error); U.toast("Adicionado. Ajuste nome e cor e salve."); rotear(); });
        }
      };
    });
  };

  iniciar();
})();
