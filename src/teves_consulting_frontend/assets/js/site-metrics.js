const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const AGENT_MODULE_URL = "https://esm.sh/@dfinity/agent@2.1.3";
const CANDID_MODULE_URL = "https://esm.sh/@dfinity/candid@2.1.3";
const METRIC_KEY_PREFIX = "teves-site-metric:";
const TECHNICAL_PAGE_PATHS = new Set([
  "/robots.txt",
  "/favicon.ico",
  "/sitemap.xml",
  "/manifest.json",
  "/site.webmanifest",
  "/browserconfig.xml",
]);
const TECHNICAL_PAGE_PREFIXES = [
  "/assets/",
  "/apple-touch-icon",
];

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function pageLocale() {
  const path = window.location.pathname || "/";
  if (path === "/admin.html" || path.endsWith("/admin.html")) return "";
  return path.startsWith("/es/") ? "es" : "en";
}

function pagePath() {
  const path = window.location.pathname || "/";
  return path === "/" ? "/index.html" : path.slice(0, 160);
}

function trackingPagePathAllowed(path) {
  if (!path || TECHNICAL_PAGE_PATHS.has(path)) return false;
  return !TECHNICAL_PAGE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function pageTitle() {
  return (document.title || pagePath()).replace(/\s+/g, " ").trim().slice(0, 160);
}

function localMetricKey(day, path) {
  return `${METRIC_KEY_PREFIX}${day}:${path}`;
}

function cleanupOldMetricKeys(day) {
  try {
    const currentPrefix = `${METRIC_KEY_PREFIX}${day}:`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(METRIC_KEY_PREFIX) && !key.startsWith(currentPrefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (_err) {
    // Tracking is best-effort and should never affect page rendering.
  }
}

function trackingAllowed() {
  const doNotTrack = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (doNotTrack === "1" || doNotTrack === "yes") return false;
  try {
    if (!window.localStorage) return false;
    const testKey = "teves-site-metric:test";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_err) {
    return false;
  }
}

async function createMetricsActor() {
  const [{ Actor, HttpAgent }, { IDL }] = await Promise.all([
    import(AGENT_MODULE_URL),
    import(CANDID_MODULE_URL),
  ]);
  const idlFactory = ({ IDL }) => IDL.Service({
    recordPageView: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [IDL.Bool],
      []
    ),
  });
  return Actor.createActor(idlFactory, {
    agent: new HttpAgent({ host: "https://ic0.app" }),
    canisterId: BACKEND_CANISTER_ID,
  });
}

async function recordSiteMetric() {
  const path = pagePath();
  if (!trackingPagePathAllowed(path)) return;

  if (!trackingAllowed()) return;

  const locale = pageLocale();
  if (!locale) return;

  try {
    const day = dayKey();
    cleanupOldMetricKeys(day);
    const metricKey = localMetricKey(day, path);
    if (window.localStorage.getItem(metricKey)) return;
    window.localStorage.setItem(metricKey, new Date().toISOString());

    const actor = await createMetricsActor();
    await actor.recordPageView(day, path, pageTitle(), locale);
  } catch (err) {
    console.debug("Site metrics unavailable:", err);
  }
}

function scheduleSiteMetric() {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => recordSiteMetric(), { timeout: 4000 });
    return;
  }
  window.setTimeout(recordSiteMetric, 1500);
}

scheduleSiteMetric();
