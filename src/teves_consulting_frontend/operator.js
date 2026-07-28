import { Actor, HttpAgent } from "https://esm.sh/@dfinity/agent@2.1.3";
import { IDL } from "https://esm.sh/@dfinity/candid@2.1.3";
import { AuthClient } from "https://esm.sh/@dfinity/auth-client@2.1.3?deps=@dfinity/candid@2.1.3,@dfinity/agent@2.1.3";

const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const AIONIC_AGENT_API_BASE_URL = "https://aionic-agent-api.onrender.com";
const OPERATOR_SESSION_EXCHANGE_URL = `${AIONIC_AGENT_API_BASE_URL}/admin/operator-session`;
const OPERATOR_SESSION_STORAGE_KEY = "aion_operator_session_v1";
let authClient = null;
let identity = null;
let actor = null;
let isAuthenticated = false;
let isOperator = false;
let renderOperatorSessionToken = null;
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

const PRIME_TRIAL_CAPTURE_STORAGE_KEY = "aion_prime_trial_capture_draft_v1";

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
  const storedSession = readStoredOperatorSession();
  if (storedSession) {
    renderOperatorSessionToken = storedSession.sessionToken;
    return;
  }

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
  if (!session || typeof session.sessionToken !== "string" || !session.sessionToken) {
    throw new Error("Operator session exchange returned an invalid session.");
  }
  renderOperatorSessionToken = session.sessionToken;
  writeStoredOperatorSession(session);
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

function setOperatorWorkspaceWarning(message = "") {
  const node = document.getElementById("operatorWorkspaceWarning");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
}

