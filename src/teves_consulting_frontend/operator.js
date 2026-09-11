import { Actor, HttpAgent } from "https://esm.sh/@dfinity/agent@2.1.3";
import { IDL } from "https://esm.sh/@dfinity/candid@2.1.3";
import { AuthClient } from "https://esm.sh/@dfinity/auth-client@2.1.3?deps=@dfinity/candid@2.1.3,@dfinity/agent@2.1.3";

const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const AIONIC_AGENT_API_BASE_URL = "https://aionic-agent-api.onrender.com";
const OPERATOR_SESSION_EXCHANGE_URL = `${AIONIC_AGENT_API_BASE_URL}/admin/operator-session`;
const OPERATOR_SESSION_STORAGE_KEY = "aion_operator_session_v1";
const ENGINEER_DEBUG_MODE_STORAGE_KEY = "aion_operator_engineer_debug_mode_v1";
const LOCAL_ENGINEER_LAUNCH_CHALLENGE_PATH = "/admin/local-engineer-launch-challenge";
const LOCAL_ENGINEER_DEVICES_PATH = "/admin/local-engineer/devices";
const LOCAL_ENGINEER_DISCONNECT_PATH = "/admin/local-engineer/session/disconnect";
const LOCAL_ENGINEER_CUSTOM_SCHEME = "aion-engineer";
const LOCAL_ENGINEER_INITIAL_STATUS_REFRESH_DELAY_MS = 2500;
const LOCAL_ENGINEER_READINESS_CONVERGENCE_WINDOW_MS = 15000;
const LOCAL_ENGINEER_READINESS_CONVERGENCE_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 3500];
const AION_CLIENT_REQUEST_ID_HEADER = "X-Aion-Client-Request-Id";
const AION_PROTECTED_ROLE_POST_PATHS = new Set([
  "/admin/prime-workspace-message",
  "/admin/mirror-workspace-message",
  "/admin/engineer-workspace-message",
]);
let authClient = null;
let identity = null;
let actor = null;
let isAuthenticated = false;
let isOperator = false;
let renderOperatorSessionToken = null;
let operatorSessionRevision = 0;
const pageInstanceId = createOptionalPageInstanceId();
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

function readStoredEngineerDebugMode() {
  try {
    return localStorage.getItem(ENGINEER_DEBUG_MODE_STORAGE_KEY) === "on";
  } catch (_) {
    return false;
  }
}

function writeStoredEngineerDebugMode(enabled) {
  try {
    localStorage.setItem(ENGINEER_DEBUG_MODE_STORAGE_KEY, enabled ? "on" : "off");
  } catch (_) {
    // Debug mode is a visual preference only; storage failure should not affect the run.
  }
}

const PRIME_TRIAL_CAPTURE_STORAGE_KEY = "aion_prime_trial_capture_draft_v1";
const D1A_WORKSPACE_STATE_KIND = "role_workspace_session_state_non_canonical";
const D1A_WORKING_CONTEXT_OPTIONS = [
  { id: "general", label: "General" },
  { id: "program", label: "Program" },
];
const ENGINEER_NORMAL_STEERING_TYPES = [
  { id: "reasoning_direction", label: "Reasoning direction" },
  { id: "constraint", label: "Constraint" },
  { id: "narrow_scope", label: "Narrow scope" },
  { id: "stop", label: "Stop" },
];
const ENGINEER_ADVANCED_STEERING_TYPE = "execution_scope_change";
const ENGINEER_TRACE_STAGE_LABELS = {
  waiting_for_approval: "Waiting for your approval",
  approval_received: "Approval recorded",
  approved_execution_started: "Approved read starting",
  approved_execution_completed: "Approved read complete",
  preparing_continuation: "Preparing Engineer continuation",
  provider_pass2_started: "Engineer reasoning resumed",
  provider_pass2_completed: "Engineer reasoning complete",
  completed: "Complete",
  blocked: "Stopped",
};
let primeConversationHistory = [];
let mirrorConversationHistory = [];
let engineerConversationHistory = [];
let roleWorkspaceTranscript = [];
let roleWorkspaceInitialized = false;
let activeRole = "prime";
let d1aWorkspaceState = createEmptyD1AWorkspaceState();
let localEngineerPairingState = createLocalEngineerPairingState();
let engineerDebugEnabled = readStoredEngineerDebugMode();

function idlFactory({ IDL }) {
  const OperatorStatus = IDL.Record({
    isOperator: IDL.Bool,
    allowlistConfigured: IDL.Bool,
    recoveryConfigured: IDL.Bool,
    operatorCount: IDL.Nat,
  });
  const RoleSummary = IDL.Record({
    roleId: IDL.Text,
    owns: IDL.Vec(IDL.Text),
    doesNotOwn: IDL.Vec(IDL.Text),
    receivesContinuity: IDL.Text,
    outputMayInfluence: IDL.Vec(IDL.Text),
    operatorApprovalRequiredBefore: IDL.Vec(IDL.Text),
  });
  const RoleRule = IDL.Record({
    id: IDL.Text,
    title: IDL.Text,
    category: IDL.Text,
    appliesTo: IDL.Vec(IDL.Text),
    requirement: IDL.Text,
    enforcement: IDL.Text,
    validatorId: IDL.Text,
    operatorVisible: IDL.Bool,
    severity: IDL.Text,
  });
  const TransitionRule = IDL.Record({
    transition: IDL.Text,
    description: IDL.Text,
    operatorApprovalRequired: IDL.Bool,
    autonomousRoleTransferAllowed: IDL.Bool,
    failClosedWithoutApproval: IDL.Bool,
  });
  const OutputInfluenceRule = IDL.Record({
    artifactKind: IDL.Text,
    producedBy: IDL.Text,
    mayInfluenceLaterWork: IDL.Bool,
    influenceRequiresOperatorReview: IDL.Bool,
    canonicalMemoryWriteAllowed: IDL.Bool,
    providerRouteChangeAllowed: IDL.Bool,
    implementationAuthorizationAllowed: IDL.Bool,
  });
  const SurfaceRule = IDL.Record({
    surfaceId: IDL.Text,
    purpose: IDL.Text,
    operatorSessionRequired: IDL.Bool,
    publicSurfaceAllowed: IDL.Bool,
    consequentialActionsAllowed: IDL.Bool,
  });
  const AcceptanceCheck = IDL.Record({
    id: IDL.Text,
    requirement: IDL.Text,
    satisfied: IDL.Bool,
    evidence: IDL.Text,
  });
  const Report = IDL.Record({
    agreementVersion: IDL.Text,
    milestone: IDL.Text,
    purpose: IDL.Text,
    rolePolicyQuestion: IDL.Text,
    providerPolicyQuestion: IDL.Text,
    roles: IDL.Vec(RoleSummary),
    rules: IDL.Vec(RoleRule),
    transitionRules: IDL.Vec(TransitionRule),
    outputInfluenceRules: IDL.Vec(OutputInfluenceRule),
    surfaceRules: IDL.Vec(SurfaceRule),
    acceptanceChecklist: IDL.Vec(AcceptanceCheck),
    readOnly: IDL.Bool,
    liveInferenceEnabled: IDL.Bool,
    consequentialActionsEnabled: IDL.Bool,
    publicBehaviorChanged: IDL.Bool,
    canonicalContinuityOwner: IDL.Text,
    trustedContextPreparer: IDL.Text,
    nextMilestone: IDL.Text,
  });

  return IDL.Service({
    whoami: IDL.Func([], [IDL.Text], []),
    getOperatorStatus: IDL.Func([], [OperatorStatus], ["query"]),
    issueOperatorSessionGrant: IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Bool], []),
    getAionRoleRulesOperatingAgreementStatus: IDL.Func([], [Report], ["query"]),
  });
}

function createActor(actorIdentity) {
  const agent = new HttpAgent({ identity: actorIdentity, host: "https://ic0.app" });
  return Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function boolText(value) {
  return value ? "Yes" : "No";
}

function currentOperatorSessionRevision() {
  return operatorSessionRevision;
}

function advanceOperatorSessionRevision() {
  operatorSessionRevision += 1;
  return operatorSessionRevision;
}

function isCurrentOperatorSessionRevision(revision) {
  return revision === operatorSessionRevision;
}

function staleOperatorSessionRevisionError() {
  const error = new Error("Stale Operator workspace response ignored.");
  error.staleOperatorSessionRevision = true;
  error.fetchStarted = false;
  error.fetchRejected = true;
  error.responseReceived = false;
  return error;
}

function throwIfStaleOperatorSessionRevision(revision) {
  if (!isCurrentOperatorSessionRevision(revision)) {
    throw staleOperatorSessionRevisionError();
  }
}

function isStaleOperatorSessionRevisionError(error) {
  return Boolean(error && error.staleOperatorSessionRevision === true);
}

function createOptionalPageInstanceId() {
  try {
    return createOpaqueDiagnosticId();
  } catch (_) {
    return "page_instance_id_unavailable";
  }
}

function createOpaqueDiagnosticId() {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }
  if (!browserCrypto || typeof browserCrypto.getRandomValues !== "function") {
    throw new Error("secure_random_unavailable");
  }
  const bytes = new Uint8Array(16);
  browserCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeBrowserExceptionName(error) {
  const name = error && typeof error.name === "string" && error.name.trim()
    ? error.name.trim()
    : "UnknownError";
  return name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 80) || "UnknownError";
}

function browserVisibilityState() {
  if (typeof document === "undefined" || typeof document.visibilityState !== "string") return "unknown";
  return document.visibilityState.replace(/[^a-z_]/gi, "_").slice(0, 40) || "unknown";
}

function browserOnlineState() {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return null;
  return navigator.onLine;
}

function classifyBrowserFetchRejection(error, signal = null) {
  const exceptionName = safeBrowserExceptionName(error);
  if ((signal && signal.aborted === true) || exceptionName === "AbortError") {
    return "browser_fetch_abort";
  }
  if (exceptionName === "TypeError") {
    return "browser_fetch_network_or_policy_rejection";
  }
  return "browser_fetch_exception_other";
}

function buildBrowserFetchRejectionDiagnostics({ error, clientRequestId, startedAtMs, sessionRevision, signal = null }) {
  const now = Date.now();
  return {
    classification: "browser_fetch_rejected_before_http_response",
    category: classifyBrowserFetchRejection(error, signal),
    clientRequestId: clientRequestId || "not_available",
    elapsedMs: Math.max(0, Math.round(now - startedAtMs)),
    exceptionName: safeBrowserExceptionName(error),
    documentVisibilityState: browserVisibilityState(),
    navigatorOnline: browserOnlineState(),
    sessionRevisionAtSend: sessionRevision,
    sessionRevisionAtRejection: currentOperatorSessionRevision(),
    pageInstanceId,
    abortSignalPresent: Boolean(signal),
    abortSignalAborted: Boolean(signal && signal.aborted === true),
    rawExceptionMessageExposed: false,
    stackTraceExposed: false,
  };
}

function encodeOperatorGrant(nonce) {
  let binary = "";
  nonce.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function establishRenderOperatorSession(options = {}) {
  const sessionRevision = Number.isInteger(options.sessionRevision)
    ? options.sessionRevision
    : currentOperatorSessionRevision();
  throwIfStaleOperatorSessionRevision(sessionRevision);
  const storedSession = readStoredOperatorSession();
  if (storedSession) {
    throwIfStaleOperatorSessionRevision(sessionRevision);
    renderOperatorSessionToken = storedSession.sessionToken;
    return;
  }

  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const issued = await actor.issueOperatorSessionGrant(Array.from(nonce));
  throwIfStaleOperatorSessionRevision(sessionRevision);
  if (!issued) throw new Error("Operator session grant was not issued.");

  const response = await browserFetch(OPERATOR_SESSION_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: encodeOperatorGrant(nonce) }),
  });
  throwIfStaleOperatorSessionRevision(sessionRevision);
  if (!response.ok) throw new Error("Operator session exchange was rejected.");
  const session = await response.json();
  throwIfStaleOperatorSessionRevision(sessionRevision);
  if (!session || typeof session.sessionToken !== "string" || !session.sessionToken) {
    throw new Error("Operator session exchange returned an invalid session.");
  }
  renderOperatorSessionToken = session.sessionToken;
  writeStoredOperatorSession(session);
}

async function renderFetch(path, options = {}) {
  const sessionRevision = Number.isInteger(options.sessionRevision)
    ? options.sessionRevision
    : currentOperatorSessionRevision();
  throwIfStaleOperatorSessionRevision(sessionRevision);
  const headers = new Headers();
  if (renderOperatorSessionToken) {
    headers.set("Authorization", `Bearer ${renderOperatorSessionToken}`);
  }
  let response;
  try {
    response = await browserFetch(`${AIONIC_AGENT_API_BASE_URL}${path}`, { headers });
  } catch (error) {
    if (error && typeof error === "object") {
      error.fetchStarted = true;
      error.fetchRejected = true;
      error.responseReceived = false;
    }
    throw error;
  }
  const data = await readRenderResponse(response);
  throwIfStaleOperatorSessionRevision(sessionRevision);
  if (!response.ok) throw buildRenderRequestError(response, data);
  return data;
}

async function readRenderResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { detail: text };
  }
}

function buildRenderRequestError(response, data) {
  const detail = data && data.detail ? data.detail : data && Object.keys(data).length ? data : `Render request failed: ${response.status}`;
  const requestError = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  requestError.fetchStarted = true;
  requestError.fetchRejected = false;
  requestError.responseReceived = true;
  requestError.httpStatus = response.status;
  requestError.backendDetail = detail;
  requestError.responseData = data;
  requestError.transportCorrelation = isPlainObject(data && data.transportCorrelation) ? data.transportCorrelation : null;
  return requestError;
}

async function renderPostWithOptions(path, options = {}) {
  const sessionRevision = Number.isInteger(options.sessionRevision)
    ? options.sessionRevision
    : currentOperatorSessionRevision();
  throwIfStaleOperatorSessionRevision(sessionRevision);
  const headers = new Headers(options.headers || {});
  if (renderOperatorSessionToken) {
    headers.set("Authorization", `Bearer ${renderOperatorSessionToken}`);
  }
  const clientRequestId = AION_PROTECTED_ROLE_POST_PATHS.has(path) ? createOpaqueDiagnosticId() : "";
  if (clientRequestId) {
    headers.set(AION_CLIENT_REQUEST_ID_HEADER, clientRequestId);
  }
  const signal = options.request && options.request.signal ? options.request.signal : null;
  const startedAtMs = Date.now();
  let response;
  try {
    response = await browserFetch(`${AIONIC_AGENT_API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      ...options.request,
    });
  } catch (error) {
    if (error && typeof error === "object") {
      error.fetchStarted = true;
      error.fetchRejected = true;
      error.responseReceived = false;
      error.transportCorrelation = {
        clientRequestId: clientRequestId || "not_available",
        clientRequestIdHeader: clientRequestId ? AION_CLIENT_REQUEST_ID_HEADER : "",
        responseCorrelationAvailable: false,
        diagnosticOnly: true,
        idempotencyKey: false,
        authorityMeaning: false,
      };
      error.browserFetchRejection = buildBrowserFetchRejectionDiagnostics({
        error,
        clientRequestId,
        startedAtMs,
        sessionRevision,
        signal,
      });
    }
    throw error;
  }
  const data = await readRenderResponse(response);
  throwIfStaleOperatorSessionRevision(sessionRevision);
  if (!response.ok) throw buildRenderRequestError(response, data);
  return data;
}

async function renderPost(path, payload, options = {}) {
  return renderPostWithOptions(path, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type": "application/json" },
    request: { ...(options.request || {}), body: JSON.stringify(payload) },
  });
}

async function renderPostNoBody(path, options = {}) {
  return renderPostWithOptions(path, options);
}

function setAccess(message, state = "") {
  const node = document.getElementById("operatorAccess");
  node.textContent = message;
  node.className = `status ${state}`.trim();
}

function setOperatorWorkspaceWarning(message = "") {
  const node = document.getElementById("operatorWorkspaceWarning");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
}

function setOperatorPanelUnavailable(elementId, label) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = `<p class="meta">${escapeHtml(label)} could not refresh from the session service. Your operator access remains verified.</p>`;
}

function setOperatingAgreementUnavailable(message) {
  const purpose = document.getElementById("agreementPurpose");
  const version = document.getElementById("agreementVersion");
  const boundary = document.getElementById("boundarySummary");
  if (purpose) purpose.textContent = message;
  if (version) version.textContent = "Unavailable";
  if (boundary) boundary.textContent = "Operating agreement report did not refresh.";
  ["roleCards", "rulesTable", "transitionTable", "influenceTable", "surfaceTable", "acceptanceTable"].forEach((id) => {
    setOperatorPanelUnavailable(id, "Operating Agreement");
  });
}

function setOperatorShellSignedIn(signedIn) {
  document.body.classList.toggle("operator-signed-in", signedIn);
  document.body.classList.toggle("operator-signed-out", !signedIn);
  if (!signedIn) hideOperatorAuthenticatedWorkspace();
}

function hideOperatorAuthenticatedWorkspace() {
  const workspace = document.getElementById("operatorWorkspace");
  if (workspace) workspace.classList.remove("is-visible");
}

function showOperatorAuthenticatedWorkspace() {
  const workspace = document.getElementById("operatorWorkspace");
  if (workspace) workspace.classList.add("is-visible");
}

function clearOperatorWorkspaceElement(id, options = {}) {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = "";
  if (options.hide === true) node.hidden = true;
}

function resetOperatorAuthenticatedWorkspaceState() {
  hideOperatorAuthenticatedWorkspace();
  primeConversationHistory = [];
  mirrorConversationHistory = [];
  engineerConversationHistory = [];
  roleWorkspaceTranscript = [];
  activeRole = "prime";
  roleWorkspaceInitialized = false;
  d1aWorkspaceState = createEmptyD1AWorkspaceState();
  resetLocalEngineerPairingState();
  clearOperatorWorkspaceElement("primeHomeResults");
  clearOperatorWorkspaceElement("primeConversation");
  clearOperatorWorkspaceElement("engineerGovernedWorkflow", { hide: true });
  clearOperatorWorkspaceElement("localEngineerPairing", { hide: true });
  clearOperatorWorkspaceElement("d1aRoleDiagnostic");
  const input = document.getElementById("primeComposerInput");
  if (input) {
    input.value = "";
    input.disabled = false;
  }
  const composer = document.getElementById("primeComposer");
  if (composer) composer.hidden = true;
}

function invalidateOperatorAuthenticatedWorkspaceLifecycle(options = {}) {
  advanceOperatorSessionRevision();
  if (options.clearStoredSession === true) {
    renderOperatorSessionToken = null;
    clearStoredOperatorSession();
  }
  resetOperatorAuthenticatedWorkspaceState();
  setOperatorWorkspaceWarning("");
  if (options.hideWorkspace === true) {
    hideOperatorAuthenticatedWorkspace();
  }
}

function quarantineOperatorAuthenticatedWorkspacePresentation() {
  hideOperatorAuthenticatedWorkspace();
  setOperatorShellSignedIn(false);
}

function waitForOperatorLogoutPresentationPaint() {
  if (
    typeof requestAnimationFrame !== "function"
    || (typeof document !== "undefined" && document.visibilityState === "hidden")
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function restoreOperatorAuthenticatedWorkspacePresentationAfterBrowserLifecycle() {
  const sessionRevision = currentOperatorSessionRevision();
  hideOperatorAuthenticatedWorkspace();
  try {
    if (!authClient) authClient = await AuthClient.create();
    const authenticated = await authClient.isAuthenticated();
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    isAuthenticated = authenticated;
    if (!isAuthenticated) {
      invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
      setOperatorShellSignedIn(false);
      document.getElementById("authButton").textContent = "Sign In";
      setAccess("Sign in with Internet Identity to continue.");
      return;
    }

    identity = authClient.getIdentity();
    actor = createActor(identity);
    await actor.whoami();
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    const status = await actor.getOperatorStatus();
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (!status.allowlistConfigured || !status.isOperator) {
      isOperator = false;
      renderOperatorSessionToken = null;
      invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
      setOperatorShellSignedIn(false);
      document.getElementById("authButton").textContent = "Sign In";
      setAccess("Access denied. This workspace is restricted to the Teves Consulting operator.", "denied");
      return;
    }

    isOperator = true;
    document.getElementById("authButton").textContent = "Logout";
    setOperatorShellSignedIn(true);
    setAccess("Operator access verified. Aion is ready.", "verified");
    showOperatorAuthenticatedWorkspace();
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    console.error("Operator browser lifecycle restoration failed", error);
    isOperator = false;
    renderOperatorSessionToken = null;
    invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
    setOperatorShellSignedIn(false);
    document.getElementById("authButton").textContent = "Sign In";
    setAccess("Operator access could not be verified. Refresh after the identity service is available.", "denied");
  }
}

function table(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function renderReport(report) {
  document.getElementById("agreementPurpose").textContent = report.purpose || "";
  document.getElementById("agreementVersion").textContent = report.agreementVersion || "Ready";
  document.getElementById("rolePolicyQuestion").textContent = report.rolePolicyQuestion || "";
  document.getElementById("providerPolicyQuestion").textContent = report.providerPolicyQuestion || "";
  document.getElementById("boundarySummary").textContent =
    `Read-only: ${boolText(report.readOnly)}. Live inference: ${boolText(report.liveInferenceEnabled)}. Consequential actions: ${boolText(report.consequentialActionsEnabled)}. Public behavior changed: ${boolText(report.publicBehaviorChanged)}.`;

  document.getElementById("roleCards").innerHTML = (report.roles || []).map((role) => `
    <article class="role-card">
      <h3>${escapeHtml(role.roleId)}</h3>
      <p class="meta">${escapeHtml(role.receivesContinuity)}</p>
      <h3>Owns</h3>
      <ul>${(role.owns || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>Does Not Own</h3>
      <ul>${(role.doesNotOwn || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `).join("");

  document.getElementById("rulesTable").innerHTML = table(
    ["Rule", "Category", "Requirement", "Enforcement", "Validator"],
    (report.rules || []).map((rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.title)}</strong><br><span class="meta">${escapeHtml(rule.id)}</span></td>
        <td>${escapeHtml(rule.category)}</td>
        <td>${escapeHtml(rule.requirement)}</td>
        <td>${escapeHtml(rule.enforcement)}</td>
        <td>${escapeHtml(rule.validatorId)}</td>
      </tr>
    `)
  );

  document.getElementById("transitionTable").innerHTML = table(
    ["Transition", "Description", "Approval Required", "Autonomous Transfer", "Fail Closed"],
    (report.transitionRules || []).map((rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.transition)}</strong></td>
        <td>${escapeHtml(rule.description)}</td>
        <td>${boolText(rule.operatorApprovalRequired)}</td>
        <td>${boolText(rule.autonomousRoleTransferAllowed)}</td>
        <td>${boolText(rule.failClosedWithoutApproval)}</td>
      </tr>
    `)
  );

  document.getElementById("influenceTable").innerHTML = table(
    ["Artifact", "Role", "May Influence", "Review", "Memory Write", "Provider Route", "Implementation Auth"],
    (report.outputInfluenceRules || []).map((rule) => `
      <tr>
        <td>${escapeHtml(rule.artifactKind)}</td>
        <td>${escapeHtml(rule.producedBy)}</td>
        <td>${boolText(rule.mayInfluenceLaterWork)}</td>
        <td>${boolText(rule.influenceRequiresOperatorReview)}</td>
        <td>${boolText(rule.canonicalMemoryWriteAllowed)}</td>
        <td>${boolText(rule.providerRouteChangeAllowed)}</td>
        <td>${boolText(rule.implementationAuthorizationAllowed)}</td>
      </tr>
    `)
  );

  document.getElementById("surfaceTable").innerHTML = table(
    ["Surface", "Purpose", "Operator Session", "Public", "Consequential Actions"],
    (report.surfaceRules || []).map((rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.surfaceId)}</strong></td>
        <td>${escapeHtml(rule.purpose)}</td>
        <td>${boolText(rule.operatorSessionRequired)}</td>
        <td>${boolText(rule.publicSurfaceAllowed)}</td>
        <td>${boolText(rule.consequentialActionsAllowed)}</td>
      </tr>
    `)
  );

  document.getElementById("acceptanceTable").innerHTML = table(
    ["Check", "Requirement", "Satisfied", "Evidence"],
    (report.acceptanceChecklist || []).map((check) => `
      <tr>
        <td><strong>${escapeHtml(check.id)}</strong></td>
        <td>${escapeHtml(check.requirement)}</td>
        <td>${boolText(check.satisfied)}</td>
        <td>${escapeHtml(check.evidence)}</td>
      </tr>
    `)
  );
}

function renderContextPackets(report) {
  const container = document.getElementById("contextPacketResults");
  if (!container) return;
  const packets = Array.isArray(report.packets) ? report.packets : [];
  const comparisons = new Map(
    (Array.isArray(report.comparisons) ? report.comparisons : [])
      .map((comparison) => [comparison.roleId, comparison])
  );
  container.innerHTML = `
    <p class="meta">Version: ${escapeHtml(report.packetVersion || "")} | Live inference: ${boolText(report.liveInferenceEnabled)} | Provider calls: ${boolText(report.providerCallsEnabled)} | Memory writes: ${boolText(report.memoryWritesEnabled)}</p>
    ${packets.map((packet) => {
      const comparison = comparisons.get(packet.roleId) || {};
      return `
        <article class="role-card">
          <h3>${escapeHtml(packet.roleId)}</h3>
          <p class="meta">${escapeHtml(packet.currentOperatorObjective || "")}</p>
          <ul>
            <li>Canonical continuity: ${escapeHtml(packet.canonicalContinuityRef || "")}</li>
            <li>Prepared by: ${escapeHtml(packet.preparedByAionLayer || "")}</li>
            <li>Task context: ${escapeHtml((packet.taskSpecificContext || {}).contentPreview || "")}</li>
            <li>Role instruction: ${escapeHtml((packet.roleSpecificInstructions || {}).contentPreview || "")}</li>
            <li>Evidence refs: ${escapeHtml(String((packet.evidenceAndProvenance || []).length))}</li>
            <li>Approved prior outputs: ${escapeHtml(String((packet.priorApprovedRoleOutputs || []).length))}</li>
            <li>Within budget: ${boolText(comparison.withinBudget)}</li>
            <li>Provider neutral: ${boolText(comparison.providerNeutral)}</li>
            <li>Accepted: ${boolText(comparison.accepted)}</li>
          </ul>
        </article>
      `;
    }).join("")}
  `;
}

function createEmptyD1AWorkspaceState() {
  return {
    stateKind: D1A_WORKSPACE_STATE_KIND,
    workingContext: "general",
    lastRoleSendDiagnostic: null,
    engineerWorkflow: createEmptyEngineerWorkflowState(),
  };
}

function createEmptyEngineerWorkflowState() {
  return {
    current: null,
    trace: null,
    steering: null,
    actionStatus: "",
    inFlightAction: "",
    lastError: null,
  };
}

function d1aOptionLabel(options, id) {
  const option = options.find((item) => item.id === id);
  return option ? option.label : "Not selected";
}

function d1aChoiceGroupHtml({ name, legend, options, selected }) {
  return `
    <fieldset class="d1a-choice-group">
      <legend>${escapeHtml(legend)}</legend>
      <div class="d1a-choice-row">
        ${options.map((option) => `
          <label>
            <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(option.id)}"${option.id === selected ? " checked" : ""}>
            <span>${escapeHtml(option.label)}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function isEngineerDebugOn() {
  return engineerDebugEnabled === true;
}

function d1aEngineerDebugControlHtml() {
  const debugOn = isEngineerDebugOn();
  return `
    <fieldset class="d1a-choice-group d1a-debug-toggle" aria-label="Engineer debug projection">
      <legend>Debug</legend>
      <div class="d1a-choice-row d1a-debug-row">
        <button id="engineerDebugOffButton" class="d1a-debug-button${debugOn ? "" : " is-active"}" type="button" aria-pressed="${debugOn ? "false" : "true"}" data-engineer-debug-mode="off">Off</button>
        <button id="engineerDebugOnButton" class="d1a-debug-button${debugOn ? " is-active" : ""}" type="button" aria-pressed="${debugOn ? "true" : "false"}" data-engineer-debug-mode="on">On</button>
      </div>
    </fieldset>
  `;
}

function d1aRoleEndpoint(role) {
  const routes = {
    prime: "/admin/prime-workspace-message",
    mirror: "/admin/mirror-workspace-message",
    engineer: "/admin/engineer-workspace-message",
  };
  return routes[role] || routes.prime;
}

function d1aWorkingContextValue(value) {
  return value === "program" || value === "general" ? value : "general";
}

function d1aWorkspaceFrameHtml() {
  const state = d1aWorkspaceState;
  return `
    <section class="d1a-workspace-frame" aria-label="Working context">
      ${d1aChoiceGroupHtml({
        name: "d1aWorkingContext",
        legend: "Working context",
        options: D1A_WORKING_CONTEXT_OPTIONS,
        selected: state.workingContext,
      })}
      ${d1aEngineerDebugControlHtml()}
      <div id="localEngineerPairing" class="local-engineer-context" hidden></div>
      <div id="d1aRoleDiagnostic">${d1aRoleDiagnosticHtml(state.lastRoleSendDiagnostic)}</div>
    </section>
  `;
}

function d1aRoleDiagnosticHtml(diagnostic) {
  if (!diagnostic || !diagnostic.outcome || diagnostic.outcome === "completed") return "";
  const responseCopy = diagnostic.responseReceived
    ? "The backend returned an error."
    : "Request failed before an HTTP response was received.";
  const detail = diagnostic.sanitizedBackendDetail || diagnostic.fetchRejectionClassification || "No additional detail available.";
  const showDetails = diagnostic.role !== "engineer" || isEngineerDebugOn();
  return `
    <section class="d1a-role-diagnostic is-error" aria-live="polite">
      <p class="d1a-diagnostic-summary">${escapeHtml(responseCopy)}</p>
      ${showDetails ? `
      <details>
        <summary>Request details</summary>
        <dl class="d1a-diagnostic-grid">
          <div><dt>Role</dt><dd>${escapeHtml(diagnostic.role)}</dd></div>
          <div><dt>Endpoint</dt><dd>${escapeHtml(diagnostic.endpointPath)}</dd></div>
          <div><dt>Message characters</dt><dd>${escapeHtml(String(diagnostic.messageCharCount))}</dd></div>
          <div><dt>Prior messages</dt><dd>${escapeHtml(String(diagnostic.priorMessageCount))}</dd></div>
          <div><dt>Auth present</dt><dd>${diagnostic.authPresent ? "yes" : "no"}</dd></div>
          <div><dt>Fetch started</dt><dd>${diagnostic.fetchStarted ? "yes" : "no"}</dd></div>
          <div><dt>Response received</dt><dd>${diagnostic.responseReceived ? "yes" : "no"}</dd></div>
          <div><dt>HTTP status</dt><dd>${escapeHtml(String(diagnostic.httpStatus || "not available"))}</dd></div>
          <div><dt>Detail</dt><dd>${escapeHtml(detail)}</dd></div>
          <div><dt>Client request ID</dt><dd>${escapeHtml(diagnostic.clientRequestId || "not available")}</dd></div>
          <div><dt>Fetch rejection category</dt><dd>${escapeHtml(diagnostic.fetchRejectionCategory || "not available")}</dd></div>
          <div><dt>Elapsed</dt><dd>${Number.isInteger(diagnostic.elapsedMs) ? escapeHtml(String(diagnostic.elapsedMs)) : "not available"} ms</dd></div>
          <div><dt>Visibility</dt><dd>${escapeHtml(diagnostic.documentVisibilityState || "unknown")}</dd></div>
          <div><dt>Browser online</dt><dd>${typeof diagnostic.navigatorOnline === "boolean" ? (diagnostic.navigatorOnline ? "yes" : "no") : "unknown"}</dd></div>
          <div><dt>Session revision</dt><dd>${escapeHtml(String(diagnostic.sessionRevisionAtSend ?? "unknown"))} -> ${escapeHtml(String(diagnostic.sessionRevisionAtRejection ?? "unknown"))}</dd></div>
          <div><dt>Abort signal</dt><dd>${diagnostic.abortSignalPresent ? (diagnostic.abortSignalAborted ? "aborted" : "present") : "not present"}</dd></div>
          <div><dt>Timestamp</dt><dd>${escapeHtml(diagnostic.timestamp)}</dd></div>
          <div><dt>Retry attempted</dt><dd>${diagnostic.retryAttempted ? "yes" : "no"}</dd></div>
        </dl>
      </details>
      ` : ""}
    </section>
  `;
}

function d1aRefreshDiagnosticDisplay() {
  const container = document.getElementById("d1aRoleDiagnostic");
  if (container) container.innerHTML = d1aRoleDiagnosticHtml(d1aWorkspaceState.lastRoleSendDiagnostic);
}

function d1aRefreshDebugModeDisplay() {
  document.querySelectorAll("[data-engineer-debug-mode]").forEach((button) => {
    const enabled = button.dataset.engineerDebugMode === "on";
    const active = enabled === isEngineerDebugOn();
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function d1aRefreshRoleConversationProjection() {
  const conversation = document.getElementById("primeConversation");
  if (!conversation || conversation.querySelector(".prime-message.pending")) return;
  conversation.innerHTML = "";
  renderRoleWorkspaceTranscript();
}

function setEngineerDebugMode(enabled) {
  engineerDebugEnabled = enabled === true;
  writeStoredEngineerDebugMode(engineerDebugEnabled);
  d1aRefreshDebugModeDisplay();
  d1aRefreshDiagnosticDisplay();
  d1aRefreshEngineerWorkflowDisplay();
  d1aRefreshRoleConversationProjection();
}

function d1aAttachWorkspaceHandlers() {
  document.querySelectorAll('input[name="d1aWorkingContext"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) d1aWorkspaceState.workingContext = input.value;
    });
  });
  document.querySelectorAll("[data-engineer-debug-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setEngineerDebugMode(button.dataset.engineerDebugMode === "on");
    });
  });
  d1aRefreshDebugModeDisplay();
}

