(() => {
  if (!("serviceWorker" in navigator)) return;

  let deferredPrompt = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true;

  const area = () => document.getElementById("pwaInstallArea");
  const button = () => document.getElementById("pwaInstallButton");
  const status = () => document.getElementById("pwaInstallStatus");

  function updateInstallUI() {
    const panel = area();
    const action = button();
    if (!panel || !action) return;

    if (isStandalone()) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    action.disabled = false;
    action.textContent = deferredPrompt ? "Instalar aplicativo" : "Como instalar";
    if (status()) {
      status().textContent = deferredPrompt
        ? "Disponível para instalar neste dispositivo."
        : "A instalação depende das opções oferecidas pelo seu navegador.";
    }
  }

  function showInstructions() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const safari = ios && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    let title = "Instalar a Dopamina 3D";
    let body = "No menu do navegador, procure “Instalar app” ou “Adicionar à tela inicial”. A opção aparece quando o navegador considera o site instalável.";
    if (ios && safari) {
      body = "No Safari, toque em Compartilhar (ícone de quadrado com seta para cima), role as opções e escolha “Adicionar à Tela de Início”. Depois confirme em “Adicionar”.";
    } else if (ios) {
      body = "No iPhone ou iPad, abra este endereço no Safari. Depois toque em Compartilhar e escolha “Adicionar à Tela de Início”. Outros navegadores no iOS não oferecem o mesmo fluxo de instalação.";
    } else if (isAndroid && !deferredPrompt) {
      body = "Abra o menu ⋮ do Chrome e procure “Instalar app” ou “Adicionar à tela inicial”. Se a opção não aparecer, atualize a página e verifique se está usando o Chrome.";
    }

    let modal = document.getElementById("pwaInstallHelp");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pwaInstallHelp";
      modal.className = "pwa-install-help";
      modal.innerHTML = `
        <div class="pwa-install-help-backdrop" data-pwa-close></div>
        <section class="pwa-install-help-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallHelpTitle">
          <button type="button" class="pwa-install-help-close" data-pwa-close aria-label="Fechar">×</button>
          <div class="pwa-install-help-mark">D</div>
          <h2 id="pwaInstallHelpTitle"></h2>
          <p class="pwa-install-help-body"></p>
          <button type="button" class="pwa-install-help-ok" data-pwa-close>Entendi</button>
        </section>`;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-pwa-close]").forEach(el => el.addEventListener("click", () => modal.classList.remove("is-open")));
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") modal.classList.remove("is-open");
      });
    }
    modal.querySelector("#pwaInstallHelpTitle").textContent = title;
    modal.querySelector(".pwa-install-help-body").textContent = body;
    modal.classList.add("is-open");
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallUI();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    updateInstallUI();
  });

  document.addEventListener("click", async event => {
    const target = event.target.closest("#pwaInstallButton");
    if (!target) return;
    if (isStandalone()) {
      updateInstallUI();
      return;
    }
    if (!deferredPrompt) {
      showInstructions();
      return;
    }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    target.disabled = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        if (status()) status().textContent = "Instalação confirmada. O aplicativo ficará disponível na tela inicial.";
      } else {
        if (status()) status().textContent = "Tudo bem. Você pode instalar quando quiser por aqui.";
      }
    } catch (error) {
      console.warn("Falha ao iniciar instalação PWA:", error);
      showInstructions();
    } finally {
      updateInstallUI();
    }
  });

  function addStyles() {
    if (document.getElementById("pwa-account-install-css")) return;
    const style = document.createElement("style");
    style.id = "pwa-account-install-css";
    style.textContent = `
      .pwa-account-install{margin:12px 10px 2px;padding:10px 11px;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:rgba(255,255,255,.035);color:var(--theme-fg,#F4F1EA);display:grid;grid-template-columns:22px 1fr;gap:6px 8px;align-items:center;opacity:.88}
      .pwa-account-install[hidden]{display:none!important}
      .pwa-account-install-icon{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:rgba(198,244,50,.14);color:#C6F432;font-size:14px;font-weight:700}
      .pwa-account-install-copy{display:grid;gap:3px;min-width:0}
      .pwa-account-install-copy strong{font-size:10px;line-height:1.35;font-weight:650}
      .pwa-account-install-copy span{font-size:9px;line-height:1.4;color:var(--theme-muted,#aaa)}
      .pwa-account-install-button{grid-column:1/-1;justify-self:start;border:1px solid rgba(198,244,50,.28);border-radius:7px;background:transparent;color:#C6F432;padding:6px 9px;font:inherit;font-size:10px;font-weight:650;cursor:pointer;transition:background .18s,border-color .18s}
      .pwa-account-install-button:hover{background:rgba(198,244,50,.08);border-color:rgba(198,244,50,.55)}
      .pwa-account-install-button:disabled{opacity:.6;cursor:wait}
      .pwa-account-install-status{grid-column:1/-1;margin:0;color:var(--theme-muted,#aaa);font-size:9px;line-height:1.4}
      .pwa-install-help{display:none;position:fixed;inset:0;z-index:100000;place-items:center;padding:18px}
      .pwa-install-help.is-open{display:grid}
      .pwa-install-help-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(5px)}
      .pwa-install-help-card{position:relative;width:min(390px,100%);padding:26px;border:1px solid var(--theme-border,#444);border-radius:20px;background:var(--theme-card,#211E1A);color:var(--theme-fg,#F4F1EA);box-shadow:0 22px 70px rgba(0,0,0,.35);text-align:center}
      .pwa-install-help-close{position:absolute;right:12px;top:8px;border:0;background:transparent;color:inherit;font-size:25px;cursor:pointer}
      .pwa-install-help-mark{width:48px;height:48px;margin:0 auto 14px;border-radius:14px;background:#14110F;color:#C6F432;display:grid;place-items:center;font-size:23px;font-weight:800}
      .pwa-install-help-card h2{font-size:20px;margin:0 0 10px}
      .pwa-install-help-body{font-size:13px;line-height:1.65;color:var(--theme-muted,#aaa);margin:0 0 20px}
      .pwa-install-help-ok{border:0;border-radius:9px;padding:11px 22px;background:#C6F432;color:#14110F;font-weight:700;cursor:pointer}
      /* CTA alinhado aos demais controles do rodapé lateral */
      .side-foot #pwaInstallArea{display:block!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;opacity:1!important}
      .side-foot #pwaInstallButton{box-sizing:border-box!important;display:flex!important;flex:0 0 100%!important;width:100%!important;min-width:100%!important;max-width:100%!important;min-height:44px!important;align-items:center!important;justify-content:center!important;gap:8px!important;margin:0!important;padding:11px 13px!important;border:1px solid #C6F432!important;border-radius:10px!important;background:#C6F432!important;color:#14110F!important;font-family:inherit!important;font-size:12px!important;font-weight:650!important;line-height:1.2!important;text-align:center!important;cursor:pointer!important;transition:filter .18s,transform .18s!important}
      .side-foot #pwaInstallButton svg{width:14px!important;height:14px!important;flex:0 0 14px!important;stroke:currentColor!important}
      .side-foot #pwaInstallButton:hover{filter:brightness(1.06)!important}
      .side-foot #pwaInstallButton:active{transform:translateY(1px)!important}
      .side-foot #pwaInstallButton:focus-visible{outline:2px solid #C6F432!important;outline-offset:3px!important}
      .side-foot #pwaInstallButton:disabled{opacity:.65!important;cursor:wait!important}
      .side-foot #pwaInstallStatus{margin:0!important;padding:3px 3px 0!important;text-align:center!important}
      @media(max-width:700px){.pwa-account-install{margin:0}.side-foot .pwa-account-install{margin:0}}
    `;
    document.head.appendChild(style);
  }

  function bindAccountPanel() {
    addStyles();
    updateInstallUI();
    const observer = new MutationObserver(updateInstallUI);
    const info = document.getElementById("userInfo");
    if (info) observer.observe(info, { childList: true, subtree: true });
  }

  window.addEventListener("load", async () => {
    bindAccountPanel();
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      });
      // A atualização é verificada no carregamento. Não forçamos nova checagem
      // quando o usuário retorna do seletor de arquivos no Android/iOS.
      registration.update().catch(() => {});
    } catch (error) {
      console.warn("Não foi possível registrar o modo aplicativo:", error);
    }
  }, { once: true });
})();