function setOperatorShellSignedIn(signedIn) {
  document.body.classList.toggle("operator-signed-in", signedIn);
  document.body.classList.toggle("operator-signed-out", !signedIn);
  const workspace = document.getElementById("operatorWorkspace");
  if (workspace && !signedIn) {
    workspace.classList.remove("is-visible");
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

function renderPrimeHome(report) {
  const container = document.getElementById("primeHomeResults");
  if (!container) return;
  const boundary = report.boundary || {};
  const brief = report.morningBrief || {};
  const continuity = report.continuityRestoration || {};
  container.innerHTML = `
    <div class="summary-grid">
      <div class="panel">
        <h2>${escapeHtml(brief.headline || "Prime Home")}</h2>
        <p>${escapeHtml(brief.summary || "")}</p>
        <span class="badge">${escapeHtml(report.milestone || "")}</span>
      </div>
      <div class="panel">
        <h2>Workspace</h2>
        <ul>${(report.workspaceNavigation || []).map((item) => `
          <li><strong>${escapeHtml(item.title || "")}</strong><br><span class="meta">${item.current ? "Current" : item.enabledInPhase97 ? "Enabled" : "Readiness"} - ${escapeHtml(item.purpose || "")}</span></li>
        `).join("")}</ul>
      </div>
      <div class="panel">
        <h2>Continuity</h2>
        <ul>
          <li>Canonical: ${escapeHtml(continuity.canonicalContinuityRef || "")}</li>
          <li>Current phase: ${boolText(continuity.includesCurrentPhase)}</li>
          <li>Accepted baseline: ${boolText(continuity.includesAcceptedBaseline)}</li>
          <li>Approved packets: ${boolText(continuity.includesApprovedWorkPackets)}</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Boundary</h2>
        <ul>
          <li>Prime primary: ${boolText(boundary.primeIsPrimaryInternalExperience)}</li>
          <li>Operator authority: ${boolText(boundary.operatorRemainsAuthority)}</li>
          <li>Autonomous execution: ${boolText(boundary.autonomousExecutionEnabled)}</li>
          <li>Memory writes: ${boolText(boundary.memoryWritesEnabled)}</li>
          <li>Provider route changes: ${boolText(boundary.providerRouteChangesEnabled)}</li>
        </ul>
      </div>
    </div>
    <h3>Current Projects</h3>
    ${table(
      ["Project", "Repo", "Status", "Next Step"],
      (report.currentProjects || []).map((project) => `
        <tr>
          <td><strong>${escapeHtml(project.displayName || "")}</strong><br><span class="meta">${escapeHtml(project.currentPhase || "")}</span></td>
          <td>${escapeHtml(project.repoName || "")}</td>
          <td>${escapeHtml(project.status || "")}</td>
          <td>${escapeHtml(project.nextUsefulStep || "")}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Priorities</h3>
        <ul>${(report.activePriorities || []).map((priority) => `
          <li><strong>${escapeHtml(priority.title || "")}</strong><br><span class="meta">${escapeHtml(priority.reason || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Pending Decisions</h3>
        <ul>${(report.pendingDecisions || []).map((decision) => `
          <li><strong>${escapeHtml(decision.question || "")}</strong><br><span class="meta">${escapeHtml(decision.recommendedDefault || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Next Actions</h3>
        <ul>${(report.recommendedNextActions || []).map((action) => `
          <li><strong>${escapeHtml(action.title || "")}</strong><br><span class="meta">${escapeHtml(action.rationale || "")}</span></li>
        `).join("")}</ul>
      </article>
    </div>
    <h3>Daily Rhythm</h3>
    ${table(
      ["Stage", "Prime Responsibility", "Artifact", "Approval", "Enabled"],
      (report.dailyWorkflow || []).map((stage) => `
        <tr>
          <td><strong>${escapeHtml(stage.stageName || "")}</strong><br><span class="meta">${escapeHtml(stage.supportingRole || "Prime")}</span></td>
          <td>${escapeHtml(stage.primeResponsibility || "")}</td>
          <td>${escapeHtml(stage.expectedArtifact || "")}</td>
          <td>${boolText(stage.operatorApprovalRequired)}</td>
          <td>${boolText(stage.enabledInPhase97)}</td>
        </tr>
      `)
    )}
    <div class="role-grid">
      <article class="role-card">
        <h3>Success Metrics</h3>
        <ul>${(report.successMetrics || []).map((metric) => `
          <li><strong>${escapeHtml(metric.title || "")}</strong><br><span class="meta">${escapeHtml(metric.targetDirection || "")}: ${escapeHtml(metric.measurement || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Packet Chain</h3>
        <ul>${(report.artifactHandoffReadiness || []).map((artifact) => `
          <li><strong>${escapeHtml(artifact.artifactKind || "")}</strong><br><span class="meta">${escapeHtml(artifact.producedBy || "")} to ${escapeHtml((artifact.consumedBy || []).join(", "))}. Automatic transfer: ${boolText(artifact.automaticTransferEnabled)}</span></li>
        `).join("")}</ul>
      </article>
    </div>
    <div class="role-grid">
      <article class="role-card">
        <h3>Role Readiness</h3>
        <ul>${(report.roleReadiness || []).map((role) => `
          <li><strong>${escapeHtml(role.roleName || "")}</strong><br><span class="meta">${escapeHtml(role.operationalStatus || "")}. Selectable: ${boolText(role.selectableInPhase97)}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Evergreen Backlog</h3>
        <ul>${(report.evergreenBacklog || []).map((item) => `
          <li><strong>${escapeHtml(item.title || "")}</strong><br><span class="meta">${escapeHtml(item.reason || "")} Execution: ${boolText(item.executionAuthorized)}</span></li>
        `).join("")}</ul>
      </article>
    </div>
    <div class="role-grid">
      <article class="role-card">
        <h3>Context Sources</h3>
        <ul>${(report.contextSources || []).map((source) => `
          <li><strong>${escapeHtml(source.title || "")}</strong><br><span class="meta">${escapeHtml(source.sourceKind || "")}: ${escapeHtml(source.provenance || "")}</span></li>
        `).join("")}</ul>
      </article>
      <article class="role-card">
        <h3>Continuity Updates</h3>
        <ul>
          <li>Prime may propose: ${boolText((report.continuityProposalBoundary || {}).primeMayProposeContinuityUpdates)}</li>
          <li>Automatic memory write: ${boolText((report.continuityProposalBoundary || {}).automaticCanonicalMemoryWriteEnabled)}</li>
          <li>Operator approval: ${boolText((report.continuityProposalBoundary || {}).operatorApprovalRequired)}</li>
          <li>Governed process: ${boolText((report.continuityProposalBoundary || {}).governedMemoryProcessRequired)}</li>
          <li>Artifact: ${escapeHtml((report.continuityProposalBoundary || {}).proposedUpdateArtifact || "")}</li>
        </ul>
      </article>
    </div>
  `;
}

async function loadPrimeHome() {
  const report = await renderFetch("/admin/prime-operational-experience");
  renderPrimeHome(report);
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

async function loadRolesAndRules() {
  setOperatorWorkspaceWarning("");
  const nativeReport = await actor.getAionRoleRulesOperatingAgreementStatus();
  let renderBridgeReport = null;

  try {
    renderBridgeReport = await renderFetch("/admin/role-rules-operating-agreement");
  } catch (error) {
    console.warn("Render roles and rules bridge unavailable:", error);
  }

  if (renderBridgeReport && nativeReport.agreementVersion !== renderBridgeReport.agreementVersion) {
    setAccess("Operator access verified. Native and Render rules need review.", "denied");
  } else if (renderBridgeReport) {
    setAccess("Operator access verified. Roles & Rules are read-only.", "verified");
  } else {
    setAccess("Operator access verified. Render bridge data is temporarily unavailable.", "verified");
    setOperatorWorkspaceWarning("Some Operator panels could not refresh from the session service. Your operator access remains verified.");
  }

  renderReport(nativeReport);

  const panelLoaders = [
    loadPrimeHome,
    loadMirrorWorkflow,
    loadEngineerWorkflow,
    loadCoordinationLoop,
    loadApprovalBoundary,
    loadTrioValidation,
    loadArchitectureValidationRun,
    loadPrimeOperationalValidationCriteria,
    loadPrimeOperationalValidationRun,
    loadPrimeOperationalValidationAcceptanceGate,
    loadPrimeOperationalValidationSameTaskComparison,
    loadPrimeOperationalValidationTrialCaptureTemplate,
    loadRoleContextPackets,
    loadMockRolePipeline,
    loadLiveRolePrototypeGate,
    loadRoleEvaluation,
  ];

  const results = await Promise.allSettled(panelLoaders.map((loader) => loader()));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    console.warn("Operator panel refresh incomplete:", failed);
    setOperatorWorkspaceWarning(`${failed.length} Operator panel${failed.length === 1 ? "" : "s"} could not refresh from the session service. Your operator access remains verified.`);
  }
}


async function refreshOperatorAccess() {
  /* operator verified workspace load boundary start */
  if (!isAuthenticated || !actor) {
    setOperatorWorkspaceWarning("");
    setOperatorShellSignedIn(false);
    setAccess("Sign in with Internet Identity to continue.");
    return;
  }

  try {
    const status = await actor.getOperatorStatus();
    if (!status.allowlistConfigured || !status.isOperator) {
      isOperator = false;
      renderOperatorSessionToken = null;
      clearStoredOperatorSession();
      setOperatorWorkspaceWarning("");
      document.getElementById("operatorWorkspace").classList.remove("is-visible");
      setOperatorShellSignedIn(false);
      setAccess("Access denied. This workspace is restricted to the Teves Consulting operator.", "denied");
      return;
    }
  } catch (error) {
    console.error("Operator principal verification failed", error);
    isOperator = false;
    renderOperatorSessionToken = null;
    clearStoredOperatorSession();
    setOperatorWorkspaceWarning("");
    document.getElementById("operatorWorkspace").classList.remove("is-visible");
    setOperatorShellSignedIn(false);
    setAccess("Operator access could not be verified. Refresh after the identity service is available.", "denied");
    return;
  }

  isOperator = true;
  document.getElementById("operatorWorkspace").classList.add("is-visible");
  setOperatorShellSignedIn(true);
  setAccess("Operator access verified. Loading workspace...", "verified");

  try {
    await establishRenderOperatorSession();
    await loadRolesAndRules();
  } catch (error) {
    console.error("Operator workspace refresh failed", error);
    renderOperatorSessionToken = null;
    clearStoredOperatorSession();
    setAccess("Operator access verified. Session service is temporarily unavailable.", "verified");
    setOperatorWorkspaceWarning("Some Operator panels could not refresh from the session service. Your operator access remains verified.");
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
    setOperatorShellSignedIn(false);
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
    clearStoredOperatorSession();
    document.getElementById("operatorWorkspace").classList.remove("is-visible");
    setOperatorShellSignedIn(false);
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