function d1aBuildRoleSendDiagnostic({ role, endpointPath, message, priorMessages, error = null, outcome, responsePacket = null }) {
  const responseReceived = Boolean(error && error.responseReceived);
  const httpStatus = error && error.httpStatus ? error.httpStatus : (outcome === "completed" ? 200 : null);
  const backendDetail = error && error.backendDetail ? error.backendDetail : "";
  const fetchRejected = Boolean(error && error.fetchRejected);
  const rejection = isPlainObject(error && error.browserFetchRejection) ? error.browserFetchRejection : {};
  const responseCorrelation = isPlainObject(responsePacket && responsePacket.transportCorrelation)
    ? responsePacket.transportCorrelation
    : isPlainObject(error && error.transportCorrelation)
      ? error.transportCorrelation
      : isPlainObject(error && error.responseData && error.responseData.transportCorrelation)
        ? error.responseData.transportCorrelation
        : {};
  return {
    role,
    endpointPath,
    messageCharCount: message.length,
    priorMessageCount: priorMessages.length,
    authPresent: Boolean(renderOperatorSessionToken),
    fetchStarted: true,
    responseReceived: outcome === "completed" ? true : responseReceived,
    httpStatus,
    sanitizedBackendDetail: typeof backendDetail === "string" ? backendDetail : JSON.stringify(backendDetail || ""),
    fetchRejectionClassification: fetchRejected ? "browser_fetch_rejected_before_http_response" : "",
    fetchRejectionCategory: rejection.category || "",
    clientRequestId: responseCorrelation.clientRequestId || rejection.clientRequestId || "not_available",
    clientRequestIdAccepted: responseCorrelation.clientRequestIdAccepted === true,
    responseCorrelationAvailable: responseCorrelation.clientRequestIdAccepted === true || responseCorrelation.responseCorrelationAvailable === true,
    elapsedMs: Number.isInteger(rejection.elapsedMs) ? rejection.elapsedMs : null,
    exceptionName: rejection.exceptionName || "",
    documentVisibilityState: rejection.documentVisibilityState || "",
    navigatorOnline: typeof rejection.navigatorOnline === "boolean" ? rejection.navigatorOnline : null,
    sessionRevisionAtSend: Number.isInteger(rejection.sessionRevisionAtSend) ? rejection.sessionRevisionAtSend : null,
    sessionRevisionAtRejection: Number.isInteger(rejection.sessionRevisionAtRejection) ? rejection.sessionRevisionAtRejection : null,
    pageInstanceId: rejection.pageInstanceId || pageInstanceId,
    abortSignalPresent: rejection.abortSignalPresent === true,
    abortSignalAborted: rejection.abortSignalAborted === true,
    rawExceptionMessageExposed: false,
    stackTraceExposed: false,
    timestamp: new Date().toISOString(),
    retryAttempted: false,
    outcome,
  };
}

function d1aRoleFailureCopy(diagnostic) {
  if (!diagnostic) return "The workspace route did not return a usable response.";
  if (diagnostic.responseReceived) {
    return "The backend returned an error.";
  }
  return "Request failed before an HTTP response was received.";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item !== undefined && item !== null && String(item).trim()).map((item) => String(item))
    : [];
}

function safeObjectEntries(value) {
  return isPlainObject(value) ? Object.entries(value) : [];
}

function firstOrUnknown(items) {
  return items.length ? items[0] : "unknown";
}

function engineerCurrentWorkflow() {
  return d1aWorkspaceState.engineerWorkflow || createEmptyEngineerWorkflowState();
}

function engineerWorkflowIsTerminal(current) {
  if (!current) return false;
  const lifecycle = current.lifecycleState || "";
  const status = current.resumeStatus || "";
  return [
    "canonical_state_unavailable",
    "denied",
    "expired",
    "cancelled",
    "consumed",
    "read_resume_continuation_completed",
    "read_resume_stopped_by_operator",
    "read_resume_requires_new_approval",
    "read_resume_additional_read_required",
    "read_resume_continuation_failed",
    "read_resume_completed",
    "read_resume_failed",
    "read_resume_unavailable",
  ].includes(lifecycle) || status.startsWith("read_resume_");
}

function engineerWorkflowHasActiveWork(current) {
  return Boolean(current && (current.pendingApprovalId || current.workItemId) && !engineerWorkflowIsTerminal(current));
}

function engineerResponsePayload(value) {
  if (!isPlainObject(value)) return value || {};
  if (isPlainObject(value.detail)) return value.detail;
  return value;
}

function normalizeEngineerReadWorkflow(packet) {
  const evidence = isPlainObject(packet.evidence) ? packet.evidence : {};
  const repositoryBinding = isPlainObject(packet.repositoryBinding)
    ? packet.repositoryBinding
    : isPlainObject(evidence.repositoryBinding)
    ? evidence.repositoryBinding
    : {};
  return {
    approvalKind: "engineer_pending_read",
    pendingApprovalId: safeText(packet.pendingApprovalId, ""),
    workItemId: safeText(packet.workItemId, ""),
    repositoryName: safeText(packet.repositoryName || repositoryBinding.repositoryName),
    requestedOperations: safeList(packet.requestedOperations),
    requestedPaths: safeList(packet.requestedPaths),
    requestReasons: safeList(packet.requestReasons),
    expiresAt: safeText(packet.expiresAt),
    expectedHeadCandidate: safeText(repositoryBinding.expectedHeadCandidate),
    approvedBranchCandidate: safeText(repositoryBinding.approvedBranchCandidate),
    cleanTreeRequired: repositoryBinding.cleanTreeRequired === true,
    lifecycleState: "awaiting_approval",
    canonicalStateUnavailable: false,
    approvalResponse: null,
    resumeResponse: null,
    resumeStatus: "",
    providerPassCountSoFar: Number.isInteger(packet.providerPassCountSoFar) ? packet.providerPassCountSoFar : 1,
    secondProviderPassOccurred: packet.secondProviderPassOccurred === true,
    repositoryAccessPerformed: packet.repositoryAccessPerformed === true,
    grantCreated: packet.grantCreated === true,
    continuityWritten: packet.continuityWritten === true,
    evidenceAuthorizesExecution: packet.evidenceAuthorizesExecution === true,
  };
}

function mergeEngineerApprovalDetails(current, packet) {
  const detail = engineerResponsePayload(packet);
  const repositoryBinding = isPlainObject(detail.repositoryBinding) ? detail.repositoryBinding : {};
  current.lifecycleState = safeText(detail.lifecycleState, current.lifecycleState);
  current.repositoryName = safeText(repositoryBinding.repositoryName, current.repositoryName);
  current.requestedOperations = safeList(detail.requestedOperations).length ? safeList(detail.requestedOperations) : current.requestedOperations;
  current.requestedPaths = safeList(detail.requestedPaths).length ? safeList(detail.requestedPaths) : current.requestedPaths;
  current.requestReasons = safeList(detail.requestReasons).length ? safeList(detail.requestReasons) : current.requestReasons;
  current.expiresAt = safeText(detail.expiresAt, current.expiresAt);
  current.expectedHeadCandidate = safeText(repositoryBinding.expectedHeadCandidate, current.expectedHeadCandidate);
  current.approvedBranchCandidate = safeText(repositoryBinding.approvedBranchCandidate, current.approvedBranchCandidate);
  current.cleanTreeRequired = repositoryBinding.cleanTreeRequired === true || current.cleanTreeRequired === true;
  current.approvalResponse = detail;
}

function engineerSafetyListHtml() {
  return `
    <ul class="engineer-authority-list">
      <li>other files</li>
      <li>writes</li>
      <li>commit</li>
      <li>push</li>
      <li>deploy</li>
      <li>continuity promotion</li>
    </ul>
  `;
}

function engineerRequestedPathsHtml(paths) {
  const items = safeList(paths);
  if (!items.length) return `<dd>unknown</dd>`;
  return `<dd><ul class="engineer-path-list">${items.map((path) => `<li><code>${escapeHtml(path)}</code></li>`).join("")}</ul></dd>`;
}

function engineerTraceLabel(stage) {
  return ENGINEER_TRACE_STAGE_LABELS[stage] || "Status update";
}

function engineerExecutionKnownCopy(packet) {
  if (packet && packet.responseReceived === false) return "The execution outcome is unknown because no backend response was received.";
  const evidence = isPlainObject(packet && packet.evidence) ? packet.evidence : {};
  if (packet && packet.localExecutionCompleted === true) return "The approved read completed.";
  if (evidence.localDispatchOccurred === true || evidence.d1Invoked === true) return "Approved local execution may have started; review the trace.";
  return "No execution is proven by the returned evidence.";
}

function engineerNextStepCopy(packet) {
  const text = `${safeText(packet && packet.status, "")} ${safeText(packet && packet.classification, "")} ${safeText(packet && packet.failure, "")}`.toLowerCase();
  if (text.includes("not_found")) return "Start a fresh Engineer request if the work is still needed.";
  if (text.includes("expired") || text.includes("terminal") || text.includes("already_claimed")) return "Do not retry automatically; create a new bounded request if needed.";
  if (text.includes("head") || text.includes("mismatch")) return "Check repository currentness before asking Engineer to continue.";
  if (text.includes("adapter") || text.includes("transport")) return "Confirm the local Engineer adapter is available before a new attempt.";
  if (text.includes("requires_new_approval")) return "Review the new scope as a separate approval before any further read.";
  if (text.includes("provider") || text.includes("continuation")) return "Review the returned status before deciding whether to ask Engineer again.";
  if (packet && packet.responseReceived === false) return "Do not retry this pending approval automatically; ask Engineer for a fresh bounded request if needed.";
  return "Review the returned status and continue only with a new Owner decision if needed.";
}

function engineerResultStatusCopy(packet) {
  if (!packet) return "";
  const status = packet.status || packet.lifecycleState || packet.applicationStatus || packet.classification || "unknown";
  const statusCopy = {
    read_resume_continuation_completed: "Engineer continuation completed.",
    read_resume_stopped_by_operator: "Engineer stopped after your Steering instruction.",
    read_resume_requires_new_approval: "Engineer needs a new approval for additional scope.",
    read_resume_additional_read_required: "Engineer needs another read approval before it can answer.",
    read_resume_continuation_failed: "Engineer continuation did not complete.",
    read_resume_completed: "Approved read completed.",
    read_resume_unavailable: "Approved read could not run because the adapter is unavailable.",
    read_resume_failed: "Approved read failed closed.",
    approved: "Approved - waiting for resume.",
    canonical_state_unavailable: "Canonical approval state is unavailable.",
    denied: "Denied. No approved read will execute.",
    awaiting_approval: "Waiting for your approval.",
    pending: "Steering is pending for the next continuation.",
    applied: "Steering was applied.",
    requires_new_approval: "Steering requires a new approval.",
    stopped: "Steering stopped the continuation.",
  };
  return statusCopy[status] || `Backend status: ${status}`;
}

