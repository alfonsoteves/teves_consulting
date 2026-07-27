import { Actor, HttpAgent } from "https://esm.sh/@dfinity/agent@2.1.3";
import { IDL } from "https://esm.sh/@dfinity/candid@2.1.3";
import { AuthClient } from "https://esm.sh/@dfinity/auth-client@2.1.3?deps=@dfinity/candid@2.1.3,@dfinity/agent@2.1.3";

const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const AIONIC_AGENT_API_BASE_URL = "https://aionic-agent-api.onrender.com";
const OPERATOR_SESSION_EXCHANGE_URL = `${AIONIC_AGENT_API_BASE_URL}/admin/operator-session`;
let authClient = null;
let identity = null;
let actor = null;
let isAuthenticated = false;
let isOperator = false;
let renderOperatorSessionToken = null;
const browserFetch = window.fetch.bind(window);

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

function encodeOperatorGrant(nonce) {
  let binary = "";
  nonce.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function establishRenderOperatorSession() {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const issued = await actor.issueOperatorSessionGrant(Array.from(nonce));
  if (!issued) throw new Error("Operator session grant was not issued.");

  const response = await browserFetch(OPERATOR_SESSION_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: encodeOperatorGrant(nonce) }),
  });
  if (!response.ok) throw new Error("Operator session exchange was rejected.");
  const session = await response.json();
  renderOperatorSessionToken = session.sessionToken;
}

async function renderFetch(path) {
  const headers = new Headers();
  if (renderOperatorSessionToken) {
    headers.set("Authorization", `Bearer ${renderOperatorSessionToken}`);
  }
  const response = await browserFetch(`${AIONIC_AGENT_API_BASE_URL}${path}`, { headers });
  if (!response.ok) throw new Error(`Render request failed: ${response.status}`);
  return response.json();
}

function setAccess(message, state = "") {
  const node = document.getElementById("operatorAccess");
  node.textContent = message;
  node.className = `status ${state}`.trim();
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

async function loadRolesAndRules() {
  const [nativeReport, renderBridgeReport] = await Promise.all([
    actor.getAionRoleRulesOperatingAgreementStatus(),
    renderFetch("/admin/role-rules-operating-agreement"),
  ]);
  if (nativeReport.agreementVersion !== renderBridgeReport.agreementVersion) {
    setAccess("Operator access verified. Native and Render rules need review.", "denied");
  } else {
    setAccess("Operator access verified. Roles & Rules are read-only.", "verified");
  }
  renderReport(nativeReport);
}

async function refreshOperatorAccess() {
  if (!isAuthenticated || !actor) {
    setAccess("Sign in with Internet Identity to continue.");
    return;
  }
  try {
    const status = await actor.getOperatorStatus();
    if (!status.allowlistConfigured || !status.isOperator) {
      isOperator = false;
      document.getElementById("operatorWorkspace").classList.remove("is-visible");
      setAccess("Access denied. This workspace is restricted to the Teves Consulting operator.", "denied");
      return;
    }
    await establishRenderOperatorSession();
    isOperator = true;
    document.getElementById("operatorWorkspace").classList.add("is-visible");
    await loadRolesAndRules();
  } catch (error) {
    console.error("Operator access failed", error);
    setAccess("Operator access could not be verified. Refresh after the session service is available.", "denied");
  }
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
    setAccess("Sign in with Internet Identity to continue.");
  }
  document.getElementById("authButton").textContent = isAuthenticated ? "Logout" : "Sign In";
}

async function handleAuth() {
  if (!authClient) authClient = await AuthClient.create();
  if (isAuthenticated) {
    await authClient.logout();
    isAuthenticated = false;
    isOperator = false;
    renderOperatorSessionToken = null;
    document.getElementById("operatorWorkspace").classList.remove("is-visible");
    document.getElementById("authButton").textContent = "Sign In";
    setAccess("Sign in with Internet Identity to continue.");
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

document.getElementById("authButton").addEventListener("click", handleAuth);
initAuth();
