/* Dopamina 3D PWA — não armazenar páginas autenticadas, APIs ou documentos privados. */
const SW_VERSION = "dopamina3d-pwa-v2";
const OFFLINE_CACHE = `${SW_VERSION}-offline`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    // Não chamar skipWaiting(): evita trocar o app enquanto há formulários abertos.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("dopamina3d-pwa-") && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Navegação: sempre tenta a versão atual do Netlify. Nunca guarda HTML autenticado.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: "no-store" });
      } catch (_) {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || new Response(
          "Você está sem conexão. Conecte-se à internet e tente novamente.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // APIs, scripts, estilos, arquivos do cliente e documentos: sempre passam pela rede.
  // Isso evita conteúdo antigo e impede cache de contratos, PDFs e dados financeiros.
});

self.addEventListener("message", (event) => {
  if (event.data === "CHECK_FOR_UPDATES") self.registration.update();
});