function engineerRefinementDiagnosticsHtml(packet) {
  if (!isPlainObject(packet)) return "";
  const evidence = isPlainObject(packet.evidence) ? packet.evidence : {};
  const diagnostics = [
    ["Selection proof failure", packet.selectionProofFailureClassification],
    ["Refinement failure", packet.refinementFailureClassification],
    ["Finalization insufficiency", packet.finalizationInsufficiencyReason || evidence.finalizationInsufficiencyReason],
    ["Additional evidence decision", packet.additionalEvidenceDecisionClassification],
    ["Refinement plan", packet.refinementPlanClassification],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  if (!diagnostics.length) return "";
  return `
      <dl class="engineer-workflow-grid">
        ${diagnostics.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
  `;
}

function engineerProviderFailureDiagnosticHtml(packet) {
  if (!isPlainObject(packet)) return "";
  const classification = safeText(packet.continuationClassification || packet.classification || packet.failure, "");
  if (classification !== "engineer_read_continuation_provider_failed") return "";
  const diagnostic = isPlainObject(packet.providerFailureDiagnostic)
    ? packet.providerFailureDiagnostic
    : isPlainObject(packet.evidence) && isPlainObject(packet.evidence.providerFailureDiagnostic)
    ? packet.evidence.providerFailureDiagnostic
    : null;
  if (!isPlainObject(diagnostic)) return "";
  const rows = [
    ["Category", diagnostic.providerFailureCategory, true],
    ["Provider", diagnostic.providerId, false],
    ["Adapter", diagnostic.adapterId, false],
    ["Route", diagnostic.routeId, false],
    ["Model", diagnostic.requestedModel, true],
    ["Reasoning effort", diagnostic.reasoningEffort, false],
    ["HTTP status", diagnostic.httpStatus === "not_available" ? "" : diagnostic.httpStatus, true],
    ["Exception", diagnostic.exceptionClass, true],
    ["Error code", diagnostic.errorCode, true],
    ["Request ID", diagnostic.providerRequestId === "not_available" ? "" : diagnostic.providerRequestId, true],
    ["Schema parameter", diagnostic.schemaErrorParam, true],
    ["Schema context", diagnostic.schemaErrorContext, true],
    ["Schema reason", diagnostic.schemaErrorReason, false],
    ["Provider response", typeof diagnostic.providerResponseReceived === "boolean" ? boolText(diagnostic.providerResponseReceived) : "", false],
    ["HTTP response", typeof diagnostic.providerHttpResponseReceived === "boolean" ? boolText(diagnostic.providerHttpResponseReceived) : "", false],
    ["Structured-output decode", typeof diagnostic.structuredOutputDecodeBegan === "boolean" ? boolText(diagnostic.structuredOutputDecodeBegan) : "", false],
    ["Usage metadata", typeof diagnostic.usageMetadataAvailable === "boolean" ? boolText(diagnostic.usageMetadataAvailable) : "", false],
  ].filter(([, value]) => String(value || "").trim());
  const safetyFlags = [
    diagnostic.promptCaptured,
    diagnostic.rawProviderPayloadCaptured,
    diagnostic.credentialsCaptured,
    diagnostic.headersCaptured,
    diagnostic.hiddenReasoningCaptured,
  ];
  if (safetyFlags.some((value) => typeof value === "boolean")) {
    rows.push(["Sensitive provider data", safetyFlags.some((value) => value === true) ? "captured" : "not captured", false]);
  }
  if (!rows.length) return "";
  return `
    <div class="engineer-need-identity-block">
      <h4>Provider continuation failure</h4>
      <dl class="engineer-workflow-grid">
        ${rows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    </div>
  `;
}

function engineerNeedIdentifiersHtml(identity) {
  if (!isPlainObject(identity)) return "unknown";
  if (identity.knownIdentifiersUnavailable === true) return "unavailable";
  const identifiers = safeList(identity.knownIdentifiers);
  if (!identifiers.length) return "none";
  return identifiers.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ");
}

function engineerNeedIdentityHtml(label, identity) {
  if (!isPlainObject(identity)) return "";
  const type = safeText(identity.evidenceType, "unknown");
  const anchorCount = Number.isInteger(identity.sourceAnchorCount) ? String(identity.sourceAnchorCount) : "unknown";
  return `
    <div class="engineer-need-identity-block">
      <h4>${escapeHtml(label)}</h4>
      <dl class="engineer-workflow-grid">
        <div><dt>Type</dt><dd>${escapeHtml(type)}</dd></div>
        <div><dt>Identifiers</dt><dd>${engineerNeedIdentifiersHtml(identity)}</dd></div>
        <div><dt>Anchor count</dt><dd>${escapeHtml(anchorCount)}</dd></div>
      </dl>
    </div>
  `;
}

function engineerNeedDifferenceHtml(difference) {
  if (!isPlainObject(difference)) return "";
  return `
    <div class="engineer-need-identity-block">
      <h4>Difference</h4>
      <dl class="engineer-workflow-grid">
        <div><dt>Evidence type changed</dt><dd>${escapeHtml(boolText(difference.evidenceTypeChanged === true))}</dd></div>
        <div><dt>Identifiers changed</dt><dd>${escapeHtml(boolText(difference.knownIdentifiersChanged === true))}</dd></div>
        <div><dt>Anchors changed</dt><dd>${escapeHtml(boolText(difference.sourceAnchorsChanged === true))}</dd></div>
      </dl>
    </div>
  `;
}

function engineerRefinementNeedIdentityHtml(packet) {
  const identity = isPlainObject(packet) ? packet.refinementNeedIdentity : null;
  if (!isPlainObject(identity)) return "";
  const prior = engineerNeedIdentityHtml("Prior satisfied need", identity.priorSatisfied);
  const final = engineerNeedIdentityHtml("Final requested need", identity.finalRequested);
  const difference = engineerNeedDifferenceHtml(identity.difference);
  if (!prior && !final && !difference) return "";
  return `
    <div class="engineer-need-identity">
      ${prior}
      ${final}
      ${difference}
    </div>
  `;
}

function engineerSelectedEvidenceDiagnosticHtml(packet) {
  if (!isPlainObject(packet)) return "";
  const diagnostic = isPlainObject(packet.selectedEvidenceDiagnostic)
    ? packet.selectedEvidenceDiagnostic
    : isPlainObject(packet.evidence) && isPlainObject(packet.evidence.selectedEvidenceDiagnostic)
    ? packet.evidence.selectedEvidenceDiagnostic
    : null;
  if (!isPlainObject(diagnostic)) return "";
  const need = isPlainObject(diagnostic.refinementNeed) ? diagnostic.refinementNeed : {};
  const coverage = isPlainObject(diagnostic.coverage) ? diagnostic.coverage : {};
  const items = Array.isArray(diagnostic.items) ? diagnostic.items.filter(isPlainObject) : [];
  const needRows = [
    ["Evidence type", need.evidenceType, true],
    ["Target", need.targetConcept, false],
    ["Identifiers", safeList(need.knownIdentifiers).join(", "), true],
    ["Anchor terms", safeList(need.sourceAnchorTerms).join(", "), true],
    ["Refinement cycle", Number.isInteger(need.refinementCycle) ? need.refinementCycle : "", true],
  ].filter(([, value]) => String(value || "").trim());
  const coverageRows = [
    ["Evidence items", Number.isInteger(coverage.selectedEvidenceItemCount) ? coverage.selectedEvidenceItemCount : "", true],
    ["Sources", Number.isInteger(coverage.selectedSourceCount) ? coverage.selectedSourceCount : "", true],
    ["Admin represented", typeof coverage.adminSourceRepresented === "boolean" ? boolText(coverage.adminSourceRepresented) : "", false],
    ["Operator represented", typeof coverage.operatorSourceRepresented === "boolean" ? boolText(coverage.operatorSourceRepresented) : "", false],
    ["Style declarations", Number.isInteger(coverage.styleDeclarationEvidenceCount) ? coverage.styleDeclarationEvidenceCount : "", true],
    ["Comparative complete", typeof coverage.comparativeEvidenceComplete === "boolean" ? boolText(coverage.comparativeEvidenceComplete) : "", false],
    ["Truncated", typeof coverage.evidenceTruncated === "boolean" ? boolText(coverage.evidenceTruncated) : "", false],
    ["Evidence chars", Number.isInteger(coverage.finalizationEvidenceChars) ? coverage.finalizationEvidenceChars : "", true],
    ["Evidence budget", Number.isInteger(coverage.finalizationEvidenceBudget) ? coverage.finalizationEvidenceBudget : "", true],
  ].filter(([, value]) => String(value || "").trim());
  const itemRows = items
    .map((item) => {
      const identifiers = safeList(item.matchedIdentifiers);
      const anchors = safeList(item.matchedAnchors);
      const detailRows = [
        ["Path", item.path, true],
        ["Source SHA-256", item.sourceSha256, true],
        ["Category", item.category, true],
        ["Type", item.evidenceType, true],
        ["Chars", Number.isInteger(item.selectedCharCount) ? item.selectedCharCount : "", true],
        ["Identifiers", identifiers.join(", "), true],
        ["Anchors", anchors.join(", "), true],
        ["Proof", item.proofClassification, true],
        ["Selector", item.selectorType, true],
      ].filter(([, value]) => String(value || "").trim());
      if (!detailRows.length) return "";
      return `<li><dl class="engineer-workflow-grid">${detailRows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}</dl></li>`;
    })
    .filter(Boolean)
    .join("");
  if (!needRows.length && !coverageRows.length && !itemRows) return "";
  return `
    <div class="engineer-need-identity">
      <h4>Selected evidence</h4>
      ${needRows.length ? `<div class="engineer-need-identity-block"><h4>Refinement need</h4><dl class="engineer-workflow-grid">${needRows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}</dl></div>` : ""}
      ${coverageRows.length ? `<div class="engineer-need-identity-block"><h4>Coverage</h4><dl class="engineer-workflow-grid">${coverageRows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}</dl></div>` : ""}
      ${itemRows ? `<div class="engineer-need-identity-block"><h4>Sources selected</h4><ol class="engineer-trace-list">${itemRows}</ol></div>` : ""}
    </div>
  `;
}

function engineerEvidenceNeedMappingDiagnosticHtml(packet) {
  if (!isPlainObject(packet)) return "";
  const diagnostic = isPlainObject(packet.evidenceNeedMappingDiagnostic)
    ? packet.evidenceNeedMappingDiagnostic
    : isPlainObject(packet.evidence) && isPlainObject(packet.evidence.evidenceNeedMappingDiagnostic)
    ? packet.evidence.evidenceNeedMappingDiagnostic
    : null;
  if (!isPlainObject(diagnostic)) return "";
  const need = isPlainObject(diagnostic.needIdentity) ? diagnostic.needIdentity : {};
  const sources = Array.isArray(diagnostic.candidateSourceIdentities)
    ? diagnostic.candidateSourceIdentities.filter(isPlainObject)
    : [];
  const rows = [
    ["Reason", diagnostic.ambiguityReason, true],
    ["Evidence type", need.evidenceType, true],
    ["Target", need.targetConcept, false],
    ["Identifiers", safeList(need.knownIdentifiers).join(", "), true],
    ["Anchor terms", safeList(need.sourceAnchorTerms).join(", "), true],
    ["Refinement cycle", Number.isInteger(need.refinementCycle) ? need.refinementCycle : "", true],
    ["Inspected sources", Number.isInteger(diagnostic.alreadyInspectedSourceCount) ? diagnostic.alreadyInspectedSourceCount : "", true],
    ["Candidate mappings", Number.isInteger(diagnostic.candidateMappingCount) ? diagnostic.candidateMappingCount : "", true],
    ["Matched terms", Number.isInteger(diagnostic.selectionProofMatchedTermCount) ? diagnostic.selectionProofMatchedTermCount : "", true],
    ["Selection proof", typeof diagnostic.selectionProofPresent === "boolean" ? boolText(diagnostic.selectionProofPresent) : "", false],
    ["Selection candidate", typeof diagnostic.selectionCandidatePresent === "boolean" ? boolText(diagnostic.selectionCandidatePresent) : "", false],
    ["Acquisition mapping", typeof diagnostic.acquisitionCandidateMapped === "boolean" ? boolText(diagnostic.acquisitionCandidateMapped) : "", false],
  ].filter(([, value]) => String(value || "").trim());
  const sourceRows = sources
    .map((source) => {
      const sourceDetailRows = [
        ["Path", source.path, true],
        ["Source SHA-256", source.sourceSha256, true],
        ["Admin", typeof source.adminSource === "boolean" ? boolText(source.adminSource) : "", false],
        ["Operator", typeof source.operatorSource === "boolean" ? boolText(source.operatorSource) : "", false],
        ["Anchor terms", safeList(source.sourceAnchorTerms).join(", "), true],
      ].filter(([, value]) => String(value || "").trim());
      if (!sourceDetailRows.length) return "";
      return `<li><dl class="engineer-workflow-grid">${sourceDetailRows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}</dl></li>`;
    })
    .filter(Boolean)
    .join("");
  if (!rows.length && !sourceRows) return "";
  return `
    <div class="engineer-need-identity">
      <h4>Evidence need mapping</h4>
      ${rows.length ? `<div class="engineer-need-identity-block"><dl class="engineer-workflow-grid">${rows.map(([label, value, code]) => `<div><dt>${escapeHtml(label)}</dt><dd>${code ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</dd></div>`).join("")}</dl></div>` : ""}
      ${sourceRows ? `<div class="engineer-need-identity-block"><h4>Candidate sources</h4><ol class="engineer-trace-list">${sourceRows}</ol></div>` : ""}
    </div>
  `;
}

function parityStateText(value) {
  return ["match", "differ", "unavailable"].includes(value) ? value : "unavailable";
}

function engineerParityStateRowsHtml(comparison) {
  const states = isPlainObject(comparison) && isPlainObject(comparison.sectionStates) ? comparison.sectionStates : {};
  const sections = [
    ["Role contract", "roleContract"],
    ["Objective", "objective"],
    ["Finalization contract", "finalizationContract"],
    ["Working/Program context", "context"],
    ["Refinement state", "refinementState"],
    ["Evidence packet", "evidencePacket"],
    ["Evidence items", "evidenceItems"],
    ["Schema", "schema"],
    ["Assembled system message", "finalSystemMessage"],
    ["Assembled user message", "finalUserMessage"],
    ["Provider configuration", "providerConfiguration"],
    ["Task 1 semantic markers", "task1SemanticMarkers"],
  ];
  return sections.map(([label, key]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(parityStateText(states[key]))}</dd></div>
  `).join("");
}

function engineerParityBaselineHtml(manifest) {
  const baseline = isPlainObject(manifest) && isPlainObject(manifest.frozenBaseline) ? manifest.frozenBaseline : {};
  const rows = [
    ["Baseline", baseline.baselineId],
    ["Fixture", baseline.fixtureDigest],
    ["Prompt", baseline.promptDigest],
    ["Schema", baseline.schemaDigest],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  if (!rows.length) return "";
  return `
    <dl class="engineer-workflow-grid">
      ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value)}</code></dd></div>`).join("")}
    </dl>
  `;
}

