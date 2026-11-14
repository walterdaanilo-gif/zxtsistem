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
