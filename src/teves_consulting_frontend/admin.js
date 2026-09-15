import { Actor, HttpAgent } from "https://esm.sh/@dfinity/agent@2.1.3";
import { IDL } from "https://esm.sh/@dfinity/candid@2.1.3";
import { AuthClient } from "https://esm.sh/@dfinity/auth-client@2.1.3?deps=@dfinity/candid@2.1.3,@dfinity/agent@2.1.3";

const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const AIONIC_AGENT_API_BASE_URL = "https://aionic-agent-api.onrender.com";
const OPERATOR_SESSION_EXCHANGE_URL = `${AIONIC_AGENT_API_BASE_URL}/admin/operator-session`;
const LOCAL_ENGINEER_DEVICES_PATH = "/admin/local-engineer/devices";
const LOCAL_ENGINEER_PAIRING_REVOKE_BASE_PATH = "/admin/local-engineer/device-pairings";
const OPERATOR_SESSION_STORAGE_KEY = "aion_operator_session_v1";
const OPENAI_PRODUCTION_ROUTE_ID = "openai-production-baseline";
const NATIVE_PRODUCTION_ROUTE_ID = "icp-admin-candidate";

let authClient = null;
let isAuthenticated = false;
let identity = null;
let isOperator = false;
let renderOperatorSessionToken = null;
let renderOperatorSessionExpiresAt = null;
let operatorAccessIssue = null;
const browserFetch = window.fetch.bind(window);

/* shared operator session helpers start */
function operatorSessionNowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readStoredOperatorSession() {
  try {
    const raw = sessionStorage.getItem(OPERATOR_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session.sessionToken !== "string" || !session.sessionToken) return null;
    if (session.expiresAt && Number(session.expiresAt) <= operatorSessionNowSeconds() + 30) return null;
    return session;
  } catch (_) {
    return null;
  }
}

function writeStoredOperatorSession(session) {
  try {
    sessionStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, JSON.stringify({
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt || null,
    }));
  } catch (_) {
    // Storage is best-effort; the active page can still use the in-memory token.
  }
}

function clearStoredOperatorSession() {
  try {
    sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
  } catch (_) {
    // Ignore storage failures; clearing in-memory state is still authoritative for this page.
  }
}
/* shared operator session helpers end */

function isRenderAdminRequest(input) {
  const rawUrl = input instanceof Request ? input.url : String(input);

  try {
    const url = new URL(rawUrl, window.location.href);
    return (
      url.origin === new URL(AIONIC_AGENT_API_BASE_URL).origin &&
      url.pathname.startsWith("/admin/") &&
      url.href !== OPERATOR_SESSION_EXCHANGE_URL
    );
  } catch (_error) {
    return false;
  }
}

window.fetch = function authenticatedAdminFetch(input, init = {}) {
  if (!isRenderAdminRequest(input) || !renderOperatorSessionToken) {
    return browserFetch(input, init);
  }

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${renderOperatorSessionToken}`);
  return browserFetch(input, { ...init, headers });
};

const idlFactory = ({ IDL }) => {
  const Relationship = IDL.Record({
    subject: IDL.Text,
    predicate: IDL.Text,
    target: IDL.Text,
    category: IDL.Text,
  });

  const MemorySummary = IDL.Record({
    id: IDL.Nat,
    owner: IDL.Principal,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
    title: IDL.Text,
    summary: IDL.Text,
    topics: IDL.Vec(IDL.Text),
    tags: IDL.Vec(IDL.Text),
    keyDecisions: IDL.Vec(IDL.Text),
    relationships: IDL.Vec(Relationship),
    milestone: IDL.Bool,
    importance: IDL.Nat,
    memoryType: IDL.Text,
    sourceSessionId: IDL.Text,
    confidence: IDL.Nat,
    status: IDL.Text,
  });

  const MemoryPreview = IDL.Record({
    id: IDL.Nat,
    title: IDL.Text,
    summary: IDL.Text,
    topics: IDL.Vec(IDL.Text),
    tags: IDL.Vec(IDL.Text),
    keyDecisions: IDL.Vec(IDL.Text),
    relationships: IDL.Vec(Relationship),
    milestone: IDL.Bool,
    importance: IDL.Nat,
    memoryType: IDL.Text,
    confidence: IDL.Nat,
    status: IDL.Text,
    score: IDL.Int,
  });

  const ProviderRouteOperation = IDL.Variant({
    publicAnswer: IDL.Null,
    adminCandidateEvaluation: IDL.Null,
    nativeContinuityPreview: IDL.Null,
  });

  const ProviderRoutePreview = IDL.Record({
    operation: ProviderRouteOperation,
    providerId: IDL.Text,
    routeId: IDL.Text,
    invocationPermitted: IDL.Bool,
    explicitOperatorAction: IDL.Bool,
    promotionRequired: IDL.Bool,
    automaticFallback: IDL.Bool,
  });

  const OperatorStatus = IDL.Record({
    isOperator: IDL.Bool,
    allowlistConfigured: IDL.Bool,
    recoveryConfigured: IDL.Bool,
    operatorCount: IDL.Nat,
  });

  const HttpsOutcallTransportReceipt = IDL.Record({
    url: IDL.Text,
    status: IDL.Nat,
    responseBytes: IDL.Nat,
    isReplicated: IDL.Bool,
  });

  const ContinuityPreviewResponse = IDL.Record({
    queryText: IDL.Text,
    queryIntent: IDL.Text,
    memoryCount: IDL.Nat,
    rankedMemories: IDL.Vec(MemoryPreview),
    expandedMemories: IDL.Vec(MemoryPreview),
    contextPreview: IDL.Text,
  });

  const ContinuityPreviewError = IDL.Variant({
    unauthenticated: IDL.Null,
    invalidQuery: IDL.Null,
    internalError: IDL.Null,
  });

  const ContinuityPreviewResult = IDL.Variant({
    ok: ContinuityPreviewResponse,
    err: ContinuityPreviewError,
  });

  return IDL.Service({
    whoami: IDL.Func([], [IDL.Text], []),

    getOperatorStatus: IDL.Func([], [OperatorStatus], ["query"]),

    issueOperatorSessionGrant: IDL.Func(
      [IDL.Vec(IDL.Nat8)],
      [IDL.Bool],
      []
    ),

    getMyAllSummaries: IDL.Func(
      [],
      [IDL.Vec(MemorySummary)],
      ["query"]
    ),

    deleteSummaryById: IDL.Func([IDL.Nat], [IDL.Bool], []),

    getFeedbackCount: IDL.Func([], [IDL.Nat], ["query"]),

    getRecentFeedback: IDL.Func(
      [IDL.Nat],
      [IDL.Vec(IDL.Record({
        id: IDL.Nat,
        rating: IDL.Text,
        question: IDL.Text,
        answer: IDL.Text,
        timestamp: IDL.Text,
        receivedAt: IDL.Int,
      }))],
      ["query"]
    ),

    previewAionProviderRoute: IDL.Func(
      [ProviderRouteOperation],
      [ProviderRoutePreview],
      ["query"]
    ),


    previewMyContinuity: IDL.Func(
      [IDL.Text],
      [ContinuityPreviewResult],
      ["query"]
    ),

    probeHttpsOutcallTransport: IDL.Func([], [HttpsOutcallTransportReceipt], []),
  });
};

const agent = new HttpAgent({
  host: "https://ic0.app",
});

window.adminActor = Actor.createActor(idlFactory, {
  agent,
  canisterId: BACKEND_CANISTER_ID,
});

async function initAuth() {
  authClient = await AuthClient.create();
  isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    identity = authClient.getIdentity();
    await createAuthenticatedActor();
    await refreshOperatorAccess();
  }

  updateAuthUI();
}

async function createAuthenticatedActor() {
  const authenticatedAgent = new HttpAgent({
    identity,
    host: "https://ic0.app",
  });

  window.adminActor = Actor.createActor(idlFactory, {
    agent: authenticatedAgent,
    canisterId: BACKEND_CANISTER_ID,
  });

  const principal = await window.adminActor.whoami();
  console.log("Authenticated principal:", principal);
}

function updateAuthUI() {
  const authButton = document.getElementById("authButton");
  authButton.textContent = isAuthenticated ? "Logout" : "Sign In";

  updateAdminVisibility();
}

function updateAdminVisibility() {
  const adminContent = document.getElementById("adminContent");
  const access = document.getElementById("operatorAccess");
  const authButton = document.getElementById("authButton");

  if (!adminContent || !access) return;

  const adminReady = isAuthenticated && isOperator;
  document.body.classList.toggle("admin-signed-in", adminReady);
  document.body.classList.toggle("admin-signed-out", !adminReady);

  adminContent.style.display = adminReady ? "block" : "none";
  access.style.display = "block";
  access.className = "admin-access";
  if (authButton) {
    authButton.removeAttribute("title");
    authButton.removeAttribute("aria-label");
  }

  if (!isAuthenticated) {
    access.textContent = "Sign in with Internet Identity to continue.";
    setAdminHealthMetric("healthOperatorStatus", "Signed out");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
    setAdminMetricProvenance("healthOperatorStatus", "LIVE", "browser session");
    setAdminMetricProvenance("healthSessionStatus", "LIVE", "session absent", { unavailable: true });
    return;
  }

  if (operatorAccessIssue) {
    access.classList.add("denied");
    access.textContent = "Operator access could not be verified. Refresh after the operator session service is available.";
    setAdminHealthMetric("healthOperatorStatus", "Review needed");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
    setAdminMetricProvenance("healthOperatorStatus", "LIVE", "access unavailable", { unavailable: true });
    setAdminMetricProvenance("healthSessionStatus", "LIVE", "session unavailable", { unavailable: true });
    return;
  }

  if (!isOperator) {
    access.classList.add("denied");
    access.textContent = "Access denied. This interface is restricted to the Teves Consulting operator.";
    setAdminHealthMetric("healthOperatorStatus", "Denied");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
    setAdminMetricProvenance("healthOperatorStatus", "LIVE", "operator check");
    setAdminMetricProvenance("healthSessionStatus", "LIVE", "session denied", { unavailable: true });
    return;
  }

  const operatorSessionMessage = renderOperatorSessionExpiresAt
    ? `Operator access verified. This Admin session expires at ${new Date(renderOperatorSessionExpiresAt * 1000).toLocaleTimeString()}.`
    : "Operator access verified.";
  access.classList.add("verified");
  access.style.display = "none";
  access.textContent = "";
  if (authButton) {
    authButton.title = operatorSessionMessage;
    authButton.setAttribute("aria-label", `Logout. ${operatorSessionMessage}`);
  }
  setAdminHealthMetric("healthOperatorStatus", "Verified");
  setAdminMetricProvenance("healthOperatorStatus", "LIVE", "operator check");
  setAdminHealthMetric(
    "healthSessionStatus",
    renderOperatorSessionExpiresAt
      ? `Expires ${new Date(renderOperatorSessionExpiresAt * 1000).toLocaleTimeString()}`
      : "Verified"
  );
  setAdminMetricProvenance(
    "healthSessionStatus",
    "LIVE",
    renderOperatorSessionExpiresAt ? "bounded session" : "session verified"
  );
}

function setAdminHealthMetric(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function metricCardForValue(id) {
  const element = document.getElementById(id);
  return element ? element.closest(".metric-card") : null;
}

function formatProvenanceAge(iso) {
  if (!iso) return "";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setAdminMetricProvenance(id, kind, detail = "", options = {}) {
  const card = metricCardForValue(id);
  if (!card) return;
  const safeKind = String(kind || "").trim().toUpperCase();
  if (!["LIVE", "SNAPSHOT", "CACHED", "DERIVED"].includes(safeKind)) return;
  const sourceId = `${id}Provenance`;
  let element = document.getElementById(sourceId);
  if (!element) {
    element = document.createElement("div");
    element.id = sourceId;
    element.className = "metric-provenance";
    element.dataset.adminProvenanceFor = id;
    card.appendChild(element);
  }
  const detailText = String(detail || "").trim();
  element.textContent = detailText ? `${safeKind} · ${detailText}` : safeKind;
  element.classList.toggle("is-unavailable", options.unavailable === true);
  element.classList.toggle("is-stale", options.stale === true);
}

function setAdminOverviewProvenanceDefaults() {
  setAdminMetricProvenance("healthCycleAction", "DERIVED", "from dashboard state");
  setAdminMetricProvenance("healthDataRefresh", "SNAPSHOT", "browser timestamp");
  setAdminMetricProvenance("healthGoldenTests", "DERIVED", "from tests and feedback");
  setAdminMetricProvenance("healthCycleRunway", "DERIVED", "from cycle snapshots");
}

function encodeOperatorGrant(nonce) {
  let binary = "";
  nonce.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function establishRenderOperatorSession() {
  const storedSession = readStoredOperatorSession();
  if (storedSession) {
    renderOperatorSessionToken = storedSession.sessionToken;
    renderOperatorSessionExpiresAt = storedSession.expiresAt || null;
    return;
  }

  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const issued = await window.adminActor.issueOperatorSessionGrant(Array.from(nonce));

  if (!issued) {
    throw new Error("Operator session grant was not issued.");
  }

  const response = await browserFetch(OPERATOR_SESSION_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: encodeOperatorGrant(nonce) }),
  });

  if (!response.ok) {
    throw new Error("Operator session exchange was rejected.");
  }

  const session = await response.json();
  if (!session || typeof session.sessionToken !== "string" || !session.sessionToken) {
    throw new Error("Operator session exchange returned an invalid session.");
  }

  renderOperatorSessionToken = session.sessionToken;
  renderOperatorSessionExpiresAt = session.expiresAt || null;
  writeStoredOperatorSession(session);
}

async function refreshOperatorAccess() {
  isOperator = false;
  renderOperatorSessionToken = null;
  renderOperatorSessionExpiresAt = null;
  operatorAccessIssue = null;

  if (!isAuthenticated || !window.adminActor) {
    updateAdminVisibility();
    return false;
  }

  try {
    const status = await window.adminActor.getOperatorStatus();
    if (!status.allowlistConfigured || !status.isOperator) {
      updateAdminVisibility();
      return false;
    }

    await establishRenderOperatorSession();
    isOperator = true;
    updateAdminVisibility();
    return true;
  } catch (err) {
    console.error("Operator access verification failed:", err);
    operatorAccessIssue = "verification_failed";
    clearStoredOperatorSession();
    updateAdminVisibility();
    return false;
  }
}

window.showOperatorAuthorizationDryRun = async function showOperatorAuthorizationDryRun() {
  const container = document.getElementById("operatorAuthorizationResults");
  if (!container) {
    return;
  }

  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Sign in with Internet Identity first.</p>";
    return;
  }

  container.innerHTML = "<p>Refreshing operator access...</p>";

  try {
    const principal = await window.adminActor.whoami();
    const status = await window.adminActor.getOperatorStatus();
    container.innerHTML = `
      <div class="memory-card">
        <h3>Operator Access</h3>
        <p>The authenticated principal is allowlisted and holds a short-lived Admin session.</p>
        ${renderMetricGrid({
          "signed-in principal": principal,
          "allowlist": status.allowlistConfigured ? "configured" : "not configured",
          "operator access": status.isOperator ? "verified" : "denied",
          "recovery principal": status.recoveryConfigured ? "configured" : "not configured",
        })}
        <p class="meta">Operator authorization and short-lived Admin session required.</p>
      </div>
    `;
  } catch (err) {
    console.error("Operator access refresh failed:", err);
    container.innerHTML = `<p>Could not refresh operator access. Sign in again, confirm the operator allowlist, then retry. ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
  }
};

