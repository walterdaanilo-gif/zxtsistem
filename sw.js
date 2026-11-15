// Service worker do portal ZXT: recebe as notificações no celular (inclusive com o app fechado).
// Não guarda páginas em cache: o portal sempre carrega a versão mais nova.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { titulo: e.data ? e.data.text() : "ZXT" }; }
  var tarefas = [self.registration.showNotification(d.titulo || "ZXT", {
    body: d.corpo || "",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "/app#/notificacoes" }
  })];
  if (typeof d.naoLidas === "number" && self.navigator && self.navigator.setAppBadge) {
    tarefas.push(d.naoLidas > 0 ? self.navigator.setAppBadge(d.naoLidas) : self.navigator.clearAppBadge());
  }
  e.waitUntil(Promise.all(tarefas).catch(function () {}));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/app";
  if (url.charAt(0) === "/") url = self.location.origin + url;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (c.url.indexOf(self.location.origin) === 0 && url.indexOf(self.location.origin) === 0 && "focus" in c) {
        return c.focus().then(function (w) { return w && w.navigate ? w.navigate(url) : w; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