function engineerParityProviderConfigHtml(manifest) {
  const config = isPlainObject(manifest) && isPlainObject(manifest.providerConfiguration) ? manifest.providerConfiguration : {};
  const rows = [
    ["Role", config.role],
    ["Provider", config.providerId],
    ["Adapter", config.adapterId],
    ["Route", config.routeId],
    ["Model", config.model],
    ["Reasoning effort", config.reasoningEffort],
    ["Fallback", typeof config.fallbackEnabled === "boolean" ? boolText(config.fallbackEnabled) : ""],
    ["Task class", config.taskClass],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  if (!rows.length) return "";
  return `
    <div class="engineer-need-identity-block">
      <h4>Provider configuration</h4>
      <dl class="engineer-workflow-grid">
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    </div>
  `;
}

function engineerParityMarkersHtml(markers) {
  if (!isPlainObject(markers)) return "";
  const rows = [
    ["Backend request multi-path", markers.backendRequestMultiPathState],
    ["Trace multi-path", markers.traceMultiPathState],
    ["Frontend first-path projection", markers.frontendFirstPathProjection],
    ["Observed one/two path mismatch", markers.observedOnePathVsTwoPathMismatch],
  ].filter(([, value]) => typeof value === "boolean");
  if (!rows.length) return "";
  return `
    <div class="engineer-need-identity-block">
      <h4>Task 1 semantic markers</h4>
      <dl class="engineer-workflow-grid">
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(boolText(value))}</dd></div>`).join("")}
      </dl>
    </div>
  `;
}

function engineerParityEvidenceItemsHtml(manifest, comparison) {
  const fingerprints = isPlainObject(manifest) && Array.isArray(manifest.evidenceItemFingerprints)
    ? manifest.evidenceItemFingerprints
    : [];
  const compared = isPlainObject(comparison)
    && isPlainObject(comparison.evidenceItemComparison)
    && Array.isArray(comparison.evidenceItemComparison.items)
    ? comparison.evidenceItemComparison.items
    : [];
  if (!fingerprints.length && !compared.length) return "";
  const comparisonByOrdinal = new Map(compared.map((item) => [item.ordinal, item]));
  const rows = fingerprints.slice(0, 24).map((item) => {
    const comparedItem = comparisonByOrdinal.get(item.ordinal) || {};
    const markers = engineerParityMarkersHtml(item.semanticMarkers);
    return `
      <li>
        <strong>Item ${escapeHtml(String(item.ordinal || "unknown"))}: ${escapeHtml(parityStateText(comparedItem.status))}</strong>
        <dl class="engineer-workflow-grid">
          <div><dt>Type</dt><dd>${escapeHtml(safeText(item.evidenceType))}</dd></div>
          <div><dt>Category</dt><dd>${escapeHtml(safeText(item.category))}</dd></div>
          <div><dt>Content chars</dt><dd>${escapeHtml(String(Number.isInteger(item.contentCharCount) ? item.contentCharCount : "unknown"))}</dd></div>
          <div><dt>Content digest</dt><dd><code>${escapeHtml(safeText(item.contentDigest))}</code></dd></div>
          <div><dt>Path digest</dt><dd><code>${escapeHtml(safeText(item.pathDigest))}</code></dd></div>
          <div><dt>SourceRef count</dt><dd>${escapeHtml(String(Number.isInteger(item.sourceRefCount) ? item.sourceRefCount : "unknown"))}</dd></div>
          <div><dt>SourceRef digest</dt><dd><code>${escapeHtml(safeText(item.sourceRefDigest))}</code></dd></div>
        </dl>
        ${markers}
      </li>
    `;
  }).join("");
  return `
    <div class="engineer-need-identity-block">
      <h4>Evidence item fingerprints</h4>
      <ol class="engineer-trace-list">${rows}</ol>
    </div>
  `;
}

function engineerFinalizationParityHtml(packet) {
  if (!isPlainObject(packet)) return "";
  const manifest = isPlainObject(packet.finalizationParityManifest) ? packet.finalizationParityManifest : null;
  const comparison = isPlainObject(packet.finalizationParityComparison) ? packet.finalizationParityComparison : null;
  if (!manifest && !comparison) return "";
  const aggregate = comparison ? parityStateText(comparison.comparisonStatus) : "unavailable";
  const allSections = comparison && typeof comparison.allSectionsMatch === "boolean" ? boolText(comparison.allSectionsMatch) : "no";
  const unavailable = comparison && Array.isArray(comparison.unavailableSections) && comparison.unavailableSections.length
    ? comparison.unavailableSections.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")
    : "none";
  const differing = comparison && Array.isArray(comparison.differingSections) && comparison.differingSections.length
    ? comparison.differingSections.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")
    : "none";
  return `
    <div class="engineer-need-identity">
      <h4>Finalization parity</h4>
      ${engineerParityBaselineHtml(manifest || {}) || "<p>Finalization parity diagnostics unavailable.</p>"}
      <dl class="engineer-workflow-grid">
        <div><dt>Aggregate</dt><dd>${escapeHtml(aggregate)}</dd></div>
        <div><dt>All sections match</dt><dd>${escapeHtml(allSections)}</dd></div>
        <div><dt>Unavailable sections</dt><dd>${unavailable}</dd></div>
        <div><dt>Differing sections</dt><dd>${differing}</dd></div>
      </dl>
      <div class="engineer-need-identity-block">
        <h4>Section comparison</h4>
        <dl class="engineer-workflow-grid">
          ${engineerParityStateRowsHtml(comparison || {})}
        </dl>
      </div>
      ${engineerParityProviderConfigHtml(manifest || {})}
      ${engineerParityMarkersHtml(manifest && manifest.task1SemanticMarkers)}
      ${engineerParityEvidenceItemsHtml(manifest || {}, comparison || {})}
    </div>
  `;
}

function engineerWorkflowStatusHtml(workflow) {
  if (!workflow.current) return "";
  const current = workflow.current;
  const status = engineerWorkflowIsTerminal(current)
    ? engineerResultStatusCopy(current.resumeResponse || current.approvalResponse || current)
    : workflow.actionStatus || engineerResultStatusCopy(current.approvalResponse || current);
  const parity = isEngineerDebugOn() ? engineerFinalizationParityHtml(current.resumeResponse) : "";
  const selectedEvidence = isEngineerDebugOn() ? engineerSelectedEvidenceDiagnosticHtml(current.resumeResponse) : "";
  const compactEvidence = isEngineerDebugOn() ? "" : engineerCompactWorkflowEvidenceHtml(current);
  return `
    <section class="engineer-workflow-card">
      <div class="engineer-workflow-card-header">
        <div>
          <p class="prime-message-role">Engineer read workflow</p>
          <h3>${escapeHtml(status)}</h3>
          <p class="meta">Approval allows one bounded repository read. Resume continues the governed workflow using only that approved read.</p>
        </div>
        <span class="engineer-status-pill">${escapeHtml(current.lifecycleState || current.resumeStatus || "pending")}</span>
      </div>
      ${compactEvidence}
      ${parity}
      ${selectedEvidence}
    </section>
  `;
}

function engineerApprovalPanelHtml(workflow) {
  const current = workflow.current;
  if (!current) return "";
  const actionable = current.canonicalStateUnavailable !== true;
  const awaiting = actionable && current.lifecycleState === "awaiting_approval";
  const approved = actionable && current.lifecycleState === "approved";
  if (!awaiting && !approved) return "";
  const operation = firstOrUnknown(current.requestedOperations);
  const reason = firstOrUnknown(current.requestReasons);
  const busy = Boolean(workflow.inFlightAction);
  const approvalButtons = awaiting
    ? `
        <button id="engineerApproveReadButton" type="button"${busy ? " disabled" : ""}>Approve once</button>
        <button id="engineerDenyReadButton" class="secondary" type="button"${busy ? " disabled" : ""}>Deny</button>
      `
    : "";
  const resumeButton = approved
    ? `<button id="engineerResumeReadButton" type="button"${busy || current.resumeSubmitted ? " disabled" : ""}>Resume approved Engineer workflow</button>`
    : "";
  return `
    <section class="engineer-workflow-card engineer-approval-card">
      <div class="engineer-workflow-card-header">
        <div>
          <p class="prime-message-role">Attention required</p>
          <h3>Engineer needs repository evidence</h3>
        </div>
        <span class="engineer-status-pill">${escapeHtml(current.capabilityRequested || "read")}</span>
      </div>
      <dl class="engineer-workflow-grid">
        <div><dt>Repository</dt><dd>${escapeHtml(current.repositoryName)}</dd></div>
        <div><dt>Operation</dt><dd>${escapeHtml(operation)}</dd></div>
        <div><dt>Paths</dt>${engineerRequestedPathsHtml(current.requestedPaths)}</div>
        <div><dt>Reason</dt><dd>${escapeHtml(reason)}</dd></div>
        <div><dt>Expected HEAD</dt><dd>${escapeHtml(current.expectedHeadCandidate)}</dd></div>
        <div><dt>Expires</dt><dd>${escapeHtml(current.expiresAt)}</dd></div>
      </dl>
      <div class="engineer-authority-copy">
        <p><strong>Approval allows:</strong> one bounded approved repository read.</p>
        <p><strong>Approval does not allow:</strong></p>
        ${engineerSafetyListHtml()}
      </div>
      <div class="engineer-workflow-actions">
        ${approvalButtons}
        ${resumeButton}
      </div>
      ${approved ? '<p class="meta">Resume continues the workflow using only the approved repository read. It does not expand authority.</p>' : ""}
    </section>
  `;
}

function engineerTraceHtml(workflow) {
  const current = workflow.current;
  if (!engineerWorkflowHasActiveWork(current)) return "";
  const entries = workflow.trace && Array.isArray(workflow.trace.entries) ? workflow.trace.entries : [];
  const currentStage = workflow.trace && workflow.trace.currentStage ? workflow.trace.currentStage : "waiting_for_approval";
  if (!isEngineerDebugOn()) {
    return `
      <section class="engineer-workflow-card">
        <div class="engineer-workflow-card-header">
          <div>
            <p class="prime-message-role">Engineer progress</p>
            <h3>${escapeHtml(engineerTraceLabel(currentStage))}</h3>
          </div>
          <span class="engineer-status-pill">${escapeHtml(current.lifecycleState || "pending")}</span>
        </div>
      </section>
    `;
  }
  const rows = entries.length ? entries.map((entry) => `
    <li>
      <strong>${escapeHtml(engineerTraceLabel(entry.stage))}</strong>
      <span>${escapeHtml(entry.activity || "")}</span>
      <details>
        <summary>Details</summary>
        <dl class="engineer-workflow-grid">
          <div><dt>Stage</dt><dd>${escapeHtml(entry.stage || "unknown")}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(entry.createdAt || "unknown")}</dd></div>
          <div><dt>Next step</dt><dd>${escapeHtml(entry.nextStep || "none")}</dd></div>
        </dl>
      </details>
    </li>
  `).join("") : `<li><strong>${escapeHtml(engineerTraceLabel(currentStage))}</strong><span>Trace will update as the workflow moves.</span></li>`;
  return `
    <section class="engineer-workflow-card">
      <div class="engineer-workflow-card-header">
        <div>
          <p class="prime-message-role">Working Trace</p>
          <h3>${escapeHtml(engineerTraceLabel(currentStage))}</h3>
        </div>
        <button id="engineerRefreshTraceButton" class="secondary" type="button"${workflow.inFlightAction ? " disabled" : ""}>Refresh trace</button>
      </div>
      <ol class="engineer-trace-list">${rows}</ol>
      <p class="meta">Trace shows workflow stages only. It does not expose hidden model reasoning.</p>
    </section>
  `;
}

function engineerSteeringHtml(workflow) {
  const current = workflow.current;
  if (!current) return "";
  if (!isEngineerDebugOn()) return "";
  const terminal = engineerWorkflowIsTerminal(current);
  if (terminal || current.lifecycleState !== "approved") return "";
  const busy = Boolean(workflow.inFlightAction);
  const directives = workflow.steering && Array.isArray(workflow.steering.directives) ? workflow.steering.directives : [];
  const directiveRows = directives.length ? directives.map((directive) => `
    <li>
      <strong>${escapeHtml(engineerResultStatusCopy(directive))}</strong>
      <span>${escapeHtml(directive.directiveType || "unknown")} (${escapeHtml(String(directive.operatorTextChars || 0))} chars)</span>
    </li>
  `).join("") : `<li><strong>No Steering submitted</strong><span>Steering can guide the next continuation checkpoint.</span></li>`;
  return `
    <section class="engineer-workflow-card">
      <div>
        <p class="prime-message-role">Steering</p>
        <h3>Guide the next Engineer checkpoint</h3>
        <p class="meta">Steering is not arbitrary live interruption and does not independently authorize execution.</p>
      </div>
      <form id="engineerSteeringForm" class="engineer-steering-form">
        <label>
          <span>Steering type</span>
          <select id="engineerSteeringType"${terminal || busy ? " disabled" : ""}>
            ${ENGINEER_NORMAL_STEERING_TYPES.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")}
            <option value="${ENGINEER_ADVANCED_STEERING_TYPE}">Advanced: Execution scope change</option>
          </select>
        </label>
        <label>
          <span>Instruction</span>
          <textarea id="engineerSteeringText" maxlength="1000" placeholder="Give Engineer a bounded instruction for the next continuation."${terminal || busy ? " disabled" : ""}></textarea>
        </label>
        <fieldset id="engineerScopeFields" class="engineer-scope-fields" hidden>
          <legend>Additional scope request</legend>
          <label>
            <span>Operation</span>
            <select id="engineerScopeOperation">
              <option value="read_text_file">read_text_file</option>
              <option value="list_directory">list_directory</option>
            </select>
          </label>
          <label>
            <span>Repository</span>
            <input id="engineerScopeRepository" type="text" value="${escapeHtml(current.repositoryName)}" />
          </label>
          <label>
            <span>Path</span>
            <input id="engineerScopePath" type="text" placeholder="repo-relative/path" />
          </label>
          <p class="meta">Requesting additional repository scope requires new approval. It does not widen the existing grant.</p>
        </fieldset>
        <div class="engineer-workflow-actions">
          <button id="engineerSubmitSteeringButton" type="submit"${terminal || busy ? " disabled" : ""}>Submit Steering</button>
          <button id="engineerRefreshSteeringButton" class="secondary" type="button"${busy ? " disabled" : ""}>Refresh Steering</button>
        </div>
      </form>
      <ol class="engineer-trace-list">${directiveRows}</ol>
    </section>
  `;
}

function engineerErrorHtml(workflow) {
  if (!workflow.lastError) return "";
  const packet = engineerResponsePayload(workflow.lastError.responseData || workflow.lastError.backendDetail || {});
  if (isPlainObject(packet) && workflow.lastError.responseReceived === false) {
    packet.responseReceived = false;
  }
  const message = typeof packet === "string" ? packet : safeText(packet.reason || packet.failure || packet.status || packet.classification, "The backend returned an error.");
  const execution = typeof packet === "string" ? "No execution is proven by the returned evidence." : engineerExecutionKnownCopy(packet);
  const next = typeof packet === "string" ? "Review the request before trying again." : engineerNextStepCopy(packet);
  const diagnostics = isEngineerDebugOn() ? engineerRefinementDiagnosticsHtml(packet) : "";
  const providerFailureDiagnostic = isEngineerDebugOn() ? engineerProviderFailureDiagnosticHtml(packet) : "";
  const needIdentity = isEngineerDebugOn() ? engineerRefinementNeedIdentityHtml(packet) : "";
  const selectedEvidence = isEngineerDebugOn() ? engineerSelectedEvidenceDiagnosticHtml(packet) : "";
  const mappingDiagnostic = isEngineerDebugOn() ? engineerEvidenceNeedMappingDiagnosticHtml(packet) : "";
  const parity = isEngineerDebugOn() ? engineerFinalizationParityHtml(packet) : "";
  return `
    <section class="engineer-workflow-card engineer-workflow-error" role="alert">
      <p class="prime-message-role">Engineer workflow issue</p>
      <h3>${escapeHtml(message)}</h3>
      ${diagnostics}
      ${providerFailureDiagnostic}
      ${needIdentity}
      ${selectedEvidence}
      ${mappingDiagnostic}
      ${parity}
      <p>${escapeHtml(execution)}</p>
      <p class="meta">${escapeHtml(next)}</p>
    </section>
  `;
}

function d1aEngineerWorkflowHtml() {
  const workflow = engineerCurrentWorkflow();
  if (!workflow.current && !workflow.lastError) return "";
  return `
    ${engineerWorkflowStatusHtml(workflow)}
    ${engineerErrorHtml(workflow)}
    ${engineerApprovalPanelHtml(workflow)}
    ${engineerTraceHtml(workflow)}
    ${engineerSteeringHtml(workflow)}
    ${isEngineerDebugOn() ? engineerSessionLimitsHtml(workflow) : ""}
  `;
}

function engineerSessionLimitsHtml(workflow) {
  const current = workflow.current;
  const shouldShow = Boolean(workflow.lastError)
    || (current && current.canonicalStateUnavailable === true)
    || engineerWorkflowHasActiveWork(current);
  if (!shouldShow) return "";
  return `
    <details class="engineer-session-limits">
      <summary>Session limits</summary>
      <p>Backend pending approval/work state is process-local and may not be durably discoverable after state loss.</p>
      <p>No grants, execution envelopes, raw source contents, provider prompts, credentials, or continuity writes are stored by this UI.</p>
    </details>
  `;
}

function d1aRefreshEngineerWorkflowDisplay() {
  const container = document.getElementById("engineerGovernedWorkflow");
  if (!container) return;
  const html = activeRole === "engineer" ? d1aEngineerWorkflowHtml().trim() : "";
  container.hidden = !html;
  container.innerHTML = html;
  if (!html) return;
  d1aAttachEngineerWorkflowHandlers();
}

function engineerApprovalPath(action) {
  const current = engineerCurrentWorkflow().current;
  if (!current || !current.pendingApprovalId) return "";
  return `/admin/engineer-pending-read-approval/${encodeURIComponent(current.pendingApprovalId)}/${action}`;
}

async function refreshEngineerTrace(sessionRevision = currentOperatorSessionRevision()) {
  const workflow = engineerCurrentWorkflow();
  const current = workflow.current;
  if (!current || !current.workItemId) return;
  const trace = await renderFetch(`/admin/engineer-working-trace/${encodeURIComponent(current.workItemId)}`, { sessionRevision });
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  workflow.trace = trace;
}

async function refreshEngineerApprovalDetails(sessionRevision = currentOperatorSessionRevision()) {
  const workflow = engineerCurrentWorkflow();
  const current = workflow.current;
  if (!current || !current.pendingApprovalId) return;
  const result = await renderFetch(`/admin/engineer-pending-read-approval/${encodeURIComponent(current.pendingApprovalId)}`, { sessionRevision });
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  mergeEngineerApprovalDetails(current, result);
}

function markEngineerCanonicalStateUnavailable(error) {
  const workflow = engineerCurrentWorkflow();
  if (!workflow.current) return;
  workflow.current.canonicalStateUnavailable = true;
  workflow.current.lifecycleState = "canonical_state_unavailable";
  workflow.current.resumeSubmitted = Boolean(workflow.current.resumeSubmitted);
  workflow.actionStatus = "Canonical approval state is unavailable.";
  workflow.lastError = error;
}

async function refreshEngineerSteering(sessionRevision = currentOperatorSessionRevision()) {
  const workflow = engineerCurrentWorkflow();
  const current = workflow.current;
  if (!current || !current.workItemId) return;
  const steering = await renderFetch(`/admin/engineer-work/${encodeURIComponent(current.workItemId)}/steering`, { sessionRevision });
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  workflow.steering = steering;
}

async function refreshEngineerPostResumeState(sessionRevision = currentOperatorSessionRevision()) {
  const workflow = engineerCurrentWorkflow();
  try {
    await refreshEngineerTrace(sessionRevision);
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (!workflow.lastError) workflow.lastError = error;
  }
  try {
    await refreshEngineerSteering(sessionRevision);
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (!workflow.lastError) workflow.lastError = error;
  }
  if (activeRole === "engineer" && isOperator && isCurrentOperatorSessionRevision(sessionRevision)) {
    await refreshLocalEngineerDeviceStatus({
      connectAttemptId: localEngineerPairingState.connectAttemptId,
      stateRevision: localEngineerPairingState.stateRevision,
      readinessConvergence: false,
      sessionRevision,
    });
  }
}

async function runEngineerWorkflowAction(actionName, fn) {
  const sessionRevision = currentOperatorSessionRevision();
  const workflow = engineerCurrentWorkflow();
  workflow.inFlightAction = actionName;
  workflow.lastError = null;
  d1aRefreshEngineerWorkflowDisplay();
  try {
    await fn(workflow, sessionRevision);
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.lastError = error;
    const responseData = error && error.responseData ? engineerResponsePayload(error.responseData) : null;
    if (responseData && workflow.current) {
      workflow.current.resumeResponse = responseData;
      workflow.current.resumeStatus = responseData.status || "";
      workflow.actionStatus = engineerResultStatusCopy(responseData);
    } else if (actionName === "resume" && workflow.current) {
      workflow.current.resumeSubmitted = true;
      workflow.actionStatus = "Resume result is ambiguous. Do not retry automatically.";
    }
  } finally {
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.inFlightAction = "";
    if (actionName === "resume") {
      await refreshEngineerPostResumeState(sessionRevision);
    }
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    d1aRefreshEngineerWorkflowDisplay();
  }
}

async function approveEngineerPendingRead() {
  await runEngineerWorkflowAction("approve", async (workflow, sessionRevision) => {
    const current = workflow.current;
    const result = await renderPostNoBody(engineerApprovalPath("approve"), { sessionRevision });
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.current.lifecycleState = result.lifecycleState || workflow.current.lifecycleState;
    workflow.current.canonicalStateUnavailable = false;
    workflow.current.approvalResponse = result;
    workflow.actionStatus = engineerResultStatusCopy(result);
    await refreshEngineerTrace(sessionRevision);
  });
}

async function denyEngineerPendingRead() {
  await runEngineerWorkflowAction("deny", async (workflow, sessionRevision) => {
    const current = workflow.current;
    const result = await renderPostNoBody(engineerApprovalPath("deny"), { sessionRevision });
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.current.lifecycleState = result.lifecycleState || "denied";
    workflow.current.canonicalStateUnavailable = false;
    workflow.current.approvalResponse = result;
    workflow.actionStatus = engineerResultStatusCopy(result);
    await refreshEngineerTrace(sessionRevision);
  });
}

async function resumeEngineerPendingRead() {
  engineerCurrentWorkflow().actionStatus = "Approved execution in progress.";
  await runEngineerWorkflowAction("resume", async (workflow, sessionRevision) => {
    workflow.current.resumeSubmitted = true;
    const result = await renderPostNoBody(engineerApprovalPath("resume"), { sessionRevision });
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.current.resumeResponse = result;
    workflow.current.resumeStatus = result.status || "";
    workflow.current.lifecycleState = result.workItemLifecycle || workflow.current.lifecycleState;
    workflow.actionStatus = engineerResultStatusCopy(result);
    await refreshEngineerTrace(sessionRevision);
    await refreshEngineerSteering(sessionRevision);
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (result.answer) {
      const evidenceHtml = result.engineerResponse ? roleEvidenceHtml(result.engineerResponse, "Engineer") : "";
      appendPrimeMessage("assistant", result.answer, evidenceHtml, "Engineer", {
        persist: true,
        evidencePacket: result.engineerResponse || null,
        evidenceRole: "Engineer",
      });
      engineerConversationHistory.push({ role: "engineer", content: result.answer });
    }
  });
}

async function submitEngineerSteering(event) {
  event.preventDefault();
  const type = document.getElementById("engineerSteeringType");
  const text = document.getElementById("engineerSteeringText");
  if (!type || !text || !text.value.trim()) return;
  await runEngineerWorkflowAction("steering", async (workflow, sessionRevision) => {
    const payload = {
      directiveType: type.value,
      text: text.value.trim(),
      pendingApprovalId: workflow.current.pendingApprovalId,
    };
    if (type.value === ENGINEER_ADVANCED_STEERING_TYPE) {
      const operation = document.getElementById("engineerScopeOperation");
      const repository = document.getElementById("engineerScopeRepository");
      const path = document.getElementById("engineerScopePath");
      payload.executionScopeRequest = {
        operation: operation ? operation.value : "read_text_file",
        repositoryName: repository ? repository.value.trim() : workflow.current.repositoryName,
        path: path ? path.value.trim() : "",
      };
    }
    const result = await renderPost(`/admin/engineer-work/${encodeURIComponent(workflow.current.workItemId)}/steering`, payload, { sessionRevision });
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    workflow.actionStatus = engineerResultStatusCopy(result);
    await refreshEngineerSteering(sessionRevision);
    await refreshEngineerTrace(sessionRevision);
  });
}

function toggleEngineerScopeFields() {
  const type = document.getElementById("engineerSteeringType");
  const fields = document.getElementById("engineerScopeFields");
  if (type && fields) fields.hidden = type.value !== ENGINEER_ADVANCED_STEERING_TYPE;
}

function d1aAttachEngineerWorkflowHandlers() {
  const approve = document.getElementById("engineerApproveReadButton");
  const deny = document.getElementById("engineerDenyReadButton");
  const resume = document.getElementById("engineerResumeReadButton");
  const refreshTrace = document.getElementById("engineerRefreshTraceButton");
  const refreshSteering = document.getElementById("engineerRefreshSteeringButton");
  const form = document.getElementById("engineerSteeringForm");
  const type = document.getElementById("engineerSteeringType");
  if (approve) approve.addEventListener("click", approveEngineerPendingRead);
  if (deny) deny.addEventListener("click", denyEngineerPendingRead);
  if (resume) resume.addEventListener("click", resumeEngineerPendingRead);
  if (refreshTrace) refreshTrace.addEventListener("click", () => runEngineerWorkflowAction("trace", (_workflow, sessionRevision) => refreshEngineerTrace(sessionRevision)));
  if (refreshSteering) refreshSteering.addEventListener("click", () => runEngineerWorkflowAction("steeringRefresh", (_workflow, sessionRevision) => refreshEngineerSteering(sessionRevision)));
  if (form) form.addEventListener("submit", submitEngineerSteering);
  if (type) {
    type.addEventListener("change", toggleEngineerScopeFields);
    toggleEngineerScopeFields();
  }
}

async function captureEngineerPendingRead(packet, sessionRevision = currentOperatorSessionRevision()) {
  const workflow = engineerCurrentWorkflow();
  workflow.current = normalizeEngineerReadWorkflow(packet);
  workflow.trace = null;
  workflow.steering = null;
  workflow.actionStatus = "Waiting for your approval.";
  workflow.lastError = null;
  try {
    await refreshEngineerApprovalDetails(sessionRevision);
    await refreshEngineerTrace(sessionRevision);
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    markEngineerCanonicalStateUnavailable(error);
  }
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  d1aRefreshEngineerWorkflowDisplay();
}

function resetEngineerWorkflowForFreshObjective() {
  const workflow = engineerCurrentWorkflow();
  if (!workflow.current && !workflow.trace && !workflow.steering && !workflow.lastError) return;
  d1aWorkspaceState.engineerWorkflow = createEmptyEngineerWorkflowState();
  d1aRefreshEngineerWorkflowDisplay();
}

function renderPrimeHome(_report) {
  renderRoleActivationWorkspace({ resetConversation: true });
}

function appendPrimeMessage(role, message, evidenceHtml = "", assistantLabel = "Prime", options = {}) {
  const conversation = document.getElementById("primeConversation");
  if (!conversation) return null;
  const article = document.createElement("article");
  article.className = `prime-message ${role === "user" ? "user" : "assistant"}`;
  if (options.extraClass) article.classList.add(options.extraClass);
  if (role === "assistant") {
    const label = document.createElement("div");
    label.className = "prime-message-role";
    label.textContent = assistantLabel;
    article.appendChild(label);
  }
  const body = document.createElement("p");
  body.textContent = message;
  article.appendChild(body);
  if (evidenceHtml) {
    const evidence = document.createElement("div");
    evidence.innerHTML = evidenceHtml;
    article.appendChild(evidence);
  }
  conversation.appendChild(article);
  conversation.scrollTop = conversation.scrollHeight;
  if (options.persist) {
    roleWorkspaceTranscript.push({
      role,
      message,
      evidenceHtml,
      assistantLabel,
      extraClass: options.extraClass || "",
      evidencePacket: options.evidencePacket || null,
      evidenceRole: options.evidenceRole || assistantLabel,
    });
  }
  return article;
}

function initializeRoleWorkspaceState({ resetConversation = false } = {}) {
  if (!resetConversation && roleWorkspaceInitialized) return;
  primeConversationHistory = [];
  mirrorConversationHistory = [];
  engineerConversationHistory = [];
  roleWorkspaceTranscript = [];
  activeRole = "prime";
  d1aWorkspaceState = createEmptyD1AWorkspaceState();
  roleWorkspaceInitialized = true;
}

function renderRoleWorkspaceTranscript() {
  roleWorkspaceTranscript.forEach((entry) => {
    const evidenceHtml = entry.evidencePacket
      ? roleEvidenceHtml(entry.evidencePacket, entry.evidenceRole || entry.assistantLabel)
      : entry.evidenceHtml;
    appendPrimeMessage(entry.role, entry.message, evidenceHtml, entry.assistantLabel, {
      extraClass: entry.extraClass,
      persist: false,
    });
  });
}

function primeEvidenceList(items) {
  if (!Array.isArray(items) || !items.length) return "unknown";
  return `<ul>${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
}

function engineerGrantStatusText(status) {
  const value = typeof status === "string" && status.trim() ? status.trim() : "unknown";
  const labels = {
    repository_read_not_requested: "not requested",
    repository_observation_completed_no_repository_read: "repository observation only",
    generated_frontend_observation_completed_no_repository_read: "generated observation only",
    generated_and_deployment_observation_completed_no_repository_read: "generated and deployment observation only",
    deployment_observation_completed_no_repository_read: "deployment observation only",
    governed_repository_read_not_yet_approved: "approval required",
    read_approval_required: "approval required",
    governed_repository_read_approved: "approved",
    governed_repository_read_completed: "read completed",
    repository_read_status_unavailable: "unavailable",
    repository_read_status_unknown: "unknown",
    unknown: "unknown",
  };
  return labels[value] || value;
}

function engineerCompactEvidenceRows(packet) {
  const execution = isPlainObject(packet && packet.executionIdentity) ? packet.executionIdentity : {};
  const context = isPlainObject(packet && packet.contextEvidence) ? packet.contextEvidence : {};
  const readiness = isPlainObject(packet && packet.engineerImplementationReadinessPacket) ? packet.engineerImplementationReadinessPacket : null;
  const readinessAccess = readiness && isPlainObject(readiness.projectAccessRequirements) ? readiness.projectAccessRequirements : {};
  const readinessBoundary = readiness && isPlainObject(readiness.boundaryConfirmation) ? readiness.boundaryConfirmation : {};
  const rows = [
    ["Execution route", execution.executionRoute || "unknown"],
    ["Provider", execution.providerIdentity || "unknown"],
    ["Timestamp", execution.executionTimestamp || "unknown"],
    ["Engineer context", context.contextPacketIdentity || "unknown"],
    ["Context accepted", context.engineerContextPacketAccepted === true || context.roleContextPacketAccepted === true ? "yes" : "unknown"],
  ];
  if (readiness) {
    rows.push(
      ["Repository access", engineerGrantStatusText(readinessAccess.grantStatus)],
      ["Project work done", readinessBoundary.projectFilesRead === false && readinessBoundary.filesEdited === false && readinessBoundary.commandsRun === false ? "no" : "unknown"],
      ["Commit / push / deploy", readinessBoundary.committed === false && readinessBoundary.pushed === false && readinessBoundary.deployed === false ? "not authorized" : "unknown"],
    );
  }
  return rows;
}

function engineerCompactWorkflowEvidenceHtml(current) {
  if (!current) return "";
  const rows = [
    ["Repository", current.repositoryName],
    ["Operation", firstOrUnknown(current.requestedOperations)],
    ["Paths", safeList(current.requestedPaths).join(", ") || "unknown"],
    ["Expected HEAD", current.expectedHeadCandidate],
    ["Branch", current.approvedBranchCandidate],
    ["Authority", current.grantCreated === true ? "created after approval" : "not created yet"],
    ["Repository access", current.repositoryAccessPerformed === true ? "performed after approval" : "not performed"],
    ["Continuity", current.continuityWritten === true ? "written" : "not written"],
  ].filter(([, value]) => String(value || "").trim());
  return `
    <dl class="engineer-workflow-grid engineer-compact-evidence">
      ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function engineerCompactEvidenceHtml(packet) {
  const rows = engineerCompactEvidenceRows(packet);
  return `
    <details class="prime-evidence engineer-compact-evidence">
      <summary>Evidence</summary>
      <dl class="prime-evidence-grid">
        ${rows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

function roleEvidenceHtml(packet, assistantLabel = "Prime") {
  if (assistantLabel === "Engineer" && !isEngineerDebugOn()) {
    return engineerCompactEvidenceHtml(packet);
  }
  return primeEvidenceHtml(packet);
}

function primeEvidenceHtml(packet) {
  const execution = packet.executionIdentity || {};
  const context = packet.contextEvidence || {};
  const cost = packet.costPerformanceEvidence || {};
  const size = context.approximateContextSize || {};
  const artifacts = Array.isArray(context.relevantArtifactIds) ? context.relevantArtifactIds : [];
  const exclusions = Array.isArray(context.excludedContextSummary) ? context.excludedContextSummary : [];
  const insufficiency = Array.isArray(context.insufficiencyNotes) ? context.insufficiencyNotes : [];
  const role = packet.role || "Prime";
  const isMirror = role === "Mirror" || context.mirrorContextPacketIncluded === true;
  const isEngineer = role === "Engineer" || context.engineerContextPacketIncluded === true;
  const contextLabel = isMirror ? "Mirror context" : isEngineer ? "Engineer context" : role === "Prime" ? "Prime context" : "Role context";
  const contextAccepted = isMirror
    ? context.mirrorContextPacketAccepted === true || context.roleContextPacketAccepted === true
    : isEngineer
    ? context.engineerContextPacketAccepted === true || context.roleContextPacketAccepted === true
    : context.primeContextPacketAccepted === true || context.roleContextPacketAccepted === true;
  const review = packet.mirrorReviewPacket || null;
  const boundary = review && review.boundaryConfirmation ? review.boundaryConfirmation : {};
  const reviewHtml = review ? `
        <div>
          <dt>Mirror review</dt>
          <dd>${escapeHtml(review.packetId || "present")}</dd>
        </div>
        <div>
          <dt>Source reviewed</dt>
          <dd>${escapeHtml(review.sourceProposalOrClaim || "unknown")}</dd>
        </div>
        <div>
          <dt>Materiality</dt>
          <dd>${escapeHtml(review.materiality || "unknown")}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>${escapeHtml(review.confidence || "unknown")}</dd>
        </div>
        <div>
          <dt>Boundary confirmed</dt>
          <dd>${boundary.engineerAuthorized === false && boundary.memoryWritten === false && boundary.publicBehaviorChanged === false ? "yes" : "unknown"}</dd>
        </div>
  ` : "";
  const readiness = packet.engineerImplementationReadinessPacket || null;
  const readinessAccess = readiness && readiness.projectAccessRequirements ? readiness.projectAccessRequirements : {};
  const readinessBoundary = readiness && readiness.boundaryConfirmation ? readiness.boundaryConfirmation : {};
  const readinessHtml = readiness ? `
        <div>
          <dt>Engineer readiness</dt>
          <dd>${escapeHtml(readiness.packetId || "present")}</dd>
        </div>
        <div>
          <dt>Source context</dt>
          <dd>${escapeHtml(readiness.sourceEngineerContextPacketId || "unknown")}</dd>
        </div>
        <div>
          <dt>Project access grant</dt>
          <dd>${escapeHtml(readinessAccess.sourceGrantId || "unknown")}</dd>
        </div>
        <div>
          <dt>Grant status</dt>
          <dd>${escapeHtml(engineerGrantStatusText(readinessAccess.grantStatus))}</dd>
        </div>
        <div>
          <dt>Project work done</dt>
          <dd>${readinessBoundary.projectFilesRead === false && readinessBoundary.filesEdited === false && readinessBoundary.commandsRun === false ? "no" : "unknown"}</dd>
        </div>
        <div>
          <dt>Commit / push / deploy</dt>
          <dd>${readinessBoundary.committed === false && readinessBoundary.pushed === false && readinessBoundary.deployed === false ? "not authorized" : "unknown"}</dd>
        </div>
  ` : "";
  return `
    <details class="prime-evidence">
      <summary>Evidence</summary>
      <dl class="prime-evidence-grid">
        <div>
          <dt>Execution route</dt>
          <dd>${escapeHtml(execution.executionRoute || "unknown")}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>${escapeHtml(execution.providerIdentity || "unknown")}</dd>
        </div>
        ${executionMetadataDetailsHtml(execution, cost)}
        <div>
          <dt>Timestamp</dt>
          <dd>${escapeHtml(execution.executionTimestamp || "unknown")}</dd>
        </div>
        <div>
          <dt>${contextLabel}</dt>
          <dd>${escapeHtml(context.contextPacketIdentity || "unknown")}</dd>
        </div>
        <div>
          <dt>Context accepted</dt>
          <dd>${contextAccepted ? "yes" : "unknown"}</dd>
        </div>
        ${reviewHtml}
        ${readinessHtml}
        <div>
          <dt>Accepted decisions</dt>
          <dd>${Number.isInteger(context.acceptedDecisionCount) ? context.acceptedDecisionCount : "unknown"}</dd>
        </div>
        <div>
          <dt>Authority tiers</dt>
          <dd>${Number.isInteger(context.authorityTierCount) ? context.authorityTierCount : "unknown"}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>${Number.isInteger(cost.latencyMs) ? `${cost.latencyMs} ms` : "unknown"}</dd>
        </div>
        <div>
          <dt>Context size</dt>
          <dd>${Number.isInteger(size.value) ? `${size.value} ${escapeHtml(size.unit || "characters")}` : "unknown"}</dd>
        </div>
        <div>
          <dt>Token usage</dt>
          <dd>${escapeHtml(cost.tokenUsage || "unknown")}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>${escapeHtml(cost.externalCost || "unknown")}</dd>
        </div>
        <div>
          <dt>Relevant artifacts</dt>
          <dd>${primeEvidenceList(artifacts)}</dd>
        </div>
        <div>
          <dt>Excluded context</dt>
          <dd>${primeEvidenceList(exclusions)}</dd>
        </div>
        <div>
          <dt>Insufficiency notes</dt>
          <dd>${primeEvidenceList(insufficiency)}</dd>
        </div>
      </dl>
    </details>
  `;
}

function executionEvidenceValue(value, fallback = "unknown") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function executionTokenValue(value) {
  if (Number.isInteger(value) && value >= 0) return String(value);
  return executionEvidenceValue(value);
}

function executionUnknownFieldsList(fields) {
  if (!Array.isArray(fields) || !fields.length) return "none";
  return primeEvidenceList(fields);
}

function executionMetadataDetailsHtml(execution, cost) {
  return `
        <div>
          <dt>Configured/requested model</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.configuredRequestedModelIdentity || execution.modelIdentityVersion))}</dd>
        </div>
        <div>
          <dt>Returned runtime model</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.returnedRuntimeModelIdentity, "not captured"))}</dd>
        </div>
        <div>
          <dt>Returned model captured</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.runtimeReturnedModelCaptured, "not captured"))}</dd>
        </div>
        <div>
          <dt>Runtime usage captured</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.runtimeUsageCaptured, "unknown"))}</dd>
        </div>
        <div>
          <dt>Input tokens</dt>
          <dd>${escapeHtml(executionTokenValue(cost.inputTokens ?? execution.inputTokens))}</dd>
        </div>
        <div>
          <dt>Cached input tokens</dt>
          <dd>${escapeHtml(executionTokenValue(cost.cachedInputTokens ?? execution.cachedInputTokens))}</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>${escapeHtml(executionTokenValue(cost.outputTokens ?? execution.outputTokens))}</dd>
        </div>
        <div>
          <dt>Reasoning tokens</dt>
          <dd>${escapeHtml(executionTokenValue(cost.reasoningTokens ?? execution.reasoningTokens))}</dd>
        </div>
        <div>
          <dt>Service tier</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.serviceTier))}</dd>
        </div>
        <div>
          <dt>Service tier captured</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.serviceTierCaptured, "not captured"))}</dd>
        </div>
        <div>
          <dt>Unknown fields</dt>
          <dd>${executionUnknownFieldsList(execution.unknownFields)}</dd>
        </div>
        <div>
          <dt>Raw provider metadata exposed</dt>
          <dd>${escapeHtml(executionEvidenceValue(execution.rawProviderMetadataExposed, "unknown"))}</dd>
        </div>
  `;
}


function roleList(items) {
  if (!Array.isArray(items) || !items.length) return "unknown";
  return `<ul>${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
}

function roleFindingList(findings) {
  if (!Array.isArray(findings) || !findings.length) return "<p>None recorded.</p>";
  return `<ul>${findings.map((finding) => `
    <li>
      <strong>${escapeHtml(finding.findingId || finding.riskId || finding.constraintId || "item")}</strong>
      <p>${escapeHtml(finding.observation || finding.requirement || finding.title || finding.impact || "")}</p>
      <p>${escapeHtml(finding.recommendation || finding.mitigation || finding.enforcement || "")}</p>
    </li>
  `).join("")}</ul>`;
}

function mirrorPacketHtml(report) {
  const execution = report.executionEvidence || {};
  const review = report.mirrorReviewPacket || {};
  const boundary = report.boundary || {};
  return `
    <details class="prime-evidence role-evidence" open>
      <summary>Mirror evidence</summary>
      <dl class="prime-evidence-grid">
        <div><dt>Execution route</dt><dd>${escapeHtml(execution.executionRoute || "unknown")}</dd></div>
        <div><dt>Provider</dt><dd>${escapeHtml(execution.providerIdentity || "unknown")}</dd></div>
        <div><dt>Configured/requested model</dt><dd>${escapeHtml(execution.modelIdentityVersion || "unknown")}</dd></div>
        <div><dt>Returned runtime model</dt><dd>${escapeHtml(execution.returnedRuntimeModelIdentity || "not captured")}</dd></div>
        <div><dt>Timestamp</dt><dd>${escapeHtml(execution.executionTimestamp || "unknown")}</dd></div>
        <div><dt>Source packet</dt><dd>${escapeHtml(review.sourcePrimePlanningPacketId || "unknown")}</dd></div>
        <div><dt>Mirror accepted</dt><dd>${boundary.mirrorOperationalValidationAccepted === true ? "yes" : "no"}</dd></div>
        <div><dt>Engineer allowed</dt><dd>${boundary.engineerMayStart === true ? "yes" : "no"}</dd></div>
        <div><dt>Public behavior</dt><dd>${boundary.publicBehaviorChanged === true ? "changed" : "unchanged"}</dd></div>
      </dl>
      <h3>Findings</h3>
      ${roleFindingList(review.findings)}
      <h3>Outcome</h3>
      ${roleList(report.outcomeEvidence || [])}
    </details>
  `;
}

function engineerPacketHtml(report) {
  const output = report.engineerOutput || {};
  const boundary = report.boundary || {};
  return `
    <details class="prime-evidence role-evidence" open>
      <summary>Engineer evidence</summary>
      <dl class="prime-evidence-grid">
        <div><dt>Workflow</dt><dd>${escapeHtml(report.workflowVersion || "unknown")}</dd></div>
        <div><dt>Mirror accepted</dt><dd>${report.sourceMirrorAccepted === true ? "yes" : "unknown"}</dd></div>
        <div><dt>Engineer is Codex</dt><dd>${boundary.engineerIsCodex === true ? "yes" : "no"}</dd></div>
        <div><dt>Can commit</dt><dd>${boundary.engineerCanCommit === true ? "yes" : "no"}</dd></div>
        <div><dt>Can deploy</dt><dd>${boundary.engineerCanDeploy === true ? "yes" : "no"}</dd></div>
        <div><dt>Public behavior</dt><dd>${boundary.publicBehaviorChanged === true ? "changed" : "unchanged"}</dd></div>
      </dl>
      <h3>Implementation plan</h3>
      ${roleList(output.implementationPlan || [])}
      <h3>Risks</h3>
      ${roleFindingList(output.risks || [])}
    </details>
  `;
}

async function loadMirrorPacket() {
  return renderFetch("/admin/mirror-review-packet-run");
}

async function loadEngineerPacket() {
  return renderFetch("/admin/engineer-workflow");
}

async function sendRoleWorkspaceMessage(role, message, priorMessages = null, sessionRevision = currentOperatorSessionRevision()) {
  const histories = {
    prime: primeConversationHistory,
    mirror: mirrorConversationHistory,
    engineer: engineerConversationHistory,
  };
  return renderPost(d1aRoleEndpoint(role), {
    message,
    priorMessages: Array.isArray(priorMessages) ? priorMessages.slice(-8) : (histories[role] || primeConversationHistory).slice(-8),
    workingContext: d1aWorkingContextValue(d1aWorkspaceState.workingContext),
  }, { sessionRevision });
}

function createLocalEngineerPairingState() {
  return {
    status: "idle",
    message: "",
    deviceStatus: null,
    deviceStatusMessage: "",
    connectAttemptId: 0,
    stateRevision: 0,
    connectInFlight: false,
    disconnectInFlight: false,
    statusRequestId: 0,
    statusInFlight: false,
    statusRefreshTimer: null,
    readinessConvergenceActive: false,
    readinessConvergenceDeadlineMs: 0,
    readinessConvergencePollIndex: 0,
  };
}

function localEngineerPairingFailureText(error) {
  const detail = error && error.backendDetail;
  if (isPlainObject(detail)) {
    return safeText(detail.failure || detail.classification || detail.status || detail.reason, "Request failed.");
  }
  return safeText(error && error.message, "Request failed.");
}

function localEngineerPairingLaunchUrl(challenge, version) {
  if (typeof challenge !== "string" || !challenge.trim()) {
    throw new Error("Local Engineer launch challenge is missing.");
  }
  const params = new URLSearchParams();
  params.set("challenge", challenge);
  params.set("v", typeof version === "string" && version.trim() ? version.trim() : "1");
  return `${LOCAL_ENGINEER_CUSTOM_SCHEME}://connect?${params.toString()}`;
}

function localEngineerPairingAdvanceStateRevision() {
  localEngineerPairingState.stateRevision += 1;
  return localEngineerPairingState.stateRevision;
}

function clearLocalEngineerStatusRefreshTimer() {
  if (!localEngineerPairingState.statusRefreshTimer) return;
  clearTimeout(localEngineerPairingState.statusRefreshTimer);
  localEngineerPairingState.statusRefreshTimer = null;
}

function cancelLocalEngineerReadinessConvergence() {
  clearLocalEngineerStatusRefreshTimer();
  localEngineerPairingState.readinessConvergenceActive = false;
  localEngineerPairingState.readinessConvergenceDeadlineMs = 0;
  localEngineerPairingState.readinessConvergencePollIndex = 0;
}

function resetLocalEngineerPairingState() {
  cancelLocalEngineerReadinessConvergence();
  localEngineerPairingState = createLocalEngineerPairingState();
}

function localEngineerDurableReadinessMessage(readinessState) {
  const state = safeText(readinessState, "");
  if (state === "ready") return "";
  const messages = {
    disabled: "Durable Local Engineer trust is not configured.",
    misconfigured: "Durable Local Engineer trust is misconfigured.",
    not_checked: "Durable Local Engineer trust has not been checked.",
    unavailable: "Durable Local Engineer trust is currently unavailable.",
    unauthorized: "The Local Engineer durable-trust service is not authorized.",
    contract_mismatch: "The Local Engineer durable-trust contract is unavailable or incompatible.",
    security_verification_failed: "Durable Local Engineer trust could not be verified.",
  };
  return messages[state] || "Durable Local Engineer trust status is unavailable.";
}

function localEngineerDurableStatusMessage(status, devices) {
  if (!isPlainObject(status) || status.durableTrustActive !== true) return "";
  const readiness = isPlainObject(status.durableTrust) && isPlainObject(status.durableTrust.readiness)
    ? status.durableTrust.readiness
    : null;
  const readinessState = readiness ? safeText(readiness.state, "") : "";
  if (status.status !== "local_engineer_durable_device_status_returned") {
    return localEngineerDurableReadinessMessage(readinessState) || "Durable Local Engineer trust status is unavailable.";
  }
  const readinessMessage = localEngineerDurableReadinessMessage(readinessState);
  if (readinessMessage) return readinessMessage;
  if (devices.some((device) => device.trustState === "paired")) {
    return "Paired";
  }
  if (devices.some((device) => device.trustState === "revoked")) {
    return "Revoked";
  }
  return "Not paired";
}

function localEngineerConnectionStatusMessage(state) {
  return localEngineerActiveSession(state) ? "Connected" : "Not connected";
}

function localEngineerActionAllowed(state) {
  const status = isPlainObject(state.deviceStatus) ? state.deviceStatus : null;
  if (!status) return true;
  if (status.durableTrustActive !== true) return true;
  const devices = Array.isArray(status.devices) ? status.devices.filter(isPlainObject) : [];
  return devices.some((device) => device.trustState === "paired");
}

function localEngineerCurrentStatusMessage(state) {
  if (state.message) return state.message;
  const status = isPlainObject(state.deviceStatus) ? state.deviceStatus : null;
  if (status) {
    const devices = Array.isArray(status.devices) ? status.devices.filter(isPlainObject) : [];
    const pairings = Array.isArray(status.pairings) ? status.pairings.filter(isPlainObject) : [];
    const durableMessage = localEngineerDurableStatusMessage(status, devices);
    if (durableMessage) {
      if (
        durableMessage === "Paired"
        || durableMessage === "Revoked"
        || durableMessage === "Not paired"
      ) {
        const connection = durableMessage === "Paired" ? localEngineerConnectionStatusMessage(state) : "Not connected";
        return `${durableMessage} — ${connection}`;
      }
      return durableMessage;
    }
    if (status.activationFailure) {
      return "Local Engineer durable-trust activation is invalid.";
    }
    if (status.trustAuthorityMode === "legacy_process_local") {
      if (pairings.length) return "";
      if (state.connectAttemptId > 0) return `Paired — ${localEngineerConnectionStatusMessage(state)}`;
      return "";
    }
  }
  return "";
}

function localEngineerDeviceStatusDetails(state) {
  return state.deviceStatusMessage ? `<p class="meta">${escapeHtml(state.deviceStatusMessage)}</p>` : "";
}

function localEngineerActiveSession(state) {
  const session = localEngineerBoundSession(state);
  if (!session) return null;
  const readiness = isPlainObject(session.localEngineerAdapterReadiness)
    ? session.localEngineerAdapterReadiness
    : {};
  return readiness.available === true && readiness.recentPullObserved === true ? session : null;
}

function localEngineerBoundSession(state) {
  const status = isPlainObject(state.deviceStatus) ? state.deviceStatus : null;
  const sessions = status && Array.isArray(status.localEngineerSessions)
    ? status.localEngineerSessions.filter(isPlainObject)
    : [];
  return sessions.find((entry) => {
    const session = isPlainObject(entry.localEngineerSession) ? entry.localEngineerSession : {};
    const adapter = isPlainObject(entry.localEngineerAdapter) ? entry.localEngineerAdapter : {};
    return session.state === "active" && adapter.state === "active" && typeof session.deviceId === "string";
  }) || null;
}

function localEngineerStatusNeedsReadinessConvergence(state) {
  if (localEngineerActiveSession(state)) return false;
  const status = isPlainObject(state.deviceStatus) ? state.deviceStatus : null;
  if (!status) return true;
  if (status.durableTrustActive === true) {
    const devices = Array.isArray(status.devices) ? status.devices.filter(isPlainObject) : [];
    return devices.some((device) => device.trustState === "paired");
  }
  return status.trustAuthorityMode === "legacy_process_local" && state.connectAttemptId > 0;
}

function localEngineerPairingPanelHtml() {
  const state = localEngineerPairingState;
  const status = localEngineerCurrentStatusMessage(state);
  const heading = status ? `Local Engineer — ${status}` : "Local Engineer";
  const statusDetails = localEngineerDeviceStatusDetails(state);
  const activeSession = localEngineerActiveSession(state);
  const buttonId = activeSession ? "localEngineerDisconnectButton" : "localEngineerConnectButton";
  const buttonText = activeSession ? "Disconnect this Mac" : "Connect this Mac";
  const buttonDisabled = state.connectInFlight || state.disconnectInFlight || state.statusInFlight;
  const showAction = localEngineerActionAllowed(state);
  const actionsHtml = showAction
    ? `
      <div class="local-engineer-actions">
        <button id="${buttonId}" class="local-engineer-connect-button" type="button"${buttonDisabled ? " disabled" : ""}>${buttonText}</button>
      </div>`
    : "";
  return `
    <section class="local-engineer-panel" aria-label="Local Engineer pairing">
      <h3>${escapeHtml(heading)}</h3>
      ${statusDetails}
      ${actionsHtml}
    </section>
  `;
}

function d1aRefreshLocalEngineerPairingDisplay() {
  const container = document.getElementById("localEngineerPairing");
  if (!container) return;
  const html = activeRole === "engineer" ? localEngineerPairingPanelHtml().trim() : "";
  container.hidden = !html;
  container.innerHTML = html;
  if (!html) return;
  d1aAttachLocalEngineerPairingHandlers();
}

async function connectLocalEngineerCompanion() {
  const sessionRevision = currentOperatorSessionRevision();
  const connectAttemptId = localEngineerPairingState.connectAttemptId + 1;
  const stateRevision = localEngineerPairingAdvanceStateRevision();
  cancelLocalEngineerReadinessConvergence();
  localEngineerPairingState.statusRequestId += 1;
  localEngineerPairingState.connectAttemptId = connectAttemptId;
  localEngineerPairingState.connectInFlight = true;
  localEngineerPairingState.statusInFlight = false;
  localEngineerPairingState.message = "";
  d1aRefreshLocalEngineerPairingDisplay();
  try {
    if (!isOperator) {
      throw new Error("Operator access is required.");
    }
    if (!renderOperatorSessionToken) {
      await establishRenderOperatorSession({ sessionRevision });
    }
    const challengeResponse = await renderPostNoBody(LOCAL_ENGINEER_LAUNCH_CHALLENGE_PATH, { sessionRevision });
    if (connectAttemptId !== localEngineerPairingState.connectAttemptId || stateRevision !== localEngineerPairingState.stateRevision || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    const launchUrl = localEngineerPairingLaunchUrl(challengeResponse.launchChallenge, challengeResponse.version);
    window.location.href = launchUrl;
    localEngineerPairingState.message = "";
    startLocalEngineerReadinessConvergence(connectAttemptId, stateRevision, sessionRevision);
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || connectAttemptId !== localEngineerPairingState.connectAttemptId || stateRevision !== localEngineerPairingState.stateRevision || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    cancelLocalEngineerReadinessConvergence();
    localEngineerPairingState.message = localEngineerPairingFailureText(error);
  } finally {
    if (connectAttemptId === localEngineerPairingState.connectAttemptId && isCurrentOperatorSessionRevision(sessionRevision)) {
      localEngineerPairingState.connectInFlight = false;
      d1aRefreshLocalEngineerPairingDisplay();
    }
  }
}

async function disconnectLocalEngineerCompanion() {
  const sessionRevision = currentOperatorSessionRevision();
  const activeSession = localEngineerActiveSession(localEngineerPairingState);
  if (!activeSession) return;
  const session = activeSession.localEngineerSession;
  const stateRevision = localEngineerPairingAdvanceStateRevision();
  cancelLocalEngineerReadinessConvergence();
  localEngineerPairingState.statusRequestId += 1;
  localEngineerPairingState.disconnectInFlight = true;
  localEngineerPairingState.statusInFlight = false;
  localEngineerPairingState.message = "";
  localEngineerPairingState.deviceStatusMessage = "";
  d1aRefreshLocalEngineerPairingDisplay();
  try {
    if (!isOperator) {
      throw new Error("Operator access is required.");
    }
    if (!renderOperatorSessionToken) {
      await establishRenderOperatorSession({ sessionRevision });
    }
    const result = await renderPost(LOCAL_ENGINEER_DISCONNECT_PATH, { deviceId: session.deviceId }, { sessionRevision });
    if (stateRevision !== localEngineerPairingState.stateRevision || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (isPlainObject(result.deviceStatus)) {
      localEngineerPairingState.deviceStatus = result.deviceStatus;
    }
    localEngineerPairingState.message = "";
    localEngineerPairingState.deviceStatusMessage = "";
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || stateRevision !== localEngineerPairingState.stateRevision || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    localEngineerPairingState.message = localEngineerPairingFailureText(error);
    localEngineerPairingState.deviceStatusMessage = "";
  } finally {
    if (stateRevision === localEngineerPairingState.stateRevision && isCurrentOperatorSessionRevision(sessionRevision)) {
      localEngineerPairingState.disconnectInFlight = false;
      d1aRefreshLocalEngineerPairingDisplay();
    }
  }
}

function startLocalEngineerReadinessConvergence(connectAttemptId, stateRevision, sessionRevision = currentOperatorSessionRevision()) {
  localEngineerPairingState.readinessConvergenceActive = true;
  localEngineerPairingState.readinessConvergenceDeadlineMs = Date.now() + LOCAL_ENGINEER_READINESS_CONVERGENCE_WINDOW_MS;
  localEngineerPairingState.readinessConvergencePollIndex = 0;
  scheduleLocalEngineerDeviceStatusRefresh(connectAttemptId, stateRevision, {
    delayMs: LOCAL_ENGINEER_INITIAL_STATUS_REFRESH_DELAY_MS,
    readinessConvergence: true,
    sessionRevision,
  });
}

function scheduleLocalEngineerDeviceStatusRefresh(connectAttemptId, stateRevision, options = {}) {
  clearLocalEngineerStatusRefreshTimer();
  localEngineerPairingState.deviceStatusMessage = "";
  const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0
    ? options.delayMs
    : LOCAL_ENGINEER_INITIAL_STATUS_REFRESH_DELAY_MS;
  localEngineerPairingState.statusRefreshTimer = setTimeout(() => {
    localEngineerPairingState.statusRefreshTimer = null;
    refreshLocalEngineerDeviceStatus({
      connectAttemptId,
      stateRevision,
      readinessConvergence: options.readinessConvergence === true,
      sessionRevision: options.sessionRevision,
    });
  }, delayMs);
}

function maybeContinueLocalEngineerReadinessConvergence(connectAttemptId, stateRevision, sessionRevision = currentOperatorSessionRevision()) {
  if (
    !localEngineerPairingState.readinessConvergenceActive
    || connectAttemptId !== localEngineerPairingState.connectAttemptId
    || stateRevision !== localEngineerPairingState.stateRevision
    || activeRole !== "engineer"
    || !isCurrentOperatorSessionRevision(sessionRevision)
  ) {
    cancelLocalEngineerReadinessConvergence();
    return;
  }
  if (!localEngineerStatusNeedsReadinessConvergence(localEngineerPairingState)) {
    cancelLocalEngineerReadinessConvergence();
    return;
  }
  if (
    Date.now() >= localEngineerPairingState.readinessConvergenceDeadlineMs
    || localEngineerPairingState.readinessConvergencePollIndex >= LOCAL_ENGINEER_READINESS_CONVERGENCE_DELAYS_MS.length
  ) {
    cancelLocalEngineerReadinessConvergence();
    return;
  }
  const delayMs = LOCAL_ENGINEER_READINESS_CONVERGENCE_DELAYS_MS[localEngineerPairingState.readinessConvergencePollIndex];
  localEngineerPairingState.readinessConvergencePollIndex += 1;
  scheduleLocalEngineerDeviceStatusRefresh(connectAttemptId, stateRevision, {
    delayMs,
    readinessConvergence: true,
    sessionRevision,
  });
}

async function refreshLocalEngineerDeviceStatus(options = {}) {
  const sessionRevision = Number.isInteger(options.sessionRevision)
    ? options.sessionRevision
    : currentOperatorSessionRevision();
  const manual = options.manual === true;
  const connectAttemptId = options.connectAttemptId || localEngineerPairingState.connectAttemptId;
  const stateRevision = manual ? localEngineerPairingAdvanceStateRevision() : options.stateRevision || localEngineerPairingState.stateRevision;
  const statusRequestId = localEngineerPairingState.statusRequestId + 1;
  clearLocalEngineerStatusRefreshTimer();
  localEngineerPairingState.statusRequestId = statusRequestId;
  localEngineerPairingState.statusInFlight = true;
  if (manual) {
    localEngineerPairingState.deviceStatusMessage = "Checking Local Engineer device trust status.";
  }
  d1aRefreshLocalEngineerPairingDisplay();
  try {
    if (!isOperator) {
      throw new Error("Operator access is required.");
    }
    if (!renderOperatorSessionToken) {
      await establishRenderOperatorSession({ sessionRevision });
    }
    const status = await renderFetch(LOCAL_ENGINEER_DEVICES_PATH, { sessionRevision });
    if (
      connectAttemptId !== localEngineerPairingState.connectAttemptId
      || stateRevision !== localEngineerPairingState.stateRevision
      || statusRequestId !== localEngineerPairingState.statusRequestId
      || !isCurrentOperatorSessionRevision(sessionRevision)
    ) return;
    localEngineerPairingState.deviceStatus = status;
    localEngineerPairingState.deviceStatusMessage = "";
    localEngineerPairingState.message = "";
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    if (
      connectAttemptId !== localEngineerPairingState.connectAttemptId
      || stateRevision !== localEngineerPairingState.stateRevision
      || statusRequestId !== localEngineerPairingState.statusRequestId
    ) return;
    if (isPlainObject(localEngineerPairingState.deviceStatus)) {
      localEngineerPairingState.deviceStatus = {
        ...localEngineerPairingState.deviceStatus,
        executionSessionActive: false,
        localEngineerSessions: [],
      };
    }
    localEngineerPairingState.deviceStatusMessage = localEngineerPairingFailureText(error);
    localEngineerPairingState.message = "";
  } finally {
    const shouldContinueReadinessConvergence = options.readinessConvergence === true
      && connectAttemptId === localEngineerPairingState.connectAttemptId
      && stateRevision === localEngineerPairingState.stateRevision
      && statusRequestId === localEngineerPairingState.statusRequestId
      && isCurrentOperatorSessionRevision(sessionRevision);
    if (
      connectAttemptId === localEngineerPairingState.connectAttemptId
      && stateRevision === localEngineerPairingState.stateRevision
      && statusRequestId === localEngineerPairingState.statusRequestId
      && isCurrentOperatorSessionRevision(sessionRevision)
    ) {
      localEngineerPairingState.statusInFlight = false;
      d1aRefreshLocalEngineerPairingDisplay();
    }
    if (shouldContinueReadinessConvergence) {
      maybeContinueLocalEngineerReadinessConvergence(connectAttemptId, stateRevision, sessionRevision);
    }
  }
}

function d1aAttachLocalEngineerPairingHandlers() {
  const connect = document.getElementById("localEngineerConnectButton");
  if (connect) connect.addEventListener("click", connectLocalEngineerCompanion);
  const disconnect = document.getElementById("localEngineerDisconnectButton");
  if (disconnect) disconnect.addEventListener("click", disconnectLocalEngineerCompanion);
}

function setActiveRole(role) {
  activeRole = role;
  document.querySelectorAll(".role-activation-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.role === role);
  });
  const primeComposer = document.getElementById("primeComposer");
  const roleHint = document.getElementById("roleWorkspaceHint");
  const input = document.getElementById("primeComposerInput");
  const sendButton = primeComposer ? primeComposer.querySelector(".prime-send-button") : null;
  if (primeComposer) {
    primeComposer.hidden = false;
  }
  if (input) {
    const placeholders = {
      prime: "Ask Prime...",
      mirror: "Ask Mirror...",
      engineer: "Ask Engineer...",
    };
    input.setAttribute("aria-label", `Message ${role.charAt(0).toUpperCase()}${role.slice(1)}`);
    input.placeholder = placeholders[role] || placeholders.prime;
  }
  if (sendButton) {
    const labels = { prime: "Send to Prime", mirror: "Send to Mirror", engineer: "Send to Engineer" };
    sendButton.textContent = labels[role] || "Send";
  }
  if (roleHint) {
    const hints = {
      prime: "",
      mirror: "",
      engineer: "",
    };
    const hint = hints[role] || "";
    roleHint.textContent = hint;
    roleHint.hidden = !hint;
  }
  d1aRefreshEngineerWorkflowDisplay();
  d1aRefreshLocalEngineerPairingDisplay();
  if (role !== "engineer") {
    cancelLocalEngineerReadinessConvergence();
  }
  if (role === "engineer" && isOperator && !localEngineerPairingState.statusInFlight) {
    refreshLocalEngineerDeviceStatus({
      connectAttemptId: localEngineerPairingState.connectAttemptId,
      stateRevision: localEngineerPairingState.stateRevision,
      readinessConvergence: localEngineerPairingState.readinessConvergenceActive,
      sessionRevision: currentOperatorSessionRevision(),
    });
  }
}

function activateMirrorRole() {
  setActiveRole("mirror");
}

function activateEngineerRole() {
  setActiveRole("engineer");
}

function renderRoleActivationWorkspace(options = {}) {
  const container = document.getElementById("primeHomeResults");
  if (!container) return;
  initializeRoleWorkspaceState(options);
  setAccess("Operator access verified. Aion is ready.", "verified");
  container.innerHTML = `
    <div class="prime-working-surface role-activation-surface">
      <div class="role-activation-bar" aria-label="Roles">
        <button class="role-activation-button" type="button" data-role="prime">Prime</button>
        <button class="role-activation-button" type="button" data-role="mirror">Mirror</button>
        <button class="role-activation-button" type="button" data-role="engineer">Engineer</button>
      </div>
      ${d1aWorkspaceFrameHtml()}
      <p id="roleWorkspaceHint" class="prime-composer-hint" hidden></p>
      <div id="primeConversation" class="prime-conversation" aria-live="polite"></div>
      <div id="engineerGovernedWorkflow" class="engineer-governed-workflow" hidden></div>
      <form id="primeComposer" class="prime-composer">
        <textarea id="primeComposerInput" aria-label="Message Prime" placeholder="Ask Prime..."></textarea>
        <div class="prime-composer-actions">
          <button class="prime-send-button" type="submit">Send to Prime</button>
        </div>
      </form>
    </div>
  `;
  renderRoleWorkspaceTranscript();
  d1aAttachWorkspaceHandlers();
  document.querySelectorAll(".role-activation-button").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.role;
      if (role === "prime") {
        setActiveRole("prime");
        return;
      }
      if (role === "mirror") {
        activateMirrorRole();
        return;
      }
      if (role === "engineer") {
        activateEngineerRole();
      }
    });
  });
  setActiveRole(activeRole);
  const form = document.getElementById("primeComposer");
  const input = document.getElementById("primeComposerInput");
  const submitButton = form ? form.querySelector(".prime-send-button") : null;
  if (form && input) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sessionRevision = currentOperatorSessionRevision();
      const role = activeRole || "prime";
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
      const histories = {
        prime: primeConversationHistory,
        mirror: mirrorConversationHistory,
        engineer: engineerConversationHistory,
      };
      const history = histories[role] || primeConversationHistory;
      const priorMessages = history.slice(-8);
      const endpointPath = d1aRoleEndpoint(role);
      const message = input.value.trim();
      if (!message) return;
      if (role === "engineer") {
        resetEngineerWorkflowForFreshObjective();
      }
      appendPrimeMessage("user", message, "", "Prime", { persist: true });
      history.push({ role: "operator", content: message });
      input.value = "";
      input.disabled = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending";
      }
      const pending = appendPrimeMessage("assistant", `${roleLabel} is thinking...`, "", roleLabel);
      if (pending) pending.classList.add("pending");
      try {
        const packet = await sendRoleWorkspaceMessage(role, message, priorMessages, sessionRevision);
        if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
        d1aWorkspaceState.lastRoleSendDiagnostic = d1aBuildRoleSendDiagnostic({
          role,
          endpointPath,
          message,
          priorMessages,
          outcome: "completed",
          responsePacket: packet,
        });
        d1aRefreshDiagnosticDisplay();
        if (pending) pending.remove();
        if (role === "engineer" && packet.status === "read_approval_required") {
          await captureEngineerPendingRead(packet, sessionRevision);
          if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
          const requestSummary = "Engineer needs repository evidence before answering. Review the requested authority below.";
          appendPrimeMessage("assistant", requestSummary, "", roleLabel, { persist: true });
          history.push({ role, content: requestSummary });
          return;
        }
        const answer = packet.answer || `${roleLabel} did not return an answer.`;
        appendPrimeMessage("assistant", answer, roleEvidenceHtml(packet, roleLabel), roleLabel, {
          persist: true,
          evidencePacket: packet,
          evidenceRole: roleLabel,
        });
        history.push({ role, content: answer });
      } catch (error) {
        if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
        if (pending) pending.remove();
        d1aWorkspaceState.lastRoleSendDiagnostic = d1aBuildRoleSendDiagnostic({
          role,
          endpointPath,
          message,
          priorMessages,
          error,
          outcome: "failed",
        });
        d1aRefreshDiagnosticDisplay();
        const detail = d1aRoleFailureCopy(d1aWorkspaceState.lastRoleSendDiagnostic);
        appendPrimeMessage("assistant", `${roleLabel} could not complete that request. ${detail}`, "", roleLabel, { persist: true });
        console.error(`${roleLabel} workspace message failed`, error);
      } finally {
        if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
        input.disabled = false;
        if (submitButton) {
          submitButton.disabled = false;
          const labels = { prime: "Send to Prime", mirror: "Send to Mirror", engineer: "Send to Engineer" };
          submitButton.textContent = labels[activeRole] || "Send";
        }
        input.focus();
      }
    });
  }
}





