const isSpanish = document.documentElement.lang === "es";

const copy = isSpanish
  ? {
      offline: "Aion esta sin conexion. Puedes ver la aplicacion, pero las respuestas, el inicio de sesion y la memoria requieren internet.",
      online: "Conexion restaurada.",
      update: "Hay una actualizacion disponible.",
      updateAction: "Actualizar",
      dismiss: "Cerrar",
    }
  : {
      offline: "Aion is offline. You can view the app shell, but answers, sign-in, and memory require the network.",
      online: "Connection restored.",
      update: "An update is available.",
      updateAction: "Update",
      dismiss: "Dismiss",
    };

let statusNode = null;
let currentWaitingWorker = null;
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
    dismiss.addEventListener("click", hideStatus);
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

window.addEventListener("online", showOnlineMessage);
window.addEventListener("offline", showOfflineMessage);

window.AionPwa = {
  isOffline: () => !navigator.onLine,
  showOfflineMessage,
};

if (!navigator.onLine) {
  showOfflineMessage();
}

registerServiceWorker();
