const isSpanish = document.documentElement.lang === "es";

const copy = isSpanish
  ? {
      offline: "Aion esta sin conexion. Puedes ver la aplicacion, pero las respuestas, el inicio de sesion y la memoria requieren internet.",
      online: "Conexion restaurada.",
      update: "Hay una actualizacion disponible.",
      updateAction: "Actualizar",
      dismiss: "Cerrar",
      installReady: "Aion se puede instalar en este dispositivo.",
      installAction: "Instalar",
      loadingIncomplete: "Aion no termino de cargar. Vuelve a conectarte y actualiza antes de iniciar sesion o enviar un mensaje.",
      resetComplete: "La cache local de Aion fue limpiada. La pagina se actualizara.",
    }
  : {
      offline: "Aion is offline. You can view the app shell, but answers, sign-in, and memory require the network.",
      online: "Connection restored.",
      update: "An update is available.",
      updateAction: "Update",
      dismiss: "Dismiss",
      installReady: "Aion can be installed on this device.",
      installAction: "Install",
      loadingIncomplete: "Aion did not finish loading. Reconnect and refresh before signing in or sending a message.",
      resetComplete: "Aion's local app cache was cleared. The page will refresh.",
    };

let statusNode = null;
let currentWaitingWorker = null;
let deferredInstallPrompt = null;
let refreshingForUpdate = false;
let transientTimer = null;

function getStatusNode() {
  if (statusNode) {
    return statusNode;
  }

  statusNode = document.getElementById("aionPwaStatus");

  if (!statusNode) {
    statusNode = document.createElement("div");
    statusNode.id = "aionPwaStatus";
    statusNode.className = "aion-pwa-status";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    document.body.append(statusNode);
  }

  return statusNode;
}

function clearTransientTimer() {
  if (transientTimer) {
    window.clearTimeout(transientTimer);
    transientTimer = null;
  }
}

function hideStatus() {
  clearTransientTimer();
  const node = getStatusNode();
  node.hidden = true;
  node.classList.remove("visible", "update");
  node.replaceChildren();
}

function showStatus(message, options = {}) {
  clearTransientTimer();
  const node = getStatusNode();
  node.hidden = false;
  node.classList.toggle("update", options.kind === "update");
  node.classList.add("visible");

  const messageNode = document.createElement("span");
  messageNode.textContent = message;
  node.replaceChildren(messageNode);

  if (options.actionLabel && typeof options.onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = options.actionLabel;
    action.addEventListener("click", options.onAction);
    node.append(action);
  }

  if (options.dismissible) {
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = copy.dismiss;
    dismiss.addEventListener("click", () => {
      if (typeof options.onDismiss === "function") {
        options.onDismiss();
      }
      hideStatus();
    });
    node.append(dismiss);
  }

  if (options.durationMs) {
    transientTimer = window.setTimeout(hideStatus, options.durationMs);
  }
}

function showOfflineMessage() {
  showStatus(copy.offline, { dismissible: true });
}

function showOnlineMessage() {
  showStatus(copy.online, { durationMs: 2200 });
}

function showUpdateAvailable(worker) {
  currentWaitingWorker = worker;
  showStatus(copy.update, {
    kind: "update",
    actionLabel: copy.updateAction,
    dismissible: true,
    onAction: () => {
      if (!currentWaitingWorker) {
        return;
      }
      currentWaitingWorker.postMessage({ type: "AION_SKIP_WAITING" });
    },
  });
}

function watchServiceWorker(registration) {
  if (registration.waiting) {
    showUpdateAvailable(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing;

    if (!installingWorker) {
      return;
    }

    installingWorker.addEventListener("statechange", () => {
      if (
        installingWorker.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        showUpdateAvailable(installingWorker);
      }
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/aion-service-worker.js", { scope: "/" })
      .then(watchServiceWorker)
      .catch((error) => {
        console.warn("Aion PWA registration failed.", error);
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForUpdate) {
      return;
    }

    refreshingForUpdate = true;
    window.location.reload();
  });
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function markInstallDismissed() {
  try {
    window.sessionStorage.setItem("aion-pwa-install-dismissed", "1");
  } catch (_error) {
    // Session storage is optional; install prompts still work without it.
  }
}

function wasInstallDismissed() {
  try {
    return window.sessionStorage.getItem("aion-pwa-install-dismissed") === "1";
  } catch (_error) {
    return false;
  }
}

async function promptInstall() {
  if (!deferredInstallPrompt) {
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  hideStatus();
  promptEvent.prompt();

  try {
    await promptEvent.userChoice;
  } catch (_error) {
    // Some browsers do not expose a reliable userChoice result.
  }

  markInstallDismissed();
}

function showInstallReady(event) {
  event.preventDefault();
  deferredInstallPrompt = event;

  if (isStandaloneDisplay() || wasInstallDismissed()) {
    return;
  }

  showStatus(copy.installReady, {
    actionLabel: copy.installAction,
    dismissible: true,
    onAction: promptInstall,
    onDismiss: markInstallDismissed,
  });
}

function shouldResetPwa() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("aion-pwa-reset") === "1";
  } catch (_error) {
    return false;
  }
}

async function resetPwaCaches() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.scope === `${window.location.origin}/`)
      .map((registration) => registration.unregister())
  );

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("aion-pwa-static-"))
      .map((cacheName) => caches.delete(cacheName))
  );
}

window.addEventListener("online", showOnlineMessage);
window.addEventListener("offline", showOfflineMessage);
window.addEventListener("beforeinstallprompt", showInstallReady);
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  markInstallDismissed();
  hideStatus();
});

window.AionPwa = {
  isOffline: () => !navigator.onLine,
  promptInstall,
  showOfflineMessage,
};

function showLoadIncompleteMessage() {
  if (!navigator.onLine) {
    showOfflineMessage();
    return;
  }

  showStatus(copy.loadingIncomplete, { dismissible: true });
}

function installActionFallbacks() {
  if (typeof window.askAgent !== "function") {
    window.askAgent = showLoadIncompleteMessage;
  }

  if (typeof window.handleAuth !== "function") {
    window.handleAuth = showLoadIncompleteMessage;
  }

  if (typeof window.sendFeedback !== "function") {
    window.sendFeedback = showLoadIncompleteMessage;
  }
}

if (!navigator.onLine) {
  showOfflineMessage();
}

installActionFallbacks();

if (shouldResetPwa()) {
  resetPwaCaches()
    .then(() => {
      showStatus(copy.resetComplete);
      window.setTimeout(() => {
        window.location.href = window.location.pathname;
      }, 900);
    })
    .catch((error) => {
      console.warn("Aion PWA reset failed.", error);
      registerServiceWorker();
    });
} else {
  registerServiceWorker();
}
