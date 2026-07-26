#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

node --check src/teves_consulting_frontend/assets/js/aion-pwa.js
node --check src/teves_consulting_frontend/aion-service-worker.js

node <<'NODE'
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const frontendRoot = "src/teves_consulting_frontend";
const manifestPath = path.join(frontendRoot, "manifest.webmanifest");
const manifest = JSON.parse(read(manifestPath));

assert(manifest.name === "Aion", "Manifest name must be Aion.");
assert(manifest.short_name === "Aion", "Manifest short_name must be Aion.");
assert(manifest.start_url === "/aion.html?source=pwa", "Manifest start_url must point at Aion.");
assert(manifest.scope === "/", "Manifest scope must cover the public Aion route.");
assert(manifest.display === "standalone", "Manifest display must be standalone.");
assert(Array.isArray(manifest.icons), "Manifest icons must be present.");
assert(manifest.icons.some((icon) => icon.sizes === "192x192"), "Manifest needs a 192x192 icon.");
assert(manifest.icons.some((icon) => icon.sizes === "512x512"), "Manifest needs a 512x512 icon.");

for (const icon of manifest.icons) {
  const iconPath = path.join(frontendRoot, icon.src.replace(/^\//, ""));
  assert(fs.existsSync(iconPath), `Manifest icon is missing: ${icon.src}`);
}

for (const page of ["aion.html", "es/aion.html"]) {
  const html = read(path.join(frontendRoot, page));
  assert(html.includes('<link rel="manifest" href="/manifest.webmanifest" />'), `${page} must link the manifest.`);
  assert(html.includes('src="/assets/js/aion-pwa.js"'), `${page} must load the PWA helper.`);
  assert(html.includes("window.AionPwa && window.AionPwa.isOffline()"), `${page} must block offline submits.`);
}

const adminHtml = read(path.join(frontendRoot, "admin.html"));
assert(!adminHtml.includes("/assets/js/aion-pwa.js"), "Admin must not register the PWA helper.");
assert(!adminHtml.includes("/manifest.webmanifest"), "Admin must not advertise the Aion PWA manifest.");

const worker = read(path.join(frontendRoot, "aion-service-worker.js"));
assert(worker.includes("isAdminPath"), "Service worker must explicitly bypass admin paths.");
assert(worker.includes('request.method !== "GET"'), "Service worker must avoid caching non-GET requests.");
assert(worker.includes("url.origin !== self.location.origin"), "Service worker must avoid cross-origin caching.");
assert(worker.includes("AION_SKIP_WAITING"), "Service worker must support controlled update activation.");

const offline = read(path.join(frontendRoot, "offline.html"));
assert(offline.includes("No message, memory write, or authenticated action has been queued."), "Offline page must state that sensitive actions are not queued.");

console.log("PWA foundation checks passed.");
NODE
