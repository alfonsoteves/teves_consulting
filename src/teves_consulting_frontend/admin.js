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

  const RoleDefinition = IDL.Record({
    id: IDL.Text,
    name: IDL.Text,
    responsibility: IDL.Text,
    capabilities: IDL.Vec(IDL.Text),
    constraints: IDL.Vec(IDL.Text),
    doesNotOwn: IDL.Vec(IDL.Text),
    lifecycleState: IDL.Text,
    assignment: IDL.Text,
    consumesCanonicalContinuity: IDL.Bool,
    hasIndependentIdentity: IDL.Bool,
    hasIndependentMemoryStore: IDL.Bool,
  });

  const DeferredIntegrationTarget = IDL.Record({
    id: IDL.Text,
    name: IDL.Text,
    purpose: IDL.Text,
    builtByRoles: IDL.Vec(IDL.Text),
    lifecycleState: IDL.Text,
    phase91SelectableRole: IDL.Bool,
    executionEnabled: IDL.Bool,
    requiresSeparateContract: IDL.Bool,
  });

  const ContractDependency = IDL.Record({
    id: IDL.Text,
    phase: IDL.Text,
    name: IDL.Text,
    obligation: IDL.Text,
  });

  const RoleArtifactContract = IDL.Record({
    kind: IDL.Text,
    producedBy: IDL.Text,
    consumedBy: IDL.Vec(IDL.Text),
    operatorApprovalRequired: IDL.Bool,
    canonicalMemoryWriteAllowed: IDL.Bool,
    phase91ExecutionEnabled: IDL.Bool,
    requiredFields: IDL.Vec(IDL.Text),
  });

  const RoleContextBudgetProfile = IDL.Record({
    roleId: IDL.Text,
    profileName: IDL.Text,
    maxContextChars: IDL.Nat,
    continuityScope: IDL.Text,
    allowedContext: IDL.Vec(IDL.Text),
    excludedContext: IDL.Vec(IDL.Text),
    requiresCanonicalContinuityRef: IDL.Bool,
    preparedByAionLayerRequired: IDL.Bool,
  });

  const OperatorSurfaceBoundary = IDL.Record({
    adminHtmlPurpose: IDL.Text,
    operatorHtmlPurpose: IDL.Text,
    adminHtmlRemainsGovernanceConsole: IDL.Bool,
    operatorHtmlExpectedForPhase9: IDL.Bool,
    operatorHtmlBuiltInPhase91: IDL.Bool,
    sharedOperatorSessionBoundaryRequired: IDL.Bool,
    publicAionSurfaceChanged: IDL.Bool,
  });

  const AcceptanceCheck = IDL.Record({
    id: IDL.Text,
    category: IDL.Text,
    requirement: IDL.Text,
    satisfied: IDL.Bool,
    evidence: IDL.Text,
  });

  const RoleResultContract = IDL.Record({
    resultVersion: IDL.Text,
    requiredFields: IDL.Vec(IDL.Text),
    prohibitedClaims: IDL.Vec(IDL.Text),
    evidenceAndProvenanceRequired: IDL.Bool,
    operatorApprovalStateRequired: IDL.Bool,
    providerRouteDisclosureRequired: IDL.Bool,
    canonicalMemoryWriteAllowed: IDL.Bool,
    productionActionAllowed: IDL.Bool,
    phase91LiveOutputAllowed: IDL.Bool,
  });

  const RoleRequestContract = IDL.Record({
    requestVersion: IDL.Text,
    requiredFields: IDL.Vec(IDL.Text),
    requiredContextFields: IDL.Vec(IDL.Text),
    prohibitedInputs: IDL.Vec(IDL.Text),
    supportedRoles: IDL.Vec(IDL.Text),
    trustedContextPreparer: IDL.Text,
    operatorApprovalRequiredForConsequentialTransitions: IDL.Bool,
    providerNeutral: IDL.Bool,
    failClosedOnMalformedRequest: IDL.Bool,
  });

  const FailClosedRule = IDL.Record({
    category: IDL.Text,
    trigger: IDL.Text,
    requiredBehavior: IDL.Text,
    operatorRecoverable: IDL.Bool,
  });

  const RolePolicy = IDL.Record({
    policyVersion: IDL.Text,
    oneCanonicalIdentityRequired: IDL.Bool,
    oneCanonicalContinuityRequired: IDL.Bool,
    governedMemoryOnly: IDL.Bool,
    humanAuthorityRequired: IDL.Bool,
    executionModelIndependent: IDL.Bool,
    providerPolicySeparated: IDL.Bool,
    failClosedRequired: IDL.Bool,
    hiddenRoleChainingAllowed: IDL.Bool,
    autonomousToolExecutionAllowed: IDL.Bool,
    liveInferenceAllowed: IDL.Bool,
    roleDrivenMemoryWritesAllowed: IDL.Bool,
    publicBehaviorChangesAllowed: IDL.Bool,
    oracleIntegrationTargetExecutionEnabled: IDL.Bool,
  });

  const RoleContextPacketPreview = IDL.Record({
    packetVersion: IDL.Text,
    canonicalContinuityRef: IDL.Text,
    preparedByAionLayer: IDL.Text,
    approvalState: IDL.Text,
    prohibitedActions: IDL.Vec(IDL.Text),
    outputExpectations: IDL.Vec(IDL.Text),
    separateRoleContinuityRequested: IDL.Bool,
    rolePrivateMemoryRequested: IDL.Bool,
    providerSpecificRoutingIncluded: IDL.Bool,
  });

  const RoleTransition = IDL.Record({
    transitionKind: IDL.Text,
    fromRole: IDL.Opt(IDL.Text),
    toRole: IDL.Opt(IDL.Text),
    approvalState: IDL.Text,
    operatorApprovalRequired: IDL.Bool,
    operatorApproved: IDL.Bool,
    supportedInPhase91: IDL.Bool,
  });

  const RoleBasedIntelligenceReport = IDL.Record({
    foundationVersion: IDL.Text,
    phaseName: IDL.Text,
    architecturalSubject: IDL.Text,
    contractDependencies: IDL.Vec(ContractDependency),
    roles: IDL.Vec(RoleDefinition),
    deferredIntegrationTargets: IDL.Vec(DeferredIntegrationTarget),
    artifactContracts: IDL.Vec(RoleArtifactContract),
    contextBudgetProfiles: IDL.Vec(RoleContextBudgetProfile),
    surfaceBoundary: OperatorSurfaceBoundary,
    acceptanceChecklist: IDL.Vec(AcceptanceCheck),
    requestContract: RoleRequestContract,
    resultContract: RoleResultContract,
    failClosedRules: IDL.Vec(FailClosedRule),
    policy: RolePolicy,
    transitionModel: IDL.Vec(RoleTransition),
    contextPacketPreview: RoleContextPacketPreview,
    lifecycleSummary: IDL.Text,
    readOnly: IDL.Bool,
    providerCallsEnabled: IDL.Bool,
    roleDrivenMemoryWritesEnabled: IDL.Bool,
    autonomousExecutionEnabled: IDL.Bool,
    publicBehaviorChanged: IDL.Bool,
    nonOperatorSurfaceAllowed: IDL.Bool,
    nextMilestone: IDL.Text,
  });

  const RoleRulesRoleSummary = IDL.Record({
    roleId: IDL.Text,
    owns: IDL.Vec(IDL.Text),
    doesNotOwn: IDL.Vec(IDL.Text),
    receivesContinuity: IDL.Text,
    outputMayInfluence: IDL.Vec(IDL.Text),
    operatorApprovalRequiredBefore: IDL.Vec(IDL.Text),
  });

  const RoleRulesRule = IDL.Record({
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

  const RoleRulesTransitionRule = IDL.Record({
    transition: IDL.Text,
    description: IDL.Text,
    operatorApprovalRequired: IDL.Bool,
    autonomousRoleTransferAllowed: IDL.Bool,
    failClosedWithoutApproval: IDL.Bool,
  });

  const RoleRulesOutputInfluenceRule = IDL.Record({
    artifactKind: IDL.Text,
    producedBy: IDL.Text,
    mayInfluenceLaterWork: IDL.Bool,
    influenceRequiresOperatorReview: IDL.Bool,
    canonicalMemoryWriteAllowed: IDL.Bool,
    providerRouteChangeAllowed: IDL.Bool,
    implementationAuthorizationAllowed: IDL.Bool,
  });

  const RoleRulesSurfaceRule = IDL.Record({
    surfaceId: IDL.Text,
    purpose: IDL.Text,
    operatorSessionRequired: IDL.Bool,
    publicSurfaceAllowed: IDL.Bool,
    consequentialActionsAllowed: IDL.Bool,
  });

  const RoleRulesAcceptanceCheck = IDL.Record({
    id: IDL.Text,
    requirement: IDL.Text,
    satisfied: IDL.Bool,
    evidence: IDL.Text,
  });

  const RoleRulesOperatingAgreementReport = IDL.Record({
    agreementVersion: IDL.Text,
    milestone: IDL.Text,
    purpose: IDL.Text,
    rolePolicyQuestion: IDL.Text,
    providerPolicyQuestion: IDL.Text,
    roles: IDL.Vec(RoleRulesRoleSummary),
    rules: IDL.Vec(RoleRulesRule),
    transitionRules: IDL.Vec(RoleRulesTransitionRule),
    outputInfluenceRules: IDL.Vec(RoleRulesOutputInfluenceRule),
    surfaceRules: IDL.Vec(RoleRulesSurfaceRule),
    acceptanceChecklist: IDL.Vec(RoleRulesAcceptanceCheck),
    readOnly: IDL.Bool,
    liveInferenceEnabled: IDL.Bool,
    consequentialActionsEnabled: IDL.Bool,
    publicBehaviorChanged: IDL.Bool,
    canonicalContinuityOwner: IDL.Text,
    trustedContextPreparer: IDL.Text,
    nextMilestone: IDL.Text,
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

  const WebAnalyticsDailyCount = IDL.Record({
    dayKey: IDL.Text,
    pagePath: IDL.Text,
    pageTitle: IDL.Text,
    locale: IDL.Text,
    count: IDL.Nat,
    firstSeenAt: IDL.Int,
    lastSeenAt: IDL.Int,
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

    getWebAnalyticsDailyCounts: IDL.Func(
      [IDL.Nat],
      [IDL.Vec(WebAnalyticsDailyCount)],
      ["query"]
    ),

    previewAionProviderRoute: IDL.Func(
      [ProviderRouteOperation],
      [ProviderRoutePreview],
      ["query"]
    ),

    getAionRoleBasedIntelligenceStatus: IDL.Func(
      [],
      [RoleBasedIntelligenceReport],
      ["query"]
    ),

    getAionRoleRulesOperatingAgreementStatus: IDL.Func(
      [],
      [RoleRulesOperatingAgreementReport],
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
    if (isOperator) {
      await loadSiteMetrics();
    }
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
  access.className = "operator-access";
  if (authButton) {
    authButton.removeAttribute("title");
    authButton.removeAttribute("aria-label");
  }

  if (!isAuthenticated) {
    access.textContent = "Sign in with Internet Identity to continue.";
    setAdminHealthMetric("healthOperatorStatus", "Signed out");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
    return;
  }

  if (operatorAccessIssue) {
    access.classList.add("denied");
    access.textContent = "Operator access could not be verified. Refresh after the operator session service is available.";
    setAdminHealthMetric("healthOperatorStatus", "Review needed");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
    return;
  }

  if (!isOperator) {
    access.classList.add("denied");
    access.textContent = "Access denied. This interface is restricted to the Teves Consulting operator.";
    setAdminHealthMetric("healthOperatorStatus", "Denied");
    setAdminHealthMetric("healthSessionStatus", "Unavailable");
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
  setAdminHealthMetric(
    "healthSessionStatus",
    renderOperatorSessionExpiresAt
      ? `Expires ${new Date(renderOperatorSessionExpiresAt * 1000).toLocaleTimeString()}`
      : "Verified"
  );
}

function setAdminHealthMetric(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
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
        <p class="meta">Phase 7.77 | Operator authorization and Render session required.</p>
      </div>
    `;
  } catch (err) {
    console.error("Operator access refresh failed:", err);
    container.innerHTML = `<p>Could not refresh operator access. Sign in again, confirm the operator allowlist, then retry. ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
  }
};

window.runHttpsOutcallTransportProbe = async function runHttpsOutcallTransportProbe() {
  const container = document.getElementById("httpsOutcallTransportResults");
  const button = document.getElementById("runHttpsOutcallTransportProbeButton");
  if (!container) {
    return;
  }

  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before running the transport probe.</p>";
    return;
  }

  if (button) {
    button.disabled = true;
  }
  container.innerHTML = "<p>Running the fixed non-replicated HTTPS transport probe...</p>";

  try {
    const receipt = await window.adminActor.probeHttpsOutcallTransport();
    container.innerHTML = `
      <div class="memory-card">
        <h3>HTTPS Transport Receipt</h3>
        <p>The operator-only proof completed. No reasoning provider, memory write, or automatic fallback was involved.</p>
        ${renderMetricGrid({
          url: receipt.url,
          "HTTP status": String(receipt.status),
          "response bytes": String(receipt.responseBytes),
          "replicated execution": receipt.isReplicated ? "yes" : "no",
        })}
        <p class="meta">Phase 7.78 | Fixed GET | No headers | No request body | No external response body displayed</p>
      </div>
    `;
  } catch (err) {
    console.error("HTTPS transport probe failed:", err);
    container.innerHTML = `<p>Transport check failed. Confirm operator access and retry before using transport evidence. ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
  } finally {
    if (button) {
      button.disabled = false;
    }
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

function nativePreviewIds(memories = []) {
  if (!Array.isArray(memories)) {
    return [];
  }

  return memories.map(memory => ({ id: String(memory.id) }));
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
        await loadSiteMetrics();
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

window.loadMemories = async function loadMemories() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const memories = await window.adminActor.getMyAllSummaries();
  latestMemories = memories;

  const total = memories.length;
  const milestones = memories.filter(m => m.milestone).length;
  const regular = total - milestones;

  document.getElementById("totalMemories").textContent = total;
  document.getElementById("totalMilestones").textContent = milestones;
  document.getElementById("totalRegular").textContent = regular;
  setAdminHealthMetric("healthMemoryCount", total);

  if (memories.length > 0) {
    const latest = memories[memories.length - 1];

    document.getElementById("latestMemory").textContent =
      latest.title;

    const latestMilestone = memories
      .slice()
      .reverse()
      .find(m => m.milestone);

    document.getElementById("latestMilestone").textContent =
      latestMilestone ? latestMilestone.title : "None";
  }
  const list = document.getElementById("memoryList");
  list.innerHTML = "";

  memories
    .slice()
    .reverse()
    .forEach((m) => {
      const createdDate = new Date(
        Number(m.createdAt) / 1_000_000
      );

      const createdText = createdDate.toLocaleString();
      const card = document.createElement("div");
      card.className = "memory-card";

      card.innerHTML = `
        <h3>#${m.id.toString()} — ${escapeHtml(m.title)}</h3>
        <p class="meta">
          Main Topic: ${escapeHtml(getMainTopic(m.tags))} |
          Milestone: ${m.milestone ? "true" : "false"} |
          Type: ${escapeHtml(m.memoryType || "session")} |
          Importance: ${m.importance?.toString?.() || "n/a"} |
          Confidence: ${m.confidence?.toString?.() || "n/a"} |
          Status: ${escapeHtml(m.status || "active")} |
          Tags: ${escapeHtml(getVisibleTags(m.tags).join(", ") || "None")} |
          Created: ${escapeHtml(createdText)}
        </p>
        <pre>${escapeHtml(m.summary)}</pre>
        ${renderKeyDecisions(m.keyDecisions)}
        ${renderRelationships(m.relationships)}
        <button onclick="deleteMemory(${m.id.toString()})">Delete</button>
      `;

      list.appendChild(card);
    });
};

window.deleteMemory = async function deleteMemory(id) {
  if (!confirm(`Delete memory #${id}?`)) return;

  const ok = await window.adminActor.deleteSummaryById(BigInt(id));

  if (ok) {
    await loadMemories();
  } else {
    alert("Delete failed or memory not found.");
  }
};

let latestMemories = [];
let latestFeedback = [];

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
    list.innerHTML =
      `<p>Failed to load feedback. ${escapeHtml(err.message || String(err))}</p>`;
  }
};

let latestSiteMetrics = [];
let latestSiteMetricsLoadedAt = null;
let latestSiteMetricsError = "";
let latestSiteMetricsSource = "none";
const SITE_METRICS_PUBLIC_PAGE_COUNT = 164;
const SITE_METRICS_BACKEND_ROW_LIMIT = 2000;
const SITE_METRICS_QUERY_LIMIT = 2000;
const SITE_METRICS_TECHNICAL_PATHS = new Set([
  "/robots.txt",
  "/favicon.ico",
  "/sitemap.xml",
  "/manifest.json",
  "/site.webmanifest",
  "/browserconfig.xml",
]);
const SITE_METRICS_TECHNICAL_PREFIXES = [
  "/assets/",
  "/apple-touch-icon",
];

function normalizeSiteMetricEntry(entry = {}) {
  return {
    dayKey: String(entry.dayKey || ""),
    pagePath: String(entry.pagePath || "/"),
    pageTitle: String(entry.pageTitle || entry.pagePath || "/"),
    locale: String(entry.locale || "unknown"),
    count: String(entry.count || "0"),
    firstSeenAt: String(entry.firstSeenAt || "0"),
    lastSeenAt: String(entry.lastSeenAt || "0"),
  };
}

function normalizeSiteMetrics(metrics = []) {
  return Array.isArray(metrics)
    ? metrics.map(normalizeSiteMetricEntry)
    : [];
}

function persistSiteMetricsCache(metrics = latestSiteMetrics, loadedAt = latestSiteMetricsLoadedAt) {
  try {
    localStorage.setItem(
      ADMIN_SITE_METRICS_CACHE_KEY,
      JSON.stringify({
        loadedAt,
        metrics: normalizeSiteMetrics(metrics).slice(0, SITE_METRICS_QUERY_LIMIT),
      }),
    );
  } catch (err) {
    console.warn("Could not save site metrics cache:", err);
  }
}

function clearPersistedSiteMetricsCache() {
  try {
    localStorage.removeItem(ADMIN_SITE_METRICS_CACHE_KEY);
  } catch (err) {
    console.warn("Could not clear site metrics cache:", err);
  }
}

function loadSiteMetricsCache() {
  try {
    const raw = localStorage.getItem(ADMIN_SITE_METRICS_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !Array.isArray(cached.metrics)) return null;
    return {
      loadedAt: cached.loadedAt || null,
      metrics: normalizeSiteMetrics(cached.metrics),
    };
  } catch (err) {
    console.warn("Could not load site metrics cache:", err);
    return null;
  }
}

function restoreCachedSiteMetrics() {
  const cached = loadSiteMetricsCache();
  if (!cached || !cached.metrics.length) {
    renderSiteMetricsHealth(latestSiteMetrics);
    return;
  }
  latestSiteMetrics = cached.metrics;
  latestSiteMetricsLoadedAt = cached.loadedAt;
  latestSiteMetricsError = "";
  latestSiteMetricsSource = "cache";
  renderSiteMetrics(latestSiteMetrics);
  const status = document.getElementById("siteMetricsStatus");
  if (status && cached.loadedAt) {
    status.textContent = `Showing cached metrics from ${new Date(cached.loadedAt).toLocaleString()}.`;
  }
}

function formatSiteMetricsLoadedAt() {
  if (latestSiteMetricsError) return "Load failed";
  if (!latestSiteMetricsLoadedAt) return "Not loaded";
  const loadedAt = new Date(latestSiteMetricsLoadedAt);
  if (!Number.isFinite(loadedAt.getTime())) return "Unknown";
  const ageMinutes = Math.max(0, Math.round((Date.now() - loadedAt.getTime()) / 60000));
  const source = latestSiteMetricsSource === "cache" ? "Cached" : "Live";
  if (ageMinutes < 1) return `${source} just now`;
  if (ageMinutes < 60) return `${source} ${ageMinutes}m ago`;
  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 48) return `${source} ${ageHours}h ago`;
  return `${source} ${loadedAt.toLocaleDateString()}`;
}

function renderSiteMetricsLoadedStatus() {
  const loadedElement = document.getElementById("siteMetricsLoaded");
  if (loadedElement) {
    loadedElement.textContent = formatSiteMetricsLoadedAt();
  }
}

function siteMetricDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function recentSiteMetricDayKeyList(days = 7) {
  const keys = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    keys.push(siteMetricDayKey(date));
  }
  return keys;
}

function recentSiteMetricDayKeys(days = 7) {
  return new Set(recentSiteMetricDayKeyList(days));
}

function metricNatToNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function safeSiteMetricHref(path = "/") {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("..")
    ? path
    : "/";
}

function isTrackableSiteMetricPath(path = "") {
  if (!path || SITE_METRICS_TECHNICAL_PATHS.has(path)) return false;
  return !SITE_METRICS_TECHNICAL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function displaySiteMetrics(metrics = []) {
  return normalizeSiteMetrics(metrics).filter((entry) => isTrackableSiteMetricPath(entry.pagePath));
}

function technicalSiteMetrics(metrics = []) {
  return normalizeSiteMetrics(metrics).filter((entry) => !isTrackableSiteMetricPath(entry.pagePath));
}

function technicalSiteMetricsSummary(metrics = []) {
  const rows = technicalSiteMetrics(metrics);
  return {
    rows: rows.length,
    uses: rows.reduce((total, entry) => total + metricNatToNumber(entry.count), 0),
  };
}

function summarizeSiteMetrics(metrics = []) {
  const displayMetrics = displaySiteMetrics(metrics);
  const today = siteMetricDayKey();
  const weekKeyList = recentSiteMetricDayKeyList(7);
  const weekKeys = new Set(weekKeyList);
  const monthKeys = recentSiteMetricDayKeys(30);
  const weekPages = new Set();
  let todayViews = 0;
  let weekViews = 0;
  let monthViews = 0;
  let latest = null;
  const pageTotals = new Map();
  const dailyTotals = new Map();
  const monthlyDailyTotals = new Map();
  const localeTotals = {
    en: 0,
    es: 0,
    other: 0,
  };

  displayMetrics.forEach((entry) => {
    const count = metricNatToNumber(entry.count);
    const pagePath = entry.pagePath || "/";
    const locale = entry.locale || "unknown";
    const pageKey = `${pagePath}::${locale}`;
    if (entry.dayKey === today) {
      todayViews += count;
    }
    if (monthKeys.has(entry.dayKey)) {
      monthViews += count;
      const existingMonthDay = monthlyDailyTotals.get(entry.dayKey) || { dayKey: entry.dayKey, count: 0 };
      existingMonthDay.count += count;
      monthlyDailyTotals.set(entry.dayKey, existingMonthDay);
    }
    if (weekKeys.has(entry.dayKey)) {
      weekViews += count;
      const existingDay = dailyTotals.get(entry.dayKey) || { dayKey: entry.dayKey, count: 0, en: 0, es: 0 };
      existingDay.count += count;
      if (locale === "en") existingDay.en += count;
      if (locale === "es") existingDay.es += count;
      dailyTotals.set(entry.dayKey, existingDay);
      if (locale === "en" || locale === "es") {
        localeTotals[locale] += count;
      } else {
        localeTotals.other += count;
      }
      weekPages.add(pageKey);
      const existing = pageTotals.get(pageKey) || {
        pagePath,
        pageTitle: entry.pageTitle || pagePath,
        locale,
        count: 0,
      };
      existing.count += count;
      pageTotals.set(pageKey, existing);
    }
    const lastSeenAt = Number(entry.lastSeenAt || 0);
    if (!latest || lastSeenAt > Number(latest.lastSeenAt || 0)) {
      latest = entry;
    }
  });

  return {
    todayViews,
    weekViews,
    trackedPages: weekPages.size,
    localeTotals,
    latest,
    dailyTotals: weekKeyList.map((dayKey) => dailyTotals.get(dayKey) || { dayKey, count: 0, en: 0, es: 0 }),
    monthViews,
    dailyAverage30: Math.round(monthViews / 30),
    peakDay30: Array.from(monthlyDailyTotals.values())
      .sort((a, b) => b.count - a.count || b.dayKey.localeCompare(a.dayKey))[0] || null,
    topPages: Array.from(pageTotals.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

function estimatedSiteMetricWritesPerDay(summary) {
  return Math.round((summary?.weekViews || 0) / 7);
}

function siteMetricsHealthStatus(metrics = latestSiteMetrics) {
  if (latestSiteMetricsError) {
    return { label: "Load failed", className: "watch", detailId: "siteMetricsPanel" };
  }
  if (!latestSiteMetricsLoadedAt) {
    return { label: "Not loaded", className: "pending", detailId: "siteMetricsPanel" };
  }

  const loadedAt = new Date(latestSiteMetricsLoadedAt).getTime();
  const ageHours = Number.isFinite(loadedAt)
    ? (Date.now() - loadedAt) / (60 * 60 * 1000)
    : Infinity;
  if (!Number.isFinite(ageHours) || ageHours > 24) {
    return { label: "Refresh metrics", className: "stale", detailId: "siteMetricsPanel" };
  }

  const summary = summarizeSiteMetrics(metrics);
  if (summary.weekViews === 0) {
    return { label: "No uses yet", className: "watch", detailId: "siteMetricsPanel" };
  }

  return {
    label: `${summary.weekViews.toLocaleString()} uses`,
    className: "healthy",
    detailId: "siteMetricsPanel",
  };
}

function renderSiteMetricsHealth(metrics = latestSiteMetrics) {
  const element = document.getElementById("healthSiteMetrics");
  if (!element) return;
  const status = siteMetricsHealthStatus(metrics);
  element.innerHTML = `<span class="admin-cycle-runway-label ${status.className}">${escapeHtml(status.label)}</span>`;
}

function refreshSiteMetricsDashboardSignals() {
  renderSiteMetricsHealth(latestSiteMetrics);
  if (typeof renderDashboardActionQueue === "function") {
    renderDashboardActionQueue(loadCycleSnapshot());
  }
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
}

function renderSiteMetrics(metrics = latestSiteMetrics) {
  const displayMetrics = displaySiteMetrics(metrics);
  const summary = summarizeSiteMetrics(metrics);
  const todayElement = document.getElementById("siteMetricsToday");
  const weekElement = document.getElementById("siteMetricsWeek");
  const monthElement = document.getElementById("siteMetricsMonth");
  const averageElement = document.getElementById("siteMetricsDailyAverage");
  const peakDayElement = document.getElementById("siteMetricsPeakDay");
  const pagesElement = document.getElementById("siteMetricsPages");
  const englishElement = document.getElementById("siteMetricsEnglish");
  const spanishElement = document.getElementById("siteMetricsSpanish");
  const writesElement = document.getElementById("siteMetricsWrites");
  const coverageElement = document.getElementById("siteMetricsCoverage");
  const storageElement = document.getElementById("siteMetricsStorage");
  const filteredElement = document.getElementById("siteMetricsFiltered");
  const boundaryElement = document.getElementById("siteMetricsBoundary");
  const latestElement = document.getElementById("siteMetricsLatest");
  const resultsElement = document.getElementById("siteMetricsResults");

  if (todayElement) todayElement.textContent = summary.todayViews.toLocaleString();
  if (weekElement) weekElement.textContent = summary.weekViews.toLocaleString();
  if (monthElement) monthElement.textContent = summary.monthViews.toLocaleString();
  if (averageElement) averageElement.textContent = summary.dailyAverage30.toLocaleString();
  if (peakDayElement) {
    peakDayElement.textContent = summary.peakDay30
      ? `${summary.peakDay30.count.toLocaleString()} · ${summary.peakDay30.dayKey}`
      : "No views yet";
  }
  if (pagesElement) pagesElement.textContent = summary.trackedPages.toLocaleString();
  if (englishElement) englishElement.textContent = summary.localeTotals.en.toLocaleString();
  if (spanishElement) spanishElement.textContent = summary.localeTotals.es.toLocaleString();
  if (writesElement) writesElement.textContent = `${estimatedSiteMetricWritesPerDay(summary).toLocaleString()} / day`;
  if (coverageElement) coverageElement.textContent = `${SITE_METRICS_PUBLIC_PAGE_COUNT.toLocaleString()} pages`;
  if (storageElement) storageElement.textContent = `${displayMetrics.length.toLocaleString()} shown / ${normalizeSiteMetrics(metrics).length.toLocaleString()} raw`;
  const filteredSummary = technicalSiteMetricsSummary(metrics);
  if (filteredElement) filteredElement.textContent = `${filteredSummary.rows.toLocaleString()} rows`;
  if (boundaryElement) boundaryElement.textContent = "GA supplement";
  if (latestElement) {
    latestElement.textContent = summary.latest
      ? `${summary.latest.pagePath || "/"} · ${summary.latest.dayKey || "unknown"}`
      : "No views yet";
  }
  renderSiteMetricsLoadedStatus();
  refreshSiteMetricsDashboardSignals();

  if (!resultsElement) return;
  const filteredNote = filteredSummary.rows
    ? `<p class="meta">Filtered ${escapeHtml(filteredSummary.rows.toLocaleString())} technical row${filteredSummary.rows === 1 ? "" : "s"} (${escapeHtml(filteredSummary.uses.toLocaleString())} tracked use${filteredSummary.uses === 1 ? "" : "s"}) from crawler, icon, sitemap, or asset requests.</p>`
    : "";
  if (!displayMetrics.length) {
    resultsElement.innerHTML = filteredNote || '<p class="meta">No ICP site metrics have been recorded yet.</p>';
    return;
  }

  const dailyRows = summary.dailyTotals.map((day) => `
    <tr>
      <td>${escapeHtml(day.dayKey)}</td>
      <td>${escapeHtml(day.count.toLocaleString())}</td>
      <td>${escapeHtml(day.en.toLocaleString())}</td>
      <td>${escapeHtml(day.es.toLocaleString())}</td>
    </tr>
  `).join("");
  const pageRows = summary.topPages.map((page) => `
    <tr>
      <td>${escapeHtml(page.pageTitle || page.pagePath)}</td>
      <td><a href="${escapeHtml(safeSiteMetricHref(page.pagePath))}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.pagePath)}</a></td>
      <td>${escapeHtml(page.locale)}</td>
      <td>${escapeHtml(page.count.toLocaleString())}</td>
    </tr>
  `).join("");
  resultsElement.innerHTML = `
    ${filteredNote}
    <div class="memory-card">
      <h3>Daily trend, last 7 days</h3>
      <table>
        <thead><tr><th>Day</th><th>Uses</th><th>English</th><th>Spanish</th></tr></thead>
        <tbody>${dailyRows || '<tr><td colspan="4">No tracked uses in the last 7 days.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Top pages, last 7 days</h3>
      <table>
        <thead><tr><th>Title</th><th>Path</th><th>Locale</th><th>Uses</th></tr></thead>
        <tbody>${pageRows || '<tr><td colspan="4">No tracked uses in the last 7 days.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

window.loadSiteMetrics = async function loadSiteMetrics() {
  const status = document.getElementById("siteMetricsStatus");
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }
  if (status) status.textContent = "Loading site metrics...";
  try {
    latestSiteMetrics = normalizeSiteMetrics(await window.adminActor.getWebAnalyticsDailyCounts(BigInt(SITE_METRICS_QUERY_LIMIT)));
    latestSiteMetricsLoadedAt = new Date().toISOString();
    latestSiteMetricsError = "";
    latestSiteMetricsSource = "live";
    persistSiteMetricsCache(latestSiteMetrics, latestSiteMetricsLoadedAt);
    renderSiteMetrics(latestSiteMetrics);
    const summary = summarizeSiteMetrics(latestSiteMetrics);
    if (status) {
      status.textContent = `Loaded ${latestSiteMetrics.length.toLocaleString()} daily page counters.`;
    }
    recordAdminDashboardActivity("Site metrics refreshed", `${summary.weekViews.toLocaleString()} tracked uses in 7 days`);
  } catch (err) {
    console.error("Failed to load site metrics:", err);
    latestSiteMetricsError = err.message || String(err);
    renderSiteMetricsLoadedStatus();
    refreshSiteMetricsDashboardSignals();
    if (status) {
      status.textContent = `Failed to load site metrics. ${err.message || String(err)}`;
    }
  }
};

function buildSiteMetricsSummaryText() {
  const summary = summarizeSiteMetrics(latestSiteMetrics);
  const lines = [
    "Aion Operator Site Metrics",
    `Generated: ${new Date().toLocaleString()}`,
    `Today: ${summary.todayViews.toLocaleString()}`,
    `Last 7 days: ${summary.weekViews.toLocaleString()}`,
    `Last 30 days: ${summary.monthViews.toLocaleString()}`,
    `Average/day, 30 days: ${summary.dailyAverage30.toLocaleString()}`,
    `Peak day, 30 days: ${summary.peakDay30 ? `${summary.peakDay30.count.toLocaleString()} · ${summary.peakDay30.dayKey}` : "None"}`,
    `Pages, 7 days: ${summary.trackedPages.toLocaleString()}`,
    `English, 7 days: ${summary.localeTotals.en.toLocaleString()}`,
    `Spanish, 7 days: ${summary.localeTotals.es.toLocaleString()}`,
    `Estimated writes/day: ${estimatedSiteMetricWritesPerDay(summary).toLocaleString()}`,
    `Tracker coverage: ${SITE_METRICS_PUBLIC_PAGE_COUNT.toLocaleString()} public pages`,
    `Storage rows shown: ${displaySiteMetrics(latestSiteMetrics).length.toLocaleString()} / ${normalizeSiteMetrics(latestSiteMetrics).length.toLocaleString()} raw`,
    `Filtered technical rows: ${technicalSiteMetricsSummary(latestSiteMetrics).rows.toLocaleString()}`,
    "Boundary: Approximate ICP supplement; Google Analytics remains source of truth",
    "Privacy: Stores day, path, title, locale, and count; no visitor IDs, IPs, or user agents",
    `Latest view: ${summary.latest ? `${summary.latest.pagePath || "/"} · ${summary.latest.dayKey || "unknown"}` : "None"}`,
    `Loaded: ${formatSiteMetricsLoadedAt()}`,
    "",
    "Daily trend, last 7 days",
  ];
  summary.dailyTotals.forEach((day) => {
    lines.push(`${day.dayKey}: ${day.count.toLocaleString()} tracked uses · ${day.en.toLocaleString()} en · ${day.es.toLocaleString()} es`);
  });
  if (!summary.dailyTotals.length) {
    lines.push("No tracked uses recorded in the last 7 days.");
  }
  lines.push("");
  lines.push(
    "Top pages, last 7 days",
  );
  summary.topPages.forEach((page, index) => {
    lines.push(`${index + 1}. ${page.pageTitle || page.pagePath} · ${page.pagePath} · ${page.locale} · ${page.count.toLocaleString()} tracked uses`);
  });
  if (!summary.topPages.length) {
    lines.push("No tracked uses recorded in the last 7 days.");
  }
  return lines.join("\n");
}

window.copySiteMetricsSummary = async function copySiteMetricsSummary() {
  const status = document.getElementById("siteMetricsStatus");
  try {
    await copyTextToClipboard(buildSiteMetricsSummaryText());
    const summary = summarizeSiteMetrics(latestSiteMetrics);
    if (status) status.textContent = "Site metrics summary copied.";
    recordAdminDashboardActivity("Site metrics copied", `${summary.weekViews.toLocaleString()} tracked uses in 7 days`);
  } catch (err) {
    console.error("Could not copy site metrics:", err);
    if (status) status.textContent = "Could not copy site metrics.";
  }
};

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildSiteMetricsCsvText(metrics = latestSiteMetrics) {
  const lines = [
    ["dayKey", "pagePath", "pageTitle", "locale", "count", "firstSeenAt", "lastSeenAt"].map(csvCell).join(","),
  ];
  displaySiteMetrics(metrics).forEach((entry) => {
    lines.push([
      entry.dayKey,
      entry.pagePath,
      entry.pageTitle,
      entry.locale,
      entry.count,
      entry.firstSeenAt,
      entry.lastSeenAt,
    ].map(csvCell).join(","));
  });
  return lines.join("\n");
}

window.copySiteMetricsCsv = async function copySiteMetricsCsv() {
  const status = document.getElementById("siteMetricsStatus");
  try {
    await copyTextToClipboard(buildSiteMetricsCsvText());
    const summary = summarizeSiteMetrics(latestSiteMetrics);
    if (status) status.textContent = "Site metrics CSV copied.";
    recordAdminDashboardActivity("Site metrics CSV copied", `${summary.weekViews.toLocaleString()} tracked uses in 7 days`);
  } catch (err) {
    console.error("Could not copy site metrics CSV:", err);
    if (status) status.textContent = "Could not copy site metrics CSV.";
  }
};

window.clearSiteMetricsCache = function clearSiteMetricsCache() {
  const status = document.getElementById("siteMetricsStatus");
  clearPersistedSiteMetricsCache();
  latestSiteMetrics = [];
  latestSiteMetricsLoadedAt = null;
  latestSiteMetricsError = "";
  latestSiteMetricsSource = "none";
  renderSiteMetrics(latestSiteMetrics);
  renderLocalBackupMetric();
  recordAdminDashboardActivity("Site metrics cache cleared");
  if (status) {
    status.textContent = "Site metrics cache cleared. Refresh metrics to load the latest counters.";
  }
};

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
      renderGoldenTests(data, { save: true });
    } else {
      

const savedGolden = loadSavedGoldenResults();
      if (savedGolden) {
        renderGoldenTests(savedGolden, { save: false });
      }
    }

  } catch (err) {
    console.error("Failed to load golden tests:", err);
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
    renderGoldenTests(data, { save: true });
    if (typeof updateAdminDashboardChecklist === "function") {
      updateAdminDashboardChecklist({ quality: true });
    }
    if (typeof recordAdminDashboardActivity === "function") {
      recordAdminDashboardActivity("Golden tests run", `${data.passed || 0}/${data.total || 0} passed`);
    }

  } catch (err) {
    console.error("Failed to run golden tests:", err);
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

function renderBoolean(value) {
  return value ? "true" : "false";
}

window.runRetrievalDebug = async function runRetrievalDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query = document.getElementById("retrievalQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container = document.getElementById("retrievalResults");

  container.innerHTML = "<p>Searching...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/retrieval-debug",
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
      container.innerHTML =
        `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const results = data.results || [];

    if (results.length === 0) {
      container.innerHTML = "<p>No chunks found.</p>";
      return;
    }

    container.innerHTML = results
      .map((r) => `
        <div class="memory-card">
          <h3>Rank ${escapeHtml(r.rank)}</h3>

          <p class="meta">
            Document: ${escapeHtml(r.document_id || "Unknown")} |
            Title: ${escapeHtml(r.title || "Untitled")} |
            Score: ${escapeHtml(r.score ?? "N/A")} |
            Boosted: ${escapeHtml(r.boosted_score ?? "N/A")} |
            Type: ${escapeHtml(r.source_type || "Unknown")}
          </p>

          <pre>${escapeHtml(r.text || "")}</pre>
        </div>
      `)
      .join("");

  } catch (err) {
    console.error("Retrieval debug failed:", err);
    container.innerHTML = "<p>Retrieval debug failed.</p>";
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

function summarizeMemoryTypes(memories = []) {
  const counts = {};

  memories.forEach((memory) => {
    const type = String(memory.memoryType || "session").toLowerCase();
    counts[type] = (counts[type] || 0) + 1;
  });

  const entries = Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) {
    return "None";
  }

  return entries
    .map(([type, count]) => `${type}: ${count}`)
    .join(" | ");
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

function renderStrongClusters(clusters = []) {
  if (!Array.isArray(clusters) || clusters.length === 0) {
    return "<p>No strong clusters detected.</p>";
  }

  return clusters.map((cluster, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(cluster.label || "Untitled cluster")}</strong>
      <p class="meta">
        Memories: ${escapeHtml(cluster.memoryCount ?? 0)} |
        Relationships: ${escapeHtml(cluster.relationshipCount ?? 0)}
      </p>
      <pre>${escapeHtml((cluster.memoryTitles || []).join("\n"))}</pre>
    </div>
  `).join("");
}

function renderPotentialDuplicates(duplicates = []) {
  if (!Array.isArray(duplicates) || duplicates.length === 0) {
    return "<p>No duplicate candidates detected.</p>";
  }

  return duplicates.map((duplicate, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(duplicate.memoryA?.title || "Memory A")} / ${escapeHtml(duplicate.memoryB?.title || "Memory B")}</strong>
      <p class="meta">
        Score: ${escapeHtml(duplicate.score ?? "n/a")} |
        Classification: ${escapeHtml(duplicate.classification || "unclassified")} |
        Reasons: ${escapeHtml((duplicate.reasons || []).join(", ") || "n/a")}
      </p>
      <p>${escapeHtml(duplicate.recommendation || "")}</p>
      <pre>${escapeHtml((duplicate.sharedTerms || []).join(", "))}</pre>
    </div>
  `).join("");
}

function renderOrphanMemories(orphans = []) {
  if (!Array.isArray(orphans) || orphans.length === 0) {
    return "<p>No orphan memories detected.</p>";
  }

  return orphans.map((orphan, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(orphan.title || "Untitled")}</strong>
      <p class="meta">
        ID: ${escapeHtml(orphan.id ?? "n/a")} |
        Type: ${escapeHtml(orphan.type || "session")} |
        Status: ${escapeHtml(orphan.status || "active")}
      </p>
      <p>${escapeHtml(orphan.reason || "")}</p>
    </div>
  `).join("");
}

function renderSupersededDecisions(decisions = []) {
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return "<p>No superseded decisions detected.</p>";
  }

  return decisions.map((decision, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(decision.olderMemory?.title || "Older memory")} -> ${escapeHtml(decision.newerMemory?.title || "Newer memory")}</strong>
      <p class="meta">
        Predicate: ${escapeHtml(decision.predicate || "n/a")} |
        Source: ${escapeHtml(decision.sourceMemoryTitle || "n/a")} |
        Inferred: ${decision.inferred ? "true" : "false"}
      </p>
    </div>
  `).join("");
}

window.runMemoryHealthDebug = async function runMemoryHealthDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("memoryHealthResults");
  container.innerHTML = "<p>Analyzing memory health...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/memory-health",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memories: serializedMemories,
          clusterLimit: 8,
          duplicateLimit: 8,
        })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>Memory Health Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Relationships: ${escapeHtml(data.relationshipCount ?? 0)} |
          Average relationships per memory: ${escapeHtml(data.averageRelationshipsPerMemory ?? 0)} |
          Local memory types: ${escapeHtml(summarizeMemoryTypes(serializedMemories))}
        </p>
      </div>

      <div class="memory-card">
        <h3>Memory Type Counts</h3>
        ${renderCountMap(data.memoryTypeCounts)}
      </div>

      <div class="memory-card">
        <h3>Relationship Predicate Frequency</h3>
        ${renderCountMap(data.predicateFrequency)}
      </div>

      <div class="memory-card">
        <h3>Strong Clusters</h3>
        ${renderStrongClusters(data.strongClusters)}
      </div>

      <div class="memory-card">
        <h3>Potential Duplicates</h3>
        ${renderPotentialDuplicates(data.potentialDuplicates)}
      </div>

      <div class="memory-card">
        <h3>Orphan Memories</h3>
        ${renderOrphanMemories(data.orphanMemories)}
      </div>

      <div class="memory-card">
        <h3>Superseded Decisions</h3>
        ${renderSupersededDecisions(data.supersededDecisions)}
      </div>
    `;

  } catch (err) {
    console.error("Memory health dry run failed:", err);
    container.innerHTML = "<p>Memory health dry run failed.</p>";
  }
};

function renderMemoryRef(memory = {}) {
  if (!memory) {
    return "None";
  }

  return `${memory.title || "Untitled"} (ID: ${memory.id ?? "n/a"}, Type: ${memory.type || "session"})`;
}

function renderConsolidationSuggestions(suggestions = []) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return "<p>No consolidation suggestions.</p>";
  }

  return suggestions.map((suggestion, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(suggestion.action || "needs_review")}</strong>
      <p class="meta">
        Confidence: ${escapeHtml(suggestion.confidence || "n/a")} |
        Source: ${escapeHtml(suggestion.source || "n/a")} |
        Duplicate score: ${escapeHtml(suggestion.duplicateScore ?? "n/a")} |
        Classification: ${escapeHtml(suggestion.duplicateClassification || "n/a")}
      </p>
      <p>${escapeHtml(suggestion.reason || "")}</p>
      <p><strong>Keep:</strong> ${escapeHtml(renderMemoryRef(suggestion.keepMemory || suggestion.newerMemory || null))}</p>
      <p><strong>Deprecate / review:</strong> ${escapeHtml(renderMemoryRef(suggestion.deprecateMemory || suggestion.olderMemory || null))}</p>
      <p>${escapeHtml(suggestion.recommendation || "")}</p>
      <pre>${escapeHtml((suggestion.sharedTerms || []).join(", "))}</pre>
    </div>
  `).join("");
}

window.runMemoryConsolidationDebug = async function runMemoryConsolidationDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("memoryConsolidationResults");
  container.innerHTML = "<p>Building consolidation suggestions...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/memory-consolidations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memories: serializedMemories,
          limit: 8,
        })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>Consolidation Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Suggestions: ${escapeHtml(data.suggestionCount ?? 0)} |
          Relationships: ${escapeHtml(data.healthSummary?.relationshipCount ?? 0)} |
          Potential duplicates: ${escapeHtml(data.healthSummary?.potentialDuplicateCount ?? 0)} |
          Superseded decisions: ${escapeHtml(data.healthSummary?.supersededDecisionCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Suggested Actions</h3>
        ${renderConsolidationSuggestions(data.suggestions)}
      </div>
    `;

  } catch (err) {
    console.error("Memory consolidation dry run failed:", err);
    container.innerHTML = "<p>Memory consolidation dry run failed.</p>";
  }
};

function renderCurrentDecisionEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No current decision memories detected.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(renderMemoryRef(entry.memory))}</strong>
      <p class="meta">
        Key decisions: ${escapeHtml(entry.decisionCount ?? 0)} |
        Relationships: ${escapeHtml(entry.relationshipCount ?? 0)} |
        Signals: ${escapeHtml((entry.signals || []).join(", ") || "n/a")}
      </p>
    </div>
  `).join("");
}

function renderSupersessionEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No superseded decisions detected.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(renderMemoryRef(entry.olderMemory))} -> ${escapeHtml(renderMemoryRef(entry.newerMemory))}</strong>
      <p class="meta">
        Predicate: ${escapeHtml(entry.predicate || "n/a")} |
        Source: ${escapeHtml(entry.sourceMemoryTitle || "n/a")} |
        Inferred: ${entry.inferred ? "true" : "false"}
      </p>
    </div>
  `).join("");
}

function renderRecommendedRelationships(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No relationship recommendations.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(entry.subject || "subject")} ${escapeHtml(entry.predicate || "predicate")} ${escapeHtml(entry.target || "target")}</strong>
      <p class="meta">
        Category: ${escapeHtml(entry.category || "decision")} |
        Confidence: ${escapeHtml(entry.confidence || "n/a")} |
        Older resolved: ${entry.resolvedOlderMemory ? "true" : "false"} |
        Newer resolved: ${entry.resolvedNewerMemory ? "true" : "false"}
      </p>
      <p>${escapeHtml(entry.recommendation || "")}</p>
    </div>
  `).join("");
}

