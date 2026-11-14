(function () {
  var Z = window.ZXT;
  var DIAS = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
  var MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  var ICONES = {
    boxe: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M18 30c0-11 7-19 17-19h4c8 0 13 6 13 14v9c0 6-4 10-9 11v6H24v-7c-4-2-6-7-6-14z"/><path d="M18 30h10c4 0 6 3 6 6"/><path d="M24 50h19"/></svg>',
    muaythai: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="22" cy="10" r="5"/><path d="M22 16l-4 16 8 6v16"/><path d="M18 32l-8 18"/><path d="M20 22l-9 4"/><path d="M24 22l10-6"/><path d="M26 30l14-4 16-8"/></svg>',
    mma: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"><path d="M22 6h20l16 16v20L42 58H22L6 42V22z"/><path d="M26 16h12l10 10v12L38 48H26L16 38V26z" stroke-width="2.5"/></svg>',
    jiujitsu: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 24h56"/><path d="M4 32h56"/><rect x="26" y="20" width="12" height="16" rx="2"/><path d="M28 36l-8 20"/><path d="M36 36l8 20"/></svg>',
    relogio: '<svg class="relogio" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><circle cx="24" cy="24" r="19"/><path d="M24 13v12l8 5"/></svg>',
    whats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3z"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>'
  };
  window.ZXT_ICONES = ICONES;

  function nomeModalidade(id) {
    if (id === "sparring") return "Sparring";
    for (var i = 0; i < Z.modalidades.length; i++) if (Z.modalidades[i].id === id) return Z.modalidades[i].nome;
    return id;
  }
  function textoDias(d) {
    var n = d.map(function (x) { return DIAS[x]; });
    return n.length > 1 ? n.slice(0, -1).join(", ") + " e " + n[n.length - 1] : n[0];
  }
  function el(id) { return document.getElementById(id); }

  // Link de contato: WhatsApp se houver número, senão direct do Instagram
  function linkContato(msg) {
    if (Z.whatsapp) return "https://wa.me/" + Z.whatsapp + "?text=" + encodeURIComponent(msg || "Olá, ZXT! Quero saber mais sobre os treinos 🥊");
    return "https://ig.me/m/" + Z.instagram;
  }
  window.ZXT_linkContato = linkContato;
  var linkInsta = "https://instagram.com/" + Z.instagram;

  // preenche links de contato marcados no HTML
  document.querySelectorAll("[data-contato]").forEach(function (a) {
    a.href = linkContato(a.getAttribute("data-msg"));
    a.target = "_blank"; a.rel = "noopener";
    var rot = a.querySelector("[data-rotulo]");
    if (rot) rot.textContent = Z.whatsapp ? "Chamar no WhatsApp" : "Chamar no direct";
    var ic = a.querySelector("[data-icone]");
    if (ic) ic.innerHTML = Z.whatsapp ? ICONES.whats : ICONES.insta;
  });
  document.querySelectorAll("[data-insta]").forEach(function (a) { a.href = linkInsta; a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll("[data-ano]").forEach(function (s) { s.textContent = new Date().getFullYear(); });

  // ---------- modalidades ----------
  var boxMod = el("lista-modalidades");
  if (boxMod) {
    boxMod.innerHTML = Z.modalidades.map(function (m) {
      return '<article class="mod">' + (m.novidade ? '<span class="selo">NOVIDADE</span>' : "") +
        ICONES[m.icone] + "<h3>" + m.nome + "</h3><p>" + m.texto + "</p></article>";
    }).join("");
  }

  // ---------- grade ----------
  var boxGrade = el("grade");
  if (boxGrade) {
    var filtros = [{ id: "todas", nome: "Todas" }].concat(Z.modalidades.map(function (m) { return { id: m.id, nome: m.nome }; }));
    filtros.push({ id: "sparring", nome: "Sparring" });
    var boxFiltros = el("filtros");
    boxFiltros.innerHTML = filtros.map(function (f, i) {
      return '<button type="button" class="filtro" data-f="' + f.id + '" aria-pressed="' + (i === 0) + '">' + f.nome + "</button>";
    }).join("");

    function desenhar(f) {
      var itens = Z.grade.filter(function (g) { return f === "todas" || g.modalidade === f; });
      var html = itens.map(function (g) {
        var sp = g.modalidade === "sparring";
        return '<article class="horario' + (sp ? " sparring" : "") + '">' + ICONES.relogio +
          '<div><p class="mod-nome">' + nomeModalidade(g.modalidade) + "</p><h3>" + (sp ? "Sparring" : g.turma) + "</h3>" +
          '<p class="quando">' + textoDias(g.dias) + (sp ? " · " + g.turma : "") + "</p></div>" +
          '<span class="hora">' + g.hora + "</span></article>";
      }).join("");
      boxGrade.innerHTML = html;
      var semGrade = Z.modalidades.filter(function (m) {
        return (f === "todas" || f === m.id) && !Z.grade.some(function (g) { return g.modalidade === m.id; });
      });
      var aviso = el("aviso-grade");
      if (semGrade.length) {
        aviso.hidden = false;
        aviso.innerHTML = "<strong>" + semGrade.map(function (m) { return m.nome; }).join(" e ") +
          ":</strong> horários saindo do forno. <a data-contato-dyn href=\"" + linkContato("Olá, ZXT! Quero saber os horários de " +
          semGrade.map(function (m) { return m.nome; }).join(" e ") + " 🥊") + "\" target=\"_blank\" rel=\"noopener\">Chama a gente</a> para garantir sua vaga.";
      } else { aviso.hidden = true; }
    }
    boxFiltros.addEventListener("click", function (e) {
      var b = e.target.closest(".filtro"); if (!b) return;
      boxFiltros.querySelectorAll(".filtro").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      desenhar(b.getAttribute("data-f"));
    });
    desenhar("todas");
  }

  // ---------- eventos ----------
  var boxEv = el("lista-eventos");
  if (boxEv) {
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var prox = Z.eventos.filter(function (e) { return new Date(e.data + "T23:59:59") >= hoje; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!prox.length) {
      boxEv.innerHTML = '<p class="vazio">Novos eventos em breve. Fica de olho no <a href="' + linkInsta + '" target="_blank" rel="noopener">@' + Z.instagram + "</a> 🔥</p>";
    } else {
      boxEv.innerHTML = prox.map(function (e) {
        var p = e.data.split("-");
        var maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(e.local);
        return '<article class="evento"><div class="dia"><b>' + p[2] + "</b><span>" + MESES[+p[1] - 1] + "</span></div><div>" +
          "<h3>" + e.titulo + "</h3>" +
          "<p><strong>Data:</strong> " + p[2] + "/" + p[1] + "/" + p[0] + (e.hora ? ", às " + e.hora : "") + "</p>" +
          "<p><strong>Local:</strong> " + e.local + "</p>" +
          (e.texto ? "<p>" + e.texto + "</p>" : "") +
          '<div class="acoes"><a class="btn btn-borda btn-sm" href="' + maps + '" target="_blank" rel="noopener">Ver no mapa</a>' +
          '<a class="btn btn-vermelho btn-sm" href="' + linkContato("Olá, ZXT! Quero informações sobre o " + e.titulo + " 🥊") + '" target="_blank" rel="noopener">Quero participar</a></div>' +
          "</div></article>";
      }).join("");
    }
  }

  // ---------- professores ----------
  var boxProf = el("lista-professores");
  if (boxProf) {
    if (Z.professores.length) {
      boxProf.className = "profs";
      boxProf.innerHTML = Z.professores.map(function (p) {
        return '<article class="prof"><img src="' + p.foto + '" alt="' + p.nome + '" loading="lazy"><div><h3>' + p.nome + "</h3><p>" + p.modalidades + "</p></div></article>";
      }).join("");
    } else {
      boxProf.innerHTML = '<div class="convite-time"><p><strong>Professores que vivem a luta</strong>Um time inteiro de professores para corrigir sua base, puxar seu ritmo e te preparar para o exame e para a competição. Conheça cada um no nosso Instagram.</p>' +
        '<a class="btn btn-borda" href="' + linkInsta + '" target="_blank" rel="noopener">' + ICONES.insta + "@" + Z.instagram + "</a></div>";
    }
  }
})();
