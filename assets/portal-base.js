// Base comum do portal ZXT: cliente Supabase + utilitários.
// A chave abaixo é a chave PÚBLICA (publishable): feita para ficar no navegador.
// Toda a segurança está nas regras do banco (RLS), não neste arquivo.
window.ZXT_SUPABASE = {
  url: "https://gsfvgdhjlqwrysgruyaj.supabase.co",
  chave: "sb_publishable_P2_9ELbKtSrUllu_S7NdGw_jxM-5r1C"
};
window.sb = window.supabase.createClient(ZXT_SUPABASE.url, ZXT_SUPABASE.chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

window.U = {
  $: function (s, el) { return (el || document).querySelector(s); },
  $$: function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); },
  esc: function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  },
  reais: function (centavos) {
    return (Number(centavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },
  data: function (d) {
    if (!d) return "";
    var s = String(d).slice(0, 10).split("-");
    return s[2] + "/" + s[1] + "/" + s[0];
  },
  dataHora: function (iso) {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  },
  hora: function (iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });
  },
  diaSemana: function (iso) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "2-digit", month: "2-digit" });
  },
  hojeISO: function () {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  },
  idade: function (nasc) {
    if (!nasc) return null;
    var n = new Date(nasc + "T12:00:00"), h = new Date();
    var a = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
    return a;
  },
  soDigitos: function (s) { return String(s || "").replace(/\D/g, ""); },
  wa: function (fone, msg) {
    var d = U.soDigitos(fone);
    if (d && d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d + (msg ? "?text=" + encodeURIComponent(msg) : "");
  },
  cpfValido: function (cpf) {
    cpf = U.soDigitos(cpf);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += cpf[i] * (t + 1 - i);
      if (((s * 10) % 11) % 10 != cpf[t]) return false;
    }
    return true;
  },
  toast: function (msg, tipo) {
    var t = document.createElement("div");
    t.className = "toast " + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("sai"); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  },
  erro: function (e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) m = "E-mail ou senha incorretos.";
    if (/User already registered/i.test(m)) m = "Esse e-mail já tem cadastro. Use Entrar ou Esqueci a senha.";
    if (/Password should be at least/i.test(m)) m = "A senha precisa ter pelo menos 8 caracteres.";
    if (/rate limit/i.test(m)) m = "Muitas tentativas seguidas. Aguarde alguns minutos.";
    U.toast(m, "erro");
    return m;
  }
};

