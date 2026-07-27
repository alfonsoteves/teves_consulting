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
  `;
}

async function loadPrimeHome() {
  const report = await renderFetch("/admin/prime-operational-experience");
  renderPrimeHome(report);
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
  await loadPrimeHome();
  await loadRoleContextPackets();
  await loadMockRolePipeline();
  await loadLiveRolePrototypeGate();
  await loadRoleEvaluation();
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