window.runDecisionEvolutionDebug = async function runDecisionEvolutionDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("decisionEvolutionResults");
  container.innerHTML = "<p>Analyzing decision evolution...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/decision-evolution",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memories: serializedMemories,
        })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>Decision Evolution Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Current decisions: ${escapeHtml(data.currentDecisionCount ?? 0)} |
          Superseded decisions: ${escapeHtml(data.supersededDecisionCount ?? 0)} |
          Inferred supersessions: ${escapeHtml(data.inferredSupersessionCount ?? 0)} |
          Unresolved older references: ${escapeHtml(data.unresolvedOlderDecisionReferenceCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Current Decisions</h3>
        ${renderCurrentDecisionEntries(data.currentDecisions)}
      </div>

      <div class="memory-card">
        <h3>Superseded Decisions</h3>
        ${renderSupersessionEntries(data.supersededDecisions)}
      </div>

      <div class="memory-card">
        <h3>Unresolved Older Decision References</h3>
        ${renderSupersessionEntries(data.unresolvedOlderDecisionReferences)}
      </div>

      <div class="memory-card">
        <h3>Recommended Relationships</h3>
        ${renderRecommendedRelationships(data.recommendedRelationships)}
      </div>
    `;

  } catch (err) {
    console.error("Decision evolution dry run failed:", err);
    container.innerHTML = "<p>Decision evolution dry run failed.</p>";
  }
};

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
    latestMemories = memories;

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
    latestMemories = memories;

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

function renderSynthesisEvidence(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "<p>No evidence memories listed.</p>";
  }

  return memories.map((memory) => `
    <div>
      <strong>${escapeHtml(renderMemoryRef(memory))}</strong>
      <p class="meta">
        Matched terms: ${escapeHtml((memory.matchedTerms || []).join(", ") || "n/a")}
      </p>
    </div>
  `).join("");
}

function renderKnowledgeInsights(insights = []) {
  if (!Array.isArray(insights) || insights.length === 0) {
    return "<p>No synthesis insights met the evidence threshold.</p>";
  }

  const renderQuestions = (insight) => {
    if (Array.isArray(insight.prioritizedQuestions) && insight.prioritizedQuestions.length) {
      return `
        <ul>
          ${insight.prioritizedQuestions.map((question) => `
            <li>
              ${escapeHtml(question.question || "")}
              <span class="meta">
                Priority: ${escapeHtml(question.priority || "medium")}
                (${escapeHtml(question.score ?? 0)}) |
                Reasons: ${escapeHtml((question.reasons || []).join(", ") || "n/a")}
              </span>
            </li>
          `).join("")}
        </ul>
      `;
    }

    return Array.isArray(insight.suggestedQuestions) && insight.suggestedQuestions.length
      ? `<ul>${insight.suggestedQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
      : "<p>No suggested questions.</p>";
  };

  return insights.map((insight, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(insight.title || "Grounded observation")}</strong>
      <p class="meta">
        Type: ${escapeHtml(insight.patternType || "pattern")} |
        Confidence: ${escapeHtml(insight.confidence || "medium")} |
        Usefulness: ${escapeHtml(insight.usefulnessLabel || "medium")} (${escapeHtml(insight.usefulnessScore ?? 0)}) |
        Evidence: ${escapeHtml(insight.evidenceCount ?? 0)}
      </p>
      <p>${escapeHtml(insight.observation || "")}</p>
      <p><strong>Guardrail:</strong> ${escapeHtml(insight.guardrail || "")}</p>
      <p><strong>Usefulness reasons:</strong> ${escapeHtml((insight.usefulnessReasons || []).join(", ") || "n/a")}</p>
      <div>
        <strong>Evidence Memories</strong>
        ${renderSynthesisEvidence(insight.evidenceMemories)}
      </div>
      <div>
        <strong>Suggested Questions</strong>
        ${renderQuestions(insight)}
      </div>
    </div>
  `).join("");
}

function renderKnowledgeSynthesisExport(text = "") {
  if (!text) {
    return "<p>No synthesis memo available.</p>";
  }

  return `
    <textarea
      id="knowledgeSynthesisExportText"
      readonly
      style="width: 100%; min-height: 320px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyKnowledgeSynthesisExport()">Copy Memo</button>
  `;
}

window.copyKnowledgeSynthesisExport = async function copyKnowledgeSynthesisExport() {
  const exportBox = document.getElementById("knowledgeSynthesisExportText");

  if (!exportBox) {
    alert("No synthesis memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Synthesis memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runKnowledgeSynthesisDebug = async function runKnowledgeSynthesisDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("knowledgeSynthesisResults");
  container.innerHTML = "<p>Synthesizing grounded memory patterns...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/knowledge-synthesis", {
      memories: serializedMemories,
      limit: 8,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Knowledge Synthesis Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Insights: ${escapeHtml(data.insightCount ?? 0)} |
          Phase coverage: ${escapeHtml((data.phaseCoverage || []).join(", ") || "none")}
        </p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Grounded Observations</h3>
        ${renderKnowledgeInsights(data.insights)}
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderKnowledgeSynthesisExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Knowledge synthesis dry run failed:", err);
    container.innerHTML = `<p>Knowledge synthesis dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderStrategicReasoningExport(text = "") {
  if (!text) {
    return "<p>No strategic reasoning memo available.</p>";
  }

  return `
    <textarea
      id="strategicReasoningExportText"
      readonly
      style="width: 100%; min-height: 260px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyStrategicReasoningExport()">Copy Memo</button>
  `;
}

window.copyStrategicReasoningExport = async function copyStrategicReasoningExport() {
  const exportBox = document.getElementById("strategicReasoningExportText");

  if (!exportBox) {
    alert("No strategic reasoning memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Strategic reasoning memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runStrategicReasoningDebug = async function runStrategicReasoningDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("strategicReasoningResults");
  container.innerHTML = "<p>Building strategic reasoning brief...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/strategic-reasoning", {
      memories: serializedMemories,
      limit: 8,
    });
    const primaryInsight = data.primaryInsight || {};
    const primaryQuestion = data.primaryQuestion || {};

    container.innerHTML = `
      <div class="memory-card">
        <h3>Strategic Brief Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Insights reviewed: ${escapeHtml(data.insightCount ?? 0)} |
          Phase coverage: ${escapeHtml((data.synthesisSummary?.phaseCoverage || []).join(", ") || "none")}
        </p>
      </div>

      <div class="memory-card">
        <h3>Primary Pattern</h3>
        <p><strong>${escapeHtml(primaryInsight.title || "No primary pattern")}</strong></p>
        <p class="meta">
          Type: ${escapeHtml(primaryInsight.patternType || "n/a")} |
          Usefulness: ${escapeHtml(primaryInsight.usefulnessLabel || "n/a")} (${escapeHtml(primaryInsight.usefulnessScore ?? "n/a")}) |
          Evidence: ${escapeHtml(primaryInsight.evidenceCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Most Useful Question</h3>
        <p><strong>${escapeHtml(primaryQuestion.question || "No prioritized question")}</strong></p>
        <p class="meta">
          Priority: ${escapeHtml(primaryQuestion.priority || "n/a")} |
          Score: ${escapeHtml(primaryQuestion.score ?? "n/a")}
        </p>
        <p><strong>Reasons:</strong> ${escapeHtml((primaryQuestion.reasons || []).join(", ") || "n/a")}</p>
      </div>

      <div class="memory-card">
        <h3>Reasoning</h3>
        <p>${escapeHtml(data.reasoning || "")}</p>
        <p><strong>Possible next operator review:</strong> ${escapeHtml(data.possibleNextOperatorReview || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderStrategicReasoningExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Strategic reasoning dry run failed:", err);
    container.innerHTML = `<p>Strategic reasoning dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderAssumptionEvidence(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "<p>No evidence memories listed.</p>";
  }

  return memories.map((memory) => `
    <div>
      <strong>${escapeHtml(renderMemoryRef(memory))}</strong>
      <p class="meta">
        Matched terms: ${escapeHtml((memory.matchedTerms || []).join(", ") || "n/a")}
      </p>
    </div>
  `).join("");
}

function renderAssumptionEntries(assumptions = []) {
  if (!Array.isArray(assumptions) || assumptions.length === 0) {
    return "<p>No assumptions in this category.</p>";
  }

  return assumptions.map((assumption, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(assumption.assumption || "Untitled assumption")}</strong>
      <p class="meta">
        Category: ${escapeHtml(assumption.category || "n/a")} |
        Confidence: ${escapeHtml(assumption.confidence || "medium")} |
        Direct evidence: ${escapeHtml(assumption.evidenceCount ?? 0)} |
        Inherited evidence: ${escapeHtml(assumption.sourceEvidenceCount ?? 0)} |
        Mode: ${escapeHtml(assumption.evidenceMode || "direct")}
      </p>
      <p>${escapeHtml(assumption.reasoning || "")}</p>
      <p><strong>Suggested operator question:</strong> ${escapeHtml(assumption.suggestedOperatorQuestion || "")}</p>
      ${
        assumption.sourceInsight
          ? `<p class="meta"><strong>Source insight:</strong> ${escapeHtml(assumption.sourceInsight.title || "Untitled insight")}</p>`
          : ""
      }
      ${
        assumption.sourceQuestion
          ? `<p class="meta"><strong>Source question:</strong> ${escapeHtml(assumption.sourceQuestion.question || "")}</p>`
          : ""
      }
      <div>
        <strong>Direct Evidence Memories</strong>
        ${renderAssumptionEvidence(assumption.evidenceMemories)}
      </div>
      <div>
        <strong>Inherited Source Evidence</strong>
        ${renderAssumptionEvidence(assumption.sourceEvidenceMemories)}
      </div>
    </div>
  `).join("");
}

function renderAssumptionEvolutionExport(text = "") {
  if (!text) {
    return "<p>No assumption memo available.</p>";
  }

  return `
    <textarea
      id="assumptionEvolutionExportText"
      readonly
      style="width: 100%; min-height: 320px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyAssumptionEvolutionExport()">Copy Memo</button>
  `;
}

window.copyAssumptionEvolutionExport = async function copyAssumptionEvolutionExport() {
  const exportBox = document.getElementById("assumptionEvolutionExportText");

  if (!exportBox) {
    alert("No assumption memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Assumption memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runAssumptionEvolutionDebug = async function runAssumptionEvolutionDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("assumptionEvolutionResults");
  container.innerHTML = "<p>Analyzing assumption evolution...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/assumption-evolution", {
      memories: serializedMemories,
      limit: 10,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Assumption Evolution Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Assumptions: ${escapeHtml(data.assumptionCount ?? 0)} |
          Synthesis insights: ${escapeHtml(data.sourceSummary?.synthesisInsightCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Category Counts</h3>
        ${renderCountMap(data.categoryCounts)}
      </div>

      <div class="memory-card">
        <h3>Stable Assumptions</h3>
        ${renderAssumptionEntries(data.stableAssumptions)}
      </div>

      <div class="memory-card">
        <h3>Evolving Assumptions</h3>
        ${renderAssumptionEntries(data.evolvingAssumptions)}
      </div>

      <div class="memory-card">
        <h3>Questioned Assumptions</h3>
        ${renderAssumptionEntries(data.questionedAssumptions)}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderAssumptionEvolutionExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Assumption evolution dry run failed:", err);
    container.innerHTML = `<p>Assumption evolution dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderLearningStatements(statements = []) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return "<p>No reflective learning statements returned.</p>";
  }

  return statements.map((statement, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(statement.statement || "Untitled reflection")}</strong>
      <p class="meta">
        Confidence: ${escapeHtml(statement.confidence || "medium")} |
        Sources: ${escapeHtml((statement.sources || []).join(", ") || "n/a")}
      </p>
      ${
        statement.sourceInsight
          ? `<p class="meta"><strong>Source insight:</strong> ${escapeHtml(statement.sourceInsight.title || "Untitled insight")}</p>`
          : ""
      }
    </div>
  `).join("");
}

function renderReflectiveIntelligenceExport(text = "") {
  if (!text) {
    return "<p>No reflection memo available.</p>";
  }

  return `
    <textarea
      id="reflectiveIntelligenceExportText"
      readonly
      style="width: 100%; min-height: 300px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyReflectiveIntelligenceExport()">Copy Memo</button>
  `;
}

window.copyReflectiveIntelligenceExport = async function copyReflectiveIntelligenceExport() {
  const exportBox = document.getElementById("reflectiveIntelligenceExportText");

  if (!exportBox) {
    alert("No reflection memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Reflection memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runReflectiveIntelligenceDebug = async function runReflectiveIntelligenceDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("reflectiveIntelligenceResults");
  container.innerHTML = "<p>Building reflective intelligence summary...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/reflective-intelligence", {
      memories: serializedMemories,
      limit: 10,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Reflective Intelligence Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Learning statements: ${escapeHtml(data.learningStatementCount ?? 0)} |
          Synthesis insights: ${escapeHtml(data.sourceSummary?.synthesisInsightCount ?? 0)} |
          Questioned assumptions: ${escapeHtml(data.sourceSummary?.questionedAssumptionCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>What Aion Appears To Be Learning</h3>
        ${renderLearningStatements(data.learningStatements)}
      </div>

      <div class="memory-card">
        <h3>Reflection</h3>
        <p>${escapeHtml(data.reflection || "")}</p>
        <p><strong>Suggested operator reflection:</strong> ${escapeHtml(data.suggestedOperatorReflection || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderReflectiveIntelligenceExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Reflective intelligence dry run failed:", err);
    container.innerHTML = `<p>Reflective intelligence dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderOperatorInsightFindings(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return "<p>No operator insight findings returned.</p>";
  }

  return findings.map((finding, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(finding.finding || "Untitled finding")}</strong>
      <p class="meta">
        Type: ${escapeHtml(finding.type || "insight")} |
        Confidence: ${escapeHtml(finding.confidence || "medium")} |
        Sources: ${escapeHtml((finding.sources || []).join(", ") || "n/a")}
      </p>
      <p><strong>Operator question:</strong> ${escapeHtml(finding.operatorQuestion || "")}</p>
    </div>
  `).join("");
}

function renderOperatorInsightReportExport(text = "") {
  if (!text) {
    return "<p>No operator insight report memo available.</p>";
  }

  return `
    <textarea
      id="operatorInsightReportExportText"
      readonly
      style="width: 100%; min-height: 340px; padding: 10px; font-family: monospace; white-space: pre-wrap;"
    >${escapeHtml(text)}</textarea>
    <button onclick="copyOperatorInsightReportExport()">Copy Memo</button>
  `;
}

window.copyOperatorInsightReportExport = async function copyOperatorInsightReportExport() {
  const exportBox = document.getElementById("operatorInsightReportExportText");

  if (!exportBox) {
    alert("No operator insight report memo is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(exportBox.value);
    alert("Operator insight report memo copied.");
  } catch (err) {
    exportBox.focus();
    exportBox.select();
    alert("Copy failed. The memo is selected so you can copy it manually.");
  }
};

window.runOperatorInsightReportDebug = async function runOperatorInsightReportDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("operatorInsightReportResults");
  container.innerHTML = "<p>Building operator insight report...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/operator-insight-report", {
      memories: serializedMemories,
      limit: 10,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Operator Insight Report Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Status: ${escapeHtml(data.reportStatus || "n/a")} |
          Key findings: ${escapeHtml(data.keyFindingCount ?? 0)} |
          Questioned assumptions: ${escapeHtml(data.sourceSummary?.questionedAssumptionCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Key Findings</h3>
        ${renderOperatorInsightFindings(data.keyFindings)}
      </div>

      <div class="memory-card">
        <h3>Next Review Focus</h3>
        <p>${escapeHtml(data.nextReviewFocus || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Operator Notes</h3>
        ${
          Array.isArray(data.operatorNotes) && data.operatorNotes.length
            ? `<ul>${data.operatorNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
            : "<p>No operator notes returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Export Memo</h3>
        ${renderOperatorInsightReportExport(data.exportText)}
      </div>
    `;

  } catch (err) {
    console.error("Operator insight report dry run failed:", err);
    container.innerHTML = `<p>Operator insight report dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderRelationshipConfidenceEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No relationships in this section.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(entry.subject || "subject")} ${escapeHtml(entry.predicate || "predicate")} ${escapeHtml(entry.target || "target")}</strong>
      <p class="meta">
        Confidence: ${escapeHtml(entry.confidence ?? "n/a")} |
        Label: ${escapeHtml(entry.confidenceLabel || "n/a")} |
        Frequency: ${escapeHtml(entry.frequency ?? 1)} |
        Source: ${escapeHtml(entry.source || "n/a")} |
        Inferred: ${entry.inferred ? "true" : "false"}
      </p>
      <p class="meta">
        Source memory: ${escapeHtml(entry.sourceMemoryTitle || "n/a")}
      </p>
      <pre>${escapeHtml((entry.reasons || []).join(", "))}</pre>
    </div>
  `).join("");
}

window.runRelationshipConfidenceDebug = async function runRelationshipConfidenceDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("relationshipConfidenceResults");
  container.innerHTML = "<p>Analyzing relationship confidence...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);
    const data = await postMemoryDryRun("/admin/relationship-confidence", {
      memories: serializedMemories,
      limit: 12,
    });

    container.innerHTML = `
      <div class="memory-card">
        <h3>Relationship Confidence Summary</h3>
        <p class="meta">
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Relationships: ${escapeHtml(data.relationshipCount ?? 0)} |
          Stored: ${escapeHtml(data.storedRelationshipCount ?? 0)} |
          Inferred: ${escapeHtml(data.inferredRelationshipCount ?? 0)} |
          Low confidence: ${escapeHtml(data.lowConfidenceCount ?? 0)}
        </p>
      </div>

      <div class="memory-card">
        <h3>Confidence Counts</h3>
        ${renderCountMap(data.confidenceCounts)}
      </div>

      <div class="memory-card">
        <h3>Lowest Confidence Relationships</h3>
        ${renderRelationshipConfidenceEntries(data.lowConfidenceRelationships)}
      </div>

      <div class="memory-card">
        <h3>Highest Confidence Relationships</h3>
        ${renderRelationshipConfidenceEntries(data.highConfidenceRelationships)}
      </div>
    `;

  } catch (err) {
    console.error("Relationship confidence dry run failed:", err);
    container.innerHTML = `<p>Relationship confidence dry run failed: ${escapeHtml(err.message || err)}</p>`;
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

window.runAionProviderRoutingPolicyDebug = async function runAionProviderRoutingPolicyDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("aionProviderRoutingPolicyResults");
  container.innerHTML = "<p>Building Aion provider routing policy...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/aion-provider-routing-policy");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const routeRows = Array.isArray(data.routes) ? data.routes.map((route) => `
      <tr><td><strong>${escapeHtml(route.operation || "")}</strong></td><td>${escapeHtml(route.provider || "")}</td><td>${escapeHtml(route.model || "")}</td><td>${escapeHtml(route.status || "")}</td><td>${escapeHtml(route.rule || "")}</td></tr>
    `).join("") : "";

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Aion Provider Routing Policy")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Provider calls: ${data.providerCallsMade ? "yes" : "no"} | Automatic switching: ${data.automaticSwitching ? "yes" : "no"}</p>
      </div>
      <div class="memory-card"><h3>Permitted Routes</h3><table><thead><tr><th>Operation</th><th>Provider</th><th>Model</th><th>Status</th><th>Rule</th></tr></thead><tbody>${routeRows}</tbody></table></div>
      <div class="memory-card"><h3>Decision Order</h3><ul>${(data.decisionOrder || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Failure Policy</h3><ul>${(data.failurePolicy || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Future Motoko Policy Contract</h3>${renderCountMap(data.futureMotokoContract || {})}</div>
      <div class="memory-card"><h3>Promotion Requirements</h3><ul>${(data.promotionRequirements || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    `;
  } catch (err) {
    console.error("Aion provider routing policy failed:", err);
    container.innerHTML = `<p>Aion provider routing policy failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderRoleBasedIntelligenceReport(data = {}, sourceLabel = "Status") {
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const dependencies = Array.isArray(data.contractDependencies)
    ? data.contractDependencies
    : [];
  const deferredTargets = Array.isArray(data.deferredIntegrationTargets)
    ? data.deferredIntegrationTargets
    : [];
  const artifactContracts = Array.isArray(data.artifactContracts)
    ? data.artifactContracts
    : [];
  const contextBudgets = Array.isArray(data.contextBudgetProfiles)
    ? data.contextBudgetProfiles
    : [];
  const surfaceBoundary = data.surfaceBoundary || {};
  const acceptanceChecklist = Array.isArray(data.acceptanceChecklist)
    ? data.acceptanceChecklist
    : [];
  const requestContract = data.requestContract || {};
  const resultContract = data.resultContract || {};
  const failClosedRules = Array.isArray(data.failClosedRules)
    ? data.failClosedRules
    : [];
  const policy = data.policy || {};
  const context = data.contextPacketPreview || {};
  const transitions = Array.isArray(data.transitionModel) ? data.transitionModel : [];
  const roleRows = roles.map((role) => `
    <tr>
      <td><strong>${escapeHtml(role.name || role.id || "")}</strong></td>
      <td>${escapeHtml(role.responsibility || "")}</td>
      <td>${escapeHtml(Array.isArray(role.capabilities) ? role.capabilities.join(", ") : "")}</td>
      <td>${escapeHtml(Array.isArray(role.constraints) ? role.constraints.join(", ") : "")}</td>
      <td>${escapeHtml(role.lifecycleState || "")}</td>
      <td>${escapeHtml(role.assignment || "")}</td>
      <td>${renderBoolean(Boolean(role.consumesCanonicalContinuity))}</td>
      <td>${renderBoolean(!role.hasIndependentIdentity && !role.hasIndependentMemoryStore)}</td>
    </tr>
  `).join("");
  const dependencyRows = dependencies.map((dependency) => `
    <tr>
      <td>${escapeHtml(dependency.phase || "")}</td>
      <td><strong>${escapeHtml(dependency.name || dependency.id || "")}</strong></td>
      <td>${escapeHtml(dependency.obligation || "")}</td>
    </tr>
  `).join("");
  const deferredTargetRows = deferredTargets.map((target) => `
    <tr>
      <td><strong>${escapeHtml(target.name || target.id || "")}</strong></td>
      <td>${escapeHtml(target.purpose || "")}</td>
      <td>${escapeHtml(Array.isArray(target.builtByRoles) ? target.builtByRoles.join(", ") : "")}</td>
      <td>${escapeHtml(target.lifecycleState || "")}</td>
      <td>${renderBoolean(Boolean(target.phase91SelectableRole))}</td>
      <td>${renderBoolean(Boolean(target.requiresSeparateContract))}</td>
    </tr>
  `).join("");
  const artifactRows = artifactContracts.map((artifact) => `
    <tr>
      <td><strong>${escapeHtml(artifact.kind || "")}</strong></td>
      <td>${escapeHtml(artifact.producedBy || "")}</td>
      <td>${escapeHtml(Array.isArray(artifact.consumedBy) ? artifact.consumedBy.join(", ") : "")}</td>
      <td>${renderBoolean(Boolean(artifact.operatorApprovalRequired))}</td>
      <td>${renderBoolean(Boolean(artifact.phase91ExecutionEnabled))}</td>
    </tr>
  `).join("");
  const budgetRows = contextBudgets.map((budget) => `
    <tr>
      <td><strong>${escapeHtml(budget.roleId || "")}</strong></td>
      <td>${escapeHtml(budget.profileName || "")}</td>
      <td>${escapeHtml(String(budget.maxContextChars || ""))}</td>
      <td>${escapeHtml(budget.continuityScope || "")}</td>
      <td>${renderBoolean(Boolean(budget.requiresCanonicalContinuityRef))}</td>
    </tr>
  `).join("");
  const acceptanceRows = acceptanceChecklist.map((check) => `
    <tr>
      <td><strong>${escapeHtml(check.id || "")}</strong></td>
      <td>${escapeHtml(check.category || "")}</td>
      <td>${escapeHtml(check.requirement || "")}</td>
      <td>${renderBoolean(Boolean(check.satisfied))}</td>
      <td>${escapeHtml(check.evidence || "")}</td>
    </tr>
  `).join("");
  const transitionRows = transitions.map((transition) => `
    <tr>
      <td><strong>${escapeHtml(transition.transitionKind || "")}</strong></td>
      <td>${escapeHtml(Array.isArray(transition.fromRole) ? (transition.fromRole[0] || "operator objective") : (transition.fromRole || "operator objective"))}</td>
      <td>${escapeHtml(Array.isArray(transition.toRole) ? (transition.toRole[0] || "approved action") : (transition.toRole || "approved action"))}</td>
      <td>${escapeHtml(transition.approvalState || "")}</td>
      <td>${renderBoolean(Boolean(transition.operatorApprovalRequired))}</td>
      <td>${renderBoolean(Boolean(transition.supportedInPhase91))}</td>
    </tr>
  `).join("");
  const failClosedRows = failClosedRules.map((rule) => `
    <tr>
      <td><strong>${escapeHtml(rule.category || "")}</strong></td>
      <td>${escapeHtml(rule.trigger || "")}</td>
      <td>${escapeHtml(rule.requiredBehavior || "")}</td>
      <td>${renderBoolean(Boolean(rule.operatorRecoverable))}</td>
    </tr>
  `).join("");

  return `
    <div class="memory-card">
      <h3>${escapeHtml(sourceLabel)}</h3>
      <p>${escapeHtml(data.architecturalSubject || "")}</p>
      <p class="meta">Version: ${escapeHtml(data.foundationVersion || "")} | Read-only: ${data.readOnly ? "yes" : "no"} | Provider calls: ${data.providerCallsEnabled ? "enabled" : "disabled"} | Memory writes: ${data.roleDrivenMemoryWritesEnabled ? "enabled" : "disabled"}</p>
      <p>${escapeHtml(data.lifecycleSummary || "")}</p>
    </div>
    <div class="memory-card">
      <h3>Role Registry</h3>
      <table>
        <thead><tr><th>Role</th><th>Responsibility</th><th>Capabilities</th><th>Constraints</th><th>Lifecycle</th><th>Assignment</th><th>Canonical continuity</th><th>One Aion</th></tr></thead>
        <tbody>${roleRows || "<tr><td colspan=\"8\">No roles returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Contract Dependencies</h3>
      <table>
        <thead><tr><th>Phase</th><th>Contract</th><th>Phase 9.1 obligation</th></tr></thead>
        <tbody>${dependencyRows || "<tr><td colspan=\"3\">No dependencies returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Deferred Integration Targets</h3>
      <table>
        <thead><tr><th>Target</th><th>Purpose</th><th>Built by</th><th>Lifecycle</th><th>Selectable role</th><th>Separate contract</th></tr></thead>
        <tbody>${deferredTargetRows || "<tr><td colspan=\"6\">No deferred targets returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Artifact Contracts</h3>
      <table>
        <thead><tr><th>Artifact</th><th>Produced by</th><th>Consumed by</th><th>Approval</th><th>9.1 execution</th></tr></thead>
        <tbody>${artifactRows || "<tr><td colspan=\"5\">No artifact contracts returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Context Budget Profiles</h3>
      <table>
        <thead><tr><th>Role</th><th>Profile</th><th>Max chars</th><th>Scope</th><th>Canonical ref</th></tr></thead>
        <tbody>${budgetRows || "<tr><td colspan=\"5\">No context budgets returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Transition Model</h3>
      <table>
        <thead><tr><th>Transition</th><th>From</th><th>To</th><th>Approval</th><th>Operator approval</th><th>Supported</th></tr></thead>
        <tbody>${transitionRows || "<tr><td colspan=\"6\">No transitions returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Operator Surface Boundary</h3>
      ${renderCountMap({
        "admin.html purpose": surfaceBoundary.adminHtmlPurpose || "",
        "operator.html purpose": surfaceBoundary.operatorHtmlPurpose || "",
        "admin remains governance console": surfaceBoundary.adminHtmlRemainsGovernanceConsole,
        "operator.html expected for Phase 9": surfaceBoundary.operatorHtmlExpectedForPhase9,
        "operator.html built in 9.1": surfaceBoundary.operatorHtmlBuiltInPhase91,
        "shared operator session required": surfaceBoundary.sharedOperatorSessionBoundaryRequired,
        "public Aion changed": surfaceBoundary.publicAionSurfaceChanged,
      })}
    </div>
    <div class="memory-card">
      <h3>Phase 9.1 Acceptance Checklist</h3>
      <table>
        <thead><tr><th>Check</th><th>Category</th><th>Requirement</th><th>Satisfied</th><th>Evidence</th></tr></thead>
        <tbody>${acceptanceRows || "<tr><td colspan=\"5\">No acceptance checks returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Role Request Contract</h3>
      ${renderCountMap({
        "request version": requestContract.requestVersion || "",
        "required fields": Array.isArray(requestContract.requiredFields) ? requestContract.requiredFields.join(", ") : "",
        "required context fields": Array.isArray(requestContract.requiredContextFields) ? requestContract.requiredContextFields.join(", ") : "",
        "prohibited inputs": Array.isArray(requestContract.prohibitedInputs) ? requestContract.prohibitedInputs.join(", ") : "",
        "supported roles": Array.isArray(requestContract.supportedRoles) ? requestContract.supportedRoles.join(", ") : "",
        "trusted context preparer": requestContract.trustedContextPreparer || "",
        "approval required for consequential transitions": requestContract.operatorApprovalRequiredForConsequentialTransitions,
        "provider neutral": requestContract.providerNeutral,
        "fail closed on malformed request": requestContract.failClosedOnMalformedRequest,
      })}
    </div>
    <div class="memory-card">
      <h3>Role Result Contract</h3>
      ${renderCountMap({
        "result version": resultContract.resultVersion || "",
        "required fields": Array.isArray(resultContract.requiredFields) ? resultContract.requiredFields.join(", ") : "",
        "prohibited claims": Array.isArray(resultContract.prohibitedClaims) ? resultContract.prohibitedClaims.join(", ") : "",
        "evidence/provenance required": resultContract.evidenceAndProvenanceRequired,
        "approval state required": resultContract.operatorApprovalStateRequired,
        "provider route disclosure required": resultContract.providerRouteDisclosureRequired,
        "canonical memory write allowed": resultContract.canonicalMemoryWriteAllowed,
        "production action allowed": resultContract.productionActionAllowed,
        "9.1 live output allowed": resultContract.phase91LiveOutputAllowed,
      })}
    </div>
    <div class="memory-card">
      <h3>Fail-Closed Rules</h3>
      <table>
        <thead><tr><th>Category</th><th>Trigger</th><th>Required behavior</th><th>Operator recoverable</th></tr></thead>
        <tbody>${failClosedRows || "<tr><td colspan=\"4\">No fail-closed rules returned.</td></tr>"}</tbody>
      </table>
    </div>
    <div class="memory-card">
      <h3>Policy Boundary</h3>
      ${renderCountMap({
        "one canonical identity": policy.oneCanonicalIdentityRequired,
        "one canonical continuity": policy.oneCanonicalContinuityRequired,
        "human authority": policy.humanAuthorityRequired,
        "execution-model independent": policy.executionModelIndependent,
        "provider policy separated": policy.providerPolicySeparated,
        "live inference allowed": policy.liveInferenceAllowed,
        "role memory writes allowed": policy.roleDrivenMemoryWritesAllowed,
        "autonomous execution allowed": policy.autonomousToolExecutionAllowed,
        "oracle target execution enabled": policy.oracleIntegrationTargetExecutionEnabled,
      })}
    </div>
    <div class="memory-card">
      <h3>Context Packet Preview</h3>
      ${renderCountMap({
        "packet version": context.packetVersion || "",
        "canonical continuity": context.canonicalContinuityRef || "",
        "prepared by": context.preparedByAionLayer || "",
        "approval state": context.approvalState || "",
        "separate role continuity requested": context.separateRoleContinuityRequested,
        "role private memory requested": context.rolePrivateMemoryRequested,
        "provider routing included": context.providerSpecificRoutingIncluded,
      })}
    </div>
  `;
}

function renderRoleRulesOperatingAgreementReport(data = {}, sourceLabel = "Status") {
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const transitionRules = Array.isArray(data.transitionRules) ? data.transitionRules : [];
  const outputInfluenceRules = Array.isArray(data.outputInfluenceRules) ? data.outputInfluenceRules : [];
  const surfaceRules = Array.isArray(data.surfaceRules) ? data.surfaceRules : [];
  const acceptanceChecklist = Array.isArray(data.acceptanceChecklist) ? data.acceptanceChecklist : [];
  const roleRows = roles.map((role) => `
    <tr>
      <td><strong>${escapeHtml(role.roleId || "")}</strong></td>
      <td>${escapeHtml(Array.isArray(role.owns) ? role.owns.join(", ") : "")}</td>
      <td>${escapeHtml(Array.isArray(role.doesNotOwn) ? role.doesNotOwn.join(", ") : "")}</td>
      <td>${escapeHtml(role.receivesContinuity || "")}</td>
      <td>${escapeHtml(Array.isArray(role.outputMayInfluence) ? role.outputMayInfluence.join(", ") : "")}</td>
      <td>${escapeHtml(Array.isArray(role.operatorApprovalRequiredBefore) ? role.operatorApprovalRequiredBefore.join(", ") : "")}</td>
    </tr>
  `).join("");
  const ruleRows = rules.map((rule) => `
    <tr>
      <td><strong>${escapeHtml(rule.title || rule.id || "")}</strong><br><span class="meta">${escapeHtml(rule.id || "")}</span></td>
      <td>${escapeHtml(rule.category || "")}</td>
      <td>${escapeHtml(rule.requirement || "")}</td>
      <td>${escapeHtml(rule.enforcement || "")}</td>
      <td>${escapeHtml(rule.validatorId || "")}</td>
      <td>${escapeHtml(rule.severity || "")}</td>
    </tr>
  `).join("");
  const transitionRows = transitionRules.map((rule) => `
    <tr>
      <td><strong>${escapeHtml(rule.transition || "")}</strong></td>
      <td>${escapeHtml(rule.description || "")}</td>
      <td>${renderBoolean(Boolean(rule.operatorApprovalRequired))}</td>
      <td>${renderBoolean(Boolean(rule.autonomousRoleTransferAllowed))}</td>
      <td>${renderBoolean(Boolean(rule.failClosedWithoutApproval))}</td>
    </tr>
  `).join("");
  const influenceRows = outputInfluenceRules.map((rule) => `
    <tr>
      <td><strong>${escapeHtml(rule.artifactKind || "")}</strong></td>
      <td>${escapeHtml(rule.producedBy || "")}</td>
      <td>${renderBoolean(Boolean(rule.mayInfluenceLaterWork))}</td>
      <td>${renderBoolean(Boolean(rule.influenceRequiresOperatorReview))}</td>
      <td>${renderBoolean(Boolean(rule.canonicalMemoryWriteAllowed))}</td>
      <td>${renderBoolean(Boolean(rule.providerRouteChangeAllowed))}</td>
      <td>${renderBoolean(Boolean(rule.implementationAuthorizationAllowed))}</td>
    </tr>
  `).join("");
  const surfaceRows = surfaceRules.map((rule) => `
    <tr>
      <td><strong>${escapeHtml(rule.surfaceId || "")}</strong></td>
      <td>${escapeHtml(rule.purpose || "")}</td>
      <td>${renderBoolean(Boolean(rule.operatorSessionRequired))}</td>
      <td>${renderBoolean(Boolean(rule.publicSurfaceAllowed))}</td>
      <td>${renderBoolean(Boolean(rule.consequentialActionsAllowed))}</td>
    </tr>
  `).join("");
  const acceptanceRows = acceptanceChecklist.map((check) => `
    <tr>
      <td><strong>${escapeHtml(check.id || "")}</strong></td>
      <td>${escapeHtml(check.requirement || "")}</td>
      <td>${renderBoolean(Boolean(check.satisfied))}</td>
      <td>${escapeHtml(check.evidence || "")}</td>
    </tr>
  `).join("");

  return `
    <div class="memory-card">
      <h3>${escapeHtml(sourceLabel)}</h3>
      <p>${escapeHtml(data.purpose || "")}</p>
      <p class="meta">Version: ${escapeHtml(data.agreementVersion || "")} | Read-only: ${data.readOnly ? "yes" : "no"} | Live inference: ${data.liveInferenceEnabled ? "enabled" : "disabled"} | Consequential actions: ${data.consequentialActionsEnabled ? "enabled" : "disabled"}</p>
      ${renderCountMap({
        "role policy": data.rolePolicyQuestion || "",
        "provider policy": data.providerPolicyQuestion || "",
        "continuity owner": data.canonicalContinuityOwner || "",
        "trusted context preparer": data.trustedContextPreparer || "",
        "next milestone": data.nextMilestone || "",
      })}
    </div>
    <div class="memory-card">
      <h3>Role Ownership</h3>
      <table><thead><tr><th>Role</th><th>Owns</th><th>Does not own</th><th>Continuity received</th><th>May influence</th><th>Approval before</th></tr></thead><tbody>${roleRows || "<tr><td colspan=\"6\">No roles returned.</td></tr>"}</tbody></table>
    </div>
    <div class="memory-card">
      <h3>Enforceable Rules</h3>
      <table><thead><tr><th>Rule</th><th>Category</th><th>Requirement</th><th>Enforcement</th><th>Validator</th><th>Severity</th></tr></thead><tbody>${ruleRows || "<tr><td colspan=\"6\">No rules returned.</td></tr>"}</tbody></table>
    </div>
    <div class="memory-card">
      <h3>Governed Transitions</h3>
      <table><thead><tr><th>Transition</th><th>Description</th><th>Approval</th><th>Autonomous transfer</th><th>Fail closed</th></tr></thead><tbody>${transitionRows || "<tr><td colspan=\"5\">No transition rules returned.</td></tr>"}</tbody></table>
    </div>
    <div class="memory-card">
      <h3>Output Influence</h3>
      <table><thead><tr><th>Artifact</th><th>Role</th><th>May influence</th><th>Review required</th><th>Memory write</th><th>Provider route</th><th>Implementation auth</th></tr></thead><tbody>${influenceRows || "<tr><td colspan=\"7\">No influence rules returned.</td></tr>"}</tbody></table>
    </div>
    <div class="memory-card">
      <h3>Private Surfaces</h3>
      <table><thead><tr><th>Surface</th><th>Purpose</th><th>Operator session</th><th>Public</th><th>Consequential actions</th></tr></thead><tbody>${surfaceRows || "<tr><td colspan=\"5\">No surface rules returned.</td></tr>"}</tbody></table>
    </div>
    <div class="memory-card">
      <h3>9.2 Acceptance</h3>
      <table><thead><tr><th>Check</th><th>Requirement</th><th>Satisfied</th><th>Evidence</th></tr></thead><tbody>${acceptanceRows || "<tr><td colspan=\"4\">No acceptance checks returned.</td></tr>"}</tbody></table>
    </div>
  `;
}

function sortedRoleFoundationValues(items, selector) {
  return (Array.isArray(items) ? items : [])
    .map(selector)
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String)
    .sort();
}

function roleFoundationValueSetsMatch(left, right, selector) {
  const leftValues = sortedRoleFoundationValues(left, selector);
  const rightValues = sortedRoleFoundationValues(right, selector);
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

function phase91AcceptanceSatisfied(report = {}) {
  const checks = Array.isArray(report.acceptanceChecklist)
    ? report.acceptanceChecklist
    : [];
  return checks.length > 0 && checks.every((check) => Boolean(check.satisfied));
}

function roleFoundationSurfaceFlagsMatch(nativeReport = {}, renderReport = {}) {
  const nativeSurface = nativeReport.surfaceBoundary || {};
  const renderSurface = renderReport.surfaceBoundary || {};
  return nativeSurface.adminHtmlRemainsGovernanceConsole === renderSurface.adminHtmlRemainsGovernanceConsole
    && nativeSurface.operatorHtmlExpectedForPhase9 === renderSurface.operatorHtmlExpectedForPhase9
    && nativeSurface.operatorHtmlBuiltInPhase91 === renderSurface.operatorHtmlBuiltInPhase91
    && nativeSurface.sharedOperatorSessionBoundaryRequired === renderSurface.sharedOperatorSessionBoundaryRequired
    && nativeSurface.publicAionSurfaceChanged === renderSurface.publicAionSurfaceChanged;
}

function roleFoundationResultContractMatches(nativeReport = {}, renderReport = {}) {
  const nativeContract = nativeReport.resultContract || {};
  const renderContract = renderReport.resultContract || {};
  return nativeContract.resultVersion === renderContract.resultVersion
    && nativeContract.evidenceAndProvenanceRequired === renderContract.evidenceAndProvenanceRequired
    && nativeContract.operatorApprovalStateRequired === renderContract.operatorApprovalStateRequired
    && nativeContract.providerRouteDisclosureRequired === renderContract.providerRouteDisclosureRequired
    && nativeContract.canonicalMemoryWriteAllowed === renderContract.canonicalMemoryWriteAllowed
    && nativeContract.productionActionAllowed === renderContract.productionActionAllowed
    && nativeContract.phase91LiveOutputAllowed === renderContract.phase91LiveOutputAllowed
    && roleFoundationValueSetsMatch(nativeContract.requiredFields, renderContract.requiredFields, (value) => value)
    && roleFoundationValueSetsMatch(nativeContract.prohibitedClaims, renderContract.prohibitedClaims, (value) => value);
}

function roleFoundationRequestContractMatches(nativeReport = {}, renderReport = {}) {
  const nativeContract = nativeReport.requestContract || {};
  const renderContract = renderReport.requestContract || {};
  return nativeContract.requestVersion === renderContract.requestVersion
    && nativeContract.trustedContextPreparer === renderContract.trustedContextPreparer
    && nativeContract.operatorApprovalRequiredForConsequentialTransitions === renderContract.operatorApprovalRequiredForConsequentialTransitions
    && nativeContract.providerNeutral === renderContract.providerNeutral
    && nativeContract.failClosedOnMalformedRequest === renderContract.failClosedOnMalformedRequest
    && roleFoundationValueSetsMatch(nativeContract.requiredFields, renderContract.requiredFields, (value) => value)
    && roleFoundationValueSetsMatch(nativeContract.requiredContextFields, renderContract.requiredContextFields, (value) => value)
    && roleFoundationValueSetsMatch(nativeContract.prohibitedInputs, renderContract.prohibitedInputs, (value) => value)
    && roleFoundationValueSetsMatch(nativeContract.supportedRoles, renderContract.supportedRoles, (value) => value);
}

function roleFoundationRoleDetailsMatch(nativeReport = {}, renderReport = {}) {
  const renderRolesById = new Map(
    (Array.isArray(renderReport.roles) ? renderReport.roles : [])
      .map((role) => [role.id, role])
  );
  return (Array.isArray(nativeReport.roles) ? nativeReport.roles : []).every((nativeRole) => {
    const renderRole = renderRolesById.get(nativeRole.id);
    return renderRole
      && roleFoundationValueSetsMatch(nativeRole.capabilities, renderRole.capabilities, (value) => value)
      && roleFoundationValueSetsMatch(nativeRole.constraints, renderRole.constraints, (value) => value)
      && roleFoundationValueSetsMatch(nativeRole.doesNotOwn, renderRole.doesNotOwn, (value) => value);
  });
}

function roleFoundationReportsAligned(nativeReport = {}, renderReport = {}) {
  return nativeReport.foundationVersion === renderReport.foundationVersion
    && nativeReport.readOnly === renderReport.readOnly
    && nativeReport.providerCallsEnabled === renderReport.providerCallsEnabled
    && nativeReport.roleDrivenMemoryWritesEnabled === renderReport.roleDrivenMemoryWritesEnabled
    && nativeReport.autonomousExecutionEnabled === renderReport.autonomousExecutionEnabled
    && nativeReport.publicBehaviorChanged === renderReport.publicBehaviorChanged
    && nativeReport.nonOperatorSurfaceAllowed === renderReport.nonOperatorSurfaceAllowed
    && roleFoundationValueSetsMatch(nativeReport.roles, renderReport.roles, (role) => role.id)
    && roleFoundationRoleDetailsMatch(nativeReport, renderReport)
    && roleFoundationValueSetsMatch(nativeReport.deferredIntegrationTargets, renderReport.deferredIntegrationTargets, (target) => target.id)
    && roleFoundationValueSetsMatch(nativeReport.contractDependencies, renderReport.contractDependencies, (dependency) => dependency.id)
    && roleFoundationValueSetsMatch(nativeReport.artifactContracts, renderReport.artifactContracts, (artifact) => artifact.kind)
    && roleFoundationValueSetsMatch(nativeReport.contextBudgetProfiles, renderReport.contextBudgetProfiles, (budget) => `${budget.roleId}:${budget.profileName}`)
    && roleFoundationValueSetsMatch(nativeReport.acceptanceChecklist, renderReport.acceptanceChecklist, (check) => check.id)
    && roleFoundationValueSetsMatch(nativeReport.failClosedRules, renderReport.failClosedRules, (rule) => rule.category)
    && phase91AcceptanceSatisfied(nativeReport)
    && phase91AcceptanceSatisfied(renderReport)
    && roleFoundationRequestContractMatches(nativeReport, renderReport)
    && roleFoundationResultContractMatches(nativeReport, renderReport)
    && roleFoundationSurfaceFlagsMatch(nativeReport, renderReport);
}

window.runRoleBasedIntelligenceFoundationStatus = async function runRoleBasedIntelligenceFoundationStatus() {
  if (!isAuthenticated || !isOperator || !window.adminActor) {
    alert("Operator access is required.");
    return;
  }

  const container = document.getElementById("roleBasedIntelligenceFoundationResults");
  container.innerHTML = "<p>Inspecting Phase 9 role foundation...</p>";

  try {
    const [nativeReport, renderResponse] = await Promise.all([
      window.adminActor.getAionRoleBasedIntelligenceStatus(),
      fetch(`${AIONIC_AGENT_API_BASE_URL}/admin/role-based-intelligence-foundation`),
    ]);
    const renderReport = await renderResponse.json();

    if (renderReport.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(renderReport.error)}</p>`;
      return;
    }

    const nativeMatchesRender = roleFoundationReportsAligned(nativeReport, renderReport);

    container.innerHTML = `
      <div class="memory-card">
        <h3>Phase 9.1 Role Foundation</h3>
        <p>Role-Based Intelligence is represented as one Aion with bounded operational roles, shared canonical continuity, and explicit operator authority. Oracle is tracked only as a deferred integration target.</p>
        <p><span class="status-badge ${nativeMatchesRender ? "success" : "error"}">${nativeMatchesRender ? "native/render aligned" : "review alignment"}</span></p>
      </div>
      ${renderRoleBasedIntelligenceReport(nativeReport, "Native Canister Status")}
      ${renderRoleBasedIntelligenceReport(renderReport, "Render Bridge Status")}
    `;
  } catch (err) {
    console.error("Role-based intelligence status failed:", err);
    container.innerHTML = `<p>Role-based intelligence status failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function roleRulesValuesMatch(left, right, selector) {
  const leftValues = sortedRoleFoundationValues(left, selector);
  const rightValues = sortedRoleFoundationValues(right, selector);
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

function roleRulesReportsAligned(nativeReport = {}, renderReport = {}) {
  const nativeChecks = Array.isArray(nativeReport.acceptanceChecklist) ? nativeReport.acceptanceChecklist : [];
  const renderChecks = Array.isArray(renderReport.acceptanceChecklist) ? renderReport.acceptanceChecklist : [];
  return nativeReport.agreementVersion === renderReport.agreementVersion
    && nativeReport.readOnly === renderReport.readOnly
    && nativeReport.liveInferenceEnabled === renderReport.liveInferenceEnabled
    && nativeReport.consequentialActionsEnabled === renderReport.consequentialActionsEnabled
    && nativeReport.publicBehaviorChanged === renderReport.publicBehaviorChanged
    && nativeReport.rolePolicyQuestion === renderReport.rolePolicyQuestion
    && nativeReport.providerPolicyQuestion === renderReport.providerPolicyQuestion
    && roleRulesValuesMatch(nativeReport.roles, renderReport.roles, (role) => role.roleId)
    && roleRulesValuesMatch(nativeReport.rules, renderReport.rules, (rule) => rule.id)
    && roleRulesValuesMatch(nativeReport.transitionRules, renderReport.transitionRules, (rule) => rule.transition)
    && roleRulesValuesMatch(nativeReport.outputInfluenceRules, renderReport.outputInfluenceRules, (rule) => rule.artifactKind)
    && roleRulesValuesMatch(nativeReport.surfaceRules, renderReport.surfaceRules, (rule) => rule.surfaceId)
    && roleRulesValuesMatch(nativeChecks, renderChecks, (check) => check.id)
    && nativeChecks.length > 0
    && renderChecks.length > 0
    && nativeChecks.every((check) => Boolean(check.satisfied))
    && renderChecks.every((check) => Boolean(check.satisfied));
}

window.runRoleRulesOperatingAgreementStatus = async function runRoleRulesOperatingAgreementStatus() {
  if (!isAuthenticated || !isOperator || !window.adminActor) {
    alert("Operator access is required.");
    return;
  }

  const container = document.getElementById("roleRulesOperatingAgreementResults");
  container.innerHTML = "<p>Inspecting Phase 9.2 Roles & Rules...</p>";

  try {
    const [nativeReport, renderResponse] = await Promise.all([
      window.adminActor.getAionRoleRulesOperatingAgreementStatus(),
      fetch(`${AIONIC_AGENT_API_BASE_URL}/admin/role-rules-operating-agreement`),
    ]);
    const renderReport = await renderResponse.json();

    if (renderReport.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(renderReport.error)}</p>`;
      return;
    }

    const nativeMatchesRender = roleRulesReportsAligned(nativeReport, renderReport);
    container.innerHTML = `
      <div class="memory-card">
        <h3>Phase 9.2 Roles & Rules</h3>
        <p>Prime, Mirror, and Engineer are visible as bounded Aion responsibilities with typed ownership, approval, transition, surface, and output-influence rules.</p>
        <p><span class="status-badge ${nativeMatchesRender ? "success" : "error"}">${nativeMatchesRender ? "native/render aligned" : "review alignment"}</span></p>
      </div>
      ${renderRoleRulesOperatingAgreementReport(nativeReport, "Native Canister Rules")}
      ${renderRoleRulesOperatingAgreementReport(renderReport, "Render Bridge Rules")}
    `;
  } catch (err) {
    console.error("Role rules operating agreement failed:", err);
    container.innerHTML = `<p>Role rules operating agreement failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function nativeOperationKey(operation = {}) {
  return Object.keys(operation)[0] || "unknown";
}

function policyParityChecks(route, nativeDecision) {
  const expected = route.nativeDecision || {};

  return {
    operation: nativeOperationKey(nativeDecision.operation) === route.operationId,
    provider: nativeDecision.providerId === expected.providerId,
    route: nativeDecision.routeId === expected.routeId,
    invocation: nativeDecision.invocationPermitted === expected.invocationPermitted,
    operatorAction: nativeDecision.explicitOperatorAction === expected.explicitOperatorAction,
    promotion: nativeDecision.promotionRequired === expected.promotionRequired,
    fallback: nativeDecision.automaticFallback === expected.automaticFallback,
  };
}

window.runAionProviderPolicyParityDebug = async function runAionProviderPolicyParityDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("aionProviderPolicyParityResults");
  container.innerHTML = "<p>Comparing Render and native provider policy...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/aion-provider-routing-policy");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const routes = Array.isArray(data.routes)
      ? data.routes.filter((route) => route.operationId && route.nativeDecision)
      : [];

    if (routes.length !== 3) {
      container.innerHTML = "<p>Policy parity metadata is incomplete.</p>";
      return;
    }

    const results = await Promise.all(routes.map(async (route) => {
      try {
        const nativeDecision = await window.adminActor.previewAionProviderRoute({
          [route.operationId]: null,
        });
        const checks = policyParityChecks(route, nativeDecision);
        const matches = Object.values(checks).every(Boolean);

        return { route, nativeDecision, checks, matches, error: "" };
      } catch (err) {
        return {
          route,
          nativeDecision: null,
          checks: {},
          matches: false,
          error: err.message || String(err),
        };
      }
    }));

    const matchedCount = results.filter((result) => result.matches).length;
    const allMatch = matchedCount === results.length;
    const rows = results.map((result) => {
      const expected = result.route.nativeDecision || {};
      const actual = result.nativeDecision;
      const actualRoute = actual
        ? `${actual.providerId || ""} / ${actual.routeId || ""}`
        : "No native result";
      const checkSummary = result.error
        ? escapeHtml(result.error)
        : Object.entries(result.checks)
          .map(([name, passed]) => `${name}: ${passed ? "pass" : "review"}`)
          .join(" | ");

      return `
        <tr>
          <td><strong>${escapeHtml(result.route.operation || "")}</strong></td>
          <td>${escapeHtml(`${expected.providerId || ""} / ${expected.routeId || ""}`)}</td>
          <td>${escapeHtml(actualRoute)}</td>
          <td><span class="status-badge ${result.matches ? "success" : "error"}">${result.matches ? "match" : "review"}</span></td>
          <td>${escapeHtml(checkSummary)}</td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="memory-card">
        <h3>Native Provider Policy Parity</h3>
        <p>Render policy and the live ICP route preview are compared for fixed operations only.</p>
        <p class="meta">Phase: 7.44 | Provider calls: no | Memory writes: no | Automatic switching: no</p>
        <p><span class="status-badge ${allMatch ? "success" : "error"}">${allMatch ? "parity confirmed" : "parity review needed"}</span> ${matchedCount}/${results.length} routes matched</p>
      </div>
      <div class="memory-card">
        <h3>Route Comparison</h3>
        <table>
          <thead><tr><th>Operation</th><th>Render expectation</th><th>Native result</th><th>Status</th><th>Checks</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="memory-card">
        <h3>Boundary</h3>
        <p>This report compares policy descriptions. It does not invoke OpenAI, ICP LLM, or any other reasoning provider, and it does not authorize route enforcement.</p>
      </div>
    `;
  } catch (err) {
    console.error("Aion provider policy parity failed:", err);
    container.innerHTML = `<p>Aion provider policy parity failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runAionRouteEnforcementHandoffDebug = async function runAionRouteEnforcementHandoffDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("aionRouteEnforcementHandoffResults");
  container.innerHTML = "<p>Building route-enforcement handoff design...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/aion-route-enforcement-handoff");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const routeRows = Array.isArray(data.routeMatrix) ? data.routeMatrix.map((route) => `
      <tr>
        <td><strong>${escapeHtml(route.operation || "")}</strong></td>
        <td>${escapeHtml(route.nativeRoute || "")}</td>
        <td>${escapeHtml(route.adapter || "")}</td>
        <td>${escapeHtml(route.enforcementStatus || "")}</td>
        <td>${escapeHtml(route.requirement || "")}</td>
      </tr>
    `).join("") : "";

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Aion Route Enforcement Handoff Design")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Phase: ${escapeHtml(data.phase || "7.45")} | Dry run: ${data.dryRunOnly ? "yes" : "no"} | Provider calls: ${data.providerCallsMade ? "yes" : "no"} | Automatic switching: ${data.automaticSwitching ? "yes" : "no"}</p>
      </div>
      <div class="memory-card"><h3>Parity Evidence</h3>${renderCountMap(data.parityEvidence || {})}</div>
      <div class="memory-card"><h3>Native Decision Contract</h3>${renderCountMap(data.nativeDecisionContract || {})}</div>
      <div class="memory-card"><h3>Aion Request Boundary</h3>${renderCountMap(data.aionRequestBoundary || {})}</div>
      <div class="memory-card"><h3>Handoff Sequence</h3><ol>${(data.handoffSequence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div>
      <div class="memory-card"><h3>Route Matrix</h3><table><thead><tr><th>Operation</th><th>Native route</th><th>External adapter</th><th>Enforcement</th><th>Requirement</th></tr></thead><tbody>${routeRows}</tbody></table></div>
      <div class="memory-card"><h3>Failure Policy</h3><ul>${(data.failurePolicy || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Promotion Requirements</h3><ul>${(data.promotionRequirements || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Non-Goals</h3><ul>${(data.nonGoals || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    `;
  } catch (err) {
    console.error("Aion route enforcement handoff design failed:", err);
    container.innerHTML = `<p>Aion route enforcement handoff design failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runProviderAdapterGuardDebug = async function runProviderAdapterGuardDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("providerAdapterGuardResults");
  container.innerHTML = "<p>Running provider adapter guard fixtures...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/provider-adapter-guard");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const summary = data.summaryCounts || {};
    const rows = Array.isArray(data.fixtureResults) ? data.fixtureResults.map((fixture) => `
      <tr>
        <td><strong>${escapeHtml(fixture.name || "")}</strong></td>
        <td>${escapeHtml(fixture.expected || "")}</td>
        <td>${escapeHtml(fixture.actual || "")}</td>
        <td><span class="status-badge ${fixture.passed ? "success" : "error"}">${fixture.passed ? "pass" : "review"}</span></td>
      </tr>
    `).join("") : "";
    const fullyGreen = Number(summary.review || 0) === 0;

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Provider Adapter Guard Fixture Run")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Phase: ${escapeHtml(data.phase || "7.48")} | Provider calls: ${data.providerCallsMade ? "yes" : "no"} | Memory writes: ${data.memoryWrites ? "yes" : "no"} | Automatic switching: ${data.automaticSwitching ? "yes" : "no"}</p>
        <p><span class="status-badge ${fullyGreen ? "success" : "error"}">${fullyGreen ? "fixtures passed" : "review required"}</span> ${escapeHtml(summary.passed || 0)}/${escapeHtml(summary.fixtures || 0)} passed</p>
      </div>
      <div class="memory-card"><h3>Contract Boundary</h3>${renderCountMap(data.contractBoundary || {})}</div>
      <div class="memory-card"><h3>Normalized Errors</h3><p>${(data.normalizedErrors || []).map((item) => `<code>${escapeHtml(item)}</code>`).join(" | ")}</p></div>
      <div class="memory-card"><h3>Fixture Results</h3><table><thead><tr><th>Fixture</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="memory-card"><h3>Guardrails</h3><ul>${(data.guardrails || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    `;
  } catch (err) {
    console.error("Provider adapter guard fixtures failed:", err);
    container.innerHTML = `<p>Provider adapter guard fixtures failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runLiveProviderAdapterHandoffSimulationDebug = async function runLiveProviderAdapterHandoffSimulationDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("liveProviderAdapterHandoffResults");
  container.innerHTML = "<p>Simulating live native policy handoffs...</p>";

  const operations = [
    { operationId: "publicAnswer", expected: "accepted" },
    { operationId: "adminCandidateEvaluation", expected: "accepted" },
    { operationId: "nativeContinuityPreview", expected: "invocation_not_permitted" },
  ];

  try {
    const results = await Promise.all(operations.map(async ({ operationId, expected }) => {
      try {
        const nativeDecision = await window.adminActor.previewAionProviderRoute({
          [operationId]: null,
        });
        const nativeOperation = nativeOperationKey(nativeDecision.operation);
        const response = await fetch(
          "https://aionic-agent-api.onrender.com/admin/provider-adapter-handoff-simulation",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: operationId,
              decisionOperation: nativeOperation,
              providerId: nativeDecision.providerId,
              routeId: nativeDecision.routeId,
              invocationPermitted: nativeDecision.invocationPermitted,
              explicitOperatorAction: nativeDecision.explicitOperatorAction,
              promotionRequired: nativeDecision.promotionRequired,
              automaticFallback: nativeDecision.automaticFallback,
              timeoutMs: 30000,
            }),
          }
        );
        const simulation = await response.json();

        if (simulation.error) {
          return { operationId, expected, simulation: null, passed: false, error: simulation.error };
        }

        return {
          operationId,
          expected,
          simulation,
          passed: simulation.handoffValidation === expected && simulation.providerCallsMade === false,
          error: "",
        };
      } catch (err) {
        return { operationId, expected, simulation: null, passed: false, error: err.message || String(err) };
      }
    }));

    const passed = results.filter((result) => result.passed).length;
    const allPassed = passed === results.length;
    const rows = results.map((result) => {
      const simulation = result.simulation;
      const nativeRoute = simulation
        ? `${simulation.nativeDecision?.providerId || ""} / ${simulation.nativeDecision?.routeId || ""}`
        : "No simulation result";
      const actual = simulation ? simulation.handoffValidation : result.error;
      const adapter = simulation ? simulation.adapterInvocation : "not attempted";

      return `
        <tr>
          <td><strong>${escapeHtml(result.operationId)}</strong></td>
          <td>${escapeHtml(nativeRoute)}</td>
          <td>${escapeHtml(result.expected)}</td>
          <td>${escapeHtml(actual || "")}</td>
          <td>${escapeHtml(adapter)}</td>
          <td><span class="status-badge ${result.passed ? "success" : "error"}">${result.passed ? "pass" : "review"}</span></td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="memory-card">
        <h3>Live Provider Adapter Handoff Simulation</h3>
        <p>Live ICP route decisions are validated by the Render guard using server-created synthetic results only.</p>
        <p class="meta">Phase: 7.49 | Provider calls: no | Memory writes: no | Automatic switching: no</p>
        <p><span class="status-badge ${allPassed ? "success" : "error"}">${allPassed ? "handoff boundary confirmed" : "handoff review needed"}</span> ${passed}/${results.length} operations passed</p>
      </div>
      <div class="memory-card">
        <h3>Live Handoff Matrix</h3>
        <table><thead><tr><th>Operation</th><th>Native decision</th><th>Expected</th><th>Guard result</th><th>Adapter state</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="memory-card">
        <h3>Boundary</h3>
        <p>The browser sends only the fixed native decision fields. Render creates a synthetic result for validation and never invokes OpenAI, ICP LLM, or another provider.</p>
      </div>
    `;
  } catch (err) {
    console.error("Live provider adapter handoff simulation failed:", err);
    container.innerHTML = `<p>Live provider adapter handoff simulation failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runRenderNativeProviderPolicyQueryDebug = async function runRenderNativeProviderPolicyQueryDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("renderNativeProviderPolicyQueryResults");
  container.innerHTML = "<p>Querying the native policy from Render...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/render-native-provider-policy-query");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const summary = data.summaryCounts || {};
    const allPassed = Number(summary.review || 0) === 0;
    const rows = Array.isArray(data.results) ? data.results.map((result) => `
      <tr>
        <td><strong>${escapeHtml(result.operation || "")}</strong></td>
        <td>${escapeHtml(`${result.nativeDecision?.providerId || ""} / ${result.nativeDecision?.routeId || ""}`)}</td>
        <td>${result.policyParity ? "pass" : "review"}</td>
        <td>${escapeHtml(result.handoffValidation || "")}</td>
        <td>${escapeHtml(result.adapterInvocation || "")}</td>
        <td><span class="status-badge ${result.passed ? "success" : "error"}">${result.passed ? "pass" : "review"}</span></td>
      </tr>
    `).join("") : "";
    const trust = data.trustBoundary || {};

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Render-Initiated Native Policy Query")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Phase: ${escapeHtml(data.phase || "7.50")} | ICP queries: ${escapeHtml(data.canisterCallsMade || 0)} | Provider calls: ${data.providerCallsMade ? "yes" : "no"} | Memory writes: ${data.memoryWrites ? "yes" : "no"}</p>
        <p><span class="status-badge ${allPassed ? "success" : "error"}">${allPassed ? "server query confirmed" : "query review needed"}</span> ${escapeHtml(summary.passed || 0)}/${escapeHtml(summary.operations || 0)} operations passed</p>
      </div>
      <div class="memory-card"><h3>Canister Query</h3>${renderCountMap(data.canister || {})}</div>
      <div class="memory-card"><h3>Trust Boundary</h3>${renderCountMap(trust)}</div>
      <div class="memory-card"><h3>Server Query Matrix</h3><table><thead><tr><th>Operation</th><th>Native decision</th><th>Policy parity</th><th>Guard result</th><th>Adapter state</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="memory-card"><h3>Guardrails</h3><ul>${(data.guardrails || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    `;
  } catch (err) {
    console.error("Render native provider policy query failed:", err);
    container.innerHTML = `<p>Render native provider policy query failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

const GOLDEN_RESULTS_KEY = "aion_admin_golden_results";

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

function refreshRecommendedActionFromQuality() {
  if (typeof renderCycleSnapshot === "function") {
    renderCycleSnapshot(loadCycleSnapshot());
  }
}

function renderGoldenDashboardSignal(data = null) {
  const element = document.getElementById("healthGoldenTests");
  if (!data || !Number.isFinite(Number(data.total)) || Number(data.total) === 0) {
    if (element) {
      element.innerHTML = renderDashboardBadge("No run", "pending");
    }
    renderDashboardQualityAttention(data, latestFeedback);
    refreshRecommendedActionFromQuality();
    return;
  }

  const total = Number(data.total || 0);
  const passed = Number(data.passed || 0);
  const label = `${passed}/${total} passed`;
  const freshness = passed === total ? goldenFreshnessStatus(data) : null;
  const className = passed === total
    ? freshness.className === "healthy" ? "success" : "warning"
    : passed > 0 ? "warning" : "error";
  const badge = passed === total
    ? freshness.label === "Fresh" ? "Passing" : freshness.label
    : "Review";
  if (element) {
    element.innerHTML = `${escapeHtml(label)}${renderDashboardBadge(badge, className)}`;
  }
  renderDashboardQualityAttention(data, latestFeedback);
  refreshRecommendedActionFromQuality();
}

function renderFeedbackDashboardSignal(feedback = []) {
  const countElement = document.getElementById("healthFeedbackCount");
  const signalElement = document.getElementById("healthFeedbackSignal");
  const items = Array.isArray(feedback) ? feedback : [];
  const up = items.filter((item) => item.rating === "up").length;
  const down = items.filter((item) => item.rating === "down").length;
  const total = items.length;

  if (countElement) {
    countElement.textContent = total;
  }
  if (total === 0) {
    if (signalElement) {
      signalElement.innerHTML = renderDashboardBadge("No feedback", "pending");
    }
    renderDashboardQualityAttention(loadSavedGoldenResults(), items);
    refreshRecommendedActionFromQuality();
    return;
  }

  const label = `${up} helpful · ${down} needs work`;
  const className = down === 0 ? "success" : down > up ? "warning" : "healthy";
  if (signalElement) {
    signalElement.innerHTML = `${escapeHtml(label)}${renderDashboardBadge(down === 0 ? "Clean" : "Review", className)}`;
  }
  renderDashboardQualityAttention(loadSavedGoldenResults(), items);
  refreshRecommendedActionFromQuality();
}
// Admin dashboard quality signals end

// Admin cycles visibility start
const ADMIN_CYCLE_SNAPSHOT_KEY = "aion_admin_cycle_snapshots_v2";
const ADMIN_LEGACY_CYCLE_SNAPSHOT_KEY = "aion_admin_cycle_snapshot_v1";
const ADMIN_DASHBOARD_REVIEW_KEY = "aion_admin_dashboard_review_v1";
const ADMIN_DASHBOARD_REFRESH_KEY = "aion_admin_dashboard_refresh_v1";
const ADMIN_DASHBOARD_ACTIVITY_KEY = "aion_admin_dashboard_activity_v1";
const ADMIN_DASHBOARD_NOTE_KEY = "aion_admin_dashboard_note_v1";
const ADMIN_DASHBOARD_NOTE_DRAFT_KEY = "aion_admin_dashboard_note_draft_v1";
const ADMIN_DASHBOARD_CHECKLIST_KEY = "aion_admin_dashboard_checklist_v1";
const ADMIN_DASHBOARD_REVIEW_EVIDENCE_KEY = "aion_admin_dashboard_review_evidence_v1";
const ADMIN_CYCLE_HISTORY_KEY = "aion_admin_cycle_history_v1";
const ADMIN_SITE_METRICS_CACHE_KEY = "aion_admin_site_metrics_cache_v1";
const ADMIN_CYCLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ADMIN_CYCLE_LABELS = {
  frontend: "Frontend",
  backend: "Backend",
  wallet: "Wallet",
};
const ADMIN_DASHBOARD_CHECKLIST_ITEMS = [
  { key: "snapshots", inputId: "adminChecklistSnapshots", label: "Snapshots reviewed" },
  { key: "wallet", inputId: "adminChecklistWallet", label: "Wallet checked" },
  { key: "quality", inputId: "adminChecklistQuality", label: "Quality reviewed" },
  { key: "evidence", inputId: "adminChecklistEvidence", label: "Evidence saved" },
  { key: "note", inputId: "adminChecklistNote", label: "Handoff note ready" },
];
const ADMIN_FRONTEND_DEPLOY_RESERVE = 100_000_000_000;
let currentAdminRecommendedAction = {
  label: "Paste snapshots",
  className: "pending",
  detailId: "cycleRunwayPanel",
};

function loadAdminDashboardActivity() {
  try {
    const raw = localStorage.getItem(ADMIN_DASHBOARD_ACTIVITY_KEY);
    if (raw) {
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) {
        persistAdminDashboardActivity(entries);
        return entries.slice(0, 8);
      }
    }
  } catch (err) {
    console.warn("Could not load dashboard activity:", err);
  }

  try {
    const cookieRaw = getAdminCookieValue(ADMIN_DASHBOARD_ACTIVITY_KEY);
    const entries = cookieRaw ? JSON.parse(cookieRaw) : [];
    if (Array.isArray(entries)) {
      persistAdminDashboardActivity(entries);
      return entries.slice(0, 8);
    }
  } catch (err) {
    console.warn("Could not load dashboard activity from cookie:", err);
  }

  return [];
}

function persistAdminDashboardActivity(entries) {
  const serialized = JSON.stringify((entries || []).slice(0, 8));
  try {
    localStorage.setItem(ADMIN_DASHBOARD_ACTIVITY_KEY, serialized);
  } catch (err) {
    console.warn("Could not save dashboard activity:", err);
  }
  try {
    document.cookie = `${ADMIN_DASHBOARD_ACTIVITY_KEY}=${encodeURIComponent(serialized)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save dashboard activity to cookie:", err);
  }
}

function formatAdminActivityTime(timestamp) {
  if (!timestamp) return "Pending";
  const time = new Date(timestamp);
  if (!Number.isFinite(time.getTime())) return "Pending";
  return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderAdminDashboardActivity(entries = loadAdminDashboardActivity()) {
  const list = document.getElementById("adminDashboardActivityList");
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = `<li><span>No recent activity yet.</span><time>Pending</time></li>`;
    if (typeof renderAdminReviewPacket === "function") {
      renderAdminReviewPacket();
    }
    return;
  }

  list.innerHTML = entries
    .slice(0, 5)
    .map((entry) => {
      const detail = entry.detail ? ` <span class="meta">${escapeHtml(entry.detail)}</span>` : "";
      const timestamp = entry.timestamp || "";
      return `<li><span><strong>${escapeHtml(entry.label || "Dashboard update")}</strong>${detail}</span><time datetime="${escapeHtml(timestamp)}">${escapeHtml(formatAdminActivityTime(timestamp))}</time></li>`;
    })
    .join("");
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
}

function recordAdminDashboardActivity(label, detail = "") {
  const entries = loadAdminDashboardActivity();
  const next = [
    {
      label,
      detail,
      timestamp: new Date().toISOString(),
    },
    ...entries,
  ].slice(0, 8);
  persistAdminDashboardActivity(next);
  renderAdminDashboardActivity(next);
}

window.clearAdminDashboardActivity = function clearAdminDashboardActivity() {
  persistAdminDashboardActivity([]);
  renderAdminDashboardActivity([]);
};

function loadAdminDashboardNote() {
  try {
    const note = localStorage.getItem(ADMIN_DASHBOARD_NOTE_KEY);
    if (note !== null) {
      persistAdminDashboardNote(note);
      return note;
    }
  } catch (err) {
    console.warn("Could not load dashboard note:", err);
  }

  try {
    return getAdminCookieValue(ADMIN_DASHBOARD_NOTE_KEY) || "";
  } catch (err) {
    console.warn("Could not load dashboard note from cookie:", err);
    return "";
  }
}

function persistAdminDashboardNote(note) {
  const value = note || "";
  try {
    localStorage.setItem(ADMIN_DASHBOARD_NOTE_KEY, value);
  } catch (err) {
    console.warn("Could not save dashboard note:", err);
  }
  try {
    document.cookie = `${ADMIN_DASHBOARD_NOTE_KEY}=${encodeURIComponent(value)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save dashboard note to cookie:", err);
  }
}

function loadAdminDashboardNoteDraft() {
  try {
    return localStorage.getItem(ADMIN_DASHBOARD_NOTE_DRAFT_KEY) || "";
  } catch (err) {
    console.warn("Could not load dashboard note draft:", err);
    return "";
  }
}

function persistAdminDashboardNoteDraft(note) {
  try {
    localStorage.setItem(ADMIN_DASHBOARD_NOTE_DRAFT_KEY, note || "");
  } catch (err) {
    console.warn("Could not save dashboard note draft:", err);
  }
}

function clearAdminDashboardNoteDraft() {
  try {
    localStorage.removeItem(ADMIN_DASHBOARD_NOTE_DRAFT_KEY);
  } catch (err) {
    console.warn("Could not clear dashboard note draft:", err);
  }
}

function renderAdminDashboardNote(note = loadAdminDashboardNote()) {
  const input = document.getElementById("adminDashboardNoteInput");
  const status = document.getElementById("adminDashboardNoteStatus");
  const draft = loadAdminDashboardNoteDraft();
  if (input && !input.value.trim()) {
    input.value = draft || note || "";
    if (!input.dataset.adminDraftBound) {
      input.addEventListener("input", () => {
        persistAdminDashboardNoteDraft(input.value);
        if (status) {
          status.textContent = input.value.trim() ? "Draft saved locally" : (note ? "Saved locally" : "Not saved");
        }
        if (typeof renderAdminReviewPacket === "function") {
          renderAdminReviewPacket();
        }
        if (typeof renderLocalBackupMetric === "function") {
          renderLocalBackupMetric();
        }
      });
      input.dataset.adminDraftBound = "true";
    }
  }
  if (status) {
    status.textContent = draft ? "Draft saved locally" : note ? "Saved locally" : "Not saved";
  }
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
  if (typeof renderLocalBackupMetric === "function") {
    renderLocalBackupMetric();
  }
}

function buildAdminDashboardNoteTemplate(kind = "daily") {
  const templates = {
    daily: {
      title: "Daily operator review",
      focus: "Refresh dashboard data, check quality, and leave the next operator with the current state.",
    },
    deploy: {
      title: "Before deploy review",
      focus: "Confirm cycles, local checks, deploy readiness, and handoff evidence before production work.",
    },
    weekly: {
      title: "Weekly maintenance review",
      focus: "Look for drift across memory, feedback, quality signals, providers, and operator evidence.",
    },
  };
  const template = templates[kind] || templates.daily;
  const checklist = loadAdminDashboardChecklist();
  const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
  const topUpAmount = recommendedFrontendTopUpAmount(loadCycleSnapshot());
  const lines = [
    `${template.title} — ${new Date().toLocaleString()}`,
    "",
    `Focus: ${template.focus}`,
    `Current state: ${dashboardMetricText("adminDashboardHeadline")}`,
    `Recommended action: ${dashboardMetricText("healthCycleAction")}`,
    `Operator readiness: ${dashboardMetricText("healthOperatorReadiness")}`,
    `Data refresh: ${dashboardMetricText("healthDataRefresh")}`,
    `Freshness: ${dashboardMetricText("healthFreshness")}`,
    `Deploy readiness: ${dashboardMetricText("healthDeployReadiness")}`,
    `Deploy buffer: ${dashboardMetricText("healthDeployBuffer")}`,
    `Pre-deploy check: ${dashboardMetricText("healthPreDeployCheck")}`,
    `Quality: ${dashboardMetricText("adminAttentionQuality")}`,
    `Review evidence: ${evidence.label}`,
    `Local backup: ${dashboardMetricText("healthLocalBackup")}`,
    `Cycle movement: ${dashboardMetricText("healthCycleMovement")}`,
    `Frontend cycles: ${dashboardMetricText("healthFrontendCycles")}`,
    `Backend cycles: ${dashboardMetricText("healthBackendCycles")}`,
    `Wallet cycles: ${dashboardMetricText("healthWalletCycles")}`,
    `Recommended top-up: ${topUpAmount ? `${formatCycles(topUpAmount)} (${formatTopUpAmount(topUpAmount)})` : "Pending"}`,
    "",
    "Checklist:",
  ];
  ADMIN_DASHBOARD_CHECKLIST_ITEMS.forEach((item) => {
    lines.push(`- ${item.label}: ${checklist[item.key] ? "yes" : "no"}`);
  });
  lines.push("");
  lines.push("Operator notes:");
  lines.push("- ");
  return lines.join("\n");
}

window.fillAdminDashboardNoteTemplate = function fillAdminDashboardNoteTemplate(kind = "daily") {
  const input = document.getElementById("adminDashboardNoteInput");
  if (!input) return;
  input.value = buildAdminDashboardNoteTemplate(kind);
  persistAdminDashboardNoteDraft(input.value);
  input.focus();
  const label = kind === "deploy" ? "Deploy note template inserted" : kind === "weekly" ? "Weekly note template inserted" : "Daily note template inserted";
  recordAdminDashboardActivity(label, "Review and save when ready");
  renderAdminDashboardNote();
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
};

window.startAdminDashboardCadenceReview = function startAdminDashboardCadenceReview(kind = "daily") {
  if (typeof openAdminDetailPanel === "function") {
    openAdminDetailPanel("adminDashboardHandoff");
  }
  window.fillAdminDashboardNoteTemplate(kind);
};

window.saveAdminDashboardNote = function saveAdminDashboardNote() {
  const input = document.getElementById("adminDashboardNoteInput");
  const note = input ? input.value.trim() : "";
  persistAdminDashboardNote(note);
  clearAdminDashboardNoteDraft();
  renderAdminDashboardNote(note);
  updateAdminDashboardChecklist({ note: Boolean(note) });
  recordAdminDashboardActivity("Operator note saved", note ? "Included in copied summaries" : "Empty note saved");
};

window.clearAdminDashboardNote = function clearAdminDashboardNote() {
  const input = document.getElementById("adminDashboardNoteInput");
  if (input) input.value = "";
  persistAdminDashboardNote("");
  clearAdminDashboardNoteDraft();
  renderAdminDashboardNote("");
  updateAdminDashboardChecklist({ note: false });
  recordAdminDashboardActivity("Operator note cleared");
};

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
  const metric = document.getElementById("healthReviewEvidence");
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
  if (metric) {
    metric.innerHTML = `<span class="admin-cycle-runway-label ${evidenceStatus.className}">${escapeHtml(evidenceStatus.label)}</span>`;
  }
  renderDashboardFreshness();
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
  updateAdminDashboardChecklist({ evidence: false });
  recordAdminDashboardActivity("Review evidence cleared");
};

function normalizeAdminDashboardChecklist(checklist = {}) {
  return ADMIN_DASHBOARD_CHECKLIST_ITEMS.reduce((next, item) => {
    next[item.key] = Boolean(checklist[item.key]);
    return next;
  }, {});
}

function loadAdminDashboardChecklist() {
  try {
    const raw = localStorage.getItem(ADMIN_DASHBOARD_CHECKLIST_KEY);
    if (raw) {
      const checklist = normalizeAdminDashboardChecklist(JSON.parse(raw));
      persistAdminDashboardChecklist(checklist);
      return checklist;
    }
  } catch (err) {
    console.warn("Could not load dashboard checklist:", err);
  }

  try {
    const cookieRaw = getAdminCookieValue(ADMIN_DASHBOARD_CHECKLIST_KEY);
    if (cookieRaw) {
      const checklist = normalizeAdminDashboardChecklist(JSON.parse(cookieRaw));
      persistAdminDashboardChecklist(checklist);
      return checklist;
    }
  } catch (err) {
    console.warn("Could not load dashboard checklist from cookie:", err);
  }

  return normalizeAdminDashboardChecklist();
}

function persistAdminDashboardChecklist(checklist) {
  const serialized = JSON.stringify(normalizeAdminDashboardChecklist(checklist));
  try {
    localStorage.setItem(ADMIN_DASHBOARD_CHECKLIST_KEY, serialized);
  } catch (err) {
    console.warn("Could not save dashboard checklist:", err);
  }
  try {
    document.cookie = `${ADMIN_DASHBOARD_CHECKLIST_KEY}=${encodeURIComponent(serialized)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save dashboard checklist to cookie:", err);
  }
}

function readAdminDashboardChecklistFromInputs() {
  return ADMIN_DASHBOARD_CHECKLIST_ITEMS.reduce((next, item) => {
    const input = document.getElementById(item.inputId);
    next[item.key] = Boolean(input && input.checked);
    return next;
  }, {});
}

function formatAdminChecklistSummary(checklist = loadAdminDashboardChecklist()) {
  const normalized = normalizeAdminDashboardChecklist(checklist);
  const completed = ADMIN_DASHBOARD_CHECKLIST_ITEMS.filter((item) => normalized[item.key]).length;
  return `${completed} of ${ADMIN_DASHBOARD_CHECKLIST_ITEMS.length} complete`;
}

function adminChecklistStatus(checklist = loadAdminDashboardChecklist()) {
  const normalized = normalizeAdminDashboardChecklist(checklist);
  const completed = ADMIN_DASHBOARD_CHECKLIST_ITEMS.filter((item) => normalized[item.key]).length;
  if (completed === ADMIN_DASHBOARD_CHECKLIST_ITEMS.length) {
    return { label: "Ready", className: "healthy", completed };
  }
  if (completed > 0) {
    return { label: `${completed}/${ADMIN_DASHBOARD_CHECKLIST_ITEMS.length} complete`, className: "watch", completed };
  }
  return { label: "Checklist pending", className: "pending", completed };
}

function renderAdminDashboardChecklist(checklist = loadAdminDashboardChecklist()) {
  const normalized = normalizeAdminDashboardChecklist(checklist);
  ADMIN_DASHBOARD_CHECKLIST_ITEMS.forEach((item) => {
    const input = document.getElementById(item.inputId);
    if (input) {
      input.checked = Boolean(normalized[item.key]);
      input.onchange = () => {
        const checklist = readAdminDashboardChecklistFromInputs();
        persistAdminDashboardChecklist(checklist);
        renderAdminDashboardChecklist(checklist);
        recordAdminDashboardActivity("Operator checklist updated", formatAdminChecklistSummary(checklist));
      };
    }
  });
  const status = document.getElementById("adminDashboardChecklistStatus");
  if (status) {
    const checklistStatus = adminChecklistStatus(normalized);
    status.textContent = checklistStatus.completed ? `Saved locally · ${formatAdminChecklistSummary(normalized)}` : "Not saved";
  }
  const metric = document.getElementById("healthHandoffReadiness");
  if (metric) {
    const checklistStatus = adminChecklistStatus(normalized);
    metric.innerHTML = `<span class="admin-cycle-runway-label ${checklistStatus.className}">${escapeHtml(checklistStatus.label)}</span>`;
  }
  if (typeof refreshAdminRecommendedAction === "function") {
    refreshAdminRecommendedAction();
  }
  if (typeof renderAdminReviewPacket === "function") {
    renderAdminReviewPacket();
  }
}

function updateAdminDashboardChecklist(updates = {}, options = {}) {
  const current = loadAdminDashboardChecklist();
  const allowed = new Set(ADMIN_DASHBOARD_CHECKLIST_ITEMS.map((item) => item.key));
  const next = { ...current };
  Object.entries(updates || {}).forEach(([key, value]) => {
    if (allowed.has(key)) {
      next[key] = Boolean(value);
    }
  });
  persistAdminDashboardChecklist(next);
  renderAdminDashboardChecklist(next);
  if (options.activityLabel) {
    recordAdminDashboardActivity(options.activityLabel, formatAdminChecklistSummary(next));
  }
  return next;
}

window.saveAdminDashboardChecklist = function saveAdminDashboardChecklist() {
  const checklist = readAdminDashboardChecklistFromInputs();
  persistAdminDashboardChecklist(checklist);
  renderAdminDashboardChecklist(checklist);
  recordAdminDashboardActivity("Operator checklist saved", formatAdminChecklistSummary(checklist));
};

window.clearAdminDashboardChecklist = function clearAdminDashboardChecklist() {
  persistAdminDashboardChecklist(normalizeAdminDashboardChecklist());
  renderAdminDashboardChecklist();
  recordAdminDashboardActivity("Operator checklist cleared");
};

function buildAdminDashboardState() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    cycleSnapshots: loadCycleSnapshot(),
    cycleHistory: loadCycleHistory(),
    dashboardRefresh: loadDashboardRefresh(),
    dashboardReview: loadDashboardReview(),
    dashboardActivity: loadAdminDashboardActivity(),
    dashboardNote: loadAdminDashboardNote(),
    dashboardNoteDraft: loadAdminDashboardNoteDraft(),
    dashboardChecklist: loadAdminDashboardChecklist(),
    reviewEvidence: loadAdminReviewEvidence(),
    siteMetricsCache: loadSiteMetricsCache(),
    goldenResults: typeof loadSavedGoldenResults === "function" ? loadSavedGoldenResults() : null,
  };
}

function applyAdminDashboardState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Dashboard state must be a JSON object.");
  }

  if (state.cycleSnapshots && typeof state.cycleSnapshots === "object") {
    persistCycleSnapshots(state.cycleSnapshots);
  }
  if (Array.isArray(state.cycleHistory)) {
    persistCycleHistory(state.cycleHistory);
  }
  if (state.dashboardRefresh && state.dashboardRefresh.refreshedAt) {
    persistDashboardRefresh(state.dashboardRefresh);
  }
  if (state.dashboardReview && state.dashboardReview.reviewedAt) {
    persistDashboardReview(state.dashboardReview);
  }
  if (Array.isArray(state.dashboardActivity)) {
    persistAdminDashboardActivity(state.dashboardActivity);
  }
  if (typeof state.dashboardNote === "string") {
    persistAdminDashboardNote(state.dashboardNote);
  }
  if (typeof state.dashboardNoteDraft === "string") {
    persistAdminDashboardNoteDraft(state.dashboardNoteDraft);
  }
  if (state.dashboardChecklist && typeof state.dashboardChecklist === "object") {
    persistAdminDashboardChecklist(state.dashboardChecklist);
  }
  if (state.reviewEvidence && typeof state.reviewEvidence === "object") {
    persistAdminReviewEvidence(state.reviewEvidence);
  }
  if (state.siteMetricsCache && Array.isArray(state.siteMetricsCache.metrics)) {
    latestSiteMetrics = normalizeSiteMetrics(state.siteMetricsCache.metrics);
    latestSiteMetricsLoadedAt = state.siteMetricsCache.loadedAt || new Date().toISOString();
    latestSiteMetricsError = "";
    persistSiteMetricsCache(latestSiteMetrics, latestSiteMetricsLoadedAt);
    renderSiteMetrics(latestSiteMetrics);
  }
  if (state.goldenResults && typeof saveGoldenResults === "function") {
    saveGoldenResults(state.goldenResults);
    renderGoldenDashboardSignal(state.goldenResults);
  }

  renderCycleSnapshot(loadCycleSnapshot());
  renderCycleMovement();
  renderDashboardRefresh();
  renderDashboardReview();
  renderAdminReviewEvidence();
  renderAdminDashboardNote();
  renderAdminDashboardChecklist();
  renderAdminDashboardActivity();
  renderAdminReviewPacket();
}

async function readTextFromClipboardOrPrompt(message) {
  if (navigator.clipboard && window.isSecureContext && navigator.clipboard.readText) {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  }
  return window.prompt(message) || "";
}

window.copyAdminDashboardState = async function copyAdminDashboardState() {
  const button = document.getElementById("adminDashboardCopyStateButton");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(JSON.stringify(buildAdminDashboardState(), null, 2));
    recordAdminDashboardActivity("Dashboard state copied", "Local backup JSON");
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy dashboard state";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy dashboard state:", err);
    if (button) {
      button.textContent = "Copy failed";
      button.title = "Could not copy dashboard state. Use the visible dashboard values or try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy dashboard state";
        button.removeAttribute("title");
      }, 2200);
    }
  }
};

window.copyAdminReviewCommands = async function copyAdminReviewCommands() {
  const button = document.getElementById("adminDashboardCopyReviewCommandsButton");
  const previousText = button ? button.textContent : "";
  const commands = [
    "cd /Users/sandbox2/Documents/Projects/teves_consulting",
    "git diff --check",
    "scripts/prepare-frontend-assets.sh",
    "node --check src/teves_consulting_frontend/admin.js",
    "PYTHONPYCACHEPREFIX=/private/tmp/admin-pycache python3 -m py_compile /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_dashboard_polish.py /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_cycles_visibility.py /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_dashboard_quality_signals.py /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_section_overviews.py /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_evergreen_cleanup_bundle.py",
    "tmpdir=$(mktemp -d /private/tmp/admin-bundle-check.XXXXXX)",
    'cp -R src/teves_consulting_frontend "$tmpdir/frontend"',
    'python3 /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_evergreen_cleanup_bundle.py "$tmpdir/frontend"',
    'cp "$tmpdir/frontend/admin.html" "$tmpdir/admin.after1.html"',
    'cp "$tmpdir/frontend/admin.js" "$tmpdir/admin.after1.js"',
    'python3 /Users/sandbox2/Documents/Codex/2026-07-15/create-a-project-api-key-to/teves-update-scripts/apply_admin_evergreen_cleanup_bundle.py "$tmpdir/frontend"',
    'cmp -s "$tmpdir/admin.after1.html" "$tmpdir/frontend/admin.html"; html_status=$?',
    'cmp -s "$tmpdir/admin.after1.js" "$tmpdir/frontend/admin.js"; js_status=$?',
    "printf 'tmpdir=%s\\nhtml_idempotent=%s\\njs_idempotent=%s\\n' \"$tmpdir\" \"$html_status\" \"$js_status\"",
    'node --check "$tmpdir/frontend/admin.js"',
    "mops test",
  ].join("\n");
  try {
    await copyTextToClipboard(commands);
    recordAdminDashboardActivity("Review commands copied", "No deploy command included");
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy validation checks";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy review commands:", err);
    if (button) {
      button.textContent = "Copy failed";
      button.title = "Could not copy validation checks. Copy the visible commands manually or try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy validation checks";
        button.removeAttribute("title");
      }, 2200);
    }
  }
};

window.restoreAdminDashboardState = async function restoreAdminDashboardState() {
  const button = document.getElementById("adminDashboardRestoreStateButton");
  const previousText = button ? button.textContent : "";
  try {
    const raw = await readTextFromClipboardOrPrompt("Paste dashboard state JSON.");
    if (!raw.trim()) return;
    const state = JSON.parse(raw);
    applyAdminDashboardState(state);
    recordAdminDashboardActivity("Dashboard state restored", "Local backup JSON");
    if (button) {
      button.textContent = "Restored";
      window.setTimeout(() => {
        button.textContent = previousText || "Restore dashboard state";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not restore dashboard state:", err);
    if (button) {
      button.textContent = "Restore failed";
      button.title = "Could not restore dashboard state. Paste valid dashboard-state JSON and try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Restore dashboard state";
        button.removeAttribute("title");
      }, 2400);
    }
  }
};

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

function topUpPlanStatus(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  const wallet = snapshots.wallet || null;
  if (!frontend || !wallet) {
    return { label: "Add snapshots", className: "pending" };
  }

  const walletBuffer = 25_000_000_000;
  const frontendTarget = Number.isFinite(frontend.reservedLimit)
    ? frontend.reservedLimit
    : 5_000_000_000_000;
  const needed = Math.max(0, frontendTarget - frontend.cycles);
  const available = Math.max(0, wallet.cycles - walletBuffer);
  if (needed <= 0) {
    return { label: "No top-up needed", className: "healthy" };
  }
  if (available < 1_000_000_000) {
    return { label: "Wallet short", className: "top-up" };
  }

  const amount = recommendedFrontendTopUpAmount(snapshots);
  if (!amount) {
    return { label: "Top-up pending", className: "watch" };
  }
  const walletAfter = Math.max(0, wallet.cycles - amount);
  const className = amount < needed ? "watch" : "healthy";
  return {
    label: `${formatCycles(amount)} · wallet after ${formatCycles(walletAfter)}`,
    className,
  };
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

function persistDashboardReview(review) {
  const serialized = JSON.stringify(review || {});
  try {
    localStorage.setItem(ADMIN_DASHBOARD_REVIEW_KEY, serialized);
  } catch (err) {
    console.warn("Could not save dashboard review to local storage:", err);
  }
  try {
    document.cookie = `${ADMIN_DASHBOARD_REVIEW_KEY}=${encodeURIComponent(serialized)}; Max-Age=${ADMIN_CYCLE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch (err) {
    console.warn("Could not save dashboard review to cookie:", err);
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

function loadDashboardReview() {
  try {
    const raw = localStorage.getItem(ADMIN_DASHBOARD_REVIEW_KEY);
    if (raw) {
      const review = JSON.parse(raw);
      if (review && review.reviewedAt) {
        persistDashboardReview(review);
        return review;
      }
    }
  } catch (err) {
    console.warn("Could not load dashboard review from local storage:", err);
  }

  try {
    const cookieRaw = getAdminCookieValue(ADMIN_DASHBOARD_REVIEW_KEY);
    if (cookieRaw) {
      const review = JSON.parse(cookieRaw);
      if (review && review.reviewedAt) {
        persistDashboardReview(review);
        return review;
      }
    }
  } catch (err) {
    console.warn("Could not load dashboard review from cookie:", err);
  }

  return null;
}

function dashboardReviewAgeHours(review) {
  if (!review || !review.reviewedAt) return null;
  const reviewedTime = new Date(review.reviewedAt).getTime();
  if (!Number.isFinite(reviewedTime)) return null;
  const hours = (Date.now() - reviewedTime) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function dashboardReviewStatus(review) {
  const hours = dashboardReviewAgeHours(review);
  if (!Number.isFinite(hours)) return { label: "Review needed", className: "pending" };
  if (hours <= 24) return { label: "Reviewed", className: "fresh" };
  if (hours <= 168) return { label: "Aging", className: "aging" };
  return { label: "Stale", className: "stale" };
}

function formatDashboardReviewAge(review) {
  const hours = dashboardReviewAgeHours(review);
  if (!Number.isFinite(hours)) return "Not reviewed";
  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${Math.floor(hours)} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
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
  const ageLabel = formatDashboardRefreshAge(refresh);
  if (refreshElement) {
    refreshElement.innerHTML = `${escapeHtml(ageLabel)}<span class="admin-cycle-freshness-label ${refreshStatus.className}">${escapeHtml(refreshStatus.label)}</span>`;
  }
  renderDashboardFreshness();
}

function renderDashboardReview(review = loadDashboardReview()) {
  const reviewElement = document.getElementById("healthDashboardReviewed");
  const statusElement = document.getElementById("dashboardReviewStatus");
  const reviewStatus = dashboardReviewStatus(review);
  const ageLabel = formatDashboardReviewAge(review);
  const reviewedAtLabel = review && review.reviewedAt
    ? new Date(review.reviewedAt).toLocaleString()
    : "";

  if (reviewElement) {
    reviewElement.innerHTML = `${escapeHtml(ageLabel)}<span class="admin-cycle-freshness-label ${reviewStatus.className}">${escapeHtml(reviewStatus.label)}</span>`;
  }
  if (statusElement) {
    statusElement.textContent = reviewedAtLabel
      ? `Dashboard last reviewed at ${reviewedAtLabel}.`
      : "Mark the dashboard reviewed after checking the current operator state.";
  }
  renderDashboardFreshness();
}

function dashboardFreshnessStatus(snapshots = loadCycleSnapshot()) {
  const snapshotStatus = snapshotAttentionStatus(snapshots);
  const refreshStatus = dashboardRefreshStatus(loadDashboardRefresh());
  const reviewStatus = dashboardReviewStatus(loadDashboardReview());
  const evidenceStatus = reviewEvidenceStatus(loadAdminReviewEvidence());
  const checks = [
    { label: "Snapshots", className: snapshotStatus.className === "healthy" ? "fresh" : snapshotStatus.className },
    { label: "Refresh", className: refreshStatus.className },
    { label: "Review", className: reviewStatus.className },
    { label: "Evidence", className: evidenceStatus.className === "healthy" ? "fresh" : evidenceStatus.className },
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

function renderDashboardFreshness(snapshots = loadCycleSnapshot()) {
  const element = document.getElementById("healthFreshness");
  if (!element) return;
  const status = dashboardFreshnessStatus(snapshots);
  const title = status.missing.length ? `Needs: ${status.missing.join(", ")}` : "Dashboard freshness checks are current.";
  element.innerHTML = `<span class="admin-cycle-freshness-label ${status.className}" title="${escapeHtml(title)}">${escapeHtml(status.label)}</span>`;
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

function loadCycleHistory() {
  try {
    const raw = localStorage.getItem(ADMIN_CYCLE_HISTORY_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries.slice(0, 24) : [];
  } catch (err) {
    console.warn("Could not load cycle history:", err);
    return [];
  }
}

function persistCycleHistory(entries) {
  try {
    localStorage.setItem(ADMIN_CYCLE_HISTORY_KEY, JSON.stringify((entries || []).slice(0, 24)));
  } catch (err) {
    console.warn("Could not save cycle history:", err);
  }
}

function recordCycleHistory(updates, previousSnapshots = loadCycleSnapshot()) {
  const entries = Object.entries(updates || {})
    .map(([kind, snapshot]) => {
      const previous = previousSnapshots ? previousSnapshots[kind] : null;
      if (!snapshot || !Number.isFinite(snapshot.cycles) || !previous || !Number.isFinite(previous.cycles)) {
        return null;
      }
      const previousCapturedAt = previous.capturedAt || "";
      const nextCapturedAt = snapshot.capturedAt || "";
      if (previous.cycles === snapshot.cycles && previousCapturedAt === nextCapturedAt) {
        return null;
      }
      return {
        kind,
        cycles: snapshot.cycles,
        previousCycles: previous.cycles,
        delta: snapshot.cycles - previous.cycles,
        capturedAt: nextCapturedAt,
        recordedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
  if (!entries.length) return;
  persistCycleHistory([...entries, ...loadCycleHistory()]);
}

function formatCycleDelta(delta) {
  if (!Number.isFinite(delta)) return "Pending";
  if (delta === 0) return "No change";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatCycles(Math.abs(delta))}`;
}

function cycleMovementStatus(entry) {
  if (!entry) return { label: "Collecting", className: "pending" };
  const label = `${ADMIN_CYCLE_LABELS[entry.kind] || entry.kind} ${formatCycleDelta(entry.delta)}`;
  if (entry.delta < -100_000_000_000) return { label, className: "top-up" };
  if (entry.delta < 0) return { label, className: "watch" };
  if (entry.delta > 0) return { label, className: "healthy" };
  return { label, className: "fresh" };
}

function renderCycleMovement() {
  const element = document.getElementById("healthCycleMovement");
  const entry = loadCycleHistory()[0] || null;
  const status = cycleMovementStatus(entry);
  const title = entry
    ? `Previous: ${formatCycles(entry.previousCycles)} · Current: ${formatCycles(entry.cycles)}`
    : "Paste a second snapshot to compare movement.";
  if (element) {
    element.innerHTML = `<span class="admin-cycle-runway-label ${status.className}" title="${escapeHtml(title)}">${escapeHtml(status.label)}</span>`;
  }
  renderCycleMovementHistory();
}

function renderCycleMovementHistory(entries = loadCycleHistory()) {
  const panel = document.getElementById("cycleMovementHistory");
  const list = document.getElementById("cycleMovementHistoryList");
  if (!panel || !list) return;
  const heading = panel.querySelector("span");
  if (!entries.length) {
    if (heading) heading.innerHTML = "<strong>Recent movement:</strong> Collecting";
    list.innerHTML = "<li><span>Paste a second snapshot to compare movement.</span><time>Pending</time></li>";
    return;
  }
  if (heading) heading.innerHTML = "<strong>Recent movement:</strong> Latest cycle changes";
  list.innerHTML = entries.slice(0, 5).map((entry) => {
    const status = cycleMovementStatus(entry);
    const recorded = entry.recordedAt ? new Date(entry.recordedAt) : null;
    const time = recorded && Number.isFinite(recorded.getTime())
      ? recorded.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "Pending";
    return `<li><span><strong>${escapeHtml(status.label)}</strong> from ${escapeHtml(formatCycles(entry.previousCycles))} to ${escapeHtml(formatCycles(entry.cycles))}</span><time datetime="${escapeHtml(entry.recordedAt || "")}">${escapeHtml(time)}</time></li>`;
  }).join("");
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
  const capturedLabel = snapshot.capturedAt
    ? new Date(snapshot.capturedAt).toLocaleString()
    : "Unknown";

  return `
    <span><strong>${escapeHtml(label)}:</strong> ${formatCycles(snapshot.cycles)}${percentLabel}</span>
    <span><strong>Canister:</strong> ${escapeHtml(snapshot.canisterName || label)}</span>
    <span><strong>Status:</strong> ${escapeHtml(snapshot.status || "Unknown")}</span>
    <span><strong>Memory:</strong> ${formatCycles(snapshot.memorySize)}</span>
    <span><strong>Reserved limit:</strong> ${formatCycles(snapshot.reservedLimit)}</span>
    <span><strong>Burn:</strong> ${formatCycles(snapshot.burnPerDay)} / day</span>
    <span><strong>Idle runway:</strong> ${formatCycleRunway(snapshot)} <span class="admin-cycle-runway-label ${runwayStatus.className}">${runwayStatus.label}</span></span>
    ${deploymentNote}
    <span><strong>Snapshot:</strong> ${formatSnapshotAge(snapshot)} <span class="admin-cycle-freshness-label ${freshnessStatus.className}">${freshnessStatus.label}</span></span>
    <span><strong>Updated:</strong> ${escapeHtml(capturedLabel)}</span>
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
    <span><strong>Available:</strong> ${formatCycles(snapshot.cycles)} cycles</span>
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
      <span><strong>Deploy reserve:</strong> ${formatCycles(ADMIN_FRONTEND_DEPLOY_RESERVE)} suggested</span>
      <span><strong>Wallet after:</strong> Pending</span>
    `;
  }

  const amount = recommendedFrontendTopUpAmount(snapshots);
  if (!amount) {
    return `
      <span><strong>Top-up plan:</strong> No wallet amount available</span>
      <span><strong>Recommended:</strong> Pending</span>
      <span><strong>Deploy reserve:</strong> ${formatCycles(ADMIN_FRONTEND_DEPLOY_RESERVE)} suggested</span>
      <span><strong>Wallet after:</strong> ${formatCycles(wallet.cycles)}</span>
    `;
  }

  const walletAfter = Math.max(0, wallet.cycles - amount);
  const target = Number.isFinite(frontend.reservedLimit) ? formatCycles(frontend.reservedLimit) : "5.00T";
  return `
    <span><strong>Top-up plan:</strong> Frontend toward ${escapeHtml(target)}</span>
    <span><strong>Recommended:</strong> ${formatCycles(amount)} (${escapeHtml(formatTopUpAmount(amount))})</span>
    <span><strong>Deploy reserve:</strong> ${formatCycles(ADMIN_FRONTEND_DEPLOY_RESERVE)} suggested</span>
    <span><strong>Wallet after:</strong> ${formatCycles(walletAfter)}</span>
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
  if (!frontend || !backend) {
    return { label: "Paste snapshots", className: "pending", detailId: "cycleRunwayPanel" };
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

  const oldest = oldestCycleSnapshot(snapshots);
  if (oldest && oldest.hours > 168) {
    return { label: "Refresh snapshots", className: "stale", detailId: "cycleRunwayPanel" };
  }
  if (oldest && oldest.hours > 24) {
    return { label: "Snapshots aging", className: "aging", detailId: "cycleRunwayPanel" };
  }

  const dashboardRefresh = loadDashboardRefresh();
  const dashboardRefreshAge = dashboardRefreshAgeHours(dashboardRefresh);
  if (!Number.isFinite(dashboardRefreshAge)) {
    return { label: "Refresh dashboard", className: "pending", command: "refresh" };
  }
  if (dashboardRefreshAge > 24) {
    return { label: "Refresh dashboard", className: "stale", command: "refresh" };
  }

  const dashboardReview = loadDashboardReview();
  const dashboardReviewAge = dashboardReviewAgeHours(dashboardReview);
  if (!Number.isFinite(dashboardReviewAge)) {
    return { label: "Review dashboard", className: "pending", detailId: "cycleRunwayPanel" };
  }
  if (dashboardReviewAge > 168) {
    return { label: "Review dashboard", className: "stale", detailId: "cycleRunwayPanel" };
  }
  if (dashboardReviewAge > 24) {
    return { label: "Review soon", className: "aging", detailId: "cycleRunwayPanel" };
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
      detailId: "adminDashboardHandoff",
    };
  }

  const handoffStatus = adminChecklistStatus();
  if (handoffStatus.className !== "healthy") {
    return {
      label: "Complete handoff",
      className: handoffStatus.className === "pending" ? "pending" : "watch",
      detailId: "adminDashboardHandoff",
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

function renderFrontendDeployBuffer(snapshots = loadCycleSnapshot()) {
  const element = document.getElementById("healthDeployBuffer");
  if (!element) return;
  const status = frontendDeployBufferStatus(snapshots);
  const title = `Suggested frontend deployment reserve: ${formatCycles(status.reserve)} cycles`;
  element.innerHTML = `<span class="admin-cycle-runway-label ${status.className}" title="${escapeHtml(title)}">${escapeHtml(status.label)}</span>`;
}

function preDeployCheckStatus(snapshots = loadCycleSnapshot()) {
  const frontendAge = cycleSnapshotAgeHours(snapshots.frontend || null);
  const quality = typeof combinedQualityAttentionStatus === "function"
    ? combinedQualityAttentionStatus()
    : { label: "Quality pending", className: "pending" };
  const checks = [
    { label: "Fresh frontend snapshot", ready: Number.isFinite(frontendAge) && frontendAge <= 24 },
    { label: "Deploy readiness", ready: deployReadinessStatus(snapshots).className === "healthy" },
    { label: "Deploy buffer", ready: frontendDeployBufferStatus(snapshots).className === "healthy" },
    { label: "Dashboard reviewed", ready: dashboardReviewStatus(loadDashboardReview()).className === "healthy" },
    { label: "Quality clear", ready: quality.className === "healthy" },
    { label: "Evidence saved", ready: reviewEvidenceStatus(loadAdminReviewEvidence()).className === "healthy" },
  ];
  const completed = checks.filter((check) => check.ready).length;
  const missing = checks.filter((check) => !check.ready).map((check) => check.label);
  const className = completed === checks.length
    ? "healthy"
    : completed >= checks.length - 1
      ? "watch"
      : completed >= Math.ceil(checks.length / 2)
        ? "aging"
        : "pending";
  return {
    label: completed === checks.length ? "Ready" : `${completed}/${checks.length} ready`,
    className,
    completed,
    total: checks.length,
    missing,
  };
}

function renderPreDeployCheck(snapshots = loadCycleSnapshot()) {
  const element = document.getElementById("healthPreDeployCheck");
  if (!element) return;
  const status = preDeployCheckStatus(snapshots);
  const title = status.missing.length ? `Missing: ${status.missing.join(", ")}` : "Pre-deploy checks are clear.";
  element.innerHTML = `<span class="admin-cycle-runway-label ${status.className}" title="${escapeHtml(title)}">${escapeHtml(status.label)}</span>`;
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

function snapshotAttentionStatus(snapshots) {
  const frontend = snapshots.frontend || null;
  const backend = snapshots.backend || null;
  if (!frontend || !backend) {
    return { label: "Paste both snapshots", className: "pending" };
  }

  const oldest = oldestCycleSnapshot(snapshots);
  if (!oldest) return { label: "Snapshot age unknown", className: "pending" };
  if (oldest.hours > 168) return { label: "Refresh snapshots", className: "stale" };
  if (oldest.hours > 24) return { label: "Snapshots aging", className: "aging" };
  return { label: "Fresh snapshots", className: "healthy" };
}

function renderDashboardAttention(snapshots) {
  const snapshotStatus = snapshotAttentionStatus(snapshots);
  const deployStatus = deployReadinessStatus(snapshots);
  const review = loadDashboardReview();
  const reviewStatus = dashboardReviewStatus(review);
  const reviewLabel = review
    ? `${formatDashboardReviewAge(review)} ago`
    : "Not reviewed";

  setDashboardAttentionItem("adminAttentionSnapshots", snapshotStatus.className, snapshotStatus.label);
  setDashboardAttentionItem("adminAttentionDeploy", deployStatus.className, deployStatus.label);
  setDashboardAttentionItem("adminAttentionReview", reviewStatus.className, reviewLabel);
}

function dashboardActionQueue(snapshots = loadCycleSnapshot()) {
  const queue = [];
  const seen = new Set();
  const add = (action) => {
    if (!action || !action.label) return;
    const key = `${action.label}:${action.detailId || action.command || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(action);
  };

  const primary = currentAdminRecommendedAction && currentAdminRecommendedAction.label
    ? currentAdminRecommendedAction
    : cycleRecommendedAction(snapshots);
  if (primary.className !== "healthy") {
    add({ ...primary, tag: "Next" });
  }

  const snapshotStatus = snapshotAttentionStatus(snapshots);
  if (snapshotStatus.className !== "healthy") {
    add({ label: snapshotStatus.label, className: snapshotStatus.className, detailId: "cycleRunwayPanel", tag: "Snapshots" });
  }

  const deployStatus = deployReadinessStatus(snapshots);
  if (deployStatus.className !== "healthy") {
    add({ label: deployStatus.label, className: deployStatus.className, detailId: "cycleRunwayPanel", tag: "Deploy" });
  }

  const deployBuffer = frontendDeployBufferStatus(snapshots);
  if (deployBuffer.className !== "healthy") {
    add({ label: `Deploy buffer: ${deployBuffer.label}`, className: deployBuffer.className, detailId: "cycleRunwayPanel", tag: "Buffer" });
  }

  const canisterState = canisterStateStatus(snapshots);
  if (canisterState.className === "top-up" || canisterState.className === "watch" || canisterState.className === "aging") {
    add({ label: `Canister state: ${canisterState.label}`, className: canisterState.className, detailId: "cycleRunwayPanel", tag: "Canisters" });
  }

  const topUpPlan = topUpPlanStatus(snapshots);
  if (topUpPlan.className === "top-up" || topUpPlan.className === "watch") {
    add({ label: `Top-up plan: ${topUpPlan.label}`, className: topUpPlan.className, detailId: "cycleRunwayPanel", tag: "Cycles" });
  }

  const preDeploy = preDeployCheckStatus(snapshots);
  if (preDeploy.className !== "healthy") {
    add({ label: `Pre-deploy: ${preDeploy.label}`, className: preDeploy.className, detailId: "cycleRunwayPanel", tag: "Deploy" });
  }

  const reviewStatus = dashboardReviewStatus(loadDashboardReview());
  if (reviewStatus.className !== "healthy") {
    add({ label: reviewStatus.label, className: reviewStatus.className, detailId: "cycleRunwayPanel", tag: "Review" });
  }

  if (typeof combinedQualityAttentionStatus === "function") {
    const quality = combinedQualityAttentionStatus();
    if (quality && quality.className !== "healthy") {
      add({ label: quality.label, className: quality.className, detailId: quality.detailId || "goldenTestsPanel", tag: "Quality" });
    }
  }

  const siteMetrics = siteMetricsHealthStatus();
  if (["pending", "stale"].includes(siteMetrics.className) || siteMetrics.label === "Load failed") {
    add({ label: `Site metrics: ${siteMetrics.label}`, className: siteMetrics.className, detailId: "siteMetricsPanel", tag: "Reports" });
  }

  const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
  if (evidence.className !== "healthy") {
    add({ label: evidence.label, className: evidence.className, detailId: "adminDashboardHandoff", tag: "Evidence" });
  }

  const checklist = adminChecklistStatus(loadAdminDashboardChecklist());
  if (checklist.className !== "healthy") {
    add({ label: checklist.label, className: checklist.className, detailId: "adminDashboardHandoff", tag: "Handoff" });
  }

  if (!queue.length) {
    add({ label: "Dashboard clear", className: "healthy", tag: "Clear" });
  }

  return queue.slice(0, 4);
}

function renderDashboardActionQueue(snapshots = loadCycleSnapshot()) {
  const element = document.getElementById("adminDashboardActionQueue");
  if (!element) return;
  const items = dashboardActionQueue(snapshots);
  element.innerHTML = items.map((action) => {
    const className = dashboardAttentionClass(action.className);
    const actionAttr = action.command === "refresh"
      ? ' onclick="refreshAdminDashboardData()"'
      : action.detailId
        ? ` data-admin-detail-jump="${escapeHtml(action.detailId)}"`
        : "";
    return `<li><button type="button" class="admin-dashboard-queue-item ${className}"${actionAttr}><strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(action.tag || "Next")}</span></button></li>`;
  }).join("");
}

function operatorReadinessScore(snapshots = loadCycleSnapshot()) {
  const quality = typeof combinedQualityAttentionStatus === "function"
    ? combinedQualityAttentionStatus()
    : { label: "Quality pending", className: "pending" };
  const checks = [
    { label: "Snapshots", ready: snapshotAttentionStatus(snapshots).className === "healthy" },
    { label: "Wallet", ready: Boolean(snapshots.wallet) },
    { label: "Deploy", ready: deployReadinessStatus(snapshots).className === "healthy" },
    { label: "Buffer", ready: frontendDeployBufferStatus(snapshots).className === "healthy" },
    { label: "Pre-deploy", ready: preDeployCheckStatus(snapshots).className === "healthy" },
    { label: "Quality", ready: quality.className === "healthy" },
    { label: "Evidence", ready: reviewEvidenceStatus(loadAdminReviewEvidence()).className === "healthy" },
    { label: "Handoff", ready: adminChecklistStatus(loadAdminDashboardChecklist()).className === "healthy" },
  ];
  const completed = checks.filter((check) => check.ready).length;
  const total = checks.length;
  const missing = checks.filter((check) => !check.ready).map((check) => check.label);
  const className = completed === total
    ? "healthy"
    : completed >= total - 1
      ? "watch"
      : completed >= Math.ceil(total / 2)
        ? "aging"
        : "pending";
  return {
    label: `${completed}/${total} ready`,
    className,
    completed,
    total,
    missing,
  };
}

function renderOperatorReadinessMetric(snapshots = loadCycleSnapshot()) {
  const metric = document.getElementById("healthOperatorReadiness");
  const score = operatorReadinessScore(snapshots);
  const missing = score.missing.length ? `Missing: ${score.missing.slice(0, 3).join(", ")}` : "Ready for handoff";
  if (metric) {
    metric.innerHTML = `<span class="admin-cycle-runway-label ${score.className}" title="${escapeHtml(missing)}">${escapeHtml(score.label)}</span>`;
  }
  const blockers = document.getElementById("healthReadinessBlockers");
  if (blockers) {
    blockers.textContent = score.missing.length ? score.missing.join(", ") : "None";
  }
}

function localBackupStatus() {
  const snapshots = loadCycleSnapshot();
  const checklist = loadAdminDashboardChecklist();
  const buckets = [
    { label: "Cycles", saved: Boolean(snapshots.frontend || snapshots.backend || snapshots.wallet) },
    { label: "Review", saved: Boolean(loadDashboardReview()) },
    { label: "Refresh", saved: Boolean(loadDashboardRefresh()) },
    { label: "Checklist", saved: ADMIN_DASHBOARD_CHECKLIST_ITEMS.some((item) => checklist[item.key]) },
    { label: "Evidence", saved: Boolean(loadAdminReviewEvidence()) },
    { label: "Note", saved: Boolean(loadAdminDashboardNote() || loadAdminDashboardNoteDraft()) },
    { label: "Activity", saved: Boolean(loadAdminDashboardActivity().length) },
    { label: "Movement", saved: Boolean(loadCycleHistory().length) },
    { label: "Site metrics", saved: Boolean(loadSiteMetricsCache()?.metrics?.length) },
  ];
  const saved = buckets.filter((bucket) => bucket.saved).length;
  const missing = buckets.filter((bucket) => !bucket.saved).map((bucket) => bucket.label);
  const className = saved === buckets.length
    ? "healthy"
    : saved >= 4
      ? "watch"
      : saved > 0
        ? "aging"
        : "pending";
  return {
    label: `${saved}/${buckets.length} saved`,
    className,
    saved,
    total: buckets.length,
    missing,
  };
}

function renderLocalBackupMetric() {
  const metric = document.getElementById("healthLocalBackup");
  if (!metric) return;
  const status = localBackupStatus();
  const title = status.missing.length ? `Missing: ${status.missing.join(", ")}` : "All local dashboard buckets have saved state.";
  metric.innerHTML = `<span class="admin-cycle-runway-label ${status.className}" title="${escapeHtml(title)}">${escapeHtml(status.label)}</span>`;
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
      text: "Paste frontend and backend cycle snapshots to complete the dashboard view.",
      pill: "Snapshots needed",
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
    : action.className === "pending" && action.label !== "Paste snapshots"
    ? {
      text: action.label === "Refresh dashboard"
        ? "Refresh dashboard data before relying on the current operator view."
        : "Review the dashboard and mark it reviewed when the current state looks accurate.",
      pill: action.label,
      className: "is-pending",
    }
    : action.className === "stale" && action.label === "Review dashboard"
      ? {
        text: "The dashboard review is stale; review the current state before relying on it.",
        pill: action.label,
        className: "is-action",
      }
      : action.className === "aging" && action.label === "Review soon"
        ? {
          text: "The dashboard review is aging; refresh it before the next operator decision.",
          pill: action.label,
          className: "is-watch",
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
}

function refreshAdminRecommendedAction(snapshots = loadCycleSnapshot()) {
  const action = cycleRecommendedAction(snapshots);
  currentAdminRecommendedAction = action;
  updateRecommendedActionButton(action);
  renderRecommendedActionMetric(action);
  updateDashboardCycleSummary(action);
  renderDashboardAttention(snapshots);
  renderDashboardActionQueue(snapshots);
  renderOperatorReadinessMetric(snapshots);
  renderLocalBackupMetric();
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

function dashboardActionDestination(action) {
  if (!action) return "";
  if (action.command === "refresh") return "Refresh dashboard";
  const labels = {
    cycleRunwayPanel: "Reports > Cycles runway",
    siteMetricsPanel: "Reports > Site metrics",
    goldenTestsPanel: "Validation > Answer quality checks",
    feedbackDashboardPanel: "Memory > Feedback signal",
    memoryHealthDashboardPanel: "Reports > Memory dashboard",
    adminDashboardHandoff: "Overview > Evidence and handoff",
  };
  return action.detailId ? labels[action.detailId] || action.detailId : "";
}

function buildAdminDashboardSummaryText() {
  const noteInput = document.getElementById("adminDashboardNoteInput");
  if (noteInput && noteInput.value.trim()) {
    persistAdminDashboardNoteDraft(noteInput.value.trim());
  }
  if (document.getElementById("adminDashboardChecklist")) {
    persistAdminDashboardChecklist(readAdminDashboardChecklistFromInputs());
  }
  const activity = loadAdminDashboardActivity().slice(0, 5);
  const note = loadAdminDashboardNote();
  const noteDraft = loadAdminDashboardNoteDraft();
  const checklist = loadAdminDashboardChecklist();
  const reviewEvidence = loadAdminReviewEvidence();
  const reviewStatus = reviewEvidenceStatus(reviewEvidence);
  const topUpAmount = recommendedFrontendTopUpAmount(loadCycleSnapshot());
  const lines = [
    "Aion Operator Dashboard",
    `Current state: ${dashboardMetricText("adminDashboardHeadline")}`,
    `Recommended action: ${dashboardMetricText("healthCycleAction")}`,
    `Operator readiness: ${dashboardMetricText("healthOperatorReadiness")}`,
    `Data refresh: ${dashboardMetricText("healthDataRefresh")}`,
    `Freshness: ${dashboardMetricText("healthFreshness")}`,
    `Quality: ${dashboardMetricText("adminAttentionQuality")}`,
    `Golden tests: ${dashboardMetricText("healthGoldenTests")}`,
    `Feedback signal: ${dashboardMetricText("healthFeedbackSignal")}`,
    `Site metrics: ${dashboardMetricText("healthSiteMetrics")}`,
    `Site 30 days: ${dashboardMetricText("siteMetricsMonth")}`,
    `Site writes/day: ${dashboardMetricText("siteMetricsWrites")}`,
    `Site storage: ${dashboardMetricText("siteMetricsStorage")}`,
    `Deploy readiness: ${dashboardMetricText("healthDeployReadiness")}`,
    `Deploy buffer: ${dashboardMetricText("healthDeployBuffer")}`,
    `Pre-deploy check: ${dashboardMetricText("healthPreDeployCheck")}`,
    `Cycle status: ${dashboardMetricText("healthCycleRunway")}`,
    `Cycle movement: ${dashboardMetricText("healthCycleMovement")}`,
    `Frontend cycles: ${dashboardMetricText("healthFrontendCycles")}`,
    `Backend cycles: ${dashboardMetricText("healthBackendCycles")}`,
    `Wallet cycles: ${dashboardMetricText("healthWalletCycles")}`,
    `Canister state: ${dashboardMetricText("healthCanisterState")}`,
    `Top-up plan: ${dashboardMetricText("healthTopUpPlan")}`,
    `Recommended top-up: ${topUpAmount ? `${formatCycles(topUpAmount)} (${formatTopUpAmount(topUpAmount)})` : "Pending"}`,
    `Snapshot age: ${dashboardMetricText("healthCycleSnapshotAge")}`,
    `Last reviewed: ${dashboardMetricText("healthDashboardReviewed")}`,
    `Review evidence: ${reviewStatus.label}`,
    `Handoff readiness: ${dashboardMetricText("healthHandoffReadiness")}`,
    `Local backup: ${dashboardMetricText("healthLocalBackup")}`,
    `Memories: ${dashboardMetricText("healthMemoryCount")}`,
    `Feedback count: ${dashboardMetricText("healthFeedbackCount")}`,
    `Copied: ${new Date().toLocaleString()}`,
  ];
  lines.push("Operator checklist:");
  ADMIN_DASHBOARD_CHECKLIST_ITEMS.forEach((item) => {
    lines.push(`- ${item.label}: ${checklist[item.key] ? "yes" : "no"}`);
  });
  if (note) {
    lines.push("Operator note:");
    lines.push(note);
  } else if (noteDraft) {
    lines.push("Operator note draft:");
    lines.push(noteDraft);
  }
  if (reviewEvidence && reviewEvidence.raw) {
    lines.push("Review evidence:");
    lines.push(`- Saved: ${new Date(reviewEvidence.savedAt).toLocaleString()}`);
    lines.push(`- Checks detected: ${reviewStatus.checks} of ${reviewStatus.total}`);
  }
  if (activity.length) {
    lines.push("Recent activity:");
    activity.forEach((entry) => {
      const detail = entry.detail ? ` — ${entry.detail}` : "";
      lines.push(`- ${entry.label || "Dashboard update"}${detail} (${formatAdminActivityTime(entry.timestamp)})`);
    });
  }
  return lines.join("\n");
}

function dashboardPacketItems() {
  const snapshots = loadCycleSnapshot();
  const snapshotStatus = snapshotAttentionStatus(snapshots);
  const deployStatus = deployReadinessStatus(snapshots);
  const qualityStatus = typeof combinedQualityAttentionStatus === "function"
    ? combinedQualityAttentionStatus()
    : { label: "Quality pending", className: "pending" };
  const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
  const checklist = adminChecklistStatus(loadAdminDashboardChecklist());
  const activity = loadAdminDashboardActivity()[0] || null;
  const note = loadAdminDashboardNote();
  const noteDraft = loadAdminDashboardNoteDraft();
  const refresh = dashboardRefreshStatus(loadDashboardRefresh());
  const review = dashboardReviewStatus(loadDashboardReview());
  return [
    { label: "Next action", value: currentAdminRecommendedAction.label || "Pending" },
    { label: "Readiness", value: operatorReadinessScore(snapshots).label },
    { label: "Freshness", value: dashboardFreshnessStatus(snapshots).label },
    { label: "Snapshots", value: snapshotStatus.label },
    { label: "Cycle movement", value: dashboardMetricText("healthCycleMovement") },
    { label: "Canister state", value: dashboardMetricText("healthCanisterState") },
    { label: "Top-up plan", value: dashboardMetricText("healthTopUpPlan") },
    { label: "Deploy", value: deployStatus.label },
    { label: "Deploy buffer", value: frontendDeployBufferStatus(snapshots).label },
    { label: "Pre-deploy", value: preDeployCheckStatus(snapshots).label },
    { label: "Quality", value: qualityStatus.label },
    { label: "Site metrics", value: siteMetricsHealthStatus().label },
    { label: "Site 30 days", value: dashboardMetricText("siteMetricsMonth") },
    { label: "Site writes/day", value: dashboardMetricText("siteMetricsWrites") },
    { label: "Site storage", value: dashboardMetricText("siteMetricsStorage") },
    { label: "Evidence", value: evidence.label },
    { label: "Checklist", value: checklist.label },
    { label: "Local backup", value: localBackupStatus().label },
    { label: "Refresh", value: refresh.label },
    { label: "Review", value: review.label },
    { label: "Note", value: note ? "Saved" : noteDraft ? "Draft" : "Not saved" },
    { label: "Latest activity", value: activity ? `${activity.label || "Dashboard update"} · ${formatAdminActivityTime(activity.timestamp)}` : "None yet" },
  ];
}

function updateAdminPanelSummaries(snapshots = loadCycleSnapshot()) {
  const detailsSummary = document.getElementById("adminDashboardDetailsSummary");
  if (detailsSummary) {
    const snapshotStatus = snapshotAttentionStatus(snapshots);
    const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
    const readiness = operatorReadinessScore(snapshots);
    detailsSummary.textContent = `${readiness.label} · ${snapshotStatus.label} · ${evidence.label}`;
  }

  const handoffSummary = document.getElementById("adminDashboardHandoffSummary");
  if (handoffSummary) {
    const checklist = adminChecklistStatus(loadAdminDashboardChecklist());
    const note = loadAdminDashboardNote() ? "Note saved" : loadAdminDashboardNoteDraft() ? "Draft note" : "No note";
    handoffSummary.textContent = `${checklist.label} · ${note}`;
  }
}

function buildAdminReviewPacketText() {
  const noteInput = document.getElementById("adminDashboardNoteInput");
  if (noteInput && noteInput.value.trim()) {
    persistAdminDashboardNoteDraft(noteInput.value.trim());
  }
  if (document.getElementById("adminDashboardChecklist")) {
    persistAdminDashboardChecklist(readAdminDashboardChecklistFromInputs());
  }

  const items = dashboardPacketItems();
  const note = loadAdminDashboardNote();
  const noteDraft = loadAdminDashboardNoteDraft();
  const evidence = loadAdminReviewEvidence();
  const evidenceStatus = reviewEvidenceStatus(evidence);
  const activity = loadAdminDashboardActivity().slice(0, 5);
  const lines = [
    "Aion Operator Review Packet",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Status",
  ];
  items.forEach((item) => {
    lines.push(`- ${item.label}: ${item.value}`);
  });

  lines.push("");
  lines.push("Checklist");
  ADMIN_DASHBOARD_CHECKLIST_ITEMS.forEach((item) => {
    const checklist = loadAdminDashboardChecklist();
    lines.push(`- ${item.label}: ${checklist[item.key] ? "yes" : "no"}`);
  });

  if (note) {
    lines.push("");
    lines.push("Operator note");
    lines.push(note);
  } else if (noteDraft) {
    lines.push("");
    lines.push("Operator note draft");
    lines.push(noteDraft);
  }

  if (evidence && evidence.raw) {
    lines.push("");
    lines.push("Review evidence");
    lines.push(`- Status: ${evidenceStatus.label}`);
    lines.push(`- Saved: ${new Date(evidence.savedAt).toLocaleString()}`);
    lines.push(`- Checks detected: ${evidenceStatus.checks} of ${evidenceStatus.total}`);
  }

  if (activity.length) {
    lines.push("");
    lines.push("Recent activity");
    activity.forEach((entry) => {
      const detail = entry.detail ? ` — ${entry.detail}` : "";
      lines.push(`- ${entry.label || "Dashboard update"}${detail} (${formatAdminActivityTime(entry.timestamp)})`);
    });
  }

  return lines.join("\n");
}

function renderAdminReviewPacket() {
  const list = document.getElementById("adminDashboardReviewPacketList");
  const status = document.getElementById("adminDashboardReviewPacketStatus");
  updateAdminPanelSummaries();
  if (!list && !status) return;

  const items = dashboardPacketItems();
  if (list) {
    list.innerHTML = items
      .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></li>`)
      .join("");
  }
  if (status) {
    const checklist = adminChecklistStatus(loadAdminDashboardChecklist());
    const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
    status.textContent = `Ready to copy · ${checklist.label} · ${evidence.label}`;
  }
}

window.copyAdminReviewPacket = async function copyAdminReviewPacket() {
  const button = document.getElementById("adminDashboardCopyPacketButton");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(buildAdminReviewPacketText());
    recordAdminDashboardActivity("Review packet copied", currentAdminRecommendedAction.label || "");
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy review packet";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy review packet:", err);
    if (button) {
      button.textContent = "Copy failed";
      button.title = "Could not copy review packet. Use the visible packet details or try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy review packet";
        button.removeAttribute("title");
      }, 2200);
    }
  }
};

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
    "cd /Users/sandbox2/Documents/Projects/teves_consulting",
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
    "cd /Users/sandbox2/Documents/Projects/teves_consulting",
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

function buildAdminDeployPacketText() {
  const snapshots = loadCycleSnapshot();
  const frontend = snapshots.frontend || null;
  const backend = snapshots.backend || null;
  const wallet = snapshots.wallet || null;
  const preDeploy = preDeployCheckStatus(snapshots);
  const deployReadiness = deployReadinessStatus(snapshots);
  const deployBuffer = frontendDeployBufferStatus(snapshots);
  const topUpAmount = recommendedFrontendTopUpAmount(snapshots);
  const evidence = reviewEvidenceStatus(loadAdminReviewEvidence());
  const quality = typeof combinedQualityAttentionStatus === "function"
    ? combinedQualityAttentionStatus()
    : { label: "Quality pending", className: "pending" };
  const lines = [
    "Aion Operator Deploy Packet",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Status",
    `- Pre-deploy: ${preDeploy.label}`,
    `- Deploy readiness: ${deployReadiness.label}`,
    `- Deploy buffer: ${deployBuffer.label}`,
    `- Quality: ${quality.label}`,
    `- Site metrics: ${siteMetricsHealthStatus().label}`,
    `- Site 30 days: ${dashboardMetricText("siteMetricsMonth")}`,
    `- Site writes/day: ${dashboardMetricText("siteMetricsWrites")}`,
    `- Site storage: ${dashboardMetricText("siteMetricsStorage")}`,
    `- Review evidence: ${evidence.label}`,
    "",
    "Cycles",
    `- Frontend: ${frontend ? `${formatCycles(frontend.cycles)} · ${formatSnapshotAge(frontend)} old` : "Missing snapshot"}`,
    `- Backend: ${backend ? `${formatCycles(backend.cycles)} · ${formatSnapshotAge(backend)} old` : "Missing snapshot"}`,
    `- Wallet: ${wallet ? formatCycles(wallet.cycles) : "Missing balance"}`,
    `- Movement: ${dashboardMetricText("healthCycleMovement")}`,
    `- Recommended top-up: ${topUpAmount ? `${formatCycles(topUpAmount)} (${formatTopUpAmount(topUpAmount)})` : "Pending"}`,
    `- Suggested frontend deploy reserve: ${formatCycles(ADMIN_FRONTEND_DEPLOY_RESERVE)}`,
  ];
  lines.push("");
  lines.push("Deploy together");
  lines.push("cd /Users/sandbox2/Documents/Projects/teves_consulting");
  lines.push("git diff --check");
  lines.push("scripts/prepare-frontend-assets.sh");
  lines.push("mops test");
  lines.push("mops build");
  lines.push("icp canister start teves_consulting_backend -e ic");
  lines.push("icp canister start teves_consulting_frontend -e ic");
  lines.push("icp build teves_consulting_backend");
  lines.push("icp build teves_consulting_frontend");
  lines.push("icp deploy teves_consulting_backend -e ic --mode upgrade");
  lines.push("icp deploy teves_consulting_frontend -e ic --mode upgrade");
  if (preDeploy.missing.length) {
    lines.push("");
    lines.push("Before deploy");
    preDeploy.missing.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join("\n");
}

function buildCycleMovementHistoryText() {
  const entries = loadCycleHistory();
  const lines = [
    "Aion Operator Cycle Movement",
    `Generated: ${new Date().toLocaleString()}`,
    "",
  ];
  if (!entries.length) {
    lines.push("No cycle movement has been recorded yet.");
    lines.push("Paste a second frontend, backend, or wallet snapshot to compare movement.");
    return lines.join("\n");
  }
  entries.slice(0, 8).forEach((entry) => {
    const status = cycleMovementStatus(entry);
    const recorded = entry.recordedAt ? new Date(entry.recordedAt).toLocaleString() : "Unknown time";
    lines.push(`- ${status.label} · ${formatCycles(entry.previousCycles)} to ${formatCycles(entry.cycles)} · ${recorded}`);
  });
  return lines.join("\n");
}

window.copyCycleMovementHistory = async function copyCycleMovementHistory() {
  const button = document.getElementById("adminDashboardCopyMovementButton");
  const status = document.getElementById("cycleSnapshotStatus");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(buildCycleMovementHistoryText());
    recordAdminDashboardActivity("Cycle movement copied", cycleMovementStatus(loadCycleHistory()[0]).label);
    if (status) {
      status.textContent = "Cycle movement copied.";
    }
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy movement";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy cycle movement:", err);
    if (status) {
      status.textContent = "Could not copy cycle movement. Review the visible movement history or paste a fresh snapshot and try again.";
    }
    if (button) {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy movement";
      }, 2200);
    }
  }
};

window.copyAdminDeployPacket = async function copyAdminDeployPacket() {
  const button = document.getElementById("adminDashboardCopyDeployPacketButton");
  const status = document.getElementById("cycleSnapshotStatus");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(buildAdminDeployPacketText());
    recordAdminDashboardActivity("Deploy packet copied", preDeployCheckStatus(loadCycleSnapshot()).label);
    if (status) {
      status.textContent = "Deploy packet copied.";
    }
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy deploy packet";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy deploy packet:", err);
    if (status) {
      status.textContent = "Could not copy deploy packet. Review readiness and saved evidence, then try again.";
    }
    if (button) {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy deploy packet";
      }, 2200);
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

function buildAdminDashboardActionsText() {
  const snapshots = loadCycleSnapshot();
  const actions = dashboardActionQueue(snapshots);
  const readiness = operatorReadinessScore(snapshots);
  const lines = [
    "Aion Operator Recommended Actions",
    `Generated: ${new Date().toLocaleString()}`,
    "Scope: dashboard guidance only; copying this does not execute an action.",
    `Current state: ${dashboardMetricText("adminDashboardHeadline")}`,
    `Operator readiness: ${dashboardMetricText("healthOperatorReadiness")}`,
    `Freshness: ${dashboardMetricText("healthFreshness")}`,
  ];
  if (readiness.missing && readiness.missing.length) {
    lines.push(`Missing readiness: ${readiness.missing.join(", ")}`);
  }
  lines.push("", "Actions");
  actions.forEach((action, index) => {
    const destination = dashboardActionDestination(action);
    lines.push(`${index + 1}. ${action.label}${action.tag ? ` (${action.tag})` : ""}${destination ? ` — ${destination}` : ""}`);
  });
  return lines.join("\n");
}

window.copyAdminDashboardActions = async function copyAdminDashboardActions() {
  const button = document.getElementById("adminDashboardCopyActionsButton");
  const previousText = button ? button.textContent : "";
  try {
    await copyTextToClipboard(buildAdminDashboardActionsText());
    recordAdminDashboardActivity("Copied next actions", currentAdminRecommendedAction.label || "");
    if (button) {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy recommended actions";
      }, 1600);
    }
  } catch (err) {
    console.error("Could not copy next actions:", err);
    if (button) {
      button.textContent = "Copy failed";
      button.title = "Could not copy recommended actions. Use the visible action queue or try again.";
      window.setTimeout(() => {
        button.textContent = previousText || "Copy recommended actions";
        button.removeAttribute("title");
      }, 2200);
    }
  }
};

function setCycleInputValue(kind, snapshot) {
  const inputElement = document.getElementById(`${kind}CycleStatusInput`);
  if (!inputElement || inputElement.value.trim() || !snapshot) return;
  if (kind === "wallet") {
    inputElement.value = `Balance: ${snapshot.cycles.toLocaleString().replaceAll(",", "_")} cycles`;
    return;
  }
  inputElement.value = `Canister Name: ${snapshot.canisterName || kind}\nCanister Id: ${snapshot.canisterId || ""}\nCycles: ${snapshot.cycles.toLocaleString().replaceAll(",", "_")}\nReserved cycles limit: ${snapshot.reservedLimit ? snapshot.reservedLimit.toLocaleString().replaceAll(",", "_") : ""}\nIdle cycles burned per day: ${snapshot.burnPerDay ? snapshot.burnPerDay.toLocaleString().replaceAll(",", "_") : ""}`;
}

function renderCycleSnapshot(snapshots = loadCycleSnapshot()) {
  const frontend = snapshots.frontend || null;
  const backend = snapshots.backend || null;
  const wallet = snapshots.wallet || null;
  const frontendSummary = document.getElementById("frontendCycleSnapshotSummary");
  const backendSummary = document.getElementById("backendCycleSnapshotSummary");
  const walletSummary = document.getElementById("walletCycleSnapshotSummary");
  const topUpSummary = document.getElementById("frontendTopUpSummary");
  const shortest = shortestCycleRunway(snapshots);
  const oldest = oldestCycleSnapshot(snapshots);

  if (!frontend) {
    setAdminHealthMetric("healthFrontendCycles", "Add snapshot");
  } else {
    const percent = cyclePercent(frontend);
    const percentLabel = percent === null ? "" : ` · ${percent.toFixed(1)}%`;
    setAdminHealthMetric("healthFrontendCycles", `${formatCycles(frontend.cycles)}${percentLabel}`);
  }

  if (!backend) {
    setAdminHealthMetric("healthBackendCycles", "Add snapshot");
  } else {
    const percent = cyclePercent(backend);
    const percentLabel = percent === null ? "" : ` · ${percent.toFixed(1)}%`;
    setAdminHealthMetric("healthBackendCycles", `${formatCycles(backend.cycles)}${percentLabel}`);
  }

  if (!wallet) {
    setAdminHealthMetric("healthWalletCycles", "Add balance");
  } else {
    setAdminHealthMetric("healthWalletCycles", formatCycles(wallet.cycles));
  }

  const canisterStateElement = document.getElementById("healthCanisterState");
  if (canisterStateElement) {
    const canisterState = canisterStateStatus(snapshots);
    canisterStateElement.innerHTML = `<span class="admin-cycle-runway-label ${canisterState.className}">${escapeHtml(canisterState.label)}</span>`;
  }

  const topUpPlanElement = document.getElementById("healthTopUpPlan");
  if (topUpPlanElement) {
    const topUpPlan = topUpPlanStatus(snapshots);
    topUpPlanElement.innerHTML = `<span class="admin-cycle-runway-label ${topUpPlan.className}">${escapeHtml(topUpPlan.label)}</span>`;
  }

  if (!shortest) {
    const runwayElement = document.getElementById("healthCycleRunway");
    if (runwayElement) {
      runwayElement.innerHTML = `Pending<span class="admin-cycle-runway-label pending">Pending</span>`;
    }
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
  }

  const snapshotAgeElement = document.getElementById("healthCycleSnapshotAge");
  if (!oldest) {
    if (snapshotAgeElement) {
      snapshotAgeElement.innerHTML = `Pending<span class="admin-cycle-freshness-label pending">Pending</span>`;
    }
  } else {
    const label = ADMIN_CYCLE_LABELS[oldest.key] || oldest.key;
    const freshnessStatus = cycleFreshnessStatus(oldest.hours);
    const days = Math.floor(oldest.hours / 24);
    const ageLabel = oldest.hours < 1
      ? "Less than 1 hour"
      : oldest.hours < 24
        ? `${Math.floor(oldest.hours)} hours`
        : days === 1
          ? "1 day"
          : `${days} days`;
    if (snapshotAgeElement) {
      snapshotAgeElement.innerHTML = `${escapeHtml(ageLabel)} · ${escapeHtml(label)}<span class="admin-cycle-freshness-label ${freshnessStatus.className}">${freshnessStatus.label}</span>`;
    }
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
  renderCycleMovement();
  if (topUpSummary) {
    topUpSummary.innerHTML = frontendTopUpSummaryHtml(snapshots);
  }

  const topUpButton = document.getElementById("frontendTopUpButton");
  if (topUpButton) {
    const topUpAmount = recommendedFrontendTopUpAmount(snapshots);
    topUpButton.textContent = topUpAmount
      ? `Copy top-up ${formatTopUpAmount(topUpAmount)}`
      : "Copy recommended top-up";
  }

  const deployReadinessElement = document.getElementById("healthDeployReadiness");
  if (deployReadinessElement) {
    const deployReadiness = deployReadinessStatus(snapshots);
    deployReadinessElement.innerHTML = `<span class="admin-cycle-runway-label ${deployReadiness.className}">${escapeHtml(deployReadiness.label)}</span>`;
  }
  renderFrontendDeployBuffer(snapshots);
  renderPreDeployCheck(snapshots);
  refreshAdminRecommendedAction(snapshots);
  renderDashboardRefresh();
  renderDashboardReview();
  setCycleInputValue("frontend", frontend);
  setCycleInputValue("backend", backend);
  setCycleInputValue("wallet", wallet);
  renderAdminReviewEvidence();
  renderAdminDashboardChecklist();
  renderAdminDashboardNote();
  renderAdminDashboardActivity();
}

window.saveCycleSnapshotFromInput = function saveCycleSnapshotFromInput(kind = "frontend") {
  const input = document.getElementById(`${kind}CycleStatusInput`);
  const status = document.getElementById("cycleSnapshotStatus");

  try {
    const snapshot = parseCycleStatusSnapshot(input ? input.value : "", kind);
    const snapshots = loadCycleSnapshot();
    recordCycleHistory({ [kind]: snapshot }, snapshots);
    snapshots[kind] = snapshot;
    persistCycleSnapshots(snapshots);
    renderCycleSnapshot(snapshots);
    if (snapshots.frontend && snapshots.backend) {
      updateAdminDashboardChecklist({ snapshots: true });
    }
    recordAdminDashboardActivity(
      `${ADMIN_CYCLE_LABELS[kind] || "Canister"} snapshot updated`,
      `${formatCycles(snapshot.cycles)} cycles`
    );
    if (status) {
      status.textContent = `${ADMIN_CYCLE_LABELS[kind] || "Canister"} cycle snapshot updated.`;
    }
  } catch (err) {
    if (status) {
      status.textContent = `${err.message || "Could not parse cycle snapshot."} Paste fresh canister status output and try again.`;
    }
  }
};

window.saveCombinedCycleSnapshotsFromInput = function saveCombinedCycleSnapshotsFromInput() {
  const input = document.getElementById("combinedCycleStatusInput");
  const status = document.getElementById("cycleSnapshotStatus");

  try {
    const updates = parseCombinedCycleSnapshots(input ? input.value : "");
    const snapshots = loadCycleSnapshot();
    recordCycleHistory(updates, snapshots);
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

window.saveCycleWalletFromInput = function saveCycleWalletFromInput() {
  const input = document.getElementById("walletCycleStatusInput");
  const status = document.getElementById("cycleSnapshotStatus");

  try {
    const snapshot = parseCycleWalletSnapshot(input ? input.value : "");
    const snapshots = loadCycleSnapshot();
    recordCycleHistory({ wallet: snapshot }, snapshots);
    snapshots.wallet = snapshot;
    persistCycleSnapshots(snapshots);
    renderCycleSnapshot(snapshots);
    updateAdminDashboardChecklist({ wallet: true });
    recordAdminDashboardActivity("Wallet balance updated", `${formatCycles(snapshot.cycles)} cycles`);
    if (status) {
      status.textContent = "Cycles wallet balance updated.";
    }
  } catch (err) {
    if (status) {
      status.textContent = `${err.message || "Could not parse cycles wallet balance."} Paste fresh wallet balance output and try again.`;
    }
  }
};

window.clearCycleSnapshot = function clearCycleSnapshot(kind = "frontend") {
  const snapshots = loadCycleSnapshot();
  delete snapshots[kind];
  persistCycleSnapshots(snapshots);
  const input = document.getElementById(`${kind}CycleStatusInput`);
  const status = document.getElementById("cycleSnapshotStatus");
  if (input) input.value = "";
  renderCycleSnapshot(snapshots);
  if (kind === "frontend" || kind === "backend") {
    updateAdminDashboardChecklist({ snapshots: false });
  }
  if (kind === "wallet") {
    updateAdminDashboardChecklist({ wallet: false });
  }
  recordAdminDashboardActivity(`${ADMIN_CYCLE_LABELS[kind] || "Canister"} snapshot cleared`);
  if (status) {
    status.textContent = `${ADMIN_CYCLE_LABELS[kind] || "Canister"} cycle snapshot cleared.`;
  }
};

window.clearCycleHistory = function clearCycleHistory() {
  const status = document.getElementById("cycleSnapshotStatus");
  persistCycleHistory([]);
  renderCycleMovement();
  renderLocalBackupMetric();
  recordAdminDashboardActivity("Cycle movement cleared");
  if (status) {
    status.textContent = "Cycle movement history cleared.";
  }
};

window.markDashboardReviewed = function markDashboardReviewed() {
  const review = { reviewedAt: new Date().toISOString() };
  persistDashboardReview(review);
  renderDashboardReview(review);
  renderCycleSnapshot(loadCycleSnapshot());
  recordAdminDashboardActivity("Dashboard reviewed", "Operator marked current state reviewed");
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
  }

  try {
    await Promise.allSettled([
      loadMemories(),
      loadGoldenTests(),
      loadFeedback(),
      loadSiteMetrics(),
    ]);
    const refresh = { refreshedAt: new Date().toISOString() };
    persistDashboardRefresh(refresh);
    renderDashboardRefresh(refresh);
    renderCycleSnapshot(loadCycleSnapshot());
    recordAdminDashboardActivity("Dashboard refreshed", "Memory, tests, feedback, and site metrics requested");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText || "Refresh dashboard";
    }
  }
};
// Admin cycles visibility end

const savedGolden = loadSavedGoldenResults();

if (savedGolden) {
  renderGoldenTests(savedGolden);
}
restoreCachedSiteMetrics();
renderCycleSnapshot();
renderGoldenDashboardSignal(loadSavedGoldenResults());
renderFeedbackDashboardSignal(latestFeedback);
initAuth();