window.runContinuityInspector = async function runContinuityInspector() {
  const input = document.getElementById("continuityInspectorQuery");
  const container = document.getElementById("continuityInspectorResults");
  if (!input || !container) {
    return;
  }

  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before inspecting continuity.</p>";
    return;
  }

  const query = input.value.trim();
  if (!query) {
    container.innerHTML = "<p>Enter a query before inspecting continuity.</p>";
    input.focus();
    return;
  }

  [
    "publicRetrievalPreviewQuery",
    "retrievalQuery",
  ].forEach((id) => {
    const advancedInput = document.getElementById(id);
    if (advancedInput) {
      advancedInput.value = query;
    }
  });

  container.innerHTML = "<p>Inspecting the signed-in caller's native continuity preview...</p>";

  try {
    const result = await window.adminActor.previewMyContinuity(query);
    if ("err" in result) {
      const errorName = Object.keys(result.err || {})[0] || "unknown_error";
      throw new Error(`Native continuity preview returned: ${errorName}`);
    }

    const preview = result.ok;
    const ranked = preview.rankedMemories || [];
    const expanded = preview.expandedMemories || [];
    const entries = [
      ...ranked.map(memory => ({ source: "ranked", memory })),
      ...expanded.map(memory => ({ source: "expanded", memory })),
    ];
    container.innerHTML = `
      <div class="memory-card">
        <h3>Native Continuity Preview</h3>
        ${renderMetricGrid({
          intent: preview.queryIntent,
          "ranked memories": ranked.length,
          "relationship-expanded": expanded.length,
          "provider calls": "no",
          "memory writes": "no",
        })}
        <p><strong>Query:</strong> ${escapeHtml(preview.queryText)}</p>
        <p><strong>Context packet:</strong></p>
        <pre>${escapeHtml(preview.contextPreview)}</pre>
        ${entries.length > 0 ? `
          <table>
            <thead><tr><th>Source</th><th>ID</th><th>Title</th><th>Type</th><th>Score</th></tr></thead>
            <tbody>
              ${entries.map(({ source, memory }) => `
                <tr>
                  <td>${escapeHtml(source)}</td>
                  <td>${escapeHtml(memory.id)}</td>
                  <td>${escapeHtml(memory.title)}</td>
                  <td>${escapeHtml(memory.memoryType)}</td>
                  <td>${escapeHtml(memory.score)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : "<p>No continuity memories matched this query.</p>"}
        <p class="meta">Native read-only inspection. Signed-in Aion uses this bounded context before the existing OpenAI answer request.</p>
      </div>
    `;
  } catch (err) {
    console.error("Native continuity inspection failed:", err);
    container.innerHTML = `<p>Could not inspect continuity: ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
  }
};

function providersViewIsVisible() {
  const section = document.querySelector('[data-admin-view="providers"]');
  return Boolean(section && !section.hidden);
}

window.handleAuth = async function handleAuth() {
  if (!authClient) {
    authClient = await AuthClient.create();
  }

  if (isAuthenticated) {
    await authClient.logout();
    isAuthenticated = false;
    identity = null;
    isOperator = false;
    renderOperatorSessionToken = null;
    renderOperatorSessionExpiresAt = null;
    operatorAccessIssue = null;
    clearStoredOperatorSession();

    window.adminActor = Actor.createActor(idlFactory, {
      agent,
      canisterId: BACKEND_CANISTER_ID,
    });

    latestMemories = [];
    updateAuthUI();
    document.getElementById("memoryList").innerHTML = "";
    const memoryStatus = document.getElementById("memoryListStatus");
    if (memoryStatus) {
      memoryStatus.textContent = "Load memories to search and filter.";
    }
    return;
  }

  await authClient.login({
    identityProvider: "https://identity.ic0.app",
    onSuccess: async () => {
      isAuthenticated = true;
      identity = authClient.getIdentity();

      await createAuthenticatedActor();
      const operatorReady = await refreshOperatorAccess();
      updateAuthUI();

      if (operatorReady) {
        await loadMemories();
        await loadGoldenTests();
        await loadFeedback();
        if (providersViewIsVisible() && typeof window.refreshProductionRouteSwitch === "function") {
          await window.refreshProductionRouteSwitch();
        }
        const refresh = { refreshedAt: new Date().toISOString() };
        persistDashboardRefresh(refresh);
        renderDashboardRefresh(refresh);
        renderCycleSnapshot(loadCycleSnapshot());
      }
    },
  });
};

function getMainTopic(tags = []) {
  const topicTag = tags.find(tag => tag.startsWith("topic:"));

  if (!topicTag) return "Unclassified";

  const topicMap = {
    "topic:food": "Food",
    "topic:water": "Water",
    "topic:power": "Power",
    "topic:financial": "Financial",
    "topic:calm": "Calm",
    "topic:identity-memory": "Identity & Memory",
  };

  return topicMap[topicTag] || "Unclassified";
}

function getVisibleTags(tags = []) {
  return tags.filter(tag => !tag.startsWith("topic:"));
}

function renderKeyDecisions(decisions = []) {
  if (!decisions || decisions.length === 0) {
    return "";
  }

  return `
    <div>
      <strong>Key Decisions</strong>
      <ul>
        ${decisions
          .map(decision => `<li>${escapeHtml(decision)}</li>`)
          .join("")}
      </ul>
    </div>
  `;
}

function renderRelationships(relationships = []) {
  if (!relationships || relationships.length === 0) {
    return "";
  }

  return `
    <div>
      <strong>Relationships</strong>
      <ul>
        ${relationships
          .map((relationship) => `
            <li>
              ${escapeHtml(relationship.subject)}
              ${escapeHtml(relationship.predicate)}
              ${escapeHtml(relationship.target)}
              ${relationship.category ? `(${escapeHtml(relationship.category)})` : ""}
            </li>
          `)
          .join("")}
      </ul>
    </div>
  `;
}

const memoryListState = {
  search: "",
  type: "all",
  status: "all",
  milestone: "all",
  sort: "newest",
};

function memoryIdText(memory = {}) {
  return memory && memory.id !== undefined && memory.id !== null
    ? memory.id.toString()
    : "";
}

function memoryCreatedTime(memory = {}) {
  const value = Number(memory.createdAt || 0);
  const timestamp = value > 0 ? value / 1_000_000 : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function memoryImportance(memory = {}) {
  const value = Number(memory.importance);
  return Number.isFinite(value) ? value : 0;
}

function memoryConfidence(memory = {}) {
  const value = Number(memory.confidence);
  return Number.isFinite(value) ? value : null;
}

function memoryStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "")) : [];
}

function memorySearchText(memory = {}) {
  const tags = memoryStringArray(memory.tags);
  const topics = memoryStringArray(memory.topics);
  const decisions = memoryStringArray(memory.keyDecisions);
  return [
    memoryIdText(memory),
    memory.title,
    memory.summary,
    getMainTopic(tags),
    ...getVisibleTags(tags),
    ...topics,
    ...decisions,
    memory.memoryType,
    memory.status,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function memoryMatchesState(memory = {}) {
  const query = memoryListState.search.trim().toLowerCase();
  if (query && !memorySearchText(memory).includes(query)) return false;
  if (memoryListState.type !== "all" && String(memory.memoryType || "session") !== memoryListState.type) return false;
  if (memoryListState.status !== "all" && String(memory.status || "active") !== memoryListState.status) return false;
  if (memoryListState.milestone === "milestone" && !memory.milestone) return false;
  if (memoryListState.milestone === "regular" && memory.milestone) return false;
  return true;
}

function currentVisibleMemories() {
  const visible = latestMemories.filter(memoryMatchesState);
  return visible.sort((a, b) => {
    if (memoryListState.sort === "oldest") {
      return memoryCreatedTime(a) - memoryCreatedTime(b);
    }
    if (memoryListState.sort === "importance") {
      const importanceDelta = memoryImportance(b) - memoryImportance(a);
      return importanceDelta || memoryCreatedTime(b) - memoryCreatedTime(a);
    }
    return memoryCreatedTime(b) - memoryCreatedTime(a);
  });
}

function memoryFiltersActive() {
  return Boolean(
    memoryListState.search.trim() ||
    memoryListState.type !== "all" ||
    memoryListState.status !== "all" ||
    memoryListState.milestone !== "all" ||
    memoryListState.sort !== "newest"
  );
}

function updateSelectOptions(id, values, allLabel, currentValue) {
  const select = document.getElementById(id);
  if (!select) return;
  const uniqueValues = Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...uniqueValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
  ].join("");
  select.value = uniqueValues.includes(currentValue) ? currentValue : "all";
  if (select.value !== currentValue) {
    if (id === "memoryTypeFilter") memoryListState.type = "all";
    if (id === "memoryStatusFilter") memoryListState.status = "all";
  }
}

function renderMemoryFilterOptions() {
  updateSelectOptions(
    "memoryTypeFilter",
    latestMemories.map((memory) => String(memory.memoryType || "session")),
    "All types",
    memoryListState.type
  );
  updateSelectOptions(
    "memoryStatusFilter",
    latestMemories.map((memory) => String(memory.status || "active")),
    "All statuses",
    memoryListState.status
  );
}

function memoryReferenceButtonHtml(memory, label = null) {
  const id = memoryIdText(memory);
  if (!id) return escapeHtml(label || "Unavailable");
  return `<button type="button" class="admin-memory-clear" onclick="reviewMemoryById(${escapeHtml(JSON.stringify(id))})">${escapeHtml(label || memory.title || `Memory #${id}`)}</button>`;
}

function updateMemoryOverview(memories = latestMemories) {
  const total = memories.length;
  const milestones = memories.filter(m => m.milestone).length;
  const regular = total - milestones;
  const latest = memories.length > 0 ? memories[memories.length - 1] : null;
  const latestMilestone = memories
    .slice()
    .reverse()
    .find(m => m.milestone);

  document.getElementById("totalMemories").textContent = total;
  document.getElementById("totalMilestones").textContent = milestones;
  document.getElementById("totalRegular").textContent = regular;
  document.getElementById("latestMemory").innerHTML = latest
    ? memoryReferenceButtonHtml(latest, latest.title || `Memory #${memoryIdText(latest)}`)
    : "None";
  document.getElementById("latestMilestone").innerHTML = latestMilestone
    ? memoryReferenceButtonHtml(latestMilestone, latestMilestone.title || `Memory #${memoryIdText(latestMilestone)}`)
    : "None";
}

function renderSavedMemoryCard(memory = {}) {
  const id = memoryIdText(memory);
  const tags = memoryStringArray(memory.tags);
  const visibleTags = getVisibleTags(tags);
  const topics = memoryStringArray(memory.topics);
  const createdTime = memoryCreatedTime(memory);
  const createdText = createdTime ? new Date(createdTime).toLocaleString() : "Unknown";
  const confidence = memoryConfidence(memory);
  const topicLabel = topics.length ? topics.join(", ") : getMainTopic(tags);
  const tagLabel = visibleTags.length ? visibleTags.join(", ") : "None";

  return `
    <div class="memory-card admin-memory-card" id="memory-card-${escapeHtml(id)}" data-memory-id="${escapeHtml(id)}" tabindex="-1">
      <div class="admin-memory-card-header">
        <h3><span class="admin-memory-id">#${escapeHtml(id || "n/a")}</span> ${escapeHtml(memory.title || "Untitled memory")}</h3>
        <button type="button" class="admin-memory-delete" onclick="deleteMemory(${escapeHtml(JSON.stringify(id))})">Delete</button>
      </div>
      <p class="meta">
        Created: ${escapeHtml(createdText)} |
        Milestone: ${memory.milestone ? "yes" : "no"} |
        Type: ${escapeHtml(memory.memoryType || "session")} |
        Status: ${escapeHtml(memory.status || "active")}
      </p>
      <p class="meta admin-memory-secondary">
        Importance: ${escapeHtml(memory.importance?.toString?.() || "n/a")} |
        Confidence: ${confidence === null ? "n/a" : escapeHtml(confidence.toString())} |
        Topics: ${escapeHtml(topicLabel || "Unclassified")} |
        Tags: ${escapeHtml(tagLabel)}
      </p>
      <details>
        <summary>Memory details</summary>
        <pre>${escapeHtml(memory.summary || "")}</pre>
        ${renderKeyDecisions(memory.keyDecisions)}
        ${renderRelationships(memory.relationships)}
      </details>
    </div>
  `;
}

function renderMemoryList() {
  const list = document.getElementById("memoryList");
  const status = document.getElementById("memoryListStatus");
  const clearButton = document.getElementById("memoryClearFiltersButton");
  if (!list) return;
  const visible = currentVisibleMemories();
  if (status) {
    status.textContent = latestMemories.length
      ? `Showing ${visible.length} of ${latestMemories.length} loaded memories.`
      : "Load memories to search and filter.";
  }
  if (clearButton) {
    clearButton.disabled = !memoryFiltersActive();
  }
  if (!latestMemories.length) {
    list.innerHTML = "";
    return;
  }
  if (!visible.length) {
    list.innerHTML = "<p>No loaded memories match the current search and filters.</p>";
    return;
  }
  list.innerHTML = visible.map(renderSavedMemoryCard).join("");
}

function applyLoadedMemories(memories = []) {
  latestMemories = Array.isArray(memories) ? memories : [];
  latestMemoryUnavailable = false;
  updateMemoryOverview(latestMemories);
  renderMemoryFilterOptions();
  updateMemoryControlValuesFromState();
  renderMemoryList();
}

function updateMemoryControlValuesFromState() {
  const search = document.getElementById("memorySearchInput");
  const type = document.getElementById("memoryTypeFilter");
  const status = document.getElementById("memoryStatusFilter");
  const milestone = document.getElementById("memoryMilestoneFilter");
  const sort = document.getElementById("memorySortSelect");
  if (search) search.value = memoryListState.search;
  if (type) type.value = memoryListState.type;
  if (status) status.value = memoryListState.status;
  if (milestone) milestone.value = memoryListState.milestone;
  if (sort) sort.value = memoryListState.sort;
}

window.clearMemoryFilters = function clearMemoryFilters(options = {}) {
  memoryListState.search = "";
  memoryListState.type = "all";
  memoryListState.status = "all";
  memoryListState.milestone = "all";
  memoryListState.sort = "newest";
  updateMemoryControlValuesFromState();
  if (options.render !== false) {
    renderMemoryList();
  }
};

function initMemoryListControls() {
  const search = document.getElementById("memorySearchInput");
  const type = document.getElementById("memoryTypeFilter");
  const status = document.getElementById("memoryStatusFilter");
  const milestone = document.getElementById("memoryMilestoneFilter");
  const sort = document.getElementById("memorySortSelect");
  if (search) {
    search.addEventListener("input", () => {
      memoryListState.search = search.value;
      renderMemoryList();
    });
  }
  if (type) {
    type.addEventListener("change", () => {
      memoryListState.type = type.value || "all";
      renderMemoryList();
    });
  }
  if (status) {
    status.addEventListener("change", () => {
      memoryListState.status = status.value || "all";
      renderMemoryList();
    });
  }
  if (milestone) {
    milestone.addEventListener("change", () => {
      memoryListState.milestone = milestone.value || "all";
      renderMemoryList();
    });
  }
  if (sort) {
    sort.addEventListener("change", () => {
      memoryListState.sort = sort.value || "newest";
      renderMemoryList();
    });
  }
}

async function focusLoadedMemory(id) {
  const targetId = String(id || "");
  if (!targetId) return false;
  if (!latestMemories.length && isAuthenticated) {
    await loadMemories();
  }
  const memory = latestMemories.find((item) => memoryIdText(item) === targetId);
  const status = document.getElementById("memoryListStatus");
  if (!memory) {
    if (status) {
      status.textContent = `Memory #${targetId} is not in the loaded memory set.`;
    }
    return false;
  }
  if (!memoryMatchesState(memory)) {
    window.clearMemoryFilters({ render: false });
  }
  renderMemoryFilterOptions();
  updateMemoryControlValuesFromState();
  renderMemoryList();
  openAdminDetailPanel("memoryListPanel");
  const card = Array.from(document.querySelectorAll("[data-memory-id]"))
    .find((element) => element.dataset.memoryId === targetId);
  if (!card) {
    if (status) {
      status.textContent = `Memory #${targetId} could not be shown.`;
    }
    return false;
  }
  card.classList.add("is-focused");
  const details = card.querySelector("details");
  if (details) details.open = true;
  card.focus({ preventScroll: true });
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  if (status) {
    status.textContent = `Showing memory #${targetId}.`;
  }
  window.setTimeout(() => card.classList.remove("is-focused"), 2200);
  return true;
}

window.reviewMemoryById = async function reviewMemoryById(id) {
  await focusLoadedMemory(id);
};

window.loadMemories = async function loadMemories() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    applyLoadedMemories(memories);
  } catch (err) {
    console.error("Failed to load memories:", err);
    latestMemories = [];
    latestMemoryUnavailable = true;
    const list = document.getElementById("memoryList");
    if (list) {
      list.innerHTML = "<p>Failed to load memories.</p>";
    }
  }
};

window.deleteMemory = async function deleteMemory(id) {
  const memoryId = String(id || "");
  const memory = latestMemories.find((item) => memoryIdText(item) === memoryId);
  const title = memory && memory.title ? ` — "${memory.title}"` : "";
  const status = document.getElementById("memoryListStatus");
  if (!confirm(`Delete memory #${memoryId}${title}?\n\nThis permanently removes this continuity record.`)) {
    if (status) {
      status.textContent = `Deletion cancelled for memory #${memoryId}.`;
    }
    return;
  }

  const ok = await window.adminActor.deleteSummaryById(BigInt(memoryId));

  if (ok) {
    if (status) {
      status.textContent = `Memory #${memoryId} deleted. Refreshing saved memories...`;
    }
    await loadMemories();
    if (status) {
      status.textContent = `Memory #${memoryId} deleted. Showing ${currentVisibleMemories().length} of ${latestMemories.length} loaded memories.`;
    }
  } else {
    if (status) {
      status.textContent = `Delete failed for memory #${memoryId}.`;
    }
    alert("Delete failed or memory not found.");
  }
};