async function loadPrimeHome(sessionRevision = currentOperatorSessionRevision()) {
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  renderRoleActivationWorkspace({ resetConversation: true });
}

function renderMirrorWorkflow(report) {
  const container = document.getElementById("mirrorWorkflowResults");
  if (!container) return;
  const review = report.phase97Review || {};
  const packet = report.primePlanningPacket || {};
  const scope = report.reviewScope || {};
  const output = report.mirrorOutput || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.workflowVersion || "")} | Source Prime accepted: ${boolText(report.sourcePrimeAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.7 Review</h2>
        <p>${escapeHtml(review.acceptedDirection || "")}</p>
        <ul>
          <li>Accepted: ${boolText(review.phase97Accepted)}</li>
          <li>Sequence: ${escapeHtml((review.recommendedSequence || []).join(" -> "))}</li>
          <li>Visual timing: ${escapeHtml(review.visualRefinementTiming || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Prime Packet</h2>
        <p>${escapeHtml(packet.currentState || "")}</p>
        <ul>
          <li>Approved for Mirror: ${boolText(packet.operatorApprovedForMirror)}</li>
          <li>Memory write approved: ${boolText(packet.canonicalMemoryWriteApproved)}</li>
          <li>Recommended: ${escapeHtml(packet.recommendedNextStep || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Mirror Question</h2>
        <p><strong>${escapeHtml(scope.reviewQuestion || "")}</strong></p>
        <ul>
          <li>Assumptions: ${boolText(scope.reviewsAssumptions)}</li>
          <li>Risks: ${boolText(scope.reviewsRisks)}</li>
          <li>Contradictions: ${boolText(scope.reviewsContradictions)}</li>
          <li>Alternatives: ${boolText(scope.reviewsAlternatives)}</li>
          <li>Decision quality: ${boolText(scope.reviewsDecisionQuality)}</li>
        </ul>
      </div>
    </div>
    <div class="role-grid">
      <article class="role-card">
        <h3>Why Now</h3>
        <ul>${(packet.whyNow || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Changed Since Last Session</h3>
        <ul>${(packet.whatChangedSinceLastSession || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Waiting For Alfonso</h3>
        <ul>${(packet.pendingHumanDecisions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Mirror Findings</h3>
    ${table(
      ["Finding", "Category", "Severity", "Observation", "Prime Revision", "Blocks Engineer"],
      (report.findings || []).map((finding) => `
        <tr>
          <td><strong>${escapeHtml(finding.title || "")}</strong><br><span class="meta">${escapeHtml(finding.findingId || "")}</span></td>
          <td>${escapeHtml(finding.category || "")}</td>
          <td>${escapeHtml(finding.severity || "")}</td>
          <td>${escapeHtml(finding.observation || "")}</td>
          <td>${boolText(finding.requiresPrimeRevision)}</td>
          <td>${boolText(finding.blocksEngineerHandoff)}</td>
        </tr>
      `)
    )}
    <h3>Governed Flow</h3>
    ${table(
      ["Step", "Owner", "Input", "Output", "Approval", "Automatic Transfer"],
      (report.workflowSteps || []).map((step) => `
        <tr>
          <td><strong>${escapeHtml(step.stepName || "")}</strong><br><span class="meta">${escapeHtml(String(step.stepIndex || ""))}</span></td>
          <td>${escapeHtml(step.owner || "")}</td>
          <td>${escapeHtml(step.inputArtifact || "")}</td>
          <td>${escapeHtml(step.outputArtifact || "")}</td>
          <td>${boolText(step.operatorApprovalRequired)}</td>
          <td>${boolText(step.automaticTransferAllowed)}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Mirror Output</h3>
        <p>${escapeHtml(output.summary || "")}</p>
        <ul>
          <li>To Prime: ${escapeHtml(output.recommendationToPrime || "")}</li>
          <li>To Operator: ${escapeHtml(output.recommendationToOperator || "")}</li>
          <li>Implementation authorized: ${boolText(output.implementationAuthorized)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Boundary</h3>
        <ul>
          <li>One Aion: ${boolText(boundary.oneAionIdentityPreserved)}</li>
          <li>Mirror is critique responsibility: ${boolText(boundary.mirrorIsAionCritiqueResponsibility)}</li>
          <li>Independent agent: ${boolText(boundary.mirrorIsIndependentAgent)}</li>
          <li>Autonomous Engineer invoke: ${boolText(boundary.mirrorCanAutonomouslyInvokeEngineer)}</li>
          <li>Provider route changes: ${boolText(boundary.providerRouteChangesEnabled)}</li>
        </ul>
      </article>
    </div>
  `;
}

async function loadMirrorWorkflow() {
  const report = await renderFetch("/admin/mirror-workflow");
  renderMirrorWorkflow(report);
}

function renderEngineerWorkflow(report) {
  const container = document.getElementById("engineerWorkflowResults");
  if (!container) return;
  const acceptance = report.phase98AAcceptance || {};
  const context = report.engineeringContext || {};
  const output = report.engineerOutput || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.workflowVersion || "")} | Source Mirror accepted: ${boolText(report.sourceMirrorAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.8A Accepted</h2>
        <p>${escapeHtml(acceptance.acceptedBaseline || "")}</p>
        <ul>
          <li>Accepted: ${boolText(acceptance.phase98AAccepted)}</li>
          <li>Loop: ${escapeHtml(acceptance.reasoningLoopPrinciple || "")}</li>
          <li>Sequence: ${escapeHtml((acceptance.approvedSequence || []).join(" -> "))}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Engineering Context</h2>
        <p>${escapeHtml(context.objective || "")}</p>
        <ul>
          <li>Prime packet: ${escapeHtml(context.sourcePrimePacketId || "")}</li>
          <li>Mirror packet: ${escapeHtml(context.sourceMirrorPacketId || "")}</li>
          <li>Approved for planning: ${boolText(context.operatorApprovedForEngineerPlanning)}</li>
          <li>Execution approved: ${boolText(context.implementationExecutionApproved)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Provider Boundary</h2>
        <ul>
          <li>Engineer is Aion reasoning: ${boolText(boundary.engineerIsAionReasoningResponsibility)}</li>
          <li>Engineer is Codex: ${boolText(boundary.engineerIsCodex)}</li>
          <li>Codex may be execution route: ${boolText(boundary.codexMayBeExecutionProvider)}</li>
          <li>Provider policy selects route: ${boolText(boundary.providerPolicySelectsExecutionRoute)}</li>
          <li>Engineer selects route: ${boolText(boundary.engineerSelectsProviderRoute)}</li>
        </ul>
      </div>
    </div>
    <h3>Implementation Plan</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Plan</h3>
        <ul>${(output.implementationPlan || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Constraints</h3>
        <ul>${(report.constraints || []).map((constraint) => `
          <li><strong>${escapeHtml(constraint.title || "")}</strong><br><span class="meta">${escapeHtml(constraint.requirement || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Execution Gate</h3>
        <ul>
          <li>Route selected by Engineer: ${boolText(output.executionRouteSelectedByEngineer)}</li>
          <li>Requires operator approval: ${boolText(output.requiresOperatorApprovalBeforeExecution)}</li>
          <li>Implementation authorized: ${boolText(output.implementationAuthorized)}</li>
          <li>Commit authorized: ${boolText(output.commitAuthorized)}</li>
          <li>Deploy authorized: ${boolText(output.deployAuthorized)}</li>
          <li>Memory write approved: ${boolText(output.canonicalMemoryWriteApproved)}</li>
        </ul>
      </article>
    </div>
    <h3>Affected Components</h3>
    ${table(
      ["Component", "Repo", "Surface", "Expected Change", "Public Safe"],
      (output.affectedComponents || []).map((component) => `
        <tr>
          <td><strong>${escapeHtml(component.componentId || "")}</strong></td>
          <td>${escapeHtml(component.repoName || "")}</td>
          <td>${escapeHtml(component.surface || "")}</td>
          <td>${escapeHtml(component.expectedChange || "")}</td>
          <td>${boolText(component.publicRepoSafe)}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Risks</h3>
        <ul>${(output.risks || []).map((risk) => `
          <li><strong>${escapeHtml(risk.title || "")}</strong><br><span class="meta">${escapeHtml(risk.mitigation || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Validation</h3>
        <ul>${(output.validationRequirements || []).map((item) => `
          <li><strong>${escapeHtml(item.requirementId || "")}</strong><br><span class="meta">${escapeHtml(item.purpose || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Rollback</h3>
        <ul>${(output.rollbackConsiderations || []).map((item) => `
          <li><strong>${escapeHtml(item.scope || "")}</strong><br><span class="meta">${escapeHtml(item.strategy || "")}</span></li>
        `).join("")}</ul>
      </article>
    </div>
    <h3>Governed Flow</h3>
    ${table(
      ["Step", "Owner", "Input", "Output", "Approval", "Executed"],
      (report.workflowSteps || []).map((step) => `
        <tr>
          <td><strong>${escapeHtml(step.stepName || "")}</strong><br><span class="meta">${escapeHtml(String(step.stepIndex || ""))}</span></td>
          <td>${escapeHtml(step.owner || "")}</td>
          <td>${escapeHtml(step.inputArtifact || "")}</td>
          <td>${escapeHtml(step.outputArtifact || "")}</td>
          <td>${boolText(step.operatorApprovalRequired)}</td>
          <td>${boolText(step.executionPerformed)}</td>
        </tr>
      `)
    )}
  `;
}

async function loadEngineerWorkflow() {
  const report = await renderFetch("/admin/engineer-workflow");
  renderEngineerWorkflow(report);
}

function renderCoordinationLoop(report) {
  const container = document.getElementById("coordinationLoopResults");
  if (!container) return;
  const acceptance = report.phase98BAcceptance || {};
  const packet = report.coordinationPacket || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.loopVersion || "")} | Source Engineer accepted: ${boolText(report.sourceEngineerAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.8B Accepted</h2>
        <p>${escapeHtml(acceptance.acceptedBaseline || "")}</p>
        <ul>
          <li>Accepted: ${boolText(acceptance.phase98BAccepted)}</li>
          <li>Engineer boundary: ${boolText(acceptance.engineerBoundaryConfirmed)}</li>
          <li>Engineer is execution provider: ${boolText(acceptance.engineerIsExecutionProvider)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Coordination Packet</h2>
        <p>${escapeHtml(packet.objective || "")}</p>
        <ul>
          <li>Packet: ${escapeHtml(packet.packetId || "")}</li>
          <li>Approval: ${escapeHtml(packet.approvalState || "")}</li>
          <li>Durable artifact: ${boolText(packet.durableArtifact)}</li>
          <li>Transcript required: ${boolText(packet.conversationTranscriptRequired)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>One Aion: ${boolText(boundary.oneAionIdentityPreserved)}</li>
          <li>Roles are responsibilities: ${boolText(boundary.rolesAreResponsibilities)}</li>
          <li>Autonomous workflow engine: ${boolText(boundary.autonomousWorkflowEngineEnabled)}</li>
          <li>Operator authority: ${boolText(boundary.operatorRemainsAuthority)}</li>
          <li>Manual transport required: ${boolText(boundary.manualTransportLayerRequired)}</li>
        </ul>
      </div>
    </div>
    <div class="role-grid">
      <article class="role-card">
        <h3>Context</h3>
        <ul>${(packet.context || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Evidence</h3>
        <ul>${(packet.evidence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Unresolved Questions</h3>
        <ul>${(packet.unresolvedQuestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Governed Handoffs</h3>
    ${table(
      ["Step", "From", "To", "Artifact", "Approval", "Automatic", "Manual Transfer"],
      (report.coordinationSteps || []).map((step) => `
        <tr>
          <td><strong>${escapeHtml(String(step.stepIndex || ""))}</strong><br><span class="meta">${escapeHtml(step.purpose || "")}</span></td>
          <td>${escapeHtml(step.fromRole || "Operator")}</td>
          <td>${escapeHtml(step.toRole || "")}</td>
          <td>${escapeHtml(step.artifact || "")}<br><span class="meta">${escapeHtml(step.approvalState || "")}</span></td>
          <td>${boolText(step.operatorApprovalRequiredBefore)}</td>
          <td>${boolText(step.autonomousTransferAllowed)}</td>
          <td>${boolText(step.manualContextTransferRequired)}</td>
        </tr>
      `)
    )}
    <h3>Cost Awareness</h3>
    ${table(
      ["Option", "Sequence", "Passes", "Use", "Quality Gain", "Review Cost"],
      (report.costOptions || []).map((option) => `
        <tr>
          <td><strong>${escapeHtml(option.optionId || "")}</strong></td>
          <td>${escapeHtml((option.sequence || []).join(" -> "))}</td>
          <td>${escapeHtml(String(option.estimatedReasoningPasses || ""))}</td>
          <td>${escapeHtml(option.expectedUse || "")}</td>
          <td>${escapeHtml(option.qualityGain || "")}</td>
          <td>${boolText(option.costWorthReviewing)}</td>
        </tr>
      `)
    )}
  `;
}

async function loadCoordinationLoop() {
  const report = await renderFetch("/admin/coordination-loop");
  renderCoordinationLoop(report);
}

function approvalKindLabel(kind) {
  if (kind === "recommendationAcceptance") return "Recommendation acceptance";
  if (kind === "workAuthorization") return "Work authorization";
  if (kind === "executionAuthorization") return "Execution authorization";
  return kind || "";
}

function renderApprovalBoundary(report) {
  const container = document.getElementById("approvalBoundaryResults");
  if (!container) return;
  const acceptance = report.phase99Acceptance || {};
  const model = report.approvalModel || {};
  const proposal = report.executionProposal || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.boundaryVersion || "")} | Source Coordination accepted: ${boolText(report.sourceCoordinationAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.9 Accepted</h2>
        <p>${escapeHtml(acceptance.acceptedBaseline || "")}</p>
        <ul>
          <li>Accepted: ${boolText(acceptance.phase99Accepted)}</li>
          <li>Coordination packet confirmed: ${boolText(acceptance.coordinationPacketConfirmed)}</li>
          <li>Conversations are durable state: ${boolText(acceptance.conversationsAreDurableState)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Approval Model</h2>
        <ul>
          <li>Recommendation accepted: ${boolText(model.recommendationAccepted)}</li>
          <li>Work authorized: ${boolText(model.workAuthorized)}</li>
          <li>Execution authorized: ${boolText(model.executionAuthorized)}</li>
          <li>Collapsed approval allowed: ${boolText(model.collapsedApprovalStateAllowed)}</li>
          <li>Fail closed: ${boolText(model.failClosedWithoutExplicitGate)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Execution Proposal</h2>
        <p>${escapeHtml(proposal.proposedAction || "")}</p>
        <ul>
          <li>Packet: ${escapeHtml(proposal.packetId || "")}</li>
          <li>Provider policy selects route: ${boolText(proposal.providerPolicyMustSelectRoute)}</li>
          <li>Role may select route: ${boolText(proposal.roleMaySelectProviderRoute)}</li>
          <li>Execution authorized: ${boolText(proposal.executionAuthorized)}</li>
        </ul>
      </div>
    </div>
    <h3>Separate Approval Gates</h3>
    ${table(
      ["Gate", "Meaning", "Recommendation", "Work", "Execution", "Cannot Imply"],
      (report.approvalGates || []).map((gate) => `
        <tr>
          <td><strong>${escapeHtml(approvalKindLabel(gate.kind))}</strong><br><span class="meta">${escapeHtml(gate.gateId || "")}</span></td>
          <td>${escapeHtml(gate.operatorMeaning || "")}</td>
          <td>${boolText(gate.grantsRecommendationAcceptance)}</td>
          <td>${boolText(gate.grantsWorkAuthorization)}</td>
          <td>${boolText(gate.grantsExecutionAuthorization)}</td>
          <td>${escapeHtml((gate.cannotImply || []).join("; "))}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Execution Status</h3>
        <ul>
          <li>Requires recommendation: ${boolText(proposal.requiresRecommendationAcceptance)}</li>
          <li>Requires work authorization: ${boolText(proposal.requiresWorkAuthorization)}</li>
          <li>Requires execution authorization: ${boolText(proposal.requiresExecutionAuthorization)}</li>
          <li>Execution performed: ${boolText(proposal.executionPerformed)}</li>
          <li>Commit performed: ${boolText(proposal.commitPerformed)}</li>
          <li>Deploy performed: ${boolText(proposal.deployPerformed)}</li>
          <li>Production mutated: ${boolText(proposal.productionMutated)}</li>
          <li>Memory written: ${boolText(proposal.canonicalMemoryWritten)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Boundary</h3>
        <ul>
          <li>Operator authority: ${boolText(boundary.operatorRemainsAuthority)}</li>
          <li>Recommendation separate: ${boolText(boundary.recommendationAcceptanceSeparate)}</li>
          <li>Work separate: ${boolText(boundary.workAuthorizationSeparate)}</li>
          <li>Execution separate: ${boolText(boundary.executionAuthorizationSeparate)}</li>
          <li>Live execution: ${boolText(boundary.liveExecutionEnabled)}</li>
          <li>Provider route changes: ${boolText(boundary.providerRouteChangesEnabled)}</li>
        </ul>
      </article>
    </div>
    <h3>Proposal Review</h3>
    ${table(
      ["Item", "Evidence", "Required Before Execution", "Satisfied in 9.10"],
      (report.proposalReviewChecklist || []).map((item) => `
        <tr>
          <td><strong>${escapeHtml(item.title || "")}</strong><br><span class="meta">${escapeHtml(item.itemId || "")}</span></td>
          <td>${escapeHtml(item.evidence || "")}</td>
          <td>${boolText(item.requiredBeforeExecutionAuthorization)}</td>
          <td>${boolText(item.satisfiedInPhase910)}</td>
        </tr>
      `)
    )}
  `;
}

async function loadApprovalBoundary() {
  const report = await renderFetch("/admin/approval-execution-boundary");
  renderApprovalBoundary(report);
}

function renderTrioValidation(report) {
  const container = document.getElementById("trioValidationResults");
  if (!container) return;
  const acceptance = report.phase910Acceptance || {};
  const oracle = report.oracleDeferral || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.validationVersion || "")} | Source Approval accepted: ${boolText(report.sourceApprovalBoundaryAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.10 Accepted</h2>
        <p>${escapeHtml(acceptance.acceptedBaseline || "")}</p>
        <ul>
          <li>Accepted: ${boolText(acceptance.phase910Accepted)}</li>
          <li>Approval gates separate: ${boolText(acceptance.approvalGatesSeparate)}</li>
          <li>Execution authorized: ${boolText(acceptance.executionAuthorized)}</li>
          <li>Oracle approved next: ${boolText(acceptance.oracleApprovedAsNext)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Oracle Deferred</h2>
        <p>${escapeHtml(oracle.reason || "")}</p>
        <ul>
          <li>Definition deferred: ${boolText(oracle.oracleDefinitionDeferred)}</li>
          <li>May proceed after validation: ${boolText(oracle.oracleMayProceedAfterValidation)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>One Aion: ${boolText(boundary.oneAionIdentityPreserved)}</li>
          <li>Roles remain responsibilities: ${boolText(boundary.rolesRemainResponsibilities)}</li>
          <li>Validates usefulness: ${boolText(boundary.validatesUsefulnessNotExistence)}</li>
          <li>Execution authorization: ${boolText(boundary.executionAuthorizationGranted)}</li>
          <li>Oracle work approved: ${boolText(boundary.oracleWorkApproved)}</li>
        </ul>
      </div>
    </div>
    <h3>Validation Dimensions</h3>
    ${table(
      ["Dimension", "Question", "Current Evidence", "Required Evidence", "Oracle Ready"],
      (report.dimensions || []).map((dimension) => `
        <tr>
          <td><strong>${escapeHtml(dimension.title || "")}</strong><br><span class="meta">${escapeHtml(dimension.dimensionId || "")}</span></td>
          <td>${escapeHtml(dimension.question || "")}</td>
          <td>${escapeHtml(dimension.currentEvidence || "")}</td>
          <td>${escapeHtml(dimension.requiredEvidence || "")}</td>
          <td>${boolText(dimension.sufficientForOracleReadiness)}</td>
        </tr>
      `)
    )}
    <h3>Bounded Scenarios</h3>
    ${table(
      ["Scenario", "Prime", "Mirror", "Engineer", "Operator", "Execution Required"],
      (report.scenarios || []).map((scenario) => `
        <tr>
          <td><strong>${escapeHtml(scenario.title || "")}</strong><br><span class="meta">${escapeHtml(scenario.workCategory || "")}</span></td>
          <td>${escapeHtml(scenario.primeResponsibility || "")}</td>
          <td>${escapeHtml(scenario.mirrorResponsibility || "")}</td>
          <td>${escapeHtml(scenario.engineerResponsibility || "")}</td>
          <td>${escapeHtml(scenario.operatorDecision || "")}</td>
          <td>${boolText(scenario.executionRequiredForValidation)}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Evidence Gates</h3>
        <ul>${(report.evidenceGates || []).map((gate) => `
          <li><strong>${escapeHtml(gate.requirement || "")}</strong><br><span class="meta">${escapeHtml(gate.evidenceSource || "")}. Satisfied: ${boolText(gate.currentlySatisfied)}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Metrics</h3>
        <ul>${(report.metrics || []).map((metric) => `
          <li><strong>${escapeHtml(metric.title || "")}</strong><br><span class="meta">${escapeHtml(metric.target || "")}. Measured: ${boolText(metric.measuredInPhase911)}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Before Oracle</h3>
        <ul>${(oracle.requiredBeforeOracle || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
  `;
}

async function loadTrioValidation() {
  const report = await renderFetch("/admin/trio-workflow-validation");
  renderTrioValidation(report);
}

function renderArchitectureValidationRun(report) {
  const container = document.getElementById("architectureValidationRunResults");
  if (!container) return;
  const acceptance = report.phase911Acceptance || {};
  const prompt = report.decisionPrompt || {};
  const prime = report.primePacket || {};
  const mirror = report.mirrorPacket || {};
  const revision = report.primeRevision || {};
  const engineer = report.engineerPacket || {};
  const assessment = report.operatorAssessment || {};
  const evidence = report.evidenceSummary || {};
  const classification = report.validationClassification || {};
  const executionEvidence = report.executionIdentityEvidence || [];
  const contextEvidence = report.contextEvidence || [];
  const costEvidence = report.costPerformanceEvidence || [];
  const outcomeEvidence = report.roleOutcomeEvidence || [];
  const validationSequence = report.futureOperationalValidationSequence || [];
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.runVersion || "")} | Source Trio accepted: ${boolText(report.sourceTrioValidationAccepted)} | Next: ${escapeHtml(report.nextValidationRun || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>9.11 Accepted</h2>
        <p>${escapeHtml(acceptance.acceptedBaseline || "")}</p>
        <ul>
          <li>Scenario: ${escapeHtml(acceptance.selectedFirstScenario || "")}</li>
          <li>Oracle deferred: ${boolText(acceptance.oracleStillDeferred)}</li>
          <li>Reason: ${escapeHtml(acceptance.selectionReason || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Decision Prompt</h2>
        <p>${escapeHtml(prompt.question || "")}</p>
        <ul>
          <li>Category: ${escapeHtml(prompt.decisionCategory || "")}</li>
          <li>Bounded real workflow: ${boolText(prompt.boundedRealWorkflow)}</li>
          <li>Execution required: ${boolText(prompt.executionRequired)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Classification</h2>
        <p>${escapeHtml(classification.distinction || "")}</p>
        <ul>
          <li>Workflow validation: ${escapeHtml(classification.workflowValidationClassification || "")}</li>
          <li>Operational intelligence: ${escapeHtml(classification.operationalIntelligenceValidationClassification || "")}</li>
          <li>Workflow accepted: ${boolText(classification.workflowValidationAccepted)}</li>
          <li>Operational accepted: ${boolText(classification.operationalIntelligenceValidationAccepted)}</li>
          <li>Execution-backed: ${boolText(classification.currentRunExecutionBackedIntelligenceValidation)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Evidence Summary</h2>
        <ul>
          <li>Workflow run: ${boolText(evidence.boundedRealWorkflowRun)}</li>
          <li>Mirror value: ${boolText(evidence.mirrorValueObserved)}</li>
          <li>Engineer value: ${boolText(evidence.engineerValueObserved)}</li>
          <li>Operator reviewed: ${boolText(evidence.operatorExperienceReviewed)}</li>
          <li>Oracle ready: ${boolText(evidence.sufficientForOracleDefinition)}</li>
        </ul>
      </div>
    </div>
    <h3>Execution Identity</h3>
    ${table(
      ["Role", "Route", "Provider", "Model", "Timestamp", "Unknowns Preserved"],
      executionEvidence.map((item) => `
        <tr>
          <td>${escapeHtml(item.role || "")}</td>
          <td>${escapeHtml(item.executionRoute || "")}</td>
          <td>${escapeHtml(item.providerIdentity || "")}</td>
          <td>${escapeHtml(item.modelIdentityVersion || "")}</td>
          <td>${escapeHtml(item.executionTimestamp || "")}</td>
          <td>${boolText(item.unknownValuesPreserved)}</td>
        </tr>
      `)
    )}
    <h3>Context Evidence</h3>
    ${table(
      ["Role", "Context Packet", "Continuity", "Grounding", "Size", "Data"],
      contextEvidence.map((item) => `
        <tr>
          <td>${escapeHtml(item.role || "")}</td>
          <td>${escapeHtml(item.contextPacketIdentity || "")}</td>
          <td>${escapeHtml(item.continuityContextIdentity || "")}</td>
          <td>${escapeHtml(item.groundingEvidenceIdentity || "")}</td>
          <td>${escapeHtml(item.approximateContextSize || "")}</td>
          <td>${escapeHtml(item.disclosedDataClassification || "")}</td>
        </tr>
      `)
    )}
    <h3>Cost And Performance</h3>
    ${table(
      ["Role", "Latency", "Tokens", "External Cost", "Cycles", "Estimated Cost", "Unknowns Preserved"],
      costEvidence.map((item) => `
        <tr>
          <td>${escapeHtml(item.role || "")}</td>
          <td>${escapeHtml(item.latency || "")}</td>
          <td>${escapeHtml(item.tokenUsage || "")}</td>
          <td>${escapeHtml(item.externalCost || "")}</td>
          <td>${escapeHtml(item.cycles || "")}</td>
          <td>${escapeHtml(item.estimatedExecutionCost || "")}</td>
          <td>${boolText(item.unknownValuesPreserved)}</td>
        </tr>
      `)
    )}
    <h3>Role Outcome Evidence</h3>
    ${table(
      ["Role", "Produced", "Continuity Value", "Changed", "Material", "Readiness"],
      outcomeEvidence.map((item) => `
        <tr>
          <td>${escapeHtml(item.role || "")}</td>
          <td>${escapeHtml(item.synthesisProduced || "")}</td>
          <td>${escapeHtml(item.continuityValueProvided || "")}</td>
          <td>${escapeHtml(item.changedBecauseOfRole || "")}</td>
          <td>${boolText(item.materialImprovementObserved)}</td>
          <td>${escapeHtml(item.implementationReadinessAdded || "")}</td>
        </tr>
      `)
    )}
    <h3>9.11 Validation Progression</h3>
    ${table(
      ["Milestone", "Kind", "Status", "Required Evidence"],
      validationSequence.map((item) => `
        <tr>
          <td>${escapeHtml(item.milestone || "")}</td>
          <td>${escapeHtml(item.validationKind || "")}</td>
          <td>${escapeHtml(item.status || "")}</td>
          <td>${escapeHtml(item.requiredEvidence || "")}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Prime</h3>
        <p>${escapeHtml(prime.recommendation || "")}</p>
        <ul>${(prime.rationale || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Mirror</h3>
        <p>Meaningful contribution: ${boolText(mirror.meaningfulContributionObserved)}</p>
        <ul>${(mirror.recommendedChanges || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Prime Revision</h3>
        <p>${escapeHtml(revision.revisedRecommendation || "")}</p>
        <ul>${(revision.acceptedMirrorChanges || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Mirror Review Detail</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Assumptions</h3>
        <ul>${(mirror.assumptionsChallenged || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Risks</h3>
        <ul>${(mirror.risksIdentified || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Alternatives</h3>
        <ul>${(mirror.alternativesAdded || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Engineer Readiness</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Affected Components</h3>
        <ul>${(engineer.affectedComponents || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Validation Plan</h3>
        <ul>${(engineer.validationPlan || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Rollback</h3>
        <ul>${(engineer.rollbackConsiderations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Operator Assessment</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Questions</h3>
        <ul>${(assessment.questions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Status</h3>
        <ul>
          <li>Required: ${boolText(assessment.assessmentRequired)}</li>
          <li>Completed: ${boolText(assessment.assessmentCompleted)}</li>
          <li>Required before Oracle: ${boolText(assessment.requiredBeforeOracle)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Boundary</h3>
        <ul>
          <li>One Aion: ${boolText(boundary.oneAionIdentityPreserved)}</li>
          <li>Real workflow validation: ${boolText(boundary.realWorkflowValidation)}</li>
          <li>Execution authorized: ${boolText(boundary.executionAuthorized)}</li>
          <li>Oracle work approved: ${boolText(boundary.oracleWorkApproved)}</li>
          <li>Provider route changes: ${boolText(boundary.providerRouteChangesEnabled)}</li>
        </ul>
      </article>
    </div>
  `;
}

async function loadArchitectureValidationRun() {
  const report = await renderFetch("/admin/architecture-decision-validation-run");
  renderArchitectureValidationRun(report);
}

function renderPrimeOperationalValidationCriteria(report) {
  const container = document.getElementById("primeOperationalValidationCriteriaResults");
  if (!container) return;
  const acceptance = report.phase911AAcceptance || {};
  const baselineA = report.baselineA || {};
  const baselineB = report.baselineB || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.criteriaVersion || "")} | Source 9.11A accepted: ${boolText(acceptance.evidenceFrameworkUpdateAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>Baseline A</h2>
        <p><strong>${escapeHtml(baselineA.name || "")}</strong></p>
        <p class="meta">${escapeHtml(baselineA.description || "")}</p>
        <ul>
          <li>Continuity: ${escapeHtml(baselineA.continuityOwnership || "")}</li>
          <li>Transfer: ${escapeHtml(baselineA.contextTransferMode || "")}</li>
          <li>Grounding: ${escapeHtml(baselineA.groundingMode || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Baseline B</h2>
        <p><strong>${escapeHtml(baselineB.name || "")}</strong></p>
        <p class="meta">${escapeHtml(baselineB.description || "")}</p>
        <ul>
          <li>Continuity: ${escapeHtml(baselineB.continuityOwnership || "")}</li>
          <li>Transfer: ${escapeHtml(baselineB.contextTransferMode || "")}</li>
          <li>Grounding: ${escapeHtml(baselineB.groundingMode || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>Criteria only: ${boolText(boundary.criteriaOnly)}</li>
          <li>Validation executed: ${boolText(boundary.operationalValidationExecuted)}</li>
          <li>Validation accepted: ${boolText(boundary.operationalValidationAccepted)}</li>
          <li>Live inference authorized: ${boolText(boundary.liveInferenceAuthorizedByCriteria)}</li>
          <li>Provider route by Prime: ${boolText(boundary.providerRouteSelectionAuthorizedByPrime)}</li>
          <li>Oracle work approved: ${boolText(boundary.oracleWorkApproved)}</li>
        </ul>
      </div>
    </div>
    <h3>Measures</h3>
    ${table(
      ["Measure", "Question", "Baseline Capture", "Prime Capture", "Success Signal"],
      (report.measures || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.measureId || "")}</td>
          <td>${escapeHtml(item.question || "")}</td>
          <td>${escapeHtml(item.baselineCapture || "")}</td>
          <td>${escapeHtml(item.primeCapture || "")}</td>
          <td>${escapeHtml(item.successSignal || "")}</td>
        </tr>
      `)
    )}
    <h3>Execution Evidence Requirements</h3>
    ${table(
      ["Role", "Execution", "Context", "Cost", "Outcome", "Unknowns"],
      (report.executionEvidenceRequirements || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.role || "")}</td>
          <td>${boolText(item.executionIdentityRequired)}</td>
          <td>${boolText(item.contextEvidenceRequired)}</td>
          <td>${boolText(item.costPerformanceRequired)}</td>
          <td>${boolText(item.outcomeEvidenceRequired)}</td>
          <td>${boolText(item.unknownValuesMustRemainUnknown)}</td>
        </tr>
      `)
    )}
    <h3>Operator Assessment</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Questions</h3>
        <ul>${(report.operatorAssessmentQuestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Checklist</h3>
        <ul>${(report.acceptanceChecklist || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
  `;
}

async function loadPrimeOperationalValidationCriteria() {
  const report = await renderFetch("/admin/prime-operational-validation-criteria");
  renderPrimeOperationalValidationCriteria(report);
}

function renderPrimeOperationalValidationRun(report) {
  const container = document.getElementById("primeOperationalValidationRunResults");
  if (!container) return;
  const baseline = report.baselineObservation || {};
  const execution = report.primeExecutionIdentity || {};
  const context = report.primeContextEvidence || {};
  const cost = report.primeCostPerformanceEvidence || {};
  const outcome = report.primeOutcomeEvidence || {};
  const assessment = report.operatorAssessment || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.runVersion || "")} | Criteria accepted: ${boolText(report.sourceCriteriaAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>Baseline</h2>
        <p>${escapeHtml(baseline.evidenceSource || "")}</p>
        <ul>
          <li>Continuity: ${escapeHtml(baseline.continuityOwnership || "")}</li>
          <li>Transfer: ${escapeHtml(baseline.contextTransferObserved || "")}</li>
          <li>Provider: ${escapeHtml(baseline.providerIdentity || "")}</li>
          <li>Model: ${escapeHtml(baseline.modelIdentityVersion || "")}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Prime Execution</h2>
        <ul>
          <li>Route: ${escapeHtml(execution.executionRoute || "")}</li>
          <li>Provider: ${escapeHtml(execution.providerIdentity || "")}</li>
          <li>Model: ${escapeHtml(execution.modelIdentityVersion || "")}</li>
          <li>Timestamp: ${escapeHtml(execution.executionTimestamp || "")}</li>
          <li>Unknowns preserved: ${boolText(execution.unknownValuesPreserved)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Assessment</h2>
        <ul>
          <li>Required: ${boolText(assessment.assessmentRequired)}</li>
          <li>Completed: ${boolText(assessment.assessmentCompleted)}</li>
          <li>Accepted: ${boolText(assessment.operationalValidationAccepted)}</li>
          <li>Candidate evidence: ${boolText(boundary.candidateEvidenceCaptured)}</li>
          <li>Oracle work: ${boolText(boundary.oracleWorkApproved)}</li>
        </ul>
      </div>
    </div>
    <h3>Context Evidence</h3>
    ${table(
      ["Context Packet", "Continuity", "Grounding", "Size", "Data"],
      [`
        <tr>
          <td>${escapeHtml(context.contextPacketIdentity || "")}</td>
          <td>${escapeHtml(context.continuityContextIdentity || "")}</td>
          <td>${escapeHtml(context.groundingEvidenceIdentity || "")}</td>
          <td>${escapeHtml(context.approximateContextSize || "")}</td>
          <td>${escapeHtml(context.disclosedDataClassification || "")}</td>
        </tr>
      `]
    )}
    <h3>Cost And Performance</h3>
    ${table(
      ["Latency", "Tokens", "External Cost", "Cycles", "Estimated Cost", "Unknowns"],
      [`
        <tr>
          <td>${escapeHtml(cost.latency || "")}</td>
          <td>${escapeHtml(cost.tokenUsage || "")}</td>
          <td>${escapeHtml(cost.externalCost || "")}</td>
          <td>${escapeHtml(cost.cycles || "")}</td>
          <td>${escapeHtml(cost.estimatedExecutionCost || "")}</td>
          <td>${boolText(cost.unknownValuesPreserved)}</td>
        </tr>
      `]
    )}
    <h3>Outcome Evidence</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Synthesis</h3>
        <p>${escapeHtml(outcome.synthesisProduced || "")}</p>
      </article>
      <article class="role-card">
        <h3>Continuity Value</h3>
        <p>${escapeHtml(outcome.continuityValueProvided || "")}</p>
      </article>
      <article class="role-card">
        <h3>Compared With Baseline</h3>
        <p>${escapeHtml(outcome.changedComparedWithBaseline || "")}</p>
        <p class="meta">Candidate improvement: ${boolText(outcome.candidateImprovementObserved)}. Operator review: ${boolText(outcome.operatorAssessmentRequired)}.</p>
      </article>
    </div>
    <h3>Measure Observations</h3>
    ${table(
      ["Measure", "Baseline", "Prime", "Signal", "Review"],
      (report.measureObservations || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.measureId || "")}</td>
          <td>${escapeHtml(item.baselineObservation || "")}</td>
          <td>${escapeHtml(item.primeObservation || "")}</td>
          <td>${escapeHtml(item.candidateSignal || "")}</td>
          <td>${boolText(item.operatorAssessmentRequired)}</td>
        </tr>
      `)
    )}
    <h3>Boundary</h3>
    ${table(
      ["Criteria", "Candidate", "Assessment", "Accepted", "Live Product Inference", "Route Changed", "Memory", "Oracle"],
      [`
        <tr>
          <td>${boolText(boundary.criteriaAccepted)}</td>
          <td>${boolText(boundary.candidateEvidenceCaptured)}</td>
          <td>${boolText(boundary.operatorAssessmentCompleted)}</td>
          <td>${boolText(boundary.operationalValidationAccepted)}</td>
          <td>${boolText(boundary.aionProductLiveInferenceEnabled)}</td>
          <td>${boolText(boundary.providerRouteChanged)}</td>
          <td>${boolText(boundary.memoryWriteAuthorized)}</td>
          <td>${boolText(boundary.oracleWorkApproved)}</td>
        </tr>
      `]
    )}
  `;
}

async function loadPrimeOperationalValidationRun() {
  const report = await renderFetch("/admin/prime-operational-validation-run");
  renderPrimeOperationalValidationRun(report);
}

function renderPrimeOperationalValidationAcceptanceGate(report) {
  const container = document.getElementById("primeOperationalValidationAcceptanceGateResults");
  if (!container) return;
  const review = report.candidateReview || {};
  const baseline = report.baselineRefinement || {};
  const assessment = report.operatorAssessmentGate || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.gateVersion || "")} | Candidate accepted: ${boolText(review.candidateEvidenceCaptureAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>Review</h2>
        <p>${escapeHtml(review.reviewSummary || "")}</p>
        <ul>
          <li>Candidate evidence: ${boolText(review.candidateEvidenceCaptureAccepted)}</li>
          <li>Prime complete: ${boolText(review.primeOperationalValidationComplete)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Baseline Refinement</h2>
        <p>${escapeHtml(baseline.currentWeakness || "")}</p>
        <ul>
          <li>Strength: ${escapeHtml(baseline.currentBaselineStrength || "")}</li>
          <li>Stronger comparison: ${boolText(baseline.strongerComparisonRequired)}</li>
          <li>Accept without stronger comparison: ${boolText(baseline.acceptanceWithoutStrongerComparisonAllowed)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>Prime accepted: ${boolText(boundary.primeOperationalValidationAccepted)}</li>
          <li>Mirror may start: ${boolText(boundary.mirrorOperationalValidationMayStart)}</li>
          <li>Live inference: ${boolText(boundary.liveInferenceAuthorized)}</li>
          <li>Route changed: ${boolText(boundary.providerRouteChanged)}</li>
          <li>Memory write: ${boolText(boundary.memoryWriteAuthorized)}</li>
          <li>Oracle work: ${boolText(boundary.oracleWorkApproved)}</li>
        </ul>
      </div>
    </div>
    <h3>Completion Criteria</h3>
    ${table(
      ["Criterion", "Requirement", "Current Evidence", "Status", "Required"],
      (report.completionCriteria || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.criterionId || "")}</td>
          <td>${escapeHtml(item.requirement || "")}</td>
          <td>${escapeHtml(item.currentEvidence || "")}</td>
          <td>${escapeHtml(item.status || "")}</td>
          <td>${boolText(item.requiredForAcceptance)}</td>
        </tr>
      `)
    )}
    <h3>Operator Assessment Gate</h3>
    <div class="role-grid">
      <article class="role-card">
        <h3>Status</h3>
        <ul>
          <li>Required: ${boolText(assessment.assessmentRequired)}</li>
          <li>Completed: ${boolText(assessment.assessmentCompleted)}</li>
          <li>Controls acceptance: ${boolText(assessment.controlsAcceptance)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Questions</h3>
        <ul>${(assessment.questions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
    <h3>Measurement Gaps</h3>
    ${table(
      ["Measurement", "Current", "Handling", "Unknowns"],
      (report.measurementGaps || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.measurementId || "")}</td>
          <td>${escapeHtml(item.currentValue || "")}</td>
          <td>${escapeHtml(item.requiredHandling || "")}</td>
          <td>${boolText(item.unknownValuesMustRemainUnknown)}</td>
        </tr>
      `)
    )}
    <h3>Checklist</h3>
    <ul>${(report.acceptanceChecklist || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

async function loadPrimeOperationalValidationAcceptanceGate() {
  const report = await renderFetch("/admin/prime-operational-validation-acceptance-gate");
  renderPrimeOperationalValidationAcceptanceGate(report);
}

function renderPrimeOperationalValidationSameTaskComparison(report) {
  const container = document.getElementById("primeOperationalValidationSameTaskComparisonResults");
  if (!container) return;
  const source = report.sourceGateStatus || {};
  const task = report.comparisonTask || {};
  const control = report.completionControl || {};
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.comparisonVersion || "")} | Gate accepted: ${boolText(source.gateAccepted)} | Next: ${escapeHtml(report.nextMilestone || "")}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>Comparison Task</h2>
        <p>${escapeHtml(task.objective || "")}</p>
        <p class="meta">${escapeHtml(task.sharedPrompt || "")}</p>
      </div>
      <div class="panel">
        <h2>Completion</h2>
        <ul>
          <li>Same-task complete: ${boolText(control.sameTaskComparisonComplete)}</li>
          <li>Assessment complete: ${boolText(control.operatorAssessmentComplete)}</li>
          <li>Baseline satisfied: ${boolText(control.strongerBaselineSatisfied)}</li>
          <li>Prime may be accepted: ${boolText(control.primeOperationalValidationMayBeAccepted)}</li>
          <li>Mirror may start: ${boolText(control.mirrorOperationalValidationMayStart)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>Required work only: ${boolText(boundary.comparisonDefinesRequiredWorkOnly)}</li>
          <li>Baseline executed by Aion: ${boolText(boundary.baselineTrialExecutedByAion)}</li>
          <li>Baseline invented: ${boolText(boundary.chatGptBaselineResultInvented)}</li>
          <li>Prime accepted: ${boolText(boundary.primeOperationalValidationAccepted)}</li>
          <li>Mirror may start: ${boolText(boundary.mirrorOperationalValidationMayStart)}</li>
          <li>Oracle work: ${boolText(boundary.oracleWorkApproved)}</li>
        </ul>
      </div>
    </div>
    <h3>Expected Output</h3>
    <ul>${(task.expectedOutput || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Trial Requirements</h3>
    ${table(
      ["Trial", "Workflow", "Continuity", "Transfer", "Execution ID", "Status"],
      (report.trialRequirements || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.trialId || "")}</td>
          <td>${escapeHtml(item.workflow || "")}</td>
          <td>${escapeHtml(item.continuityAllowed || "")}</td>
          <td>${escapeHtml(item.contextTransferMode || "")}</td>
          <td>${boolText(item.executionIdentityRequired)}</td>
          <td>${escapeHtml(item.status || "")}</td>
        </tr>
      `)
    )}
    <h3>Trial Evidence Status</h3>
    ${table(
      ["Trial", "Evidence", "Route", "Provider", "Model", "Context Effort", "Questions", "Usefulness", "Load", "Cost"],
      (report.trialEvidenceStatuses || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.trialId || "")}</td>
          <td>${escapeHtml(item.evidenceStatus || "")}</td>
          <td>${escapeHtml(item.executionRoute || "")}</td>
          <td>${escapeHtml(item.providerIdentity || "")}</td>
          <td>${escapeHtml(item.modelIdentityVersion || "")}</td>
          <td>${escapeHtml(item.contextRestorationEffort || "")}</td>
          <td>${escapeHtml(item.clarifyingExchangeCount || "")}</td>
          <td>${escapeHtml(item.usefulnessAssessment || "")}</td>
          <td>${escapeHtml(item.cognitiveLoadAssessment || "")}</td>
          <td>${escapeHtml(item.externalCost || "")}</td>
        </tr>
      `)
    )}
    <h3>Checklist</h3>
    <ul>${(report.acceptanceChecklist || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

async function loadPrimeOperationalValidationSameTaskComparison() {
  const report = await renderFetch("/admin/prime-operational-validation-same-task-comparison");
  renderPrimeOperationalValidationSameTaskComparison(report);
}

function captureInputId(fieldId) {
  return `primeTrialCapture_${fieldId}`;
}

function captureQuestionId(questionId) {
  return `primeTrialAssessment_${questionId}`;
}

function loadPrimeTrialDraft() {
  try {
    return JSON.parse(localStorage.getItem(PRIME_TRIAL_CAPTURE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrimeTrialDraft(report) {
  const draft = { trialA: {}, assessment: {} };
  (report.captureFields || []).forEach((field) => {
    const node = document.getElementById(captureInputId(field.fieldId));
    draft.trialA[field.fieldId] = node ? node.value : "";
  });
  (report.assessmentQuestions || []).forEach((question) => {
    const node = document.getElementById(captureQuestionId(question.questionId));
    draft.assessment[question.questionId] = node ? node.value : "";
  });
  localStorage.setItem(PRIME_TRIAL_CAPTURE_STORAGE_KEY, JSON.stringify(draft));
  return draft;
}

function buildPrimeTrialReviewPacket(report, draft) {
  const requiredFields = (report.captureFields || []).filter((field) => field.required);
  const missingFields = requiredFields
    .filter((field) => !String((draft.trialA || {})[field.fieldId] || "").trim())
    .map((field) => field.fieldId);
  const missingQuestions = (report.assessmentQuestions || [])
    .filter((question) => question.required && !String((draft.assessment || {})[question.questionId] || "").trim())
    .map((question) => question.questionId);
  return {
    packetKind: "phase-9-11b-prime-trial-review-packet",
    templateVersion: report.templateVersion || "unknown",
    createdAt: new Date().toISOString(),
    localOnly: true,
    submittedToBackend: false,
    canonicalMemoryWriteRequested: false,
    primeOperationalValidationAccepted: false,
    mirrorOperationalValidationMayStart: false,
    trialA: draft.trialA || {},
    operatorAssessment: draft.assessment || {},
    completion: {
      requiredTrialAFieldsPresent: missingFields.length === 0,
      requiredAssessmentPresent: missingQuestions.length === 0,
      missingFields,
      missingQuestions,
      readyForOwnerReview: missingFields.length === 0 && missingQuestions.length === 0,
    },
  };
}

function renderPrimeOperationalValidationTrialCaptureTemplate(report) {
  const container = document.getElementById("primeOperationalValidationTrialCaptureTemplateResults");
  if (!container) return;
  const draft = loadPrimeTrialDraft();
  const boundary = report.boundary || {};
  container.innerHTML = `
    <p><strong>${escapeHtml(report.objective || "")}</strong></p>
    <p class="meta">Version: ${escapeHtml(report.templateVersion || "")} | Local only: ${boolText(boundary.localBrowserCaptureOnly)} | Backend submission: ${boolText(boundary.backendSubmissionEnabled)}</p>
    <div class="summary-grid">
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>Template only: ${boolText(boundary.templateOnly)}</li>
          <li>Local browser capture: ${boolText(boundary.localBrowserCaptureOnly)}</li>
          <li>Canonical memory write: ${boolText(boundary.canonicalMemoryWriteAllowed)}</li>
          <li>Prime accepted: ${boolText(boundary.primeOperationalValidationAccepted)}</li>
          <li>Mirror may start: ${boolText(boundary.mirrorOperationalValidationMayStart)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Completion Rules</h2>
        <ul>${(report.completionRules || []).map((rule) => `<li><strong>${escapeHtml(rule.status || "")}</strong>: ${escapeHtml(rule.requirement || "")}</li>`).join("")}</ul>
      </div>
    </div>
    <h3>Trial A Evidence</h3>
    <div class="capture-grid">
      ${(report.captureFields || []).map((field) => {
        const value = ((draft.trialA || {})[field.fieldId]) || "";
        const input = field.fieldKind === "textarea"
          ? `<textarea id="${escapeHtml(captureInputId(field.fieldId))}" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea>`
          : `<input id="${escapeHtml(captureInputId(field.fieldId))}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || "")}" />`;
        return `
          <div class="capture-field">
            <label for="${escapeHtml(captureInputId(field.fieldId))}">${escapeHtml(field.label || "")}${field.required ? " *" : ""}</label>
            ${input}
            <span class="meta">Unknown allowed: ${boolText(field.unknownAllowed)}</span>
          </div>
        `;
      }).join("")}
    </div>
    <h3>Operator Assessment</h3>
    <div class="capture-grid">
      ${(report.assessmentQuestions || []).map((question) => {
        const value = ((draft.assessment || {})[question.questionId]) || "";
        return `
          <div class="capture-field">
            <label for="${escapeHtml(captureQuestionId(question.questionId))}">${escapeHtml(question.prompt || "")}${question.required ? " *" : ""}</label>
            <textarea id="${escapeHtml(captureQuestionId(question.questionId))}" placeholder="Answer for owner review.">${escapeHtml(value)}</textarea>
          </div>
        `;
      }).join("")}
    </div>
    <div class="actions" style="margin-top: 14px;">
      <button id="primeTrialGeneratePacketButton" type="button">Generate Review Packet</button>
      <button id="primeTrialClearDraftButton" type="button" class="secondary">Clear Local Draft</button>
    </div>
    <p id="primeTrialCaptureStatus" class="meta" style="margin-top: 10px;">Draft stays in this browser only.</p>
    <pre id="primeTrialCaptureOutput" class="capture-output" hidden></pre>
  `;
  document.getElementById("primeTrialGeneratePacketButton").addEventListener("click", () => {
    const nextDraft = savePrimeTrialDraft(report);
    const packet = buildPrimeTrialReviewPacket(report, nextDraft);
    const output = document.getElementById("primeTrialCaptureOutput");
    output.hidden = false;
    output.textContent = JSON.stringify(packet, null, 2);
    document.getElementById("primeTrialCaptureStatus").textContent = packet.completion.readyForOwnerReview
      ? "Review packet is locally complete. It has not been submitted or written to memory."
      : "Review packet generated with missing required fields. It has not been submitted or written to memory.";
  });
  document.getElementById("primeTrialClearDraftButton").addEventListener("click", () => {
    localStorage.removeItem(PRIME_TRIAL_CAPTURE_STORAGE_KEY);
    renderPrimeOperationalValidationTrialCaptureTemplate(report);
  });
}

async function loadPrimeOperationalValidationTrialCaptureTemplate() {
  const report = await renderFetch("/admin/prime-operational-validation-trial-capture-template");
  renderPrimeOperationalValidationTrialCaptureTemplate(report);
}

async function loadRoleContextPackets() {
  const report = await renderFetch("/admin/role-grounded-context-packets");
  renderContextPackets(report);
}

function renderMockPipeline(result) {
  const container = document.getElementById("mockPipelineResults");
  if (!container) return;
  if (!result || !result.accepted || !result.report) {
    container.innerHTML = `<p>Mock pipeline unavailable: ${escapeHtml((result && result.reason) || "review required")}</p>`;
    return;
  }
  const report = result.report;
  container.innerHTML = `
    <p class="meta">Version: ${escapeHtml(report.pipelineVersion || "")} | Mock only: ${boolText(report.mockOnly)} | Live inference: ${boolText(report.liveInferenceEnabled)} | Provider calls: ${boolText(report.providerCallsEnabled)} | Memory writes: ${boolText(report.memoryWritesEnabled)}</p>
    ${table(
      ["Step", "Kind", "Role", "Transition", "Approval", "Output"],
      (report.steps || []).map((step) => `
        <tr>
          <td>${escapeHtml(String(step.stepIndex))}</td>
          <td><strong>${escapeHtml(step.stepKind || "")}</strong></td>
          <td>${escapeHtml(step.roleId || "")}</td>
          <td>${escapeHtml(step.transitionKind || "")}</td>
          <td>${escapeHtml(step.authorizationState || "")}</td>
          <td>${escapeHtml(step.outputId || "")}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      ${(report.outputs || []).map((output) => `
        <article class="role-card">
          <h3>${escapeHtml(output.roleId || "")}</h3>
          <p>${escapeHtml(output.summary || "")}</p>
          <ul>
            <li>Kind: ${escapeHtml(output.outputKind || "")}</li>
            <li>Self promoted: ${boolText(output.selfPromoted)}</li>
            <li>Production inference claimed: ${boolText(output.productionInferenceClaimed)}</li>
            <li>Provider call: ${boolText(output.providerCallMade)}</li>
            <li>Memory write: ${boolText(output.memoryWriteMade)}</li>
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}

async function loadMockRolePipeline() {
  const result = await renderFetch("/admin/mock-role-pipeline");
  renderMockPipeline(result);
}

function renderLiveRolePrototypeGate(result) {
  const container = document.getElementById("livePrototypeGateResults");
  if (!container) return;
  if (!result || !result.accepted || !result.report) {
    container.innerHTML = `<p>Live prototype gate unavailable: ${escapeHtml((result && result.reason) || "review required")}</p>`;
    return;
  }
  const report = result.report;
  const prototype = report.rolePrototype || {};
  const route = report.providerPolicyRoute || {};
  const boundary = report.boundary || {};
  const approval = report.approvalEvidence || {};
  container.innerHTML = `
    <p class="meta">Version: ${escapeHtml(report.gateVersion || "")} | State: ${escapeHtml(report.executionState || "")} | Live call: ${boolText(report.liveCallMade)} | Provider calls: ${boolText(report.providerCallsEnabled)} | Memory writes: ${boolText(report.memoryWritesEnabled)}</p>
    <div class="role-grid">
      <article class="role-card">
        <h3>${escapeHtml(prototype.roleId || "")}</h3>
        <p>${escapeHtml(prototype.reasoningResponsibility || "")}</p>
        <ul>
          <li>Eligible: ${boolText(prototype.livePrototypeEligible)}</li>
          <li>Context accepted: ${boolText(prototype.contextPacketAccepted)}</li>
          <li>Mock pipeline accepted: ${boolText(prototype.mockPipelineAccepted)}</li>
          <li>Provider-neutral input: ${boolText(prototype.providerNeutralRoleInput)}</li>
          <li>Payload prepared: ${boolText(prototype.executionPayloadPrepared)}</li>
          <li>Separate execution approval: ${boolText(prototype.requiresSeparateLiveExecutionApproval)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Provider Policy</h3>
        <p class="meta">${escapeHtml(route.policyAuthority || "")}</p>
        <ul>
          <li>Operation: ${escapeHtml(route.operationId || "")}</li>
          <li>Route: ${escapeHtml(route.routeId || "")}</li>
          <li>Provider: ${escapeHtml(route.providerId || "")}</li>
          <li>Selected by role: ${boolText(route.selectedByRole)}</li>
          <li>Mutable by role: ${boolText(route.mutableByRole)}</li>
          <li>Fallback: ${boolText(route.automaticFallbackAllowed)}</li>
        </ul>
      </article>
      <article class="role-card">
        <h3>Boundary</h3>
        <ul>
          <li>Role policy owns route: ${boolText(boundary.rolePolicyOwnsProviderRoute)}</li>
          <li>Provider policy owns route: ${boolText(boundary.providerPolicyOwnsExecutionRoute)}</li>
          <li>Governed transition: ${boolText(approval.governedAionWorkflowTransition)}</li>
          <li>Autonomous transfer: ${boolText(approval.autonomousRoleTransferAllowed)}</li>
          <li>Oracle selectable: ${boolText(boundary.oracleSelectableRole)}</li>
          <li>Engineer live prototype: ${boolText(boundary.engineerLivePrototypeEnabled)}</li>
        </ul>
      </article>
    </div>
  `;
}

async function loadLiveRolePrototypeGate() {
  const result = await renderFetch("/admin/live-role-prototype-gate");
  renderLiveRolePrototypeGate(result);
}

function renderRoleEvaluation(result) {
  const container = document.getElementById("roleEvaluationResults");
  if (!container) return;
  if (!result || !result.accepted || !result.report) {
    container.innerHTML = `<p>Role evaluation unavailable: ${escapeHtml((result && result.reason) || "review required")}</p>`;
    return;
  }
  const report = result.report;
  const boundary = report.boundary || {};
  const metrics = report.metrics || {};
  container.innerHTML = `
    <p class="meta">Version: ${escapeHtml(report.evaluationVersion || "")} | Baseline: ${escapeHtml(report.baselineCompared || "")} | Production suitability: ${boolText(boundary.productionSuitabilityEstablished)}</p>
    <div class="role-grid">
      ${(report.roleFindings || []).map((finding) => `
        <article class="role-card">
          <h3>${escapeHtml(finding.roleName || "")}</h3>
          <p class="meta">${escapeHtml(finding.decision || "")} | Evidence: ${escapeHtml(finding.evidenceStatus || "")}</p>
          <p>${escapeHtml(finding.rationale || "")}</p>
          <ul>
            <li>Useful for: ${escapeHtml((finding.usefulFor || []).join(", "))}</li>
            <li>Approval: ${escapeHtml(finding.approvalRule || "")}</li>
          </ul>
        </article>
      `).join("")}
    </div>
    ${table(
      ["Task", "Sequence", "Decision", "Approval", "Rationale"],
      (report.taskCategoryFindings || []).map((finding) => `
        <tr>
          <td><strong>${escapeHtml(finding.categoryName || "")}</strong></td>
          <td>${escapeHtml((finding.recommendedSequence || []).join(" -> "))}</td>
          <td>${escapeHtml(finding.decision || "")}</td>
          <td>${escapeHtml(finding.approvalRule || "")}</td>
          <td>${escapeHtml(finding.rationale || "")}</td>
        </tr>
      `)
    )}
    ${table(
      ["Metric", "Measured", "Verdict"],
      [
        ["Latency", metrics.latencyMeasured, metrics.latencyVerdict],
        ["Cost or cycles", metrics.costOrCyclesMeasured, metrics.costOrCyclesVerdict],
        ["Operator burden", metrics.operatorBurdenMeasured, metrics.operatorBurdenVerdict],
        ["Execution-route differences", metrics.executionRouteDifferencesMeasured, metrics.executionRouteDifferenceVerdict],
      ].map((row) => `
        <tr>
          <td><strong>${escapeHtml(row[0])}</strong></td>
          <td>${boolText(row[1])}</td>
          <td>${escapeHtml(row[2] || "")}</td>
        </tr>
      `)
    )}
  `;
}

async function loadRoleEvaluation() {
  const result = await renderFetch("/admin/role-quality-suitability-evaluation");
  renderRoleEvaluation(result);
}

async function loadRolesAndRules(sessionRevision = currentOperatorSessionRevision()) {
  /* prime-only final operator surface start */
  if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
  setOperatorWorkspaceWarning("");
  setAccess("Operator access verified. Aion is ready.", "verified");
  await loadPrimeHome(sessionRevision);
  /* prime-only final operator surface end */
}





async function refreshOperatorAccess() {
  /* operator verified workspace load boundary start */
  if (!isAuthenticated || !actor) {
    invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
    setOperatorShellSignedIn(false);
    setAccess("Sign in with Internet Identity to continue.");
    return;
  }

  hideOperatorAuthenticatedWorkspace();

  try {
    const status = await actor.getOperatorStatus();
    if (!status.allowlistConfigured || !status.isOperator) {
      isOperator = false;
      renderOperatorSessionToken = null;
      invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
      setOperatorShellSignedIn(false);
      setAccess("Access denied. This workspace is restricted to the Teves Consulting operator.", "denied");
      return;
    }
  } catch (error) {
    console.error("Operator principal verification failed", error);
    isOperator = false;
    renderOperatorSessionToken = null;
    invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
    setOperatorShellSignedIn(false);
    setAccess("Operator access could not be verified. Refresh after the identity service is available.", "denied");
    return;
  }

  const sessionRevision = advanceOperatorSessionRevision();
  resetOperatorAuthenticatedWorkspaceState();
  isOperator = true;
  setOperatorShellSignedIn(true);
  setAccess("Operator access verified. Loading workspace...", "verified");

  try {
    await establishRenderOperatorSession({ sessionRevision });
    await loadRolesAndRules(sessionRevision);
    if (!isCurrentOperatorSessionRevision(sessionRevision)) return;
    showOperatorAuthenticatedWorkspace();
  } catch (error) {
    if (isStaleOperatorSessionRevisionError(error) || !isCurrentOperatorSessionRevision(sessionRevision)) return;
    console.error("Operator workspace refresh failed", error);
    renderOperatorSessionToken = null;
    clearStoredOperatorSession();
    resetOperatorAuthenticatedWorkspaceState();
    hideOperatorAuthenticatedWorkspace();
    setAccess("Operator access verified. Session service is temporarily unavailable.", "verified");
    setOperatorWorkspaceWarning("Aion session service is temporarily unavailable. Messages may be unavailable until it refreshes.");
  }
  /* operator verified workspace load boundary end */
}


async function initAuth() {
  authClient = await AuthClient.create();
  isAuthenticated = await authClient.isAuthenticated();
  if (isAuthenticated) {
    identity = authClient.getIdentity();
    actor = createActor(identity);
    await actor.whoami();
    await refreshOperatorAccess();
  } else {
    actor = createActor();
    invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
    setOperatorShellSignedIn(false);
    setAccess("Sign in with Internet Identity to continue.");
  }
  document.getElementById("authButton").textContent = isAuthenticated ? "Logout" : "Sign In";
}

async function handleAuth() {
  if (!authClient) authClient = await AuthClient.create();
  if (isAuthenticated) {
    isAuthenticated = false;
    isOperator = false;
    renderOperatorSessionToken = null;
    invalidateOperatorAuthenticatedWorkspaceLifecycle({ clearStoredSession: true, hideWorkspace: true });
    setOperatorShellSignedIn(false);
    document.getElementById("authButton").textContent = "Sign In";
    setAccess("Sign in with Internet Identity to continue.");
    await waitForOperatorLogoutPresentationPaint();
    const logoutPromise = authClient.logout();
    await logoutPromise;
    return;
  }
  await authClient.login({
    identityProvider: "https://identity.ic0.app",
    onSuccess: async () => {
      isAuthenticated = true;
      identity = authClient.getIdentity();
      actor = createActor(identity);
      document.getElementById("authButton").textContent = "Logout";
      await refreshOperatorAccess();
    },
  });
}

window.addEventListener("pagehide", () => {
  quarantineOperatorAuthenticatedWorkspacePresentation();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted === true) {
    quarantineOperatorAuthenticatedWorkspacePresentation();
    restoreOperatorAuthenticatedWorkspacePresentationAfterBrowserLifecycle();
  }
});

document.getElementById("authButton").addEventListener("click", handleAuth);
initAuth();