// ---------------------------------------------------------------------------
// Seletor de plano + turmas (cadastro, aprovação e troca de plano).
// Regra: plano.max_turmas = quantas turmas pode escolher; plano.turmas_livres = todas.
// Sparring de sexta é de todos e não entra na escolha.
// ---------------------------------------------------------------------------
window.PlanoPicker = function (el, opts) {
  var DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var planos = opts.planos || [], turmas = (opts.turmas || []).filter(function (t) { return !t.coletiva; });
  var mods = opts.modalidades || [];
  var estado = { plano: opts.planoId || null, turmas: (opts.turmaIds || []).slice() };
  function regra(p) {
    if (p.turmas_livres) return "Todas as turmas e horários + sparring de sexta";
    if (p.max_turmas) return p.max_turmas + (p.max_turmas > 1 ? " turmas à sua escolha" : " turma à sua escolha") + " (2 aulas por semana cada) + sparring de sexta";
    return "Turmas definidas pela equipe + sparring de sexta";
  }
  function horario(t) {
    return (t.dias_semana || []).map(function (d) { return DIAS[d]; }).join(" e ") + " às " + String(t.hora_inicio || "").slice(0, 5).replace(":00", "h").replace(":", "h");
  }
  function planoAtual() { return planos.filter(function (p) { return p.id === estado.plano; })[0]; }

  // ---- números reais da grade para explicar cada plano (sem inventar dado) ----
  var todas = opts.turmas || [];
  var aulasTurmasSemana = todas.filter(function (t) { return !t.coletiva; }).reduce(function (s, t) { return s + (t.dias_semana || []).length; }, 0);
  var sparringSemana = todas.filter(function (t) { return t.coletiva; }).reduce(function (s, t) { return s + (t.dias_semana || []).length; }, 0) || 1;
  var MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
  function treinosSemana(x) { return x.turmas_livres ? aulasTurmasSemana + sparringSemana : (x.max_turmas || 1) * 2 + sparringSemana; }
  function treinosMes(x) { return Math.round(treinosSemana(x) * 52 / 12); }
  function valorMes(x) { return x.valor_centavos / (MESES[x.periodicidade] || 1); }
  function custoTreino(x) { return valorMes(x) / treinosMes(x); }
  var mensais = planos.slice().sort(function (a, b) { return valorMes(a) - valorMes(b); });
  var maisBarato = mensais[0] && mensais[0].id;
  var melhorCusto = planos.slice().sort(function (a, b) { return custoTreino(a) - custoTreino(b); })[0];
  melhorCusto = melhorCusto && melhorCusto.id;
  function selo(x) {
    if (!opts.explicar) return "";
    if (x.id === melhorCusto && planos.length > 1) return '<span class="selo-plano">Melhor custo por treino</span>';
    if (x.id === maisBarato && planos.length > 1) return '<span class="selo-plano claro">Menor investimento</span>';
    return "";
  }
  function explicacao(x) {
    var tsem = treinosSemana(x), tmes = treinosMes(x), custo = U.reais(Math.round(custoTreino(x)));
    var idx = mensais.indexOf(x), prox = mensais[idx + 1];
    var paraQuem, itens;
    if (x.turmas_livres) {
      paraQuem = "Para quem quer treinar sem limite: competir, chegar forte no exame de graduação ou encaixar o treino no horário que der.";
      itens = ["Todas as turmas e todos os horários da grade, de todas as modalidades",
               "Até " + tsem + " treinos por semana (cerca de " + tmes + " por mês)",
               "Perdeu o treino da manhã? Vai à noite. Sem ficar preso a uma turma",
               "Sparring de sexta com a equipe toda"];
    } else if ((x.max_turmas || 1) >= 2) {
      paraQuem = "Para quem já pegou o ritmo e quer evoluir mais rápido: o dobro de turmas do plano de entrada.";
      itens = [x.max_turmas + " turmas à sua escolha: 2 modalidades (ex.: Muay Thai + Boxe) ou 2 turmas da mesma modalidade",
               tsem + " treinos por semana (cerca de " + tmes + " por mês)",
               "Mais repetição de técnica por semana, que é o que faz a graduação andar",
               "Sparring de sexta com a equipe toda"];
    } else {
      paraQuem = "Para começar com o pé direito ou para quem tem a rotina corrida: um compromisso fixo e possível de cumprir.";
      itens = ["1 turma à sua escolha, em qualquer modalidade",
               "2 aulas fixas por semana + sparring de sexta = " + tsem + " treinos por semana",
               "Cerca de " + tmes + " treinos por mês para criar o hábito",
               "Pode subir de plano quando quiser, é só falar com a recepção"];
    }
    var subir = "";
    if (prox) {
      var dif = Math.round(valorMes(prox) - valorMes(x)), ganho = treinosSemana(prox) - tsem;
      if (dif > 0 && ganho > 0) subir = '<p class="pp-subir">💡 Por <b>+ ' + U.reais(dif) + "/mês</b> no " + U.esc(prox.nome) + " você ganha <b>" + ganho + " treino" + (ganho > 1 ? "s" : "") +
        " a mais por semana</b>" + (custoTreino(prox) < custoTreino(x) ? " e o treino sai mais barato: " + U.reais(Math.round(custoTreino(prox))) + " cada" : "") + ".</p>";
    }
    return '<div class="pp-explica"><p class="pp-explica-t">Como funciona o ' + U.esc(x.nome) + "</p>" +
      '<p class="pp-para">' + paraQuem + "</p><ul>" + itens.map(function (i) { return "<li>" + U.esc(i) + "</li>"; }).join("") + "</ul>" +
      '<p class="pp-custo">Sai a <b>' + custo + " por treino</b> (" + U.reais(Math.round(valorMes(x))) + "/mês ÷ " + tmes + " treinos)</p>" + subir + "</div>";
  }

  function desenhar() {
    var p = planoAtual();
    var html = '<div class="planos-op">' + planos.map(function (x) {
      return '<label class="plano-op' + (x.id === estado.plano ? " sel" : "") + '"><input type="radio" name="pp-plano" value="' + x.id + '"' + (x.id === estado.plano ? " checked" : "") + ">" + selo(x) +
        "<b>" + U.esc(x.nome) + "</b>" + (opts.mostrarValor !== false ? "<span class=\"valor\">" + U.reais(x.valor_centavos) + "<small>/" + (x.periodicidade || "mês").replace("mensal", "mês") + "</small></span>" : "") +
        "<span class=\"regra\">" + U.esc(regra(x)) + "</span></label>";
    }).join("") + (opts.permitirSemPlano ? '<label class="plano-op' + (!estado.plano ? " sel" : "") + '"><input type="radio" name="pp-plano" value=""' + (!estado.plano ? " checked" : "") + "><b>Sem plano</b><span class=\"regra\">Bolsista ou isento: turmas escolhidas pela equipe</span></label>" : "") + "</div>";
    if (opts.explicar && p) html += explicacao(p);
    if (p && p.turmas_livres) {
      html += '<p class="pp-aviso">Plano livre: treina em qualquer turma e horário. Não precisa escolher turma.</p>';
    } else if (p || (opts.permitirSemPlano && !estado.plano)) {
      var max = p ? p.max_turmas : null;
      html += '<p class="pp-titulo">' + (max ? "Escolha " + (max > 1 ? "até " + max + " turmas" : "1 turma") : "Escolha as turmas") +
        ' <span id="pp-cont">' + estado.turmas.length + (max ? "/" + max : "") + "</span></p>";
      mods.forEach(function (m) {
        var ts = turmas.filter(function (t) { return t.modalidade_id === m.id; });
        if (!ts.length) return;
        html += '<p class="pp-mod">' + U.esc(m.nome) + "</p>" + ts.map(function (t) {
          var on = estado.turmas.indexOf(t.id) >= 0, cheio = max && !on && estado.turmas.length >= max;
          return '<label class="check pp-turma' + (cheio ? " off" : "") + '"><input type="checkbox" name="pp-turma" value="' + t.id + '"' + (on ? " checked" : "") + (cheio ? " disabled" : "") + "> " +
            "<span><b>" + U.esc(t.nome.replace(m.nome + " · ", "")) + "</b> · " + horario(t) + "</span></label>";
        }).join("");
      });
      html += '<p class="pp-aviso">O sparring de sexta às 19h é liberado para todos os planos.</p>';
    } else {
      html += '<p class="pp-aviso">Escolha um plano para ver as turmas.</p>';
    }
    el.innerHTML = html;
  }
  el.addEventListener("change", function (e) {
    if (e.target.name === "pp-plano") {
      estado.plano = e.target.value || null;
      var p = planoAtual();
      if (p && p.turmas_livres) estado.turmas = [];
      else if (p && p.max_turmas) estado.turmas = estado.turmas.slice(0, p.max_turmas);
      desenhar();
    }
    if (e.target.name === "pp-turma") {
      var id = e.target.value, i = estado.turmas.indexOf(id);
      if (e.target.checked && i < 0) estado.turmas.push(id);
      if (!e.target.checked && i >= 0) estado.turmas.splice(i, 1);
      desenhar();
    }
  });
  desenhar();
  return {
    valor: function () { return { plano: estado.plano, turmas: estado.turmas.slice() }; },
    erro: function () {
      var p = planoAtual();
      if (!estado.plano) return opts.permitirSemPlano ? (estado.turmas.length ? null : "Escolha pelo menos uma turma.") : "Escolha um plano.";
      if (p.turmas_livres) return null;
      if (!estado.turmas.length) return "Escolha a turma do seu plano.";
      if (p.max_turmas && estado.turmas.length > p.max_turmas) return "Esse plano dá direito a " + p.max_turmas + " turma(s).";
      return null;
    },
    modalidadesSlugs: function () {
      var p = planoAtual();
      if (p && p.turmas_livres) return mods.map(function (m) { return m.slug; });
      var ids = estado.turmas.map(function (id) { return (turmas.filter(function (t) { return t.id === id; })[0] || {}).modalidade_id; });
      return mods.filter(function (m) { return ids.indexOf(m.id) >= 0; }).map(function (m) { return m.slug; });
    }
  };
};
window.carregarDadosPlano = function () {
  return Promise.all([
    sb.from("planos").select("id,nome,valor_centavos,periodicidade,max_turmas,turmas_livres").eq("ativo", true).order("valor_centavos", { ascending: false }),
    sb.from("turmas").select("id,nome,modalidade_id,dias_semana,hora_inicio,coletiva").eq("ativa", true).order("nome"),
    sb.from("modalidades").select("id,slug,nome").eq("ativa", true).order("ordem")
  ]).then(function (r) { return { planos: r[0].data || [], turmas: r[1].data || [], modalidades: r[2].data || [] }; });
};

// faixa/prajied colorido: cor única ou duas cores (ex.: "ponta branca")
U.corGrad = function (n) {
  if (!n) return "#333";
  return n.cor2 ? "linear-gradient(90deg, " + n.cor + " 0 55%, " + n.cor2 + " 55% 100%)" : (n.cor || "#333");
};
U.barraGrad = function (n, largura) {
  return '<span class="barra-grad" style="width:' + (largura || 64) + 'px;background:' + U.esc(U.corGrad(n)) + '"></span>';
};