let latestMemories = [];
let latestFeedback = [];
let latestMemoryUnavailable = false;
let latestFeedbackUnavailable = false;

window.loadFeedback = async function loadFeedback() {
  const list = document.getElementById("feedbackList");
  list.innerHTML = "<p>Loading feedback...</p>";

  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  try {
    console.log("Loading ICP feedback...");
    const feedback = await window.adminActor.getRecentFeedback(BigInt(100));
    console.log("Feedback loaded:", feedback);

    latestFeedback = feedback;
    latestFeedbackUnavailable = false;

    document.getElementById("feedbackTotal").textContent = feedback.length;
    document.getElementById("feedbackUp").textContent =
      feedback.filter(f => f.rating === "up").length;
    document.getElementById("feedbackDown").textContent =
      feedback.filter(f => f.rating === "down").length;
    renderFeedbackDashboardSignal(feedback);

    if (feedback.length === 0) {
      list.innerHTML = "<p>No feedback yet.</p>";
      return;
    }

    list.innerHTML = feedback.slice().reverse().map(f => {
      const receivedText =
        f.receivedAt
          ? new Date(Number(f.receivedAt) / 1_000_000).toLocaleString()
          : "Unknown";

      return `
        <div class="memory-card">
          <h3>Feedback #${f.id.toString()} · ${f.rating === "up" ? "Helpful" : "Needs work"}</h3>
          <p class="meta">
            Rating: ${escapeHtml(f.rating)} |
            Submitted: ${escapeHtml(f.timestamp || "Unknown")} |
            Received: ${escapeHtml(receivedText)}
          </p>
          <strong>Question</strong>
          <pre>${escapeHtml(f.question || "")}</pre>
          <strong>Answer</strong>
          <pre>${escapeHtml(f.answer || "")}</pre>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.error("Failed to load feedback:", err);
    latestFeedback = [];
    latestFeedbackUnavailable = true;
    renderFeedbackDashboardSignal([]);
    list.innerHTML =
      "<p>Failed to load feedback.</p>";
  }
};

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

window.exportFeedback = function exportFeedback() {
  const plainFeedback = latestFeedback.map(f => ({
    id: f.id.toString(),
    rating: f.rating,
    question: f.question,
    answer: f.answer,
    timestamp: f.timestamp,
    receivedAt: f.receivedAt.toString(),
  }));

  const blob = new Blob(
    [JSON.stringify(plainFeedback, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `aion-feedback-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlAttributeJsonString(value) {
  return escapeHtml(JSON.stringify(String(value || "")));
}

function localEngineerDeviceRevokePath(deviceId) {
  return `${LOCAL_ENGINEER_PAIRING_REVOKE_BASE_PATH}/${encodeURIComponent(String(deviceId || ""))}/revoke`;
}

function localEngineerAdminReadinessMessage(state) {
  const messages = {
    disabled: "Durable Local Engineer trust is not active.",
    misconfigured: "Durable Local Engineer trust is misconfigured.",
    not_checked: "Durable Local Engineer trust has not been checked.",
    unavailable: "Durable Local Engineer trust is currently unavailable.",
    unauthorized: "The Local Engineer durable-trust service is not authorized.",
    contract_mismatch: "The Local Engineer durable-trust contract is unavailable or incompatible.",
    security_verification_failed: "Durable Local Engineer trust could not be verified.",
  };
  return messages[state] || "Durable Local Engineer trust status is unavailable.";
}

async function readLocalEngineerAdminResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) {
    const failure = payload && payload.detail && payload.detail.failure
      ? payload.detail.failure
      : `http_${response.status}`;
    throw new Error(failure);
  }
  return payload || {};
}

function renderLocalEngineerDeviceCard(device) {
  const state = device && device.trustState === "revoked" ? "revoked" : "paired";
  const title = state === "revoked"
    ? "Local Engineer device revoked"
    : "Local Engineer device paired";
  const action = state === "paired"
    ? `
      <button
        type="button"
        class="admin-danger-button"
        onclick="revokeLocalEngineerDeviceIdentity(${htmlAttributeJsonString(device.deviceId)})"
      >Revoke this Mac</button>
    `
    : "";
  return `
    <div class="memory-card">
      <h3>${title}</h3>
      ${renderMetricGrid({
        "device fingerprint": device.deviceFingerprint || "not shown",
        "trust state": device.trustState || "unknown",
        "key protection": device.keyProtection || "not shown",
        "record version": String(device.recordVersion ?? "not shown"),
        "last seen": device.lastSeenAt || "not shown",
      })}
      ${state === "paired" ? `<p class="meta">Revoke is permanent for this device identity and is not the same as Disconnect.</p>` : ""}
      ${action}
    </div>
  `;
}

function renderLocalEngineerGovernanceStatus(payload) {
  const durableActive = payload && payload.durableTrustActive === true;
  const mode = payload && payload.trustAuthorityMode ? payload.trustAuthorityMode : "unknown";
  const durableTrust = payload && payload.durableTrust && typeof payload.durableTrust === "object"
    ? payload.durableTrust
    : {};
  const readiness = durableTrust.readiness && typeof durableTrust.readiness === "object"
    ? durableTrust.readiness
    : {};
  const devices = Array.isArray(payload && payload.devices) ? payload.devices : [];
  const pairedDevices = devices.filter((device) => device && device.trustState === "paired");
  const revokedDevices = devices.filter((device) => device && device.trustState === "revoked");

  if (!durableActive) {
    return `
      <div class="memory-card">
        <h3>Local Engineer governance</h3>
        <p>Durable Local Engineer trust is not active. Routine Local Engineer connection remains in Operator.</p>
        ${renderMetricGrid({
          "authority mode": mode,
          "durable trust": "inactive",
        })}
      </div>
    `;
  }

  if (payload.status !== "local_engineer_durable_device_status_returned" || readiness.state !== "ready") {
    return `
      <div class="memory-card">
        <h3>Local Engineer governance</h3>
        <p>${escapeHtml(localEngineerAdminReadinessMessage(readiness.state))}</p>
        ${renderMetricGrid({
          "authority mode": mode,
          "durable trust": "not ready",
          "readiness": readiness.state || payload.status || "unknown",
        })}
      </div>
    `;
  }

  if (pairedDevices.length === 0 && revokedDevices.length === 0) {
    return `
      <div class="memory-card">
        <h3>Local Engineer governance</h3>
        <p>No durably paired Local Engineer device is recorded.</p>
        ${renderMetricGrid({
          "authority mode": mode,
          "durable trust": "ready",
        })}
      </div>
    `;
  }

  return `
    ${pairedDevices.map(renderLocalEngineerDeviceCard).join("")}
    ${revokedDevices.map(renderLocalEngineerDeviceCard).join("")}
  `;
}

window.refreshLocalEngineerGovernance = async function refreshLocalEngineerGovernance() {
  const container = document.getElementById("localEngineerGovernanceResults");
  if (!container) return;
  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before reviewing Local Engineer governance.</p>";
    return;
  }

  container.innerHTML = "<p>Refreshing Local Engineer governance...</p>";
  try {
    const response = await fetch(`${AIONIC_AGENT_API_BASE_URL}${LOCAL_ENGINEER_DEVICES_PATH}`);
    const payload = await readLocalEngineerAdminResponse(response);
    container.innerHTML = renderLocalEngineerGovernanceStatus(payload);
  } catch (err) {
    console.error("Local Engineer governance refresh failed:", err);
    container.innerHTML = "<p>Local Engineer governance status is currently unavailable.</p>";
  }
};

window.revokeLocalEngineerDeviceIdentity = async function revokeLocalEngineerDeviceIdentity(deviceId) {
  const container = document.getElementById("localEngineerGovernanceResults");
  if (!container) return;
  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before revoking Local Engineer trust.</p>";
    return;
  }

  const firstConfirmation = [
    "Revoke is not Disconnect.",
    "This permanently revokes the current Local Engineer device identity.",
    "This Mac cannot reconnect with that identity after revocation.",
    "Owner-controlled re-enrollment with a new identity is required to trust this Mac again.",
    "Historical trust evidence remains recorded.",
    "This does not delete Program Grounding, repositories, or continuity.",
  ].join("\n\n");
  if (!window.confirm(firstConfirmation)) {
    return;
  }
  if (!window.confirm("Revoke device identity")) {
    return;
  }

  container.innerHTML = "<p>Revoking Local Engineer device identity...</p>";
  try {
    const response = await fetch(
      `${AIONIC_AGENT_API_BASE_URL}${localEngineerDeviceRevokePath(deviceId)}`,
      { method: "POST" }
    );
    await readLocalEngineerAdminResponse(response);
    await window.refreshLocalEngineerGovernance();
  } catch (err) {
    console.error("Local Engineer device revoke failed:", err);
    container.innerHTML = "<p>Local Engineer device identity could not be revoked.</p>";
  }
};
window.loadGoldenTests = async function loadGoldenTests() {
  if (!isAuthenticated) {
    return;
  }
  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/golden-tests/last"
    );

    const data = await res.json();
    if (data && Array.isArray(data.results) && data.results.length > 0) {
      renderGoldenTests(data, { save: true, provenance: { kind: "LIVE", detail: "fetched now" } });
    } else {
      const savedGolden = loadSavedGoldenResults();
      if (savedGolden) {
        renderGoldenTests(savedGolden, { save: false, provenance: { kind: "CACHED", detail: "browser cache" } });
      } else {
        setGoldenDashboardProvenance("LIVE", "no run found");
        renderGoldenDashboardSignal(null);
      }
    }

  } catch (err) {
    console.error("Failed to load golden tests:", err);
    const savedGolden = loadSavedGoldenResults();
    if (savedGolden) {
      renderGoldenTests(savedGolden, { save: false, provenance: { kind: "CACHED", detail: "live fetch unavailable", unavailable: true } });
    } else {
      setGoldenDashboardProvenance("LIVE", "fetch unavailable", { unavailable: true });
      renderGoldenDashboardSignal(null);
    }
  }
};

window.runGoldenTests = async function runGoldenTests() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }
  const button = event.target;
  button.disabled = true;
  button.textContent = "Running...";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/golden-tests/run",
      { method: "POST" }
    );

    const data = await res.json();
    renderGoldenTests(data, { save: true, provenance: { kind: "LIVE", detail: "run now" } });
    if (typeof updateAdminDashboardChecklist === "function") {
      updateAdminDashboardChecklist({ quality: true });
    }
    if (typeof recordAdminDashboardActivity === "function") {
      recordAdminDashboardActivity("Golden tests run", `${data.passed || 0}/${data.total || 0} passed`);
    }

  } catch (err) {
    console.error("Failed to run golden tests:", err);
    setGoldenDashboardProvenance("LIVE", "run unavailable", { unavailable: true });
    renderGoldenDashboardSignal(null);
  } finally {
    button.disabled = false;
    button.textContent = "Run quality checks";
  }
};

window.runPublicRetrievalPreview = async function runPublicRetrievalPreview() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query = document.getElementById("publicRetrievalPreviewQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container = document.getElementById("publicRetrievalPreviewResults");
  container.innerHTML = "<p>Building preview...</p>";

  try {
    const res = await fetch(
      `${AIONIC_AGENT_API_BASE_URL}/admin/public-retrieval-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const selected = Array.isArray(data.selected) ? data.selected : [];
    const terms = Array.isArray(data.query?.terms) ? data.query.terms : [];
    const safety = data.safety || {};
    const corpus = data.corpus || {};
    const ruleVersions = data.ruleVersions || {};

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.previewVersion || "Public retrieval preview")}</h3>
        <p class="meta">
          Intent: ${escapeHtml(data.query?.intent || "unknown")} |
          Corpus: ${escapeHtml(corpus.schemaVersion || "unknown")} |
          Documents: ${escapeHtml(corpus.documentCount ?? "unknown")} |
          Chunks: ${escapeHtml(corpus.chunkCount ?? "unknown")}
        </p>
        <p class="meta">Corpus SHA-256: ${escapeHtml(corpus.corpusSha256 || "unavailable")}</p>
        <p class="meta">Rule versions: ${escapeHtml(JSON.stringify(ruleVersions))}</p>
        <pre>${escapeHtml(terms.join(", "))}</pre>
      </div>

      <div class="memory-card">
        <h3>Selected Sources</h3>
        ${
          selected.length > 0
            ? selected.map((item) => `
                <p class="meta">
                  ${escapeHtml(item.rank)}.
                  ${escapeHtml(item.documentId || "unknown")}
                  |
                  Chunk: ${escapeHtml(item.chunkId || "unknown")}
                  |
                  Score: ${escapeHtml(item.score ?? "N/A")}
                  |
                  Boosted: ${escapeHtml(item.boostedScore ?? "N/A")}
                  |
                  Type: ${escapeHtml(item.sourceType || "unknown")}
                </p>
              `).join("")
            : "<p>No sources selected.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Safety</h3>
        <pre>${escapeHtml(JSON.stringify(safety, null, 2))}</pre>
      </div>
    `;

  } catch (err) {
    console.error("Public retrieval preview failed:", err);
    container.innerHTML = "<p>Public retrieval preview failed.</p>";
  }
};

function serializeNat(value, fallback = "0") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value?.toString === "function") {
    return value.toString();
  }

  return String(value);
}

function serializeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(item => String(item));
}

function serializeRelationships(relationships = []) {
  if (!Array.isArray(relationships)) {
    return [];
  }

  return relationships.map(relationship => ({
    subject: String(relationship.subject || ""),
    predicate: String(relationship.predicate || ""),
    target: String(relationship.target || ""),
    category: String(relationship.category || ""),
  }));
}

function serializeMemoryForRanking(memory) {
  return {
    id: serializeNat(memory.id),
    createdAt: serializeNat(memory.createdAt),
    updatedAt: serializeNat(memory.updatedAt),
    title: String(memory.title || ""),
    summary: String(memory.summary || ""),
    topics: serializeArray(memory.topics),
    tags: serializeArray(memory.tags),
    keyDecisions: serializeArray(memory.keyDecisions),
    relationships: serializeRelationships(memory.relationships),
    milestone: Boolean(memory.milestone),
    importance: Number(memory.importance || 5),
    memoryType: String(memory.memoryType || "session"),
    sourceSessionId: String(memory.sourceSessionId || ""),
    confidence: Number(memory.confidence || 80),
    status: String(memory.status || "active"),
  };
}

function renderCountMap(counts = {}) {
  const entries = Object.entries(counts || {});

  if (entries.length === 0) {
    return "<p>No counts available.</p>";
  }

  return `
    <ul>
      ${entries.map(([label, count]) => `
        <li>${escapeHtml(label)}: ${escapeHtml(count)}</li>
      `).join("")}
    </ul>
  `;
}

function renderMemoryRef(memory = {}) {
  if (!memory) {
    return "None";
  }

  return `${memory.title || "Untitled"} (ID: ${memory.id ?? "n/a"}, Type: ${memory.type || "session"})`;
}

function memoryReviewActionsHtml(...memories) {
  const buttons = memories
    .flat()
    .filter(Boolean)
    .map((memory) => {
      const id = memoryIdText(memory);
      if (!id) return "";
      return `<button type="button" class="admin-memory-clear" onclick="reviewMemoryById(${escapeHtml(JSON.stringify(id))})">Review memory #${escapeHtml(id)}</button>`;
    })
    .filter(Boolean);
  if (!buttons.length) return "";
  return `<div class="admin-memory-ref-actions">${buttons.join("")}</div>`;
}

function dashboardNextActionMemories(health, consolidation, decisionEvolution) {
  const suggestions = consolidation.suggestions || [];
  const merge = suggestions.find((suggestion) => suggestion.action === "merge_candidate");
  const deprecate = suggestions.find((suggestion) => suggestion.action === "deprecate_candidate");
  const orphan = (health.orphanMemories || [])[0];
  const unresolved = (decisionEvolution.unresolvedOlderDecisionReferences || [])[0];
  const review = suggestions.find((suggestion) => suggestion.action === "needs_review");

  if (merge) return [merge.keepMemory, merge.deprecateMemory];
  if (deprecate) return [deprecate.keepMemory, deprecate.reviewMemory, deprecate.memory].filter(Boolean);
  if (orphan) return [orphan];
  if (unresolved) return [unresolved.olderMemory];
  if (review) return [review.keepMemory, review.reviewMemory, review.memory].filter(Boolean);
  return [];
}

