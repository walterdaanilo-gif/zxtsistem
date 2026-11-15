// "Baixar o app": Android instala direto pelo Chrome (gera o app de verdade, sem arquivo .apk);
// iPhone mostra o guia com a seta para o botão Compartilhar (a Apple não deixa o site criar o atalho sozinho).
// Uso: qualquer botão com data-instalar="android" ou data-instalar="ios".
(function () {
  var pedido = null;
  var ua = navigator.userAgent;
  var ehIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var ehAndroid = /android/i.test(ua);
  var outroNavIOS = ehIOS && /crios|fxios|edgios|opios/i.test(ua);
  function instalado() { return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches; }
  var SITE = location.origin + "/app";

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); pedido = e; marcar(); });
  window.addEventListener("appinstalled", function () { pedido = null; aviso("App da ZXT instalado ✅", "Procure o ícone da ZXT na sua tela de aplicativos e entre com seu login."); });
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });

  function marcar() {
    document.querySelectorAll('[data-instalar="android"]').forEach(function (b) { b.classList.add("pronto"); });
  }

  function camada(html) {
    var f = document.createElement("div");
    f.className = "inst-fundo";
    f.innerHTML = '<div class="inst-caixa" role="dialog" aria-modal="true"><button class="inst-x" aria-label="Fechar">×</button>' + html + "</div>";
    f.addEventListener("click", function (e) { if (e.target === f || e.target.classList.contains("inst-x") || e.target.hasAttribute("data-fechar")) f.remove(); });
    document.body.appendChild(f);
    return f;
  }
  function aviso(t, txt) { camada("<h3>" + t + "</h3><p>" + txt + '</p><button class="btn btn-vermelho btn-bloco" data-fechar>Fechar</button>'); }
  function qr() {
    if (typeof qrcode !== "function") return "";
    var q = qrcode(0, "M"); q.addData(location.origin + "/?app=1"); q.make();
    return '<div class="inst-qr">' + q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) + "</div>";
  }

  function android() {
    if (instalado()) return aviso("Você já está no app ✅", "A ZXT já está instalada neste aparelho.");
    if (pedido) {
      pedido.prompt();
      pedido.userChoice.then(function (r) { if (r.outcome !== "accepted") return; pedido = null; });
      return;
    }
    if (ehIOS) return iphone();
    if (!ehAndroid) return camada("<h3>Abra no seu Android</h3><p>Aponte a câmera do celular para o código e toque em <b>Baixar para Android</b>.</p>" + qr() +
      '<p class="inst-pe">Ou acesse <b>' + location.host + "</b> no Chrome do celular.</p>");
    camada("<h3>Instalar no Android</h3><ol class=\"inst-passos\"><li>Abra este site no <b>Chrome</b>.</li><li>Toque nos <b>três pontinhos ⋮</b> no canto de cima.</li><li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>) e confirme.</li><li>O ícone da ZXT aparece junto dos seus aplicativos. Abra e entre com seu login.</li></ol>" +
      '<p class="inst-pe">Se o Chrome já mostrou o aviso de instalar, é só tocar em Instalar.</p>');
  }

  function iphone() {
    if (instalado()) return aviso("Você já está no app ✅", "A ZXT já está na sua Tela de Início.");
    if (!ehIOS) return camada("<h3>Abra no seu iPhone</h3><p>Aponte a câmera do iPhone para o código, abra no <b>Safari</b> e toque em <b>Baixar para iPhone</b>.</p>" + qr() +
      '<p class="inst-pe">Ou acesse <b>' + location.host + "</b> no Safari do iPhone.</p>");
    if (outroNavIOS) {
      var f = camada("<h3>Abra no Safari</h3><p>Para instalar no iPhone, este site precisa estar aberto no <b>Safari</b>.</p><ol class=\"inst-passos\"><li>Toque em <b>Copiar link</b>.</li><li>Abra o <b>Safari</b>, cole na barra de endereço e abra.</li><li>Toque de novo em <b>Baixar para iPhone</b>.</li></ol>" +
        '<button class="btn btn-vermelho btn-bloco" id="inst-copiar">Copiar link</button>');
      f.querySelector("#inst-copiar").onclick = function () {
        (navigator.clipboard ? navigator.clipboard.writeText(location.origin) : Promise.reject()).then(function () { this.textContent = "Link copiado ✅"; }.bind(this), function () { prompt("Copie o link:", location.origin); });
      };
      return;
    }
    var ipad = /ipad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var g = camada('<img class="inst-icone" src="/assets/icon-180.png" alt="" width="64" height="64"><h3>Instalar no iPhone</h3><p class="inst-sub">3 toques e a ZXT fica na sua tela como aplicativo.</p>' +
      '<ol class="inst-passos grande"><li><span class="inst-n">1</span><span>Toque em <b>Compartilhar</b> <svg class="inst-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg> ' +
        (ipad ? "no alto da tela." : "na barra do Safari (se não aparecer, toque em <b>•••</b> primeiro).") + "</span></li>" +
      '<li><span class="inst-n">2</span><span>Role e toque em <b>Adicionar à Tela de Início</b> <span class="inst-mais">＋</span></span></li>' +
      '<li><span class="inst-n">3</span><span>Toque em <b>Adicionar</b>. Depois abra a ZXT pelo ícone e entre com seu login.</span></li></ol>' +
      '<p class="inst-pe">Pronto: abre como aplicativo, fica logado e recebe as notificações (iOS 16.4 ou mais novo).</p>' +
      (ipad ? "" : '<div class="inst-seta" aria-hidden="true">↓</div>'));
    if (ipad) g.classList.add("ipad");
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-instalar]"); if (!b) return;
    e.preventDefault();
    if (b.getAttribute("data-instalar") === "android") android(); else iphone();
  });

  // link vindo do QR (?app=1): já abre o guia certo
  if (/[?&]app=1/.test(location.search)) window.addEventListener("load", function () { setTimeout(function () { if (ehIOS) iphone(); else if (ehAndroid) android(); }, 600); });
})();