async function postMemoryDryRun(path, payload) {
  const res = await fetch(
    `https://aionic-agent-api.onrender.com${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

function countSuggestionsByAction(suggestions = []) {
  return (suggestions || []).reduce((counts, suggestion) => {
    const action = suggestion.action || "unknown";
    counts[action] = (counts[action] || 0) + 1;
    return counts;
  }, {});
}

function buildDashboardStatus(health, consolidation, decisionEvolution) {
  const actionCounts = countSuggestionsByAction(consolidation.suggestions || []);
  const mergeCount = actionCounts.merge_candidate || 0;
  const deprecateCount = actionCounts.deprecate_candidate || 0;
  const orphanCount = (health.orphanMemories || []).length;
  const unresolvedDecisionCount = decisionEvolution.unresolvedOlderDecisionReferenceCount || 0;

  if (mergeCount || deprecateCount || orphanCount) {
    return {
      label: "Needs Manual Cleanup",
      reason: "Review merge, deprecation, or orphan-memory items before proceeding.",
    };
  }

  if (unresolvedDecisionCount || (actionCounts.needs_review || 0)) {
    return {
      label: "Review Recommended",
      reason: "No immediate cleanup is required, but some items need human judgment.",
    };
  }

  return {
    label: "Looks Stable",
    reason: "No high-priority memory graph issues were detected.",
  };
}

function buildDashboardNextAction(health, consolidation, decisionEvolution) {
  const suggestions = consolidation.suggestions || [];
  const merge = suggestions.find((suggestion) => suggestion.action === "merge_candidate");
  const deprecate = suggestions.find((suggestion) => suggestion.action === "deprecate_candidate");
  const orphan = (health.orphanMemories || [])[0];
  const unresolved = (decisionEvolution.unresolvedOlderDecisionReferences || [])[0];
  const review = suggestions.find((suggestion) => suggestion.action === "needs_review");

  if (merge) {
    return `Review merge candidate: keep ${renderMemoryRef(merge.keepMemory)} and review ${renderMemoryRef(merge.deprecateMemory)}.`;
  }

  if (deprecate) {
    return deprecate.recommendation || "Review deprecation candidate.";
  }

  if (orphan) {
    return `Review orphan memory: ${orphan.title || "Untitled"}.`;
  }

  if (unresolved) {
    return `Resolve older decision reference: ${renderMemoryRef(unresolved.olderMemory)}.`;
  }

  if (review) {
    return review.recommendation || "Review remaining possible duplicate.";
  }

  return "No immediate manual action is recommended.";
}

function renderTopDashboardRisks(health, consolidation, decisionEvolution) {
  const risks = [];
  const actionCounts = countSuggestionsByAction(consolidation.suggestions || []);

  if (actionCounts.merge_candidate) {
    risks.push(`${actionCounts.merge_candidate} merge candidate(s)`);
  }

  if (actionCounts.deprecate_candidate) {
    risks.push(`${actionCounts.deprecate_candidate} deprecation candidate(s)`);
  }

  if ((health.orphanMemories || []).length) {
    risks.push(`${health.orphanMemories.length} orphan memory item(s)`);
  }

  if (decisionEvolution.unresolvedOlderDecisionReferenceCount) {
    risks.push(`${decisionEvolution.unresolvedOlderDecisionReferenceCount} unresolved older decision reference(s)`);
  }

  if (actionCounts.needs_review) {
    risks.push(`${actionCounts.needs_review} needs-review item(s)`);
  }

  if (risks.length === 0) {
    return "<p>No top risks detected.</p>";
  }

  return `
    <ul>
      ${risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}
    </ul>
  `;
}

window.runMemoryHealthDashboard = async function runMemoryHealthDashboard() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("memoryHealthDashboardResults");
  container.innerHTML = "<p>Building memory health dashboard...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    applyLoadedMemories(memories);

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const [health, consolidation, decisionEvolution] = await Promise.all([
      postMemoryDryRun("/admin/memory-health", {
        memories: serializedMemories,
        clusterLimit: 8,
        duplicateLimit: 8,
      }),
      postMemoryDryRun("/admin/memory-consolidations", {
        memories: serializedMemories,
        limit: 8,
      }),
      postMemoryDryRun("/admin/decision-evolution", {
        memories: serializedMemories,
      }),
    ]);
    const status = buildDashboardStatus(health, consolidation, decisionEvolution);
    const actionCounts = countSuggestionsByAction(consolidation.suggestions || []);

    container.innerHTML = `
      <div class="memory-card">
        <h3>Dashboard Status</h3>
        <p><strong>${escapeHtml(status.label)}</strong></p>
        <p>${escapeHtml(status.reason)}</p>
        <p class="meta">
          Memories: ${escapeHtml(health.memoryCount ?? serializedMemories.length)} |
          Relationships: ${escapeHtml(health.relationshipCount ?? 0)} |
          Avg relationships/memory: ${escapeHtml(health.averageRelationshipsPerMemory ?? 0)} |
          Current decisions: ${escapeHtml(decisionEvolution.currentDecisionCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Action Counts</h3>
        ${renderCountMap(actionCounts)}
      </div>

      <div class="memory-card">
        <h3>Top Risks</h3>
        ${renderTopDashboardRisks(health, consolidation, decisionEvolution)}
      </div>

      <div class="memory-card">
        <h3>Recommended Next Manual Action</h3>
        <p>${escapeHtml(buildDashboardNextAction(health, consolidation, decisionEvolution))}</p>
        ${memoryReviewActionsHtml(dashboardNextActionMemories(health, consolidation, decisionEvolution))}
      </div>

      <div class="memory-card">
        <h3>Decision Evolution</h3>
        <p class="meta">
          Superseded decisions: ${escapeHtml(decisionEvolution.supersededDecisionCount ?? 0)} |
          Inferred supersessions: ${escapeHtml(decisionEvolution.inferredSupersessionCount ?? 0)} |
          Unresolved older references: ${escapeHtml(decisionEvolution.unresolvedOlderDecisionReferenceCount ?? 0)}
        </p>
      </div>
    `;

  } catch (err) {
    console.error("Memory health dashboard failed:", err);
    container.innerHTML = `<p>Memory health dashboard failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderMaintenanceRelationship(relationship = {}) {
  if (!relationship || !relationship.subject) {
    return "None";
  }

  return `${relationship.subject || "subject"} ${relationship.predicate || "predicate"} ${relationship.target || "target"}`;
}

function renderOperatorGuidance(guidance = {}) {
  if (!guidance || !guidance.mode) {
    return "<p>No operator guidance available.</p>";
  }

  const steps = Array.isArray(guidance.manualSteps)
    ? guidance.manualSteps
    : [];

  return `
    <p class="meta">
      Guidance: ${escapeHtml(guidance.mode || "manual_review")} |
      Automatic action: ${guidance.canApplyAutomatically ? "yes" : "no"}
    </p>
    <p><strong>Outcome:</strong> ${escapeHtml(guidance.recommendedOutcome || "")}</p>
    ${
      guidance.blockedBy
        ? `<p><strong>Blocked by:</strong> ${escapeHtml(guidance.blockedBy)}</p>`
        : ""
    }
    ${
      steps.length
        ? `<ul>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

function renderMaintenanceActions(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return "<p>No maintenance actions suggested.</p>";
  }

  return actions.map((action, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(action.title || action.actionType || "Review action")}</strong>
      <p class="meta">
        Type: ${escapeHtml(action.actionType || "n/a")} |
        Priority: ${escapeHtml(action.priority || "n/a")} |
        Safety: ${escapeHtml(action.safety || "n/a")} |
        Confidence: ${escapeHtml(action.confidence || "n/a")} |
        Sources: ${escapeHtml((action.sourceAnalyses || []).join(", ") || "n/a")}
      </p>
      <p>${escapeHtml(action.reason || "")}</p>
      <p><strong>Keep:</strong> ${escapeHtml(renderMemoryRef(action.keepMemory || null))}</p>
      <p><strong>Review:</strong> ${escapeHtml(renderMemoryRef(action.reviewMemory || null))}</p>
      ${memoryReviewActionsHtml([action.keepMemory, action.reviewMemory, action.memory])}
      <p><strong>Relationship:</strong> ${escapeHtml(renderMaintenanceRelationship(action.relationship))}</p>
      <p>${escapeHtml(action.recommendation || "")}</p>
      <div>
        <strong>Operator Guidance</strong>
        ${renderOperatorGuidance(action.operatorGuidance)}
      </div>
      <pre>${escapeHtml((action.sharedTerms || []).join(", "))}</pre>
    </div>
  `).join("");
}

function renderMaintenanceExport(text = "") {
  if (!text) {
    return "<p>No export memo available.</p>";
  }

  return `
    <textarea
      id="memoryMaintenanceExportText"
      readonly
      style="width: 100%; min-height: 320px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyMemoryMaintenanceExport()">Copy Memo</button>
  `;
}

function renderSeveritySummary(summary = {}) {
  if (!summary || !summary.recommendedStatus) {
    return "<p>No severity summary available.</p>";
  }

  return `
    <p><strong>${escapeHtml(summary.recommendedStatus || "Looks Stable")}</strong></p>
    <p>${escapeHtml(summary.reason || "")}</p>
    <p class="meta">
      Immediate blockers: ${escapeHtml(summary.immediateBlockerCount ?? 0)} |
      Manual review items: ${escapeHtml(summary.manualReviewCount ?? 0)} |
      No-action items: ${escapeHtml(summary.noActionCount ?? 0)}
    </p>
    <p><strong>Next action:</strong> ${escapeHtml(summary.nextAction || "No immediate manual action is recommended.")}</p>
  `;
}

window.copyMemoryMaintenanceExport = async function copyMemoryMaintenanceExport() {
  const exportBox = document.getElementById("memoryMaintenanceExportText");

  if (!exportBox) {
    alert("No maintenance memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Maintenance memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runMemoryMaintenancePlanDebug = async function runMemoryMaintenancePlanDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("memoryMaintenancePlanResults");
  container.innerHTML = "<p>Building memory maintenance action plan...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    applyLoadedMemories(memories);

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/memory-maintenance-plan", {
      memories: serializedMemories,
      limit: 10,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Maintenance Plan Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Relationships: ${escapeHtml(data.relationshipCount ?? 0)} |
          Actions: ${escapeHtml(data.actionCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Severity Summary</h3>
        ${renderSeveritySummary(data.severitySummary)}
      </div>

      <div class="memory-card">
        <h3>Safety Counts</h3>
        ${renderCountMap(data.safetyCounts)}
      </div>

      <div class="memory-card">
        <h3>Priority Counts</h3>
        ${renderCountMap(data.priorityCounts)}
      </div>

      <div class="memory-card">
        <h3>Action Type Counts</h3>
        ${renderCountMap(data.actionTypeCounts)}
      </div>

      <div class="memory-card">
        <h3>Source Summary</h3>
        ${renderCountMap(data.sourceSummary)}
      </div>

      <div class="memory-card">
        <h3>Operator Checklist</h3>
        ${renderMaintenanceActions(data.actions)}
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderMaintenanceExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Memory maintenance plan dry run failed:", err);
    container.innerHTML = `<p>Memory maintenance plan dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function valueFromInput(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function currentOperatorIdentifier() {
  try {
    const principal = identity && identity.getPrincipal && identity.getPrincipal();
    return principal && principal.toText ? principal.toText() : "admin-operator";
  } catch (_error) {
    return "admin-operator";
  }
}

function checkedValue(id) {
  const element = document.getElementById(id);
  return Boolean(element && element.checked);
}

function routeSwitchAcknowledgementsReady() {
  return [
    "productionRouteOperatorAuthorized",
    "productionRouteIdentityReviewed",
    "productionRouteAuditAcknowledged",
    "productionRouteRollbackAcknowledged",
    "productionRouteNoFallbackAcknowledged",
    "productionRouteNoRetryAcknowledged",
    "productionRouteNoDeploymentAcknowledged",
    "productionRouteNoMemoryContinuityAcknowledged",
  ].every(checkedValue);
}

function productionRouteSwitchReason() {
  return valueFromInput("productionRouteSwitchReason") || "Operator-selected production route change.";
}

function productionRouteSwitchRequest(routeId) {
  const command = routeId === OPENAI_PRODUCTION_ROUTE_ID
    ? "select_openai_production_baseline"
    : "select_native_production_candidate";

  return {
    requestedRouteId: routeId,
    command,
    operatorIdentifier: currentOperatorIdentifier(),
    reason: productionRouteSwitchReason(),
    operatorAuthorized: checkedValue("productionRouteOperatorAuthorized"),
    routeIdentityReviewed: checkedValue("productionRouteIdentityReviewed"),
    auditAcknowledged: checkedValue("productionRouteAuditAcknowledged"),
    rollbackAcknowledged: checkedValue("productionRouteRollbackAcknowledged"),
    noFallbackAcknowledged: checkedValue("productionRouteNoFallbackAcknowledged"),
    noRetryAcknowledged: checkedValue("productionRouteNoRetryAcknowledged"),
    noDeploymentAcknowledged: checkedValue("productionRouteNoDeploymentAcknowledged"),
    noMemoryContinuityMutationAcknowledged: checkedValue("productionRouteNoMemoryContinuityAcknowledged"),
    fallbackRequested: false,
    retryRequested: false,
    deploymentRequested: false,
    openAiRetirementRequested: false,
    memoryMutationRequested: false,
    continuityMutationRequested: false,
    productionCutoverRequested: false,
    permanentDefaultChangeRequested: false,
  };
}

function productionRouteRollbackRequest() {
  return {
    operatorIdentifier: currentOperatorIdentifier(),
    reason: productionRouteSwitchReason(),
    operatorAuthorized: checkedValue("productionRouteOperatorAuthorized"),
    rollbackAcknowledged: checkedValue("productionRouteRollbackAcknowledged"),
    fallbackRequested: false,
    retryRequested: false,
    deploymentRequested: false,
    openAiRetirementRequested: false,
    memoryMutationRequested: false,
    continuityMutationRequested: false,
    productionCutoverRequested: false,
    permanentDefaultChangeRequested: false,
  };
}

async function readProductionRouteSwitchResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok) {
    const detail = data && (data.detail || data.error);
    throw new Error(typeof detail === "string" ? detail : `Route switch request failed with HTTP ${response.status}.`);
  }

  return data || {};
}

function renderProductionRouteSwitchState(data = {}) {
  const activeRoute = data.activeProductionRoute || {};
  const routes = Array.isArray(data.supportedProductionRoutes)
    ? data.supportedProductionRoutes
    : [];
  const activeIsOpenAi = data.activeProductionRouteId === OPENAI_PRODUCTION_ROUTE_ID;
  const activeIsNative = data.activeProductionRouteId === NATIVE_PRODUCTION_ROUTE_ID;
  const rows = routes.map((route) => `
    <tr>
      <td><strong>${escapeHtml(route.label || route.routeId || "Unknown route")}</strong></td>
      <td>${escapeHtml(route.providerId || "n/a")}</td>
      <td>${renderStatusBadge(route.routeId === data.activeProductionRouteId ? "active" : "available", route.routeId === data.activeProductionRouteId ? "success" : "info")}</td>
      <td>${renderStatusBadge(route.publicAnswerEligible ? "production-capable" : "review", route.publicAnswerEligible ? "success" : "error")}</td>
    </tr>
  `).join("");

  return `
    <div class="memory-card">
      <h3>Active Production Route</h3>
      ${renderMetricGrid({
        route: activeRoute.label || data.activeProductionRouteId || "unknown",
        provider: activeRoute.providerId || "unknown",
        rollback: data.rollbackTargetRouteId || OPENAI_PRODUCTION_ROUTE_ID,
        audit: data.auditCount ?? 0,
      })}
      <p>
        ${renderStatusBadge(activeIsOpenAi ? "OpenAI active" : activeIsNative ? "Native active" : "Review route", activeIsOpenAi || activeIsNative ? "success" : "error")}
        ${renderStatusBadge(data.automaticFallback ? "fallback enabled" : "no fallback", data.automaticFallback ? "error" : "info")}
        ${renderStatusBadge(data.automaticRetry ? "retry enabled" : "no retry", data.automaticRetry ? "error" : "info")}
      </p>
    </div>
    <div class="memory-card">
      <h3>Supported Routes</h3>
      <table>
        <thead><tr><th>Route</th><th>Provider</th><th>Status</th><th>Production</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderProductionRouteSwitchAudit(data = {}) {
  const events = Array.isArray(data.events) ? data.events : [];
  if (!events.length) {
    return `
      <div class="memory-card">
        <h3>Route Audit</h3>
        <p>No route-switch events recorded yet.</p>
      </div>
    `;
  }

  return `
    <div class="memory-card">
      <h3>Route Audit</h3>
      <table>
        <thead><tr><th>Time</th><th>Command</th><th>Previous</th><th>Selected</th><th>Operator</th></tr></thead>
        <tbody>
          ${events.map((entry) => `
            <tr>
              <td>${escapeHtml(entry.createdAt || "n/a")}</td>
              <td>${escapeHtml(entry.command || "n/a")}</td>
              <td>${escapeHtml(entry.previousProductionRouteId || "n/a")}</td>
              <td>${escapeHtml(entry.selectedProductionRouteId || "n/a")}</td>
              <td>${escapeHtml(entry.operatorIdentifier || "n/a")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

window.refreshProductionRouteSwitch = async function refreshProductionRouteSwitch() {
  const container = document.getElementById("productionRouteSwitchState");
  if (!container) return;

  if (!isAuthenticated || !isOperator) {
    container.innerHTML = "<p>Sign in with operator access first.</p>";
    return;
  }

  container.innerHTML = "<p>Refreshing production route...</p>";

  try {
    const response = await fetch(`${AIONIC_AGENT_API_BASE_URL}/admin/production-route-switch`);
    const data = await readProductionRouteSwitchResponse(response);
    container.innerHTML = renderProductionRouteSwitchState(data);
  } catch (err) {
    console.error("Production route refresh failed:", err);
    container.innerHTML = `<p>Production route refresh failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.refreshProductionRouteSwitchAudit = async function refreshProductionRouteSwitchAudit() {
  const container = document.getElementById("productionRouteSwitchAudit");
  if (!container) return;

  if (!isAuthenticated || !isOperator) {
    container.innerHTML = "<p>Sign in with operator access first.</p>";
    return;
  }

  container.innerHTML = "<p>Loading route audit...</p>";

  try {
    const response = await fetch(`${AIONIC_AGENT_API_BASE_URL}/admin/production-route-switch/audit`);
    const data = await readProductionRouteSwitchResponse(response);
    container.innerHTML = renderProductionRouteSwitchAudit(data);
  } catch (err) {
    console.error("Production route audit failed:", err);
    container.innerHTML = `<p>Production route audit failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

async function applyProductionRouteSwitch(routeId) {
  const container = document.getElementById("productionRouteSwitchResults");
  if (!container) return;

  if (!isAuthenticated || !isOperator) {
    container.innerHTML = "<p>Sign in with operator access first.</p>";
    return;
  }

  if (!routeSwitchAcknowledgementsReady()) {
    container.innerHTML = "<p>Review and check each operator confirmation before changing the production route.</p>";
    return;
  }

  const label = routeId === NATIVE_PRODUCTION_ROUTE_ID ? "native" : "OpenAI";
  if (!window.confirm(`Select ${label} as the production answer route?`)) {
    return;
  }

  container.innerHTML = `<p>Selecting ${escapeHtml(label)}...</p>`;

  try {
    const response = await fetch(
      `${AIONIC_AGENT_API_BASE_URL}/admin/production-route-switch/select`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(productionRouteSwitchRequest(routeId)),
      }
    );
    const data = await readProductionRouteSwitchResponse(response);
    container.innerHTML = renderProductionRouteSwitchState(data);
    await window.refreshProductionRouteSwitchAudit();
    if (typeof recordAdminDashboardActivity === "function") {
      recordAdminDashboardActivity("Production route selected", data.activeProductionRouteId || routeId);
    }
  } catch (err) {
    console.error("Production route selection failed:", err);
    container.innerHTML = `<p>Production route selection failed: ${escapeHtml(err.message || err)}</p>`;
  }
}

window.selectNativeProductionRoute = function selectNativeProductionRoute() {
  return applyProductionRouteSwitch(NATIVE_PRODUCTION_ROUTE_ID);
};

window.selectOpenAiProductionRoute = function selectOpenAiProductionRoute() {
  return applyProductionRouteSwitch(OPENAI_PRODUCTION_ROUTE_ID);
};

window.rollbackProductionRouteToOpenAi = async function rollbackProductionRouteToOpenAi() {
  const container = document.getElementById("productionRouteSwitchResults");
  if (!container) return;

  if (!isAuthenticated || !isOperator) {
    container.innerHTML = "<p>Sign in with operator access first.</p>";
    return;
  }

  if (!checkedValue("productionRouteOperatorAuthorized") || !checkedValue("productionRouteRollbackAcknowledged")) {
    container.innerHTML = "<p>Confirm operator authorization and rollback acknowledgement before rollback.</p>";
    return;
  }

  if (!window.confirm("Roll production back to the OpenAI baseline?")) {
    return;
  }

  container.innerHTML = "<p>Rolling back to OpenAI...</p>";

  try {
    const response = await fetch(
      `${AIONIC_AGENT_API_BASE_URL}/admin/production-route-switch/rollback`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(productionRouteRollbackRequest()),
      }
    );
    const data = await readProductionRouteSwitchResponse(response);
    container.innerHTML = renderProductionRouteSwitchState(data);
    await window.refreshProductionRouteSwitchAudit();
    if (typeof recordAdminDashboardActivity === "function") {
      recordAdminDashboardActivity("Production route rolled back", data.activeProductionRouteId || OPENAI_PRODUCTION_ROUTE_ID);
    }
  } catch (err) {
    console.error("Production route rollback failed:", err);
    container.innerHTML = `<p>Production route rollback failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderStatusBadge(value, fallback = "info") {
  const normalized = String(value ?? "").toLowerCase();
  const badgeClass = normalized.includes("success") || normalized === "pass" || normalized === "yes"
    ? "success"
    : normalized.includes("error") || normalized === "review" || normalized === "no"
      ? "error"
      : fallback;

  return `<span class="status-badge ${badgeClass}">${escapeHtml(String(value ?? "n/a"))}</span>`;
}

function renderMetricGrid(metrics = {}) {
  return `
    <div class="dashboard-grid">
      ${Object.entries(metrics).map(([label, value]) => `
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(label)}</div>
          <div class="metric-value">${escapeHtml(String(value ?? "n/a"))}</div>
        </div>
      `).join("")}
    </div>
  `;
}

const GOLDEN_RESULTS_KEY = "aion_admin_golden_results";
let goldenDashboardProvenance = {
  kind: "CACHED",
  detail: "browser cache",
  unavailable: false,
  stale: false,
};

function setGoldenDashboardProvenance(kind, detail = "", options = {}) {
  goldenDashboardProvenance = {
    kind,
    detail,
    unavailable: options.unavailable === true,
    stale: options.stale === true,
  };
}

function saveGoldenResults(data) {
  localStorage.setItem(
    GOLDEN_RESULTS_KEY,
    JSON.stringify(data)
  );
}

function loadSavedGoldenResults() {
  try {
    const raw = localStorage.getItem(GOLDEN_RESULTS_KEY);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (err) {
    console.error("Could not load saved golden results:", err);
    return null;
  }
}

function renderGoldenTests(data, options = {}) {

  const shouldSave =
    options.save === true &&
    data &&
    Array.isArray(data.results) &&
    data.results.length > 0;

  if (options.provenance) {
    setGoldenDashboardProvenance(
      options.provenance.kind,
      options.provenance.detail,
      {
        unavailable: options.provenance.unavailable === true,
        stale: options.provenance.stale === true,
      }
    );
  }

  if (shouldSave) {
    saveGoldenResults(data);
  }

  document.getElementById("goldenLastRun").textContent =
    `Last run: ${data.last_run_at || "Never"}`;

  document.getElementById("goldenSummary").textContent =
    `${data.passed || 0}/${data.total || 0} passed`;

  renderGoldenDashboardSignal(data);

  document.getElementById("goldenResults").innerHTML =
    (data.results || [])
      .map((r) => `
        <div class="memory-card">
          <strong>${r.passed ? "✅" : "❌"} ${escapeHtml(r.name)}</strong>
          <p class="meta">${escapeHtml(r.query || "")}</p>
          <details>
            <summary>View answer</summary>
            <pre>${escapeHtml(r.answer || "")}</pre>
          </details>

          <pre>${escapeHtml(r.notes || "")}</pre>
        </div>
      `)
      .join("");
}

// Admin dashboard quality signals start
function dashboardQualityClass(className) {
  if (className === "success" || className === "healthy") return "healthy";
  if (className === "warning" || className === "watch") return "watch";
  if (className === "error" || className === "stale") return "stale";
  return "pending";
}

function renderDashboardBadge(label, className = "pending") {
  return `<span class="admin-cycle-runway-label ${dashboardQualityClass(className)}">${escapeHtml(label)}</span>`;
}

function goldenResultAgeHours(data) {
  if (!data || !data.last_run_at) return null;
  const runTime = new Date(data.last_run_at).getTime();
  if (!Number.isFinite(runTime)) return null;
  const hours = (Date.now() - runTime) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function goldenFreshnessStatus(data) {
  const hours = goldenResultAgeHours(data);
  if (!Number.isFinite(hours)) return { label: "Age unknown", className: "watch" };
  if (hours > 720) return { label: "Run again", className: "stale" };
  if (hours > 168) return { label: "Aging", className: "watch" };
  return { label: "Fresh", className: "healthy" };
}

function goldenQualityStatus(data = loadSavedGoldenResults()) {
  if (goldenDashboardProvenance && goldenDashboardProvenance.unavailable) {
    return { label: "Tests unavailable", className: "stale", detailId: "goldenTestsPanel" };
  }
  if (!data || !Number.isFinite(Number(data.total)) || Number(data.total) === 0) {
    return { label: "Run golden tests", className: "pending", detailId: "goldenTestsPanel" };
  }

  const total = Number(data.total || 0);
  const passed = Number(data.passed || 0);
  if (passed === total) {
    const freshness = goldenFreshnessStatus(data);
    if (freshness.className === "stale") {
      return { label: "Run golden tests", className: "stale", detailId: "goldenTestsPanel" };
    }
    if (freshness.className === "watch") {
      return { label: "Tests aging", className: "watch", detailId: "goldenTestsPanel" };
    }
    return { label: "Tests passing", className: "healthy", detailId: "goldenTestsPanel" };
  }
  if (passed > 0) {
    return { label: "Review tests", className: "watch", detailId: "goldenTestsPanel" };
  }
  return { label: "Tests failing", className: "stale", detailId: "goldenTestsPanel" };
}

function feedbackQualityStatus(feedback = latestFeedback) {
  if (latestFeedbackUnavailable) {
    return { label: "Feedback unavailable", className: "stale", detailId: "feedbackDashboardPanel" };
  }
  const items = Array.isArray(feedback) ? feedback : [];
  if (items.length === 0) {
    return { label: "No feedback", className: "pending", detailId: "feedbackDashboardPanel" };
  }

  const up = items.filter((item) => item.rating === "up").length;
  const down = items.filter((item) => item.rating === "down").length;
  if (down === 0) {
    return { label: "Feedback clean", className: "healthy", detailId: "feedbackDashboardPanel" };
  }
  if (down > up) {
    return { label: "Review feedback", className: "stale", detailId: "feedbackDashboardPanel" };
  }
  return { label: "Feedback watch", className: "watch", detailId: "feedbackDashboardPanel" };
}

function dashboardLiveDataStatus() {
  const unavailable = [];
  if (latestMemoryUnavailable) unavailable.push("memories");
  if (latestFeedbackUnavailable) unavailable.push("feedback");
  if (goldenDashboardProvenance && goldenDashboardProvenance.unavailable) unavailable.push("golden tests");
  return {
    className: unavailable.length ? "stale" : "healthy",
    label: unavailable.length ? "Refresh unavailable" : "Live data ready",
    unavailable,
  };
}

function combinedQualityAttentionStatus(data = loadSavedGoldenResults(), feedback = latestFeedback) {
  const golden = goldenQualityStatus(data);
  const feedbackStatus = feedbackQualityStatus(feedback);
  const priority = { stale: 3, watch: 2, pending: 1, healthy: 0 };
  return (priority[feedbackStatus.className] || 0) > (priority[golden.className] || 0)
    ? feedbackStatus
    : golden;
}

function renderDashboardQualityAttention(data = loadSavedGoldenResults(), feedback = latestFeedback) {
  const status = combinedQualityAttentionStatus(data, feedback);
  if (typeof setDashboardAttentionItem === "function") {
    setDashboardAttentionItem("adminAttentionQuality", status.className, status.label);
  }
  const element = document.getElementById("adminAttentionQuality");
  if (element && status.detailId) {
    element.dataset.adminDetailJump = status.detailId;
    delete element.dataset.adminViewJump;
  }
}

function renderOverviewQualityState(data = loadSavedGoldenResults(), feedback = latestFeedback) {
  const element = document.getElementById("healthGoldenTests");
  const status = combinedQualityAttentionStatus(data, feedback);
  const golden = data && Number.isFinite(Number(data.total))
    ? `${Number(data.passed || 0)}/${Number(data.total || 0)} tests`
    : "No test run";
  const items = Array.isArray(feedback) ? feedback : [];
  const down = latestFeedbackUnavailable ? null : items.filter((item) => item.rating === "down").length;
  const feedbackLabel = latestFeedbackUnavailable
    ? "feedback unavailable"
    : items.length
      ? `${down} negative feedback`
      : "no feedback";
  if (element) {
    element.innerHTML = `${escapeHtml(status.label)} · ${escapeHtml(golden)} · ${escapeHtml(feedbackLabel)}${renderDashboardBadge(status.className === "healthy" ? "Clear" : "Review", status.className === "healthy" ? "success" : status.className)}`;
  }
  setAdminMetricProvenance(
    "healthGoldenTests",
    latestFeedbackUnavailable || (goldenDashboardProvenance && goldenDashboardProvenance.unavailable)
      ? "LIVE"
      : "DERIVED",
    latestFeedbackUnavailable || (goldenDashboardProvenance && goldenDashboardProvenance.unavailable)
      ? "ICP unavailable"
      : "from tests and feedback",
    { unavailable: latestFeedbackUnavailable || (goldenDashboardProvenance && goldenDashboardProvenance.unavailable), stale: status.className === "stale" }
  );
  renderDashboardQualityAttention(data, feedback);
}

function refreshRecommendedActionFromQuality() {
  if (typeof renderCycleSnapshot === "function") {
    renderCycleSnapshot(loadCycleSnapshot());
  }
}

function renderGoldenDashboardSignal(data = null) {
  const provenance = goldenDashboardProvenance || {};
  if (!data || !Number.isFinite(Number(data.total)) || Number(data.total) === 0) {
    setAdminMetricProvenance(
      "healthGoldenTests",
      provenance.kind || "LIVE",
      provenance.detail || "no run found",
      { unavailable: provenance.unavailable === true, stale: provenance.stale === true }
    );
    renderOverviewQualityState(data, latestFeedback);
    refreshRecommendedActionFromQuality();
    return;
  }

  const total = Number(data.total || 0);
  const passed = Number(data.passed || 0);
  const freshness = passed === total ? goldenFreshnessStatus(data) : null;
  setAdminMetricProvenance(
    "healthGoldenTests",
    provenance.kind || "CACHED",
    provenance.detail || (provenance.kind === "LIVE" ? "fetched now" : "browser cache"),
    { unavailable: provenance.unavailable === true, stale: freshness && freshness.className === "stale" }
  );
  renderOverviewQualityState(data, latestFeedback);
  refreshRecommendedActionFromQuality();
}

function renderFeedbackDashboardSignal(feedback = []) {
  if (latestFeedbackUnavailable) {
    renderOverviewQualityState(loadSavedGoldenResults(), []);
    refreshRecommendedActionFromQuality();
    return;
  }
  const items = Array.isArray(feedback) ? feedback : [];
  const total = items.length;

  if (total === 0) {
    renderOverviewQualityState(loadSavedGoldenResults(), items);
    refreshRecommendedActionFromQuality();
    return;
  }

  renderOverviewQualityState(loadSavedGoldenResults(), items);
  refreshRecommendedActionFromQuality();
}
// Admin dashboard quality signals end

// Admin cycles visibility start
const ADMIN_CYCLE_SNAPSHOT_KEY = "aion_admin_cycle_snapshots_v2";
const ADMIN_LEGACY_CYCLE_SNAPSHOT_KEY = "aion_admin_cycle_snapshot_v1";
const ADMIN_DASHBOARD_REFRESH_KEY = "aion_admin_dashboard_refresh_v1";
const ADMIN_DASHBOARD_REVIEW_EVIDENCE_KEY = "aion_admin_dashboard_review_evidence_v1";
const ADMIN_CYCLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ADMIN_CYCLE_LABELS = {
  frontend: "Frontend",
  backend: "Backend",
  wallet: "Wallet",
};
const ADMIN_FRONTEND_DEPLOY_RESERVE = 100_000_000_000;
let currentAdminRecommendedAction = {
  label: "Refresh dashboard",
  className: "pending",
  command: "refresh",
};

function recordAdminDashboardActivity(_label, _detail = "") {}

function loadAdminReviewEvidence() {
  try {
    const raw = localStorage.getItem(ADMIN_DASHBOARD_REVIEW_EVIDENCE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Could not load review evidence:", err);
    return null;
  }
}

function persistAdminReviewEvidence(evidence) {
  try {
    if (!evidence) {
      localStorage.removeItem(ADMIN_DASHBOARD_REVIEW_EVIDENCE_KEY);
      return;
    }
    localStorage.setItem(ADMIN_DASHBOARD_REVIEW_EVIDENCE_KEY, JSON.stringify(evidence));
  } catch (err) {
    console.warn("Could not save review evidence:", err);
  }
}

function parseAdminReviewEvidence(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw new Error("Paste review command output before saving evidence.");
  }
  return {
    raw: text,
    savedAt: new Date().toISOString(),
    diffCheck: /git diff --check/i.test(text) && !/(whitespace errors|conflict marker|<<<<<<<|>>>>>>>)/i.test(text),
    assetsPrepared: /Preparing frontend assets/i.test(text),
    jsChecked: /node --check\s+src\/teves_consulting_frontend\/admin\.js/i.test(text) && !/(SyntaxError|ReferenceError|TypeError)/i.test(text),
    scriptsCompiled: /py_compile/i.test(text) && !/(Traceback|SyntaxError|IndentationError)/i.test(text),
    bundleIdempotent: /html_idempotent=0/i.test(text) && /js_idempotent=0/i.test(text),
    testsPassed: /Tests passed/i.test(text) && /passed\s+\d+\s+files/i.test(text),
  };
}

function reviewEvidenceCheckKeys() {
  return ["diffCheck", "assetsPrepared", "jsChecked", "scriptsCompiled", "bundleIdempotent", "testsPassed"];
}

function reviewEvidenceCheckLabels() {
  return {
    diffCheck: "Diff check",
    assetsPrepared: "Assets prepared",
    jsChecked: "JavaScript checked",
    scriptsCompiled: "Scripts compiled",
    bundleIdempotent: "Bundle repeatable",
    testsPassed: "Tests passed",
  };
}

function reviewEvidenceAgeHours(evidence) {
  if (!evidence || !evidence.savedAt) return null;
  const savedTime = new Date(evidence.savedAt).getTime();
  if (!Number.isFinite(savedTime)) return null;
  const hours = (Date.now() - savedTime) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function reviewEvidenceStatus(evidence = loadAdminReviewEvidence()) {
  const total = reviewEvidenceCheckKeys().length;
  if (!evidence) return { label: "Not saved", className: "pending", checks: 0, total };
  const checks = reviewEvidenceCheckKeys().filter((key) => evidence[key]).length;
  const hours = reviewEvidenceAgeHours(evidence);
  if (!Number.isFinite(hours)) return { label: `${checks}/${total} checks saved`, className: "watch", checks, total };
  if (hours > 168) return { label: "Evidence stale", className: "stale", checks, total };
  if (hours > 24) return { label: "Evidence aging", className: "watch", checks, total };
  return { label: `${checks}/${total} checks fresh`, className: checks >= total - 1 ? "healthy" : "watch", checks, total };
}

function renderAdminReviewEvidence(evidence = loadAdminReviewEvidence()) {
  const input = document.getElementById("adminDashboardReviewEvidenceInput");
  const status = document.getElementById("adminDashboardReviewEvidenceStatus");
  const checksList = document.getElementById("adminDashboardReviewEvidenceChecks");
  const evidenceStatus = reviewEvidenceStatus(evidence);
  if (input && !input.value.trim() && evidence && evidence.raw) {
    input.value = evidence.raw;
  }
  if (checksList) {
    const labels = reviewEvidenceCheckLabels();
    checksList.innerHTML = reviewEvidenceCheckKeys()
      .map((key) => {
        const detected = Boolean(evidence && evidence[key]);
        return `<li class="${detected ? "is-detected" : ""}">${escapeHtml(labels[key] || key)}: ${detected ? "Detected" : "Pending"}</li>`;
      })
      .join("");
  }
  if (status) {
    status.textContent = evidence
      ? `Saved locally · ${evidenceStatus.label} · ${new Date(evidence.savedAt).toLocaleString()}`
      : "Not saved";
  }
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
}

window.saveAdminReviewEvidence = function saveAdminReviewEvidence() {
  const input = document.getElementById("adminDashboardReviewEvidenceInput");
  const status = document.getElementById("adminDashboardReviewEvidenceStatus");
  try {
    const evidence = parseAdminReviewEvidence(input ? input.value : "");
    persistAdminReviewEvidence(evidence);
    renderAdminReviewEvidence(evidence);
    updateAdminDashboardChecklist({ evidence: reviewEvidenceStatus(evidence).checks >= reviewEvidenceStatus(evidence).total - 1 });
    recordAdminDashboardActivity("Review evidence saved", reviewEvidenceStatus(evidence).label);
  } catch (err) {
    if (status) {
      status.textContent = err.message || "Could not save review evidence.";
    }
  }
};

window.pasteAdminReviewEvidenceFromClipboard = async function pasteAdminReviewEvidenceFromClipboard() {
  const input = document.getElementById("adminDashboardReviewEvidenceInput");
  const status = document.getElementById("adminDashboardReviewEvidenceStatus");
  try {
    const text = await readTextFromClipboardOrPrompt("Paste review command output.");
    if (!text.trim()) return;
    if (input) {
      input.value = text;
    }
    window.saveAdminReviewEvidence();
  } catch (err) {
    if (status) {
      status.textContent = err.message || "Could not read review evidence.";
    }
  }
};

window.clearAdminReviewEvidence = function clearAdminReviewEvidence() {
  const input = document.getElementById("adminDashboardReviewEvidenceInput");
  if (input) input.value = "";
  persistAdminReviewEvidence(null);
  renderAdminReviewEvidence(null);
  recordAdminDashboardActivity("Review evidence cleared");
};

function updateAdminDashboardChecklist(_updates = {}, _options = {}) {
  return {};
}

async function readTextFromClipboardOrPrompt(message) {
  if (navigator.clipboard && window.isSecureContext && navigator.clipboard.readText) {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  }
  return window.prompt(message) || "";
}

function parseCycleNumber(value) {
  if (!value) return null;
  const normalized = String(value).replaceAll("_", "").replaceAll(",", "").trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([tkmb])?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const suffix = match[2];
  const multiplier = suffix === "t"
    ? 1_000_000_000_000
    : suffix === "b"
      ? 1_000_000_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "k"
          ? 1_000
          : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : null;
}

function parseCycleStatusSnapshot(raw, canister = "frontend") {
  const text = String(raw || "");
  const cyclesMatch = text.match(/\bCycles:\s*([0-9_,.]+\s*[tkmb]?)/i);
  const burnMatch = text.match(/Idle cycles burned per day:\s*([0-9_,.]+\s*[tkmb]?)/i);
  const reservedMatch = text.match(/Reserved cycles limit:\s*([0-9_,.]+\s*[tkmb]?)/i);
  const memoryMatch = text.match(/Memory size:\s*([0-9_,.]+\s*[tkmb]?)/i);
  const statusMatch = text.match(/Status:\s*([^\n]+)/i);
  const nameMatch = text.match(/Canister Name:\s*([^\n]+)/i);
  const idMatch = text.match(/Canister Id:\s*([^\n]+)/i);
  const cycles = parseCycleNumber(cyclesMatch && cyclesMatch[1]);
  const burnPerDay = parseCycleNumber(burnMatch && burnMatch[1]);
  const reservedLimit = parseCycleNumber(reservedMatch && reservedMatch[1]);
  const memorySize = parseCycleNumber(memoryMatch && memoryMatch[1]);

  if (!cycles) {
    throw new Error("Could not find a Cycles line in the pasted status output.");
  }

  return {
    canister,
    canisterName: nameMatch ? nameMatch[1].trim() : canister,
    canisterId: idMatch ? idMatch[1].trim() : "",
    cycles,
    burnPerDay,
    reservedLimit,
    memorySize,
    status: statusMatch ? statusMatch[1].trim() : "",
    capturedAt: new Date().toISOString(),
  };
}

function parseCycleWalletSnapshot(raw) {
  const text = String(raw || "");
  const balanceMatch = text.match(/\bBalance:\s*([0-9_,.]+\s*[tkmb]?)\s*cycles/i);
  const cycles = parseCycleNumber(balanceMatch && balanceMatch[1]);
  if (!cycles) {
    throw new Error("Could not find a Balance line in the pasted cycles wallet output.");
  }
  return {
    canister: "wallet",
    canisterName: "Cycles wallet",
    cycles,
    capturedAt: new Date().toISOString(),
  };
}

function parseCombinedCycleSnapshots(raw) {
  const text = String(raw || "");
  const snapshots = {};

  try {
    snapshots.wallet = parseCycleWalletSnapshot(text);
  } catch (_err) {
    // Combined paste may omit the wallet balance; keep any existing wallet snapshot.
  }

  const sections = text
    .split(/(?=Canister Id:\s*[^\n]+\nCanister Name:)/i)
    .map((section) => section.trim())
    .filter((section) => /\bCycles:\s*[0-9_,.]+/i.test(section));
  const unnamedSections = [];

  sections.forEach((section) => {
    const nameMatch = section.match(/Canister Name:\s*([^\n]+)/i);
    const name = nameMatch ? nameMatch[1].trim().toLowerCase() : "";
    if (name.includes("frontend")) {
      snapshots.frontend = parseCycleStatusSnapshot(section, "frontend");
      return;
    }
    if (name.includes("backend")) {
      snapshots.backend = parseCycleStatusSnapshot(section, "backend");
      return;
    }
    unnamedSections.push(section);
  });

  if (!snapshots.frontend && unnamedSections[0]) {
    snapshots.frontend = parseCycleStatusSnapshot(unnamedSections[0], "frontend");
  }
  if (!snapshots.backend && unnamedSections[1]) {
    snapshots.backend = parseCycleStatusSnapshot(unnamedSections[1], "backend");
  }

  if (!snapshots.wallet && !snapshots.frontend && !snapshots.backend) {
    throw new Error("Could not find wallet, frontend, or backend cycle data in the combined paste.");
  }

  return snapshots;
}

function formatCycles(value) {
  if (!Number.isFinite(value)) return "Pending";
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}

function formatTopUpAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const billions = Math.floor(amount / 1_000_000_000);
  if (billions >= 1) return `${billions}b`;
  const millions = Math.floor(amount / 1_000_000);
  if (millions >= 1) return `${millions}m`;
  return String(Math.floor(amount));
}

function recommendedFrontendTopUpAmount(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  const wallet = snapshots.wallet || null;
  if (!wallet || !Number.isFinite(wallet.cycles)) return null;

  const walletBuffer = 25_000_000_000;
  const available = wallet.cycles - walletBuffer;
  if (available < 1_000_000_000) return null;

  const frontendTarget = frontend && Number.isFinite(frontend.reservedLimit)
    ? frontend.reservedLimit
    : 5_000_000_000_000;
  const frontendCycles = frontend && Number.isFinite(frontend.cycles) ? frontend.cycles : 0;
  const needed = Math.max(0, frontendTarget - frontendCycles);
  const rawAmount = needed > 0 ? Math.min(available, needed) : available;
  const rounded = Math.floor(rawAmount / 1_000_000_000) * 1_000_000_000;
  return rounded >= 1_000_000_000 ? rounded : null;
}

function canisterStateStatus(snapshots = loadCycleSnapshot()) {
  const items = ["frontend", "backend"].map((key) => snapshots[key]).filter(Boolean);
  if (!items.length) {
    return { label: "Add snapshots", className: "pending" };
  }

  const stopped = items.filter((snapshot) => /^stopped$/i.test(snapshot.status || ""));
  const nonRunning = items.filter((snapshot) => snapshot.status && !/^running$/i.test(snapshot.status));
  const unknown = items.filter((snapshot) => !snapshot.status);
  if (stopped.length) {
    return { label: `${stopped.length} stopped`, className: "top-up" };
  }
  if (nonRunning.length) {
    return { label: `${nonRunning.length} not running`, className: "watch" };
  }
  if (unknown.length) {
    return { label: "Status unknown", className: "aging" };
  }
  if (items.length < 2) {
    return { label: "One canister running", className: "watch" };
  }
  return { label: "Frontend and backend running", className: "healthy" };
}

function formatCycleRunway(snapshot) {
  if (!snapshot || !snapshot.burnPerDay) return "Burn unknown";
  const days = snapshot.cycles / snapshot.burnPerDay;
  if (!Number.isFinite(days)) return "Pending";
  if (days >= 365) return `${(days / 365).toFixed(1)} years`;
  return `${Math.floor(days)} days`;
}

function cyclePercent(snapshot) {
  if (!snapshot || !snapshot.reservedLimit) return null;
  return (snapshot.cycles / snapshot.reservedLimit) * 100;
}

function cycleRunwayStatus(days, snapshot = null, key = "") {
  if (!Number.isFinite(days)) return { label: "Pending", className: "pending" };
  const percent = cyclePercent(snapshot);
  const frontend = key === "frontend" || snapshot?.canister === "frontend" || /frontend/i.test(snapshot?.canisterName || "");
  if (frontend && Number.isFinite(percent) && percent <= 10) return { label: "Top up before deploy", className: "top-up" };
  if (frontend && Number.isFinite(percent) && percent <= 20) return { label: "Deploy watch", className: "watch" };
  if (days < 30) return { label: "Top up soon", className: "top-up" };
  if (days < 90) return { label: "Watch", className: "watch" };
  return { label: "Idle healthy", className: "healthy" };
}

function cycleSnapshotAgeHours(snapshot) {
  if (!snapshot || !snapshot.capturedAt) return null;
  const capturedTime = new Date(snapshot.capturedAt).getTime();
  if (!Number.isFinite(capturedTime)) return null;
  const hours = (Date.now() - capturedTime) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function cycleFreshnessStatus(hours) {
  if (!Number.isFinite(hours)) return { label: "Pending", className: "pending" };
  if (hours <= 24) return { label: "Fresh", className: "fresh" };
  if (hours <= 168) return { label: "Aging", className: "aging" };
  return { label: "Stale", className: "stale" };
}

function formatSnapshotAge(snapshot) {
  const hours = cycleSnapshotAgeHours(snapshot);
  if (!Number.isFinite(hours)) return "Pending";
  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${Math.floor(hours)} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

function getAdminCookieValue(key) {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${key}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(key.length + 1));
}

function getCycleSnapshotCookie() {
  return getAdminCookieValue(ADMIN_CYCLE_SNAPSHOT_KEY);
}

function persistCycleSnapshots(snapshots) {
  const serialized = JSON.stringify(snapshots || {});
  try {
    localStorage.setItem(ADMIN_CYCLE_SNAPSHOT_KEY, serialized);
  } catch (err) {
    console.warn("Could not save cycle snapshots to local storage:", err);
  }
  try {
    document.cookie = `${ADMIN_CYCLE_SNAPSHOT_KEY}=${encodeURIComponent(serialized)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save cycle snapshots to cookie:", err);
  }
}

function persistDashboardRefresh(refresh) {
  const serialized = JSON.stringify(refresh || {});
  try {
    localStorage.setItem(ADMIN_DASHBOARD_REFRESH_KEY, serialized);
  } catch (err) {
    console.warn("Could not save dashboard refresh to local storage:", err);
  }
  try {
    document.cookie = `${ADMIN_DASHBOARD_REFRESH_KEY}=${encodeURIComponent(serialized)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save dashboard refresh to cookie:", err);
  }
}

function loadDashboardRefresh() {
  try {
    const raw = localStorage.getItem(ADMIN_DASHBOARD_REFRESH_KEY);
    if (raw) {
      const refresh = JSON.parse(raw);
      if (refresh && refresh.refreshedAt) {
        persistDashboardRefresh(refresh);
        return refresh;
      }
    }
  } catch (err) {
    console.warn("Could not load dashboard refresh from local storage:", err);
  }

  try {
    const cookieRaw = getAdminCookieValue(ADMIN_DASHBOARD_REFRESH_KEY);
    if (cookieRaw) {
      const refresh = JSON.parse(cookieRaw);
      if (refresh && refresh.refreshedAt) {
        persistDashboardRefresh(refresh);
        return refresh;
      }
    }
  } catch (err) {
    console.warn("Could not load dashboard refresh from cookie:", err);
  }

  return null;
}

function dashboardRefreshAgeHours(refresh) {
  if (!refresh || !refresh.refreshedAt) return null;
  const refreshedTime = new Date(refresh.refreshedAt).getTime();
  if (!Number.isFinite(refreshedTime)) return null;
  const hours = (Date.now() - refreshedTime) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function dashboardRefreshStatus(refresh) {
  const hours = dashboardRefreshAgeHours(refresh);
  if (!Number.isFinite(hours)) return { label: "Refresh needed", className: "pending" };
  if (hours <= 1) return { label: "Current", className: "fresh" };
  if (hours <= 24) return { label: "Aging", className: "aging" };
  return { label: "Stale", className: "stale" };
}

function formatDashboardRefreshAge(refresh) {
  const hours = dashboardRefreshAgeHours(refresh);
  if (!Number.isFinite(hours)) return "Not refreshed";
  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${Math.floor(hours)} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

function renderDashboardRefresh(refresh = loadDashboardRefresh()) {
  const refreshElement = document.getElementById("healthDataRefresh");
  const refreshStatus = dashboardRefreshStatus(refresh);
  const dataStatus = dashboardLiveDataStatus();
  const effectiveStatus = dataStatus.className === "stale"
    ? { label: "Partial", className: "stale" }
    : refreshStatus;
  const ageLabel = formatDashboardRefreshAge(refresh);
  if (refreshElement) {
    refreshElement.innerHTML = `${escapeHtml(ageLabel)}<span class="admin-cycle-freshness-label ${effectiveStatus.className}">${escapeHtml(effectiveStatus.label)}</span>`;
  }
  setAdminMetricProvenance(
    "healthDataRefresh",
    "SNAPSHOT",
    refresh ? `${formatProvenanceAge(refresh.refreshedAt) || "browser timestamp"} · memory/tests/feedback only` : "memory/tests/feedback only",
    { stale: effectiveStatus.className === "stale", unavailable: dataStatus.className === "stale" }
  );
}

function dashboardFreshnessStatus(snapshots = loadCycleSnapshot()) {
  const refreshStatus = dashboardRefreshStatus(loadDashboardRefresh());
  const liveDataStatus = dashboardLiveDataStatus();
  const checks = [
    { label: "Refresh", className: refreshStatus.className },
    { label: "Live data", className: liveDataStatus.className === "healthy" ? "fresh" : liveDataStatus.className },
  ];
  const priority = { stale: 4, "top-up": 4, aging: 3, watch: 3, pending: 2, fresh: 0, healthy: 0 };
  const worst = checks
    .slice()
    .sort((a, b) => (priority[b.className] || 1) - (priority[a.className] || 1))[0];
  const current = checks.filter((check) => check.className === "fresh" || check.className === "healthy").length;
  const missing = checks.filter((check) => check.className !== "fresh" && check.className !== "healthy").map((check) => check.label);
  if (!worst || current === checks.length) {
    return { label: "Current", className: "fresh", current, total: checks.length, missing: [] };
  }
  const className = worst.className === "watch" ? "aging" : worst.className;
  const label = className === "stale"
    ? "Stale"
    : className === "aging"
      ? "Aging"
      : className === "pending"
        ? "Needs data"
        : worst.label;
  return { label: `${label} · ${current}/${checks.length} current`, className, current, total: checks.length, missing };
}

function loadCycleSnapshot() {
  try {
    const raw = localStorage.getItem(ADMIN_CYCLE_SNAPSHOT_KEY);
    if (raw) {
      const snapshots = JSON.parse(raw);
      persistCycleSnapshots(snapshots);
      return snapshots;
    }
  } catch (err) {
    console.warn("Could not load cycle snapshots from local storage:", err);
  }

  try {
    const cookieRaw = getCycleSnapshotCookie();
    if (cookieRaw) {
      const snapshots = JSON.parse(cookieRaw);
      persistCycleSnapshots(snapshots);
      return snapshots;
    }
  } catch (err) {
    console.warn("Could not load cycle snapshots from cookie:", err);
  }

  try {
    const legacyRaw = localStorage.getItem(ADMIN_LEGACY_CYCLE_SNAPSHOT_KEY);
    if (!legacyRaw) return {};

    const legacy = JSON.parse(legacyRaw);
    const snapshots = legacy ? { frontend: legacy } : {};
    persistCycleSnapshots(snapshots);
    return snapshots;
  } catch (err) {
    console.error("Could not load cycle snapshots:", err);
    return {};
  }
}

function cycleSnapshotSummaryHtml(snapshot, label) {
  if (!snapshot) {
    return `
      <span><strong>${escapeHtml(label)}:</strong> Add a snapshot</span>
      <span><strong>Idle runway:</strong> Pending <span class="admin-cycle-runway-label pending">Pending</span></span>
      <span><strong>Snapshot:</strong> Pending <span class="admin-cycle-freshness-label pending">Pending</span></span>
    `;
  }

  const percent = cyclePercent(snapshot);
  const percentLabel = percent === null ? "" : ` · ${percent.toFixed(1)}%`;
  const runwayDays = cycleRunwayDays(snapshot);
  const runwayStatus = cycleRunwayStatus(runwayDays, snapshot, snapshot.canister);
  const snapshotAge = cycleSnapshotAgeHours(snapshot);
  const freshnessStatus = cycleFreshnessStatus(snapshotAge);
  const frontend = snapshot.canister === "frontend" || /frontend/i.test(snapshot.canisterName || "");
  const deploymentNote = frontend && percent !== null && percent <= 20
    ? `<span><strong>Deployment:</strong> Top up before frontend upgrades.</span>`
    : "";
  return `
    <span><strong>${escapeHtml(label)}:</strong> ${formatCycles(snapshot.cycles)}${percentLabel}</span>
    <span><strong>State:</strong> ${escapeHtml(snapshot.status || "Unknown")}</span>
    <span><strong>Idle runway:</strong> ${formatCycleRunway(snapshot)} <span class="admin-cycle-runway-label ${runwayStatus.className}">${runwayStatus.label}</span></span>
    ${deploymentNote}
    <span><strong>Snapshot:</strong> ${formatSnapshotAge(snapshot)} <span class="admin-cycle-freshness-label ${freshnessStatus.className}">${freshnessStatus.label}</span></span>
  `;
}

function walletCycleSnapshotSummaryHtml(snapshot) {
  if (!snapshot) {
    return `
      <span><strong>Wallet:</strong> Add a balance</span>
      <span><strong>Available:</strong> Pending</span>
      <span><strong>Snapshot:</strong> Pending <span class="admin-cycle-freshness-label pending">Pending</span></span>
    `;
  }

  const snapshotAge = cycleSnapshotAgeHours(snapshot);
  const freshnessStatus = cycleFreshnessStatus(snapshotAge);
  const capturedLabel = snapshot.capturedAt
    ? new Date(snapshot.capturedAt).toLocaleString()
    : "Unknown";
  return `
    <span><strong>Wallet:</strong> ${formatCycles(snapshot.cycles)}</span>
    <span><strong>Snapshot:</strong> ${formatSnapshotAge(snapshot)} <span class="admin-cycle-freshness-label ${freshnessStatus.className}">${freshnessStatus.label}</span></span>
    <span><strong>Updated:</strong> ${escapeHtml(capturedLabel)}</span>
  `;
}

function frontendTopUpSummaryHtml(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  const wallet = snapshots.wallet || null;
  if (!frontend || !wallet) {
    return `
      <span><strong>Top-up plan:</strong> Add wallet and frontend snapshots</span>
      <span><strong>Recommended:</strong> Pending</span>
      <span><strong>Wallet after:</strong> Pending</span>
    `;
  }

  const amount = recommendedFrontendTopUpAmount(snapshots);
  if (!amount) {
    return `
      <span><strong>Top-up plan:</strong> No top-up needed now</span>
      <span><strong>Recommended:</strong> None</span>
      <span><strong>Wallet after:</strong> ${formatCycles(wallet.cycles)}</span>
    `;
  }

  const walletAfter = Math.max(0, wallet.cycles - amount);
  const target = Number.isFinite(frontend.reservedLimit) ? formatCycles(frontend.reservedLimit) : "5.00T";
  return `
    <span><strong>Top-up plan:</strong> Frontend toward ${escapeHtml(target)}</span>
    <span><strong>Recommended:</strong> ${formatCycles(amount)} (${escapeHtml(formatTopUpAmount(amount))})</span>
    <span><strong>Wallet after:</strong> ${formatCycles(walletAfter)}</span>
  `;
}

function operationsReadinessSummaryHtml(snapshots = loadCycleSnapshot()) {
  const canister = canisterStateStatus(snapshots);
  const deploy = deployReadinessStatus(snapshots);
  const buffer = frontendDeployBufferStatus(snapshots);
  const oldest = oldestCycleSnapshot(snapshots);
  const oldestSnapshot = oldest ? snapshots[oldest.key] : null;
  const freshness = oldest
    ? cycleFreshnessStatus(oldest.hours)
    : { label: "Update before deploy", className: "pending" };
  const deployLabel = deploy.className === "pending"
    ? "Update before deploy"
    : deploy.label;
  return `
    <span><strong>Operational readiness:</strong> <span class="admin-cycle-runway-label ${deploy.className}">${escapeHtml(deployLabel)}</span></span>
    <span><strong>Canisters:</strong> <span class="admin-cycle-runway-label ${canister.className}">${escapeHtml(canister.label)}</span></span>
    <span><strong>Freshness:</strong> ${oldestSnapshot ? escapeHtml(formatSnapshotAge(oldestSnapshot)) : "No snapshot"} <span class="admin-cycle-freshness-label ${freshness.className}">${escapeHtml(freshness.label)}</span></span>
    <span><strong>Deploy buffer:</strong> <span class="admin-cycle-runway-label ${buffer.className}">${escapeHtml(buffer.label)}</span></span>
  `;
}

function cycleRunwayDays(snapshot) {
  if (!snapshot || !snapshot.burnPerDay) return null;
  const days = snapshot.cycles / snapshot.burnPerDay;
  return Number.isFinite(days) ? days : null;
}

function shortestCycleRunway(snapshots) {
  return ["frontend", "backend"]
    .map((key) => {
      const days = cycleRunwayDays(snapshots[key]);
      return days === null ? null : { key, days, snapshot: snapshots[key] };
    })
    .filter(Boolean)
    .sort((a, b) => a.days - b.days)[0] || null;
}

function oldestCycleSnapshot(snapshots) {
  return ["frontend", "backend", "wallet"]
    .map((key) => {
      const hours = cycleSnapshotAgeHours(snapshots[key]);
      return hours === null ? null : { key, hours };
    })
    .filter(Boolean)
    .sort((a, b) => b.hours - a.hours)[0] || null;
}

function cycleRecommendedAction(snapshots) {
  const frontend = snapshots.frontend || null;
  const backend = snapshots.backend || null;
  const wallet = snapshots.wallet || null;

  const liveData = dashboardLiveDataStatus();
  if (liveData.className === "stale") {
    return { label: "Review data refresh", className: "stale", command: "refresh" };
  }

  const canisterState = canisterStateStatus(snapshots);
  if (canisterState.className === "top-up") {
    return { label: "Review canisters", className: "top-up", detailId: "cycleRunwayPanel" };
  }
  if (canisterState.className === "watch") {
    return { label: "Check canisters", className: "watch", detailId: "cycleRunwayPanel" };
  }

  const frontendPercent = cyclePercent(frontend);
  if (Number.isFinite(frontendPercent) && frontendPercent <= 10) {
    if (!wallet) {
      return { label: "Check wallet", className: "pending", detailId: "cycleRunwayPanel" };
    }
    if (wallet.cycles < 25_000_000_000) {
      return { label: "Buy cycles", className: "top-up", detailId: "cycleRunwayPanel" };
    }
    return { label: "Top up frontend", className: "top-up", detailId: "cycleRunwayPanel" };
  }
  if (Number.isFinite(frontendPercent) && frontendPercent <= 20) {
    if (!wallet) {
      return { label: "Check wallet", className: "pending", detailId: "cycleRunwayPanel" };
    }
    if (wallet.cycles < 25_000_000_000) {
      return { label: "Buy cycles", className: "top-up", detailId: "cycleRunwayPanel" };
    }
    return { label: "Watch deploys", className: "watch", detailId: "cycleRunwayPanel" };
  }

  const shortest = shortestCycleRunway(snapshots);
  if (shortest && shortest.days < 30) {
    return { label: "Top up soon", className: "top-up", detailId: "cycleRunwayPanel" };
  }
  if (shortest && shortest.days < 90) {
    return { label: "Review runway", className: "watch", detailId: "cycleRunwayPanel" };
  }

  if (wallet && wallet.cycles < 25_000_000_000) {
    return { label: "Buy cycles", className: "top-up", detailId: "cycleRunwayPanel" };
  }

  const dashboardRefresh = loadDashboardRefresh();
  const dashboardRefreshAge = dashboardRefreshAgeHours(dashboardRefresh);
  if (!Number.isFinite(dashboardRefreshAge)) {
    return { label: "Refresh dashboard", className: "pending", command: "refresh" };
  }
  if (dashboardRefreshAge > 24) {
    return { label: "Refresh dashboard", className: "stale", command: "refresh" };
  }

  if (typeof combinedQualityAttentionStatus === "function") {
    const quality = combinedQualityAttentionStatus();
    if (quality && quality.className !== "healthy") {
      return {
        label: quality.label,
        className: quality.className,
        source: "quality",
        detailId: quality.detailId,
      };
    }
  }

  const evidenceStatus = reviewEvidenceStatus();
  if (evidenceStatus.className !== "healthy") {
    return {
      label: evidenceStatus.className === "pending"
        ? "Save evidence"
        : evidenceStatus.className === "watch"
          ? "Review evidence"
          : evidenceStatus.label,
      className: evidenceStatus.className,
      source: "evidence",
      detailId: "localValidationSnapshotPanel",
    };
  }

  return { label: "No action needed", className: "healthy" };
}

function deployReadinessStatus(snapshots) {
  const frontend = snapshots.frontend || null;
  const wallet = snapshots.wallet || null;
  if (!frontend) return { label: "Add frontend snapshot", className: "pending" };

  const snapshotAge = cycleSnapshotAgeHours(frontend);
  if (Number.isFinite(snapshotAge) && snapshotAge > 24) {
    return { label: "Refresh first", className: snapshotAge > 168 ? "stale" : "aging" };
  }

  const percent = cyclePercent(frontend);
  if (Number.isFinite(percent) && percent <= 10) {
    if (!wallet) return { label: "Check wallet", className: "pending" };
    if (wallet.cycles < 25_000_000_000) return { label: "Buy cycles", className: "top-up" };
    return { label: "Top up first", className: "top-up" };
  }
  if (Number.isFinite(percent) && percent <= 20) {
    if (!wallet) return { label: "Check wallet", className: "pending" };
    if (wallet.cycles < 25_000_000_000) return { label: "Buy cycles", className: "top-up" };
    return { label: "Top up advised", className: "watch" };
  }

  if (!Number.isFinite(percent)) {
    return { label: "Limit unknown", className: "watch" };
  }

  return { label: "Ready", className: "healthy" };
}

function frontendDeployBufferStatus(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  if (!frontend || !Number.isFinite(frontend.cycles)) {
    return {
      label: "Add snapshot",
      className: "pending",
      buffer: null,
      reserve: ADMIN_FRONTEND_DEPLOY_RESERVE,
    };
  }

  const buffer = frontend.cycles - ADMIN_FRONTEND_DEPLOY_RESERVE;
  if (buffer < 0) {
    return {
      label: `${formatCycles(Math.abs(buffer))} short`,
      className: "top-up",
      buffer,
      reserve: ADMIN_FRONTEND_DEPLOY_RESERVE,
    };
  }
  if (buffer < ADMIN_FRONTEND_DEPLOY_RESERVE) {
    return {
      label: `${formatCycles(buffer)} buffer`,
      className: "watch",
      buffer,
      reserve: ADMIN_FRONTEND_DEPLOY_RESERVE,
    };
  }
  return {
    label: `${formatCycles(buffer)} buffer`,
    className: "healthy",
    buffer,
    reserve: ADMIN_FRONTEND_DEPLOY_RESERVE,
  };
}

function dashboardAttentionClass(className) {
  if (className === "healthy" || className === "fresh") return "is-clear";
  if (className === "watch" || className === "aging") return "is-watch";
  if (className === "top-up" || className === "stale") return "is-action";
  return "is-pending";
}

function setDashboardAttentionItem(id, className, text) {
  const element = document.getElementById(id);
  if (!element) return;
  const valueElement = element.querySelector("span");
  element.className = `admin-dashboard-attention-item ${dashboardAttentionClass(className)}`;
  if (valueElement) {
    valueElement.textContent = text;
  }
}

function operationsAttentionStatus(snapshots = loadCycleSnapshot()) {
  const canister = canisterStateStatus(snapshots);
  if (canister.className === "top-up" || canister.className === "watch") {
    return canister;
  }

  const deploy = deployReadinessStatus(snapshots);
  if (deploy.className === "top-up" || deploy.className === "watch") {
    return deploy;
  }

  const shortest = shortestCycleRunway(snapshots);
  if (shortest) {
    return cycleRunwayStatus(shortest.days, shortest.snapshot, shortest.key);
  }

  return { label: "Update before deploy", className: "pending" };
}

function renderDashboardAttention(snapshots) {
  const dataStatus = dashboardFreshnessStatus(snapshots);
  const operationsStatus = operationsAttentionStatus(snapshots);

  setDashboardAttentionItem("adminAttentionData", dataStatus.className, dataStatus.label);
  setDashboardAttentionItem("adminAttentionOperations", operationsStatus.className, operationsStatus.label);
}

function updateDashboardCycleSummary(action) {
  const headline = document.getElementById("adminDashboardHeadline");
  const pill = document.getElementById("adminDashboardPill");
  if (!headline || !pill || !action) return;

  const qualityCopy = {
    "Run golden tests": {
      text: "Run golden tests before relying on the dashboard quality state.",
      className: "is-pending",
    },
    "Tests aging": {
      text: "Golden tests are aging; run them again before the next quality-sensitive decision.",
      className: "is-watch",
    },
    "Review tests": {
      text: "Golden tests need review before treating the current answer path as clear.",
      className: "is-watch",
    },
    "Tests failing": {
      text: "Golden tests are failing; review answer quality before the next operator decision.",
      className: "is-action",
    },
    "No feedback": {
      text: "No feedback has been loaded yet; refresh dashboard data before judging quality.",
      className: "is-pending",
    },
    "Review feedback": {
      text: "Feedback needs review before treating the current user signal as clear.",
      className: "is-action",
    },
    "Feedback watch": {
      text: "Feedback has some negative signal; review it before the next quality decision.",
      className: "is-watch",
    },
  };
  const actionCopy = {
    "Check wallet": {
      text: "Paste the cycles wallet balance before deciding whether the frontend canister can be topped up.",
      className: "is-pending",
    },
    "Buy cycles": {
      text: "Cycles wallet balance is low; buy or transfer cycles before the next frontend top-up.",
      className: "is-action",
    },
    "Save evidence": {
      text: "Save local review evidence before marking this operator handoff ready.",
      className: "is-pending",
    },
    "Review evidence": {
      text: "Review evidence is incomplete or aging; rerun checks or save a stronger evidence packet.",
      className: "is-watch",
    },
    "Evidence aging": {
      text: "Review evidence is aging; refresh it before the next operator decision.",
      className: "is-watch",
    },
    "Evidence stale": {
      text: "Review evidence is stale; rerun checks and save fresh evidence.",
      className: "is-action",
    },
  };

  const states = {
    pending: {
      text: "Refresh live dashboard data; operational snapshots can be updated before deploy.",
      pill: action.label,
      className: "is-pending",
    },
    "top-up": {
      text: "Review frontend cycles before the next production deployment.",
      pill: action.label,
      className: "is-action",
    },
    watch: {
      text: "Cycle runway is usable, but deployment timing should be reviewed.",
      pill: action.label,
      className: "is-watch",
    },
    stale: {
      text: "Refresh cycle snapshots before relying on the dashboard status.",
      pill: action.label,
      className: "is-action",
    },
    aging: {
      text: "Cycle snapshots are aging; refresh them before the next deployment.",
      pill: action.label,
      className: "is-watch",
    },
    healthy: {
      text: "Aion is operating on the approved continuity and provider path.",
      pill: "Clear",
      className: "is-clear",
    },
  };
  const state = action.source === "quality" && qualityCopy[action.label]
    ? {
      text: action.label === "Run golden tests" && action.className === "stale"
        ? "Golden-test evidence is stale; run tests again before relying on the current quality state."
        : qualityCopy[action.label].text,
      pill: action.label,
      className: action.label === "Run golden tests" && action.className === "stale"
        ? "is-action"
        : qualityCopy[action.label].className,
    }
    : actionCopy[action.label]
      ? {
        text: actionCopy[action.label].text,
        pill: action.label,
        className: actionCopy[action.label].className,
      }
  : action.className === "pending"
    ? {
      text: action.label === "Refresh dashboard"
        ? "Refresh dashboard data before relying on the current operator view."
        : "Open the relevant Admin section and review the bounded state.",
      pill: action.label,
      className: "is-pending",
    }
    : action.className === "stale" && action.label === "Refresh dashboard"
          ? {
            text: "Dashboard data is stale; refresh it before the next operator decision.",
            pill: action.label,
            className: "is-action",
          }
    : states[action.className] || states.pending;
  headline.textContent = state.text;
  pill.textContent = state.pill;
  pill.className = `admin-dashboard-pill ${state.className}`;
}

function updateRecommendedActionButton(action) {
  const button = document.getElementById("adminDashboardActionButton");
  if (!button || !action) return;
  const clear = action.className === "healthy";
  button.disabled = clear;
  button.textContent = clear ? "Dashboard clear" : "Open recommended action";
  button.title = clear ? "No immediate operator action is needed." : `Open recommended action: ${action.label}`;
}

function renderRecommendedActionMetric(action) {
  const actionElement = document.getElementById("healthCycleAction");
  if (actionElement) {
    actionElement.innerHTML = `<span class="admin-cycle-runway-label ${action.className}">${escapeHtml(action.label)}</span>`;
  }
  setAdminMetricProvenance("healthCycleAction", "DERIVED", "from dashboard state");
}

function refreshAdminRecommendedAction(snapshots = loadCycleSnapshot()) {
  const action = cycleRecommendedAction(snapshots);
  currentAdminRecommendedAction = action;
  updateRecommendedActionButton(action);
  renderRecommendedActionMetric(action);
  updateDashboardCycleSummary(action);
  renderDashboardAttention(snapshots);
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
  return action;
}

function openAdminDetailPanel(detailId) {
  const detail = document.getElementById(detailId);
  if (!detail) return false;
  const section = detail.closest("[data-admin-view]");
  if (section && window.setAdminWorkspaceView) {
    window.setAdminWorkspaceView(section.dataset.adminView, { skipScroll: true });
  }
  if (section) {
    section.querySelectorAll(":scope > details").forEach((panel) => {
      panel.open = panel === detail;
    });
  }
  detail.open = true;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

window.openAdminRecommendedAction = function openAdminRecommendedAction() {
  const action = currentAdminRecommendedAction || {};
  if (action.command === "refresh" && typeof refreshAdminDashboardData === "function") {
    refreshAdminDashboardData();
    return;
  }
  if (action.detailId && openAdminDetailPanel(action.detailId)) {
    return;
  }
  if (window.setAdminWorkspaceView) {
    window.setAdminWorkspaceView("overview");
  }
};

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-admin-detail-jump]");
  if (!target) return;
  const detailId = target.dataset.adminDetailJump;
  if (detailId && openAdminDetailPanel(detailId)) {
    event.preventDefault();
  }
});

function dashboardMetricText(id) {
  const element = document.getElementById(id);
  return element ? element.textContent.replace(/\s+/g, " ").trim() : "Pending";
}

function buildAdminDashboardSummaryText() {
  const topUpAmount = recommendedFrontendTopUpAmount(loadCycleSnapshot());
  const lines = [
    "Aion Admin Dashboard",
    `Current state: ${dashboardMetricText("adminDashboardHeadline")}`,
    `Recommended action: ${dashboardMetricText("healthCycleAction")}`,
    `Quality: ${dashboardMetricText("healthGoldenTests")}`,
    `Data freshness: ${dashboardMetricText("healthDataRefresh")}`,
    `Operations: ${dashboardMetricText("healthCycleRunway")}`,
    `Operations detail: ${dashboardMetricText("operationsReadinessSummary")}`,
    `Recommended top-up: ${topUpAmount ? `${formatCycles(topUpAmount)} (${formatTopUpAmount(topUpAmount)})` : "Pending"}`,
    `Copied: ${new Date().toLocaleString()}`,
  ];
  return lines.join("\n");
}

function updateAdminPanelSummaries(_snapshots = loadCycleSnapshot()) {}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

window.copyCycleStatusCommands = async function copyCycleStatusCommands() {
  const status = document.getElementById("cycleSnapshotStatus");
  const commands = [
    "icp cycles balance -n ic",
    "icp canister status teves_consulting_frontend -e ic",
    "icp canister status teves_consulting_backend -e ic",
  ].join("\n");
  try {
    await copyTextToClipboard(commands);
    recordAdminDashboardActivity("Cycle status commands copied", "Frontend and backend status");
    if (status) {
      status.textContent = "Cycle status commands copied.";
    }
  } catch (err) {
    console.error("Could not copy cycle status commands:", err);
    if (status) {
      status.textContent = "Could not copy cycle status commands. Copy the visible validation checks manually and try again.";
    }
  }
};

window.copyFrontendTopUpCommand = async function copyFrontendTopUpCommand() {
  const status = document.getElementById("cycleSnapshotStatus");
  const amount = recommendedFrontendTopUpAmount(loadCycleSnapshot());
  if (!amount) {
    if (status) {
      status.textContent = "Paste a current wallet balance before copying the recommended frontend top-up.";
    }
    return;
  }
  const amountLabel = formatTopUpAmount(amount);
  const command = [
    `icp canister top-up teves_consulting_frontend --amount ${amountLabel} -e ic`,
    "icp canister status teves_consulting_frontend -e ic",
  ].join("\n");
  try {
    await copyTextToClipboard(command);
    recordAdminDashboardActivity("Frontend top-up command copied", `${formatCycles(amount)} cycles`);
    if (status) {
      status.textContent = `Frontend top-up command copied for ${formatCycles(amount)} cycles.`;
    }
  } catch (err) {
    console.error("Could not copy frontend top-up command:", err);
    if (status) {
      status.textContent = "Could not copy frontend top-up command. Check the wallet and frontend snapshots, then try again.";
    }
  }
};

window.copyAdminDashboardSummary = async function copyAdminDashboardSummary() {
  const button = document.getElementById("adminDashboardCopyButton");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(buildAdminDashboardSummaryText());
    recordAdminDashboardActivity("Copied dashboard summary", currentAdminRecommendedAction.label || "");
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy summary";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy dashboard summary:", err);
    if (button) {
      button.textContent = "Copy failed";
      button.title = "Could not copy dashboard summary. Use the visible dashboard status or try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy summary";
        button.removeAttribute("title");
      }, 2200);
    }
  }
};

function renderCycleSnapshot(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  const backend = snapshots.backend || null;
  const wallet = snapshots.wallet || null;
  const frontendSummary = document.getElementById("frontendCycleSnapshotSummary");
  const backendSummary = document.getElementById("backendCycleSnapshotSummary");
  const walletSummary = document.getElementById("walletCycleSnapshotSummary");
  const topUpSummary = document.getElementById("frontendTopUpSummary");
  const operationsSummary = document.getElementById("operationsReadinessSummary");
  const shortest = shortestCycleRunway(snapshots);

  if (!shortest) {
    const runwayElement = document.getElementById("healthCycleRunway");
    if (runwayElement) {
      runwayElement.innerHTML = `Pending<span class="admin-cycle-runway-label pending">Pending</span>`;
    }
    setAdminMetricProvenance("healthCycleRunway", "DERIVED", "needs cycle snapshots");
  } else {
    const label = ADMIN_CYCLE_LABELS[shortest.key] || shortest.key;
    const runway = shortest.days >= 365
      ? `${(shortest.days / 365).toFixed(1)} years`
      : `${Math.floor(shortest.days)} days`;
    const runwayStatus = cycleRunwayStatus(shortest.days, shortest.snapshot, shortest.key);
    const runwayElement = document.getElementById("healthCycleRunway");
    if (runwayElement) {
      runwayElement.innerHTML = `${escapeHtml(runway)} · ${escapeHtml(label)}<span class="admin-cycle-runway-label ${runwayStatus.className}">${runwayStatus.label}</span>`;
    }
    setAdminMetricProvenance("healthCycleRunway", "DERIVED", "from cycle snapshots");
  }

  if (frontendSummary) {
    frontendSummary.innerHTML = cycleSnapshotSummaryHtml(frontend, "Frontend");
  }
  if (backendSummary) {
    backendSummary.innerHTML = cycleSnapshotSummaryHtml(backend, "Backend");
  }
  if (walletSummary) {
    walletSummary.innerHTML = walletCycleSnapshotSummaryHtml(wallet);
  }
  if (operationsSummary) {
    operationsSummary.innerHTML = operationsReadinessSummaryHtml(snapshots);
  }
  if (topUpSummary) {
    topUpSummary.innerHTML = frontendTopUpSummaryHtml(snapshots);
  }

  const topUpButton = document.getElementById("frontendTopUpButton");
  if (topUpButton) {
    const topUpAmount = recommendedFrontendTopUpAmount(snapshots);
    topUpButton.disabled = !topUpAmount;
    topUpButton.textContent = topUpAmount
      ? `Copy top-up ${formatTopUpAmount(topUpAmount)}`
      : "No top-up action";
  }

  refreshAdminRecommendedAction(snapshots);
  renderDashboardRefresh();
  renderAdminReviewEvidence();
}

window.saveCombinedCycleSnapshotsFromInput = function saveCombinedCycleSnapshotsFromInput() {
  const input = document.getElementById("combinedCycleStatusInput");
  const status = document.getElementById("cycleSnapshotStatus");

  try {
    const updates = parseCombinedCycleSnapshots(input ? input.value : "");
    const snapshots = loadCycleSnapshot();
    Object.assign(snapshots, updates);
    persistCycleSnapshots(snapshots);
    renderCycleSnapshot(snapshots);

    if (updates.frontend && updates.backend) {
      updateAdminDashboardChecklist({ snapshots: true });
    }
    if (updates.wallet) {
      updateAdminDashboardChecklist({ wallet: true });
    }

    const labels = Object.keys(updates).map((key) => ADMIN_CYCLE_LABELS[key] || key);
    recordAdminDashboardActivity("Cycle snapshots updated", labels.join(", "));
    if (status) {
      status.textContent = `Updated ${labels.join(", ")} from combined paste.`;
    }
  } catch (err) {
    if (status) {
      status.textContent = `${err.message || "Could not parse combined cycles output."} Paste the wallet, frontend, and backend outputs again, then retry.`;
    }
  }
};

window.pasteCombinedCycleSnapshotsFromClipboard = async function pasteCombinedCycleSnapshotsFromClipboard() {
  const input = document.getElementById("combinedCycleStatusInput");
  const status = document.getElementById("cycleSnapshotStatus");
  try {
    const text = await readTextFromClipboardOrPrompt("Paste combined cycles output.");
    if (!text.trim()) return;
    if (input) {
      input.value = text;
    }
    window.saveCombinedCycleSnapshotsFromInput();
  } catch (err) {
    if (status) {
      status.textContent = `${err.message || "Could not read combined cycles output."} Paste the output manually if clipboard access is blocked.`;
    }
  }
};

window.clearCombinedCycleInput = function clearCombinedCycleInput() {
  const input = document.getElementById("combinedCycleStatusInput");
  const status = document.getElementById("cycleSnapshotStatus");
  if (input) input.value = "";
  if (status) {
    status.textContent = "Combined cycles paste cleared.";
  }
};

window.refreshAdminDashboardData = async function refreshAdminDashboardData() {
  const button = document.getElementById("adminDashboardRefreshButton");
  const previousText = button ? button.textContent : "";
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Refreshing...";
    button.title = "Refreshes live memories, golden-test state, and feedback. Cycle and validation snapshots remain manual.";
  }

  try {
    await Promise.allSettled([
      loadMemories(),
      loadGoldenTests(),
      loadFeedback(),
    ]);
    const refresh = { refreshedAt: new Date().toISOString() };
    persistDashboardRefresh(refresh);
    renderDashboardRefresh(refresh);
    renderCycleSnapshot(loadCycleSnapshot());
    recordAdminDashboardActivity("Dashboard refreshed", "Memory, tests, and feedback requested");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText || "Refresh dashboard";
      button.title = "Refreshes live memories, golden-test state, and feedback. Cycle and validation snapshots remain manual.";
    }
  }
};
// Admin cycles visibility end

const savedGolden = loadSavedGoldenResults();

if (savedGolden) {
  renderGoldenTests(savedGolden, { save: false, provenance: { kind: "CACHED", detail: "browser cache" } });
}
setAdminOverviewProvenanceDefaults();
initMemoryListControls();
renderCycleSnapshot();
renderGoldenDashboardSignal(loadSavedGoldenResults());
renderFeedbackDashboardSignal(latestFeedback);
initAuth();
