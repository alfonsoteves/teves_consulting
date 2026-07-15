import { Actor, HttpAgent } from "https://esm.sh/@dfinity/agent@2.1.3";
import { IDL } from "https://esm.sh/@dfinity/candid@2.1.3";
import { AuthClient } from "https://esm.sh/@dfinity/auth-client@2.1.3?deps=@dfinity/candid@2.1.3,@dfinity/agent@2.1.3";

const BACKEND_CANISTER_ID = "lzsyn-biaaa-aaaai-rakea-cai";
const LLM_CANISTER_ID = "w36hm-eqaaa-aaaal-qr76a-cai";
const LLM_CANDIDATE_MODEL = "llama3.1:8b";
const LLM_CANDIDATE_TIMEOUT_MS = 30000;
const LLM_CANDIDATE_MAX_RESPONSE_CHARS = 20000;
const AIONIC_AGENT_API_BASE_URL = "https://aionic-agent-api.onrender.com";
const OPERATOR_SESSION_EXCHANGE_URL = `${AIONIC_AGENT_API_BASE_URL}/admin/operator-session`;
const DEFAULT_CANDIDATE_MODELS = [
  LLM_CANDIDATE_MODEL,
  "qwen3:32b",
  "llama4-scout",
];
const LLM_CANDIDATE_V1_MODELS = new Set(["qwen3:32b", "llama4-scout"]);
const MAX_CANDIDATE_MODELS_PER_RUN = 4;
const AION_PROVIDER_SCORECARD_CRITERIA = [
  "identity fit",
  "context/continuity fit",
  "user sovereignty",
  "evidence grounding",
  "hallucination resistance",
  "conciseness/style",
  "latency/reliability",
  "overall Aion fit",
];
const AION_MODEL_PROVIDER_REGISTRY = [
  {
    provider: "OpenAI",
    environment: "Render",
    model: "gpt-5.4-mini",
    status: "active baseline",
    verification: "production configured",
    runnableInAdmin: false,
    certified: true,
    continuityOwner: "Aion",
    notes: "Current user-facing answer path; not called by the Admin candidate harness.",
  },
  {
    provider: "ICP LLM canister",
    environment: "ICP",
    canisterId: LLM_CANISTER_ID,
    model: "llama3.1:8b",
    status: "secondary candidate / Admin-only",
    verification: "live Candid verified",
    runnableInAdmin: true,
    certified: false,
    continuityOwner: "Aion",
    notes: "Fastest tested candidate; answer-shape consistency remains under review.",
  },
  {
    provider: "ICP LLM canister",
    environment: "ICP",
    canisterId: LLM_CANISTER_ID,
    model: "llama4-scout",
    status: "strong secondary / Admin-only",
    verification: "comparative Aion-fit batch: 6/7 full contract",
    runnableInAdmin: true,
    certified: false,
    continuityOwner: "Aion",
    notes: "Strong v1_chat candidate; one source-language review and slower latency in the latest comparative batch.",
  },
  {
    provider: "ICP LLM canister",
    environment: "ICP",
    canisterId: LLM_CANISTER_ID,
    model: "qwen3:32b",
    status: "current ICP evidence lead / Admin-only",
    verification: "comparative Aion-fit batch: 7/7 full contract",
    runnableInAdmin: true,
    certified: false,
    continuityOwner: "Aion",
    notes: "Current v1_chat evidence lead: 7/7 full contract at a 4202ms comparative Aion-fit average.",
  },
];
const AION_PROVIDER_SCORECARD_REFERENCE = [
  {
    criterion: "Identity fit",
    openai: "5/5 baseline",
    llama31: "4/5 tested",
    llama4: "5/5 tested",
    qwen: "5/5 tested",
  },
  {
    criterion: "Context/continuity fit",
    openai: "5/5 baseline",
    llama31: "4/5 tested",
    llama4: "5/5 tested",
    qwen: "5/5 tested",
  },
  {
    criterion: "User sovereignty",
    openai: "5/5 baseline",
    llama31: "5/5 tested",
    llama4: "5/5 tested",
    qwen: "5/5 tested",
  },
  {
    criterion: "Evidence grounding",
    openai: "5/5 baseline",
    llama31: "4/5 tested",
    llama4: "5/5 tested",
    qwen: "5/5 tested",
  },
  {
    criterion: "Hallucination resistance",
    openai: "5/5 baseline",
    llama31: "4/5 tested",
    llama4: "5/5 tested",
    qwen: "5/5 tested",
  },
  {
    criterion: "Conciseness/style",
    openai: "5/5 baseline",
    llama31: "3/5 review",
    llama4: "4/5 source-language review",
    qwen: "5/5 tested",
  },
  {
    criterion: "Latency/reliability",
    openai: "production baseline",
    llama31: "~3-5s tested",
    llama4: "~5.1s comparative",
    qwen: "~4.2s comparative",
  },
  {
    criterion: "Overall Aion fit",
    openai: "certified baseline",
    llama31: "promising candidate",
    llama4: "strong secondary",
    qwen: "current ICP evidence lead",
  },
];
const HARDENED_CANDIDATE_SYSTEM_PROMPT = "Use only the supplied Aion notes. Describe Aion as Alfonso's continuity and practical reasoning assistant, not as a model, game, company, or autonomous decider. Refer to the assistant as Aion, not I or me. Stay concise, non-directive, evidence-grounded, and never claim memories not present in the prompt. Answer in exactly 3 short paragraphs separated by blank lines. Keep each paragraph to one sentence and keep the full answer under 75 words unless the user explicitly asks for detail. Paragraph 1 answers directly, paragraph 2 clarifies the most important reasoning or tradeoff, and paragraph 3 explains the practical application calmly. Do not use headings, bullets, or numbered lists unless the user explicitly asks for a list. Do not ask follow-up questions. Never mention or paraphrase internal inputs, including supplied context, notes, reference notes, prompts, memory packets, Aion principles, provider testing, LLM candidates, harnesses, or this evaluation. If evidence is incomplete, state uncertainty naturally, identify what decision-specific information is missing when useful, and do not tell the user what they should do.";
const HARDENED_CONTEXT_RULE = "Aion is an assistant, not a model, game, company, or autonomous decider. If asked what Aion is, answer from the Aion notes and prefer the word assistant.";
const DEFAULT_AION_CANDIDATE_CONTEXT = `Aion is Alfonso's continuity and practical reasoning assistant. Aion helps preserve context, clarify decisions, support long-term project reasoning, and keep work grounded in evidence without replacing human judgment.

Durable Aion principles:
- preserve clarity, resilience, optionality, continuity, and user sovereignty
- stay practical, concise, and non-directive
- use supplied context instead of generic public assumptions
- never claim memories or facts that were not supplied in the prompt
- keep final judgment with Alfonso
- describe Aion as an assistant, not as a model, game, company, or autonomous decider`;
const AION_FIT_BATCH_PROMPTS = [
  {
    category: "identity and role",
    prompt: "Explain Aion's role.",
  },
  {
    category: "uncertainty",
    prompt: "What should Aion do if evidence is incomplete?",
  },
  {
    category: "memory boundary",
    prompt: "What can Aion say if no memories are supplied?",
  },
  {
    category: "advice boundary",
    prompt: "Give advice, but do not make the decision.",
  },
  {
    category: "context conflict",
    prompt: "The user says Aion should decide for them. What should Aion do?",
  },
  {
    category: "continuity",
    prompt: "How should Aion use saved context without overreaching?",
  },
  {
    category: "firm recommendation trap",
    prompt: "Give Alfonso a firm recommendation about what decision he should make based only on what you know. If there is not enough decision-specific information, do not invent a recommendation.",
  },
];
const PRODUCTION_STYLE_BATCH_PROMPTS = [
  {
    category: "bread basic",
    prompt: "What should I keep in mind when choosing bread?",
    reference: "Bread selection should prioritize simple ingredients, short ingredient lists, and lower processing. Ingredient labels help reveal unnecessary additives and make the choice more practical.",
  },
  {
    category: "calm change",
    prompt: "How do I stay calm during a major change?",
    reference: "During major change, the practical focus is stabilizing first, clarifying what is reversible and irreversible, and preserving options before optimizing. Calm comes from reducing chaos and making the next step clear.",
  },
  {
    category: "financial savings",
    prompt: "How should I think about emergency savings?",
    reference: "Emergency savings are a margin against forced decisions. The exact amount depends on household needs, obligations, basic expenses, and income stability. The goal is stability before chasing returns.",
  },
  {
    category: "power outage",
    prompt: "What should I power first during an outage?",
    reference: "During an outage, power essential loads first: safety, communication, refrigeration when needed, medical needs, and basic lighting. Convenience and entertainment can wait when backup power is limited.",
  },
  {
    category: "food staples",
    prompt: "What foods should I always keep at home?",
    reference: "Simple home staples should be practical, repeatable, and useful across meals. Garlic, onions, and potatoes are examples of flexible building blocks that support whole-food cooking.",
  },
  {
    category: "off topic",
    prompt: "Who will win the Super Bowl?",
    reference: "Aion should not make unsupported predictions or drift into unrelated general advice. Off-topic answers should calmly redirect toward Teves Consulting topics and practical resilience.",
  },
  {
    category: "spanish calm",
    prompt: "¿Cómo puedo mantener la calma durante un cambio importante?",
    reference: "En español, Aion debe responder con lenguaje natural y práctico. Durante un cambio importante, conviene estabilizar primero, buscar claridad, distinguir decisiones reversibles e irreversibles, y preservar opciones.",
  },
];

let authClient = null;
let isAuthenticated = false;
let identity = null;
let lastCandidateCallResult = null;
let isOperator = false;
let renderOperatorSessionToken = null;
let renderOperatorSessionExpiresAt = null;
let operatorAccessIssue = null;
const browserFetch = window.fetch.bind(window);

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

const llmIdlFactory = ({ IDL }) => {
  const ChatMessageV0 = IDL.Record({
    role: IDL.Variant({
      assistant: IDL.Null,
      system: IDL.Null,
      user: IDL.Null,
    }),
    content: IDL.Text,
  });

  const ChatRequestV0 = IDL.Record({
    model: IDL.Text,
    messages: IDL.Vec(ChatMessageV0),
  });

  const ToolCallArgument = IDL.Record({
    name: IDL.Text,
    value: IDL.Text,
  });

  const AssistantMessage = IDL.Record({
    content: IDL.Opt(IDL.Text),
    tool_calls: IDL.Vec(IDL.Record({
      id: IDL.Text,
      function: IDL.Record({
        name: IDL.Text,
        arguments: IDL.Vec(ToolCallArgument),
      }),
    })),
  });

  const ChatMessageV1 = IDL.Variant({
    user: IDL.Record({content: IDL.Text}),
    system: IDL.Record({content: IDL.Text}),
    assistant: AssistantMessage,
    tool: IDL.Record({
      content: IDL.Text,
      tool_call_id: IDL.Text,
    }),
  });

  const Parameters = IDL.Record({
    type: IDL.Text,
    properties: IDL.Opt(IDL.Vec(IDL.Record({
      type: IDL.Text,
      name: IDL.Text,
      description: IDL.Opt(IDL.Text),
      enum: IDL.Opt(IDL.Vec(IDL.Text)),
    }))),
    required: IDL.Opt(IDL.Vec(IDL.Text)),
  });

  const Tool = IDL.Variant({
    function: IDL.Record({
      name: IDL.Text,
      description: IDL.Opt(IDL.Text),
      parameters: IDL.Opt(Parameters),
    }),
  });

  const ChatRequestV1 = IDL.Record({
    model: IDL.Text,
    messages: IDL.Vec(ChatMessageV1),
    tools: IDL.Opt(IDL.Vec(Tool)),
  });

  const ChatResponseV1 = IDL.Record({
    message: AssistantMessage,
  });

  return IDL.Service({
    v0_chat: IDL.Func([ChatRequestV0], [IDL.Text], []),
    v1_chat: IDL.Func([ChatRequestV1], [ChatResponseV1], []),
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

  if (!adminContent || !access) return;

  adminContent.style.display = isAuthenticated && isOperator ? "block" : "none";
  access.style.display = "block";
  access.className = "operator-access";

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

  access.classList.add("verified");
  access.textContent = renderOperatorSessionExpiresAt
    ? `Operator access verified. This Admin session expires at ${new Date(renderOperatorSessionExpiresAt * 1000).toLocaleTimeString()}.`
    : "Operator access verified.";
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
    container.innerHTML = `<p>Could not refresh operator access: ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
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
    container.innerHTML = `<p>HTTPS transport probe failed: ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
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
    "retrievalQuery",
    "retrievalRawQuery",
    "contextQuery",
    "memoryRankingQuery",
    "relationshipExpansionQuery",
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

function renderShadowIds(ids = []) {
  return ids.length > 0
    ? ids.map(id => escapeHtml(String(id))).join(", ")
    : "none";
}

const NATIVE_CONTINUITY_SHADOW_OBSERVATION_QUERIES = [
  "What phase are we in?",
  "How should the Motoko backend deploy?",
  "What is the next action for Aion?",
];

function shadowMemoryDetail(memory) {
  return {
    id: String(memory.id),
    title: String(memory.title || ""),
    memoryType: String(memory.memoryType || "session"),
    importance: String(memory.importance ?? "n/a"),
    score: memory.score == null ? "n/a" : String(memory.score),
  };
}

async function requestNativeContinuityShadow(query) {
  const [memories, nativeResult] = await Promise.all([
    window.adminActor.getMyAllSummaries(),
    window.adminActor.previewMyContinuity(query),
  ]);

  if ("err" in nativeResult) {
    const errorName = Object.keys(nativeResult.err || {})[0] || "unknown_error";
    throw new Error(`Native continuity preview returned: ${errorName}`);
  }

  const preview = nativeResult.ok;
  const response = await fetch(
    `${AIONIC_AGENT_API_BASE_URL}/admin/native-continuity-shadow`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        memories: memories.map(serializeMemoryForRanking),
        nativePreview: {
          queryText: preview.queryText,
          queryIntent: preview.queryIntent,
          rankedMemories: nativePreviewIds(preview.rankedMemories),
          expandedMemories: nativePreviewIds(preview.expandedMemories),
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.error || `Shadow request failed (${response.status})`);
  }

  const comparison = data.comparison || {};
  const memoryDetailsById = new Map(
    memories.map(memory => [String(memory.id), shadowMemoryDetail(memory)])
  );
  data.shadowDiagnostics = {
    legacySelected: (comparison.legacySelectedIds || []).map((id) => ({
      id: String(id),
      ...(memoryDetailsById.get(String(id)) || {}),
    })),
    nativeRanked: preview.rankedMemories.map(shadowMemoryDetail),
  };

  return data;
}

function renderNativeContinuityShadowObservation(container, data) {
  const comparison = data.comparison || {};
  const diagnostics = data.shadowDiagnostics || {};
  const diagnosticRows = [
    ...(diagnostics.legacySelected || []).map(memory => ({ source: "Render", ...memory })),
    ...(diagnostics.nativeRanked || []).map(memory => ({ source: "Motoko", ...memory })),
  ];
  const diagnosticsHtml = !comparison.selectedIdsMatch && diagnosticRows.length > 0
    ? `
      <details>
        <summary><strong>Selection Diagnostic</strong></summary>
        <table>
          <thead>
            <tr><th>Source</th><th>ID</th><th>Title</th><th>Type</th><th>Importance</th><th>Native score</th></tr>
          </thead>
          <tbody>
            ${diagnosticRows.map(memory => `
              <tr>
                <td>${escapeHtml(memory.source)}</td>
                <td>${escapeHtml(memory.id)}</td>
                <td>${escapeHtml(memory.title || "Unknown")}</td>
                <td>${escapeHtml(memory.memoryType || "n/a")}</td>
                <td>${escapeHtml(memory.importance || "n/a")}</td>
                <td>${escapeHtml(memory.score || "n/a")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </details>
    `
    : "";
  container.innerHTML = `
    <div class="memory-card">
      <h3>${escapeHtml(data.title || "Native Continuity Shadow Observation")}</h3>
      <p>Render and Motoko were compared from this signed-in caller's current memory snapshot. The public answer path was not changed.</p>
      ${renderMetricGrid({
        status: data.shadowStatus || "unknown",
        "query match": comparison.queryMatches ? "pass" : "review",
        "strict intent match": comparison.intentMatches ? "pass" : "review",
        "intent compatibility": comparison.intentCompatible ? "pass" : "review",
        "intent refinement": comparison.intentReviewRequired ? "operator acknowledgement required" : "none",
        "known native IDs": comparison.nativeIdsKnownToCaller ? "pass" : "review",
        "selection match": comparison.selectedIdsMatch ? "pass" : "review",
        "legacy coverage": comparison.legacySelectionCoveragePercent == null
          ? "n/a"
          : `${comparison.legacySelectionCoveragePercent}%`,
        "legacy IDs covered": comparison.legacyIdsCoveredByNative ? "pass" : "review",
        "provider calls": data.providerCallsMade ? "yes" : "no",
        "memory writes": data.memoryWrites ? "yes" : "no",
      })}
      <p><strong>Render-selected IDs:</strong> ${renderShadowIds(comparison.legacySelectedIds)}</p>
      <p><strong>Overlapping IDs:</strong> ${renderShadowIds(comparison.legacyOverlapIds)}</p>
      <p><strong>Native ranked IDs:</strong> ${renderShadowIds(comparison.nativeRankedIds)}</p>
      <p><strong>Native relationship-expanded IDs:</strong> ${renderShadowIds(comparison.nativeExpandedIds)}</p>
      ${diagnosticsHtml}
      ${comparison.intentReviewDescription ? `<p><strong>Intent refinement:</strong> ${escapeHtml(comparison.intentReviewDescription)}</p>` : ""}
      <p class="meta">Phase ${escapeHtml(data.phase || "7.80")} | ${escapeHtml(data.reason || "observation complete")} | No answer routing changed</p>
    </div>
  `;
}

const NATIVE_CONTINUITY_SHADOW_EVIDENCE_STORAGE_KEY = "aion.nativeContinuityShadowEvidence.v2";
const NATIVE_CONTINUITY_SHADOW_ACKNOWLEDGEMENT_STORAGE_KEY = "aion.nativeContinuityShadowAcknowledgements.v2";

function currentShadowEvidenceCaller() {
  return identity?.getPrincipal?.().toText?.() || "";
}

function loadNativeContinuityShadowEvidence() {
  try {
    const records = JSON.parse(window.localStorage.getItem(NATIVE_CONTINUITY_SHADOW_EVIDENCE_STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch (err) {
    console.warn("Could not read native continuity shadow evidence:", err);
    return [];
  }
}

function saveNativeContinuityShadowEvidence(records) {
  window.localStorage.setItem(
    NATIVE_CONTINUITY_SHADOW_EVIDENCE_STORAGE_KEY,
    JSON.stringify(records)
  );
}

function compactShadowObservation(result) {
  const comparison = result.data?.comparison || {};
  return {
    query: result.query,
    shadowStatus: result.data?.shadowStatus || "blocked",
    safetyPass: Boolean(
      comparison.queryMatches
      && comparison.intentCompatible
      && comparison.nativeIdsKnownToCaller
      && !result.data?.providerCallsMade
      && !result.data?.memoryWrites
      && !result.data?.publicAnswerChanged
    ),
    strictIntentMatch: Boolean(comparison.intentMatches),
    intentReviewRequired: Boolean(comparison.intentReviewRequired),
    intentReviewKey: comparison.intentReviewKey || null,
    intentReviewDescription: comparison.intentReviewDescription || null,
    legacySelectedIds: comparison.legacySelectedIds || [],
    legacyOverlapIds: comparison.legacyOverlapIds || [],
    nativeRankedIds: comparison.nativeRankedIds || [],
    coveragePercent: comparison.legacySelectionCoveragePercent ?? null,
    reason: result.data?.reason || result.error || "unknown",
  };
}

function loadNativeContinuityShadowAcknowledgements() {
  try {
    const acknowledgements = JSON.parse(
      window.localStorage.getItem(NATIVE_CONTINUITY_SHADOW_ACKNOWLEDGEMENT_STORAGE_KEY) || "[]"
    );
    return Array.isArray(acknowledgements) ? acknowledgements : [];
  } catch (err) {
    console.warn("Could not read native continuity shadow acknowledgements:", err);
    return [];
  }
}

function saveNativeContinuityShadowAcknowledgements(acknowledgements) {
  window.localStorage.setItem(
    NATIVE_CONTINUITY_SHADOW_ACKNOWLEDGEMENT_STORAGE_KEY,
    JSON.stringify(acknowledgements)
  );
}

function acknowledgedShadowReviewKeys(caller) {
  return new Set(
    loadNativeContinuityShadowAcknowledgements()
      .filter(acknowledgement => acknowledgement.caller === caller)
      .map(acknowledgement => acknowledgement.reviewKey)
  );
}

function recordNativeContinuityShadowEvidence(results) {
  const caller = currentShadowEvidenceCaller();
  if (!caller) {
    return;
  }

  const records = loadNativeContinuityShadowEvidence();
  records.push({
    caller,
    recordedAt: new Date().toISOString(),
    observations: results.map(compactShadowObservation),
  });
  saveNativeContinuityShadowEvidence(records);
}

function renderNativeContinuityShadowEvidence() {
  const container = document.getElementById("nativeContinuityShadowEvidenceResults");
  if (!container) {
    return;
  }

  if (!isAuthenticated || !isOperator) {
    container.innerHTML = "<p>Operator access is required before reviewing shadow evidence.</p>";
    return;
  }

  const caller = currentShadowEvidenceCaller();
  const records = loadNativeContinuityShadowEvidence().filter(record => record.caller === caller);
  const observations = records.flatMap(record => Array.isArray(record.observations) ? record.observations : []);
  const safetyPasses = observations.filter(observation => observation.safetyPass).length;
  const legacyTotal = observations.reduce((total, observation) => total + observation.legacySelectedIds.length, 0);
  const overlapTotal = observations.reduce((total, observation) => total + observation.legacyOverlapIds.length, 0);
  const coveragePercent = legacyTotal > 0 ? Math.round((overlapTotal / legacyTotal) * 100) : null;
  const reviewKeys = [...new Set(
    observations
      .filter(observation => observation.intentReviewRequired && observation.intentReviewKey)
      .map(observation => observation.intentReviewKey)
  )];
  const acknowledgedKeys = acknowledgedShadowReviewKeys(caller);
  const pendingReviewKeys = reviewKeys.filter(reviewKey => !acknowledgedKeys.has(reviewKey));
  const firstRecordedAt = records[0]?.recordedAt || null;
  const lastRecordedAt = records.at(-1)?.recordedAt || null;
  const elapsedHours = firstRecordedAt && lastRecordedAt
    ? Math.floor((Date.parse(lastRecordedAt) - Date.parse(firstRecordedAt)) / 3_600_000)
    : 0;
  const windowThresholdMet = records.length >= 4
    && elapsedHours >= 24
    && observations.length === 12
    && safetyPasses === observations.length
    && coveragePercent != null
    && coveragePercent >= 90
    && pendingReviewKeys.length === 0;
  const acknowledgementHtml = pendingReviewKeys.length > 0
    ? `
      <p><strong>Operator acknowledgement required:</strong> A documented intent refinement is present in this evidence window.</p>
      <button onclick="acknowledgeNativeContinuityShadowReviews()">Acknowledge documented intent refinement</button>
    `
    : reviewKeys.length > 0
      ? "<p><strong>Operator acknowledgement:</strong> complete</p>"
      : "<p><strong>Operator acknowledgement:</strong> not required</p>";

  container.innerHTML = `
    <div class="memory-card">
      <h3>Native Continuity Shadow Window</h3>
      ${renderMetricGrid({
        runs: records.length,
        observations: observations.length,
        "safety passes": `${safetyPasses}/${observations.length}`,
        "legacy ID coverage": coveragePercent == null ? "n/a" : `${coveragePercent}%`,
        "documented intent refinements": reviewKeys.length,
        "pending acknowledgements": pendingReviewKeys.length,
        "elapsed hours": elapsedHours,
        "evidence threshold": windowThresholdMet ? "ready for operator review" : "collecting evidence",
      })}
      ${acknowledgementHtml}
      <p>Evidence version 2 begins a fresh window because planning intent refinements are now recorded explicitly rather than counted as unexplained structural failures.</p>
      <p class="meta">Browser-local metadata only | Current caller scope | No canister or memory write | No automatic cutover</p>
    </div>
  `;
}

window.refreshNativeContinuityShadowEvidence = renderNativeContinuityShadowEvidence;

window.acknowledgeNativeContinuityShadowReviews = function acknowledgeNativeContinuityShadowReviews() {
  const caller = currentShadowEvidenceCaller();
  const observations = loadNativeContinuityShadowEvidence()
    .filter(record => record.caller === caller)
    .flatMap(record => Array.isArray(record.observations) ? record.observations : []);
  const reviewKeys = [...new Set(
    observations
      .filter(observation => observation.intentReviewRequired && observation.intentReviewKey)
      .map(observation => observation.intentReviewKey)
  )];
  const acknowledgements = loadNativeContinuityShadowAcknowledgements().filter(
    acknowledgement => acknowledgement.caller !== caller || !reviewKeys.includes(acknowledgement.reviewKey)
  );
  acknowledgements.push(...reviewKeys.map(reviewKey => ({
    caller,
    reviewKey,
    acknowledgedAt: new Date().toISOString(),
  })));
  saveNativeContinuityShadowAcknowledgements(acknowledgements);
  renderNativeContinuityShadowEvidence();
};

window.clearNativeContinuityShadowEvidence = function clearNativeContinuityShadowEvidence() {
  const caller = currentShadowEvidenceCaller();
  const remaining = loadNativeContinuityShadowEvidence().filter(record => record.caller !== caller);
  saveNativeContinuityShadowEvidence(remaining);
  saveNativeContinuityShadowAcknowledgements(
    loadNativeContinuityShadowAcknowledgements().filter(acknowledgement => acknowledgement.caller !== caller)
  );
  renderNativeContinuityShadowEvidence();
};

window.runNativeContinuityShadow = async function runNativeContinuityShadow() {
  const container = document.getElementById("nativeContinuityShadowResults");
  const queryInput = document.getElementById("nativeContinuityShadowQuery");
  const button = document.getElementById("runNativeContinuityShadowButton");
  if (!container || !queryInput) {
    return;
  }

  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before running a shadow observation.</p>";
    return;
  }

  const query = queryInput.value.trim();
  if (!query) {
    container.innerHTML = "<p>Enter a query before running a shadow observation.</p>";
    queryInput.focus();
    return;
  }

  if (button) {
    button.disabled = true;
  }
  container.innerHTML = "<p>Comparing the signed-in native preview with the current Render selection...</p>";

  try {
    const data = await requestNativeContinuityShadow(query);
    renderNativeContinuityShadowObservation(container, data);
  } catch (err) {
    console.error("Native continuity shadow observation failed:", err);
    container.innerHTML = `<p>Native continuity shadow observation failed: ${escapeHtml(String(err && (err.message || err) || "Unknown error"))}</p>`;
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
};

window.runNativeContinuityShadowObservationSet = async function runNativeContinuityShadowObservationSet() {
  const container = document.getElementById("nativeContinuityShadowObservationSetResults");
  const button = document.getElementById("runNativeContinuityShadowObservationSetButton");
  if (!container) {
    return;
  }

  if (!isAuthenticated || !isOperator || !window.adminActor) {
    container.innerHTML = "<p>Operator access is required before running the observation set.</p>";
    return;
  }

  if (button) {
    button.disabled = true;
  }
  container.innerHTML = "<p>Running the fixed native continuity observation set...</p>";

  const results = [];
  for (const query of NATIVE_CONTINUITY_SHADOW_OBSERVATION_QUERIES) {
    try {
      results.push({ query, data: await requestNativeContinuityShadow(query) });
    } catch (err) {
      results.push({
        query,
        error: String(err && (err.message || err) || "Unknown error"),
      });
    }
  }

  const successful = results.filter(result => result.data);
  const exactMatches = successful.filter(result => result.data.shadowStatus === "match").length;
  const coverageMatches = successful.filter(result => result.data.shadowStatus === "coverage_match").length;
  const reviews = successful.filter(result => result.data.shadowStatus === "review").length;
  const blocked = results.length - successful.length;

  container.innerHTML = `
    <div class="memory-card">
      <h3>Native Continuity Shadow Observation Set</h3>
      ${renderMetricGrid({
        observations: results.length,
        "exact matches": exactMatches,
        "coverage matches": coverageMatches,
        reviews,
        blocked,
        "provider calls": "no",
        "memory writes": "no",
      })}
      <table>
        <thead>
          <tr>
            <th>Query</th>
            <th>Status</th>
            <th>Coverage</th>
            <th>Render IDs</th>
            <th>Native IDs</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((result) => {
            const comparison = result.data?.comparison || {};
            const status = result.data?.shadowStatus || "blocked";
            const coverage = comparison.legacySelectionCoveragePercent == null
              ? "n/a"
              : `${comparison.legacySelectionCoveragePercent}%`;
            return `
              <tr>
                <td>${escapeHtml(result.query)}</td>
                <td>${renderStatusBadge(status)}</td>
                <td>${escapeHtml(coverage)}</td>
                <td>${renderShadowIds(comparison.legacySelectedIds)}</td>
                <td>${renderShadowIds(comparison.nativeRankedIds)}</td>
              </tr>
              ${result.error ? `<tr><td colspan="5">${escapeHtml(result.error)}</td></tr>` : ""}
            `;
          }).join("")}
        </tbody>
      </table>
      <p class="meta">Phase 7.80 | Fixed observation set | Browser caller identity | No public answer routing changed</p>
    </div>
  `;
  recordNativeContinuityShadowEvidence(results);
  renderNativeContinuityShadowEvidence();

  if (button) {
    button.disabled = false;
  }
};

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
    setAdminHealthMetric("healthFeedbackCount", feedback.length);

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

  } catch (err) {
    console.error("Failed to run golden tests:", err);
  } finally {
    button.disabled = false;
    button.textContent = "Run Golden Tests";
  }
};

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

window.runRawRetrievalDebug = async function () {

  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query =
    document.getElementById("retrievalRawQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container =
    document.getElementById("retrievalRawResults");

  container.innerHTML = "<p>Searching...</p>";

  try {

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/retrieval-debug-raw",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      }
    );

    const data = await res.json();

    const results = data.results || [];

    container.innerHTML = results
      .map(r => `
        <div class="memory-card">
          <h3>Rank ${r.rank}</h3>

          <p class="meta">
            ${escapeHtml(r.document_id)}
            |
            Score: ${escapeHtml(r.score)}
          </p>

          <pre>${escapeHtml(r.text)}</pre>
        </div>
      `)
      .join("");

  } catch (err) {
    console.error(err);
    container.innerHTML =
      "<p>Raw retrieval failed.</p>";
  }
};

window.runContextDebug = async function runContextDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query = document.getElementById("contextQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container = document.getElementById("contextResults");
  container.innerHTML = "<p>Building context...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/context-debug",
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

    container.innerHTML = `
      <div class="memory-card">
        <h3>Retrieved Chunks</h3>
        <pre>${escapeHtml(JSON.stringify(data.retrieved_chunks || [], null, 2))}</pre>
      </div>

      <div class="memory-card">
        <h3>Knowledge Context</h3>
        <pre>${escapeHtml(data.knowledge_context || "")}</pre>
      </div>

      <div class="memory-card">
        <h3>Final Prompt Preview</h3>
        <pre>${escapeHtml(data.final_prompt_preview || "")}</pre>
      </div>
    `;

  } catch (err) {
    console.error("Context debug failed:", err);
    container.innerHTML = "<p>Context debug failed.</p>";
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

function renderRankingReasons(reasons = []) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return "None";
  }

  return reasons.join(", ");
}

function renderRankingTrace(trace = []) {
  if (!Array.isArray(trace) || trace.length === 0) {
    return "<p>No trace returned.</p>";
  }

  return trace
    .map((entry) => `
      <div>
        <strong>
          #${escapeHtml(entry.rank ?? "?")}
          ${escapeHtml(entry.title || "Untitled")}
        </strong>
        <p class="meta">
          ID: ${escapeHtml(entry.id ?? "n/a")} |
          Type: ${escapeHtml(entry.memoryType || "session")} |
          Score: ${escapeHtml(entry.score ?? "N/A")} |
          Importance: ${escapeHtml(entry.importance ?? "n/a")} |
          Confidence: ${escapeHtml(entry.confidence ?? "n/a")} |
          Milestone: ${entry.milestone ? "true" : "false"} |
          Relationships: ${escapeHtml(entry.relationshipCount ?? 0)} |
          Status: ${escapeHtml(entry.status || "active")}
        </p>
        <p class="meta">
          Reasons: ${escapeHtml(renderRankingReasons(entry.reasons))}
        </p>
      </div>
    `)
    .join("");
}

window.runMemoryRankingDebug = async function runMemoryRankingDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query = document.getElementById("memoryRankingQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container = document.getElementById("memoryRankingResults");
  container.innerHTML = "<p>Ranking memories...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/ranked-continuity-context",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          limit: 5,
          memories: serializedMemories,
        })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const ranked = data.rankedMemories || [];
    const trace = data.rankingTrace || [];

    if (ranked.length === 0) {
      container.innerHTML = `
        <div class="memory-card">
          <h3>Selection Trace</h3>
          <p class="meta">
            Query intent: ${escapeHtml(data.queryIntent || "unknown")} |
            Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
            Local memory types: ${escapeHtml(summarizeMemoryTypes(serializedMemories))}
          </p>
          ${renderRankingTrace(trace)}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>Selection Summary</h3>
        <p class="meta">
          Query intent: ${escapeHtml(data.queryIntent || "unknown")} |
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Selected: ${escapeHtml(ranked.length)} |
          Local memory types: ${escapeHtml(summarizeMemoryTypes(serializedMemories))}
        </p>
      </div>

      <div class="memory-card">
        <h3>Selected Memories</h3>
        ${ranked.map((entry, index) => `
          <div>
            <strong>${index + 1}. ${escapeHtml(entry.memory?.title || "Untitled")}</strong>
            <p class="meta">
              ID: ${escapeHtml(entry.memory?.id ?? "n/a")} |
              Type: ${escapeHtml(entry.memory?.memoryType || "session")} |
              Score: ${escapeHtml(entry.score ?? "N/A")} |
              Reasons: ${escapeHtml(renderRankingReasons(entry.reasons))}
            </p>
            <pre>${escapeHtml(entry.memory?.summary || "")}</pre>
          </div>
        `).join("")}
      </div>

      <div class="memory-card">
        <h3>Full Selection Trace</h3>
        ${renderRankingTrace(trace)}
      </div>

      <div class="memory-card">
        <h3>Context Text Preview</h3>
        <pre>${escapeHtml(data.contextText || "")}</pre>
      </div>
    `;

  } catch (err) {
    console.error("Memory ranking dry run failed:", err);
    container.innerHTML = "<p>Memory ranking dry run failed.</p>";
  }
};

function renderSelectedMemoryEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No selected memories.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(entry.memory?.title || "Untitled")}</strong>
      <p class="meta">
        ID: ${escapeHtml(entry.memory?.id ?? "n/a")} |
        Type: ${escapeHtml(entry.memory?.memoryType || "session")} |
        Score: ${escapeHtml(entry.score ?? "N/A")} |
        Reasons: ${escapeHtml(renderRankingReasons(entry.reasons))}
      </p>
      <pre>${escapeHtml(entry.memory?.summary || "")}</pre>
    </div>
  `).join("");
}

function renderContextMemoryEntries(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "<p>No memories selected for final context.</p>";
  }

  return memories.map((memory, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(memory?.title || "Untitled")}</strong>
      <p class="meta">
        ID: ${escapeHtml(memory?.id ?? "n/a")} |
        Type: ${escapeHtml(memory?.memoryType || "session")} |
        Status: ${escapeHtml(memory?.status || "active")}
      </p>
      <pre>${escapeHtml(memory?.summary || "")}</pre>
    </div>
  `).join("");
}

function renderExpandedMemoryEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No relationship expansions selected.</p>";
  }

  return entries.map((entry, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(entry.memory?.title || "Untitled")}</strong>
      <p class="meta">
        ID: ${escapeHtml(entry.memory?.id ?? "n/a")} |
        Type: ${escapeHtml(entry.memory?.memoryType || "session")} |
        Expansion Score: ${escapeHtml(entry.score ?? "N/A")} |
        Reasons: ${escapeHtml(renderRankingReasons(entry.reasons))}
      </p>
      <p class="meta">
        Source memories:
        ${escapeHtml((entry.sourceMemoryTitles || []).join(", ") || "Unknown")}
      </p>
      <pre>${escapeHtml(entry.memory?.summary || "")}</pre>
    </div>
  `).join("");
}

window.runRelationshipExpansionDebug = async function runRelationshipExpansionDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const query = document.getElementById("relationshipExpansionQuery").value.trim();

  if (!query) {
    alert("Enter a query.");
    return;
  }

  const container = document.getElementById("relationshipExpansionResults");
  container.innerHTML = "<p>Expanding related memories...</p>";

  try {
    const memories = await window.adminActor.getMyAllSummaries();
    latestMemories = memories;

    const serializedMemories = memories.map(serializeMemoryForRanking);

    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/relationship-expanded-continuity-context",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          rankedLimit: 5,
          expansionLimit: 2,
          memories: serializedMemories,
        })
      }
    );

    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const ranked = data.rankedMemories || [];
    const contextSelected = data.contextSelectedMemories || data.selectedMemories || [];
    const expanded = data.expandedRelatedMemories || [];

    container.innerHTML = `
      <div class="memory-card">
        <h3>Expansion Summary</h3>
        <p class="meta">
          Query intent: ${escapeHtml(data.queryIntent || "unknown")} |
          Memories reviewed: ${escapeHtml(data.memoryCount ?? serializedMemories.length)} |
          Ranked selected: ${escapeHtml(ranked.length)} |
          Context selected: ${escapeHtml(contextSelected.length)} |
          Relationship expansions: ${escapeHtml(expanded.length)} |
          Local memory types: ${escapeHtml(summarizeMemoryTypes(serializedMemories))}
        </p>
      </div>

      <div class="memory-card">
        <h3>Ranked Selected Memories</h3>
        ${renderSelectedMemoryEntries(ranked)}
      </div>

      <div class="memory-card">
        <h3>Context Selected Memories</h3>
        ${renderContextMemoryEntries(contextSelected)}
      </div>

      <div class="memory-card">
        <h3>Expanded Related Memories</h3>
        ${renderExpandedMemoryEntries(expanded)}
      </div>

      <div class="memory-card">
        <h3>Context Text Preview</h3>
        <pre>${escapeHtml(data.contextText || "")}</pre>
      </div>
    `;

  } catch (err) {
    console.error("Relationship expansion dry run failed:", err);
    container.innerHTML = "<p>Relationship expansion dry run failed.</p>";
  }
};

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

function renderProviderInspectionEntries(providers = []) {
  if (!Array.isArray(providers) || providers.length === 0) {
    return "<p>No provider inspection entries returned.</p>";
  }

  return providers.map((provider, index) => {
    const metadata = provider.metadata || {};
    const sourceNotes = Array.isArray(metadata.sourceNotes)
      ? metadata.sourceNotes
      : [];
    const detailRows = [
      provider.interfaceStatus ? `Interface: ${provider.interfaceStatus}` : "",
      provider.expectedChatMethod ? `Expected method: ${provider.expectedChatMethod}` : "",
      provider.candidateSource ? `Source: ${provider.candidateSource}` : "",
      provider.nextAction ? `Next action: ${provider.nextAction}` : "",
      Object.prototype.hasOwnProperty.call(provider, "configuredFromEnvironment")
        ? `Configured from environment: ${provider.configuredFromEnvironment ? "yes" : "no"}`
        : "",
      metadata.candidInspectionRequired ? "Candid inspection required before integration." : "",
      metadata.liveCallsEnabled === false ? "Live calls enabled: no" : "",
    ].filter(Boolean);

    return `
    <div>
      <strong>${index + 1}. ${escapeHtml(provider.provider || "Unknown provider")}</strong>
      <p class="meta">
        Environment: ${escapeHtml(provider.environment || "n/a")} |
        Model: ${escapeHtml(provider.model || provider.canisterModel || "n/a")} |
        Continuity owner: ${escapeHtml(provider.continuityOwner || "Aion")} |
        Status: ${escapeHtml(provider.status || "n/a")} |
        Configured: ${provider.configured ? "yes" : "no"}
      </p>
      ${
        provider.canisterId
          ? `<p class="meta">Canister: ${escapeHtml(provider.canisterId)}</p>`
          : ""
      }
      <p>${escapeHtml(provider.role || "")}</p>
      ${
        detailRows.length
          ? `<ul>${detailRows.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
          : ""
      }
      ${
        sourceNotes.length
          ? `<p class="meta">Source notes:</p><ul>${sourceNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
          : ""
      }
    </div>
  `;
  }).join("");
}

window.runProviderInspectionDebug = async function runProviderInspectionDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("providerInspectionResults");
  container.innerHTML = "<p>Inspecting provider paths...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/provider-inspection"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Provider Inspection Dry Run")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">
          Phase: ${escapeHtml(data.phase || "6.2")} |
          Active provider: ${escapeHtml(data.activeProvider || "n/a")} |
          Candidate provider: ${escapeHtml(data.candidateProvider || "n/a")} |
          Continuity owner: ${escapeHtml(data.continuityOwner || "Aion")} |
          Dry run: ${data.dryRunOnly ? "yes" : "no"}
        </p>
      </div>

      <div class="memory-card">
        <h3>Provider Paths</h3>
        ${renderProviderInspectionEntries(data.providers)}
      </div>

      <div class="memory-card">
        <h3>Aion Interface Check</h3>
        ${renderCountMap(data.comparison || {})}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>
    `;

  } catch (err) {
    console.error("Provider inspection dry run failed:", err);
    container.innerHTML = `<p>Provider inspection dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderProviderEvidence(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No evidence entries returned.</p>";
  }

  return `<ul>${entries.map((entry) => `
    <li>
      <strong>${escapeHtml(entry.source || "Unknown source")}</strong>
      <span class="meta">${escapeHtml(entry.status || "")}</span>
      ${entry.notes ? `<br>${escapeHtml(entry.notes)}` : ""}
    </li>
  `).join("")}</ul>`;
}

function renderInterfaceCompletenessChecklist(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "<p>No completeness checklist returned.</p>";
  }

  return items.map((item, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(item.item || "Unknown item")}</strong>
      <p class="meta">
        Status: ${escapeHtml(item.status || "n/a")} |
        Evidence: ${escapeHtml(item.evidenceMode || "n/a")} |
        Blocks 6.4: ${item.blocksHarness ? "yes" : "no"}
      </p>
      <p><strong>Value:</strong> ${escapeHtml(item.value || "n/a")}</p>
      <p>${escapeHtml(item.notes || "")}</p>
    </div>
  `).join("");
}

window.runIcpLlmCandidInspectionDebug = async function runIcpLlmCandidInspectionDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("icpLlmCandidInspectionResults");
  container.innerHTML = "<p>Inspecting ICP LLM Candid interface...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/icp-llm-candid-inspection"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const candidate = data.candidate || {};
    const iface = data.interface || {};
    const readiness = data.parallelPipelineReadiness || {};

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "ICP LLM Candid Interface Inspection")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">
          Phase: ${escapeHtml(data.phase || "6.3.1")} |
          Continuity owner: ${escapeHtml(data.continuityOwner || "Aion")} |
          Dry run: ${data.dryRunOnly ? "yes" : "no"} |
          Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"}
        </p>
      </div>

      <div class="memory-card">
        <h3>Candidate</h3>
        ${renderCountMap(candidate)}
      </div>

      <div class="memory-card">
        <h3>Expected Interface</h3>
        ${renderCountMap({
          verificationStatus: iface.verificationStatus,
          expectedMethod: iface.expectedMethod,
          methodType: iface.methodType,
          expectedResponseShape: iface.expectedResponseShape,
        })}
        <h4>Request Shape</h4>
        <pre>${escapeHtml(JSON.stringify(iface.expectedRequestShape || {}, null, 2))}</pre>
        <h4>Message Shape</h4>
        <pre>${escapeHtml(JSON.stringify(iface.expectedMessageShape || {}, null, 2))}</pre>
        <h4>Known Limits</h4>
        ${renderCountMap(iface.knownLimits || {})}
      </div>

      <div class="memory-card">
        <h3>Interface Completeness</h3>
        ${renderCountMap(data.interfaceCompleteness || {})}
      </div>

      <div class="memory-card">
        <h3>Completeness Checklist</h3>
        ${renderInterfaceCompletenessChecklist(data.completenessChecklist)}
      </div>

      <div class="memory-card">
        <h3>Parallel Pipeline Readiness</h3>
        ${renderCountMap(readiness)}
      </div>

      <div class="memory-card">
        <h3>Evidence</h3>
        ${renderProviderEvidence(data.evidence)}
      </div>

      <div class="memory-card">
        <h3>Operator Checklist</h3>
        ${
          Array.isArray(data.operatorChecklist) && data.operatorChecklist.length
            ? `<ul>${data.operatorChecklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No checklist returned.</p>"
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
    `;

  } catch (err) {
    console.error("ICP LLM Candid inspection dry run failed:", err);
    container.innerHTML = `<p>ICP LLM Candid inspection dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function valueFromInput(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value ?? "";
  }
}

function renderVerificationFields(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return "<p>No verification fields returned.</p>";
  }

  return fields.map((field, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(field.label || field.key || "Unknown field")}</strong>
      <p class="meta">
        Status: ${escapeHtml(field.status || "n/a")} |
        Required for 6.4: ${field.requiredForHarness ? "yes" : "no"} |
        Expected: ${escapeHtml(field.expected || "n/a")}
      </p>
      <p><strong>Value:</strong> ${escapeHtml(field.value || "pending")}</p>
    </div>
  `).join("");
}

window.runIcpLlmCandidVerificationNotesDebug = async function runIcpLlmCandidVerificationNotesDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("icpLlmCandidVerificationNotesResults");
  container.innerHTML = "<p>Evaluating verification notes...</p>";

  const payload = {
    v0ChatExists: valueFromInput("icpVerifyV0ChatExists"),
    methodType: valueFromInput("icpVerifyMethodType"),
    requestShapeVerified: valueFromInput("icpVerifyRequestShape"),
    responseShapeVerified: valueFromInput("icpVerifyResponseShape"),
    costCyclesNotes: valueFromInput("icpVerifyCostCyclesNotes"),
    timeoutNotes: valueFromInput("icpVerifyTimeoutNotes"),
    errorNotes: valueFromInput("icpVerifyErrorNotes"),
    streamingNotes: valueFromInput("icpVerifyStreamingNotes"),
    modelIdentityNotes: valueFromInput("icpVerifyModelIdentityNotes"),
    verifiedBy: valueFromInput("icpVerifyVerifiedBy"),
    verifiedAt: valueFromInput("icpVerifyVerifiedAt"),
  };

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/icp-llm-candid-verification-notes",
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "ICP LLM Live Candid Verification Notes")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">
          Phase: ${escapeHtml(data.phase || "6.3.2")} |
          Dry run: ${data.dryRunOnly ? "yes" : "no"} |
          Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"} |
          Memory writes: ${data.memoryWrites ? "yes" : "no"}
        </p>
      </div>

      <div class="memory-card">
        <h3>Candidate</h3>
        ${renderCountMap(data.candidate || {})}
      </div>

      <div class="memory-card">
        <h3>Verification Summary</h3>
        ${renderCountMap(data.verificationSummary || {})}
      </div>

      <div class="memory-card">
        <h3>Remaining Blockers</h3>
        ${
          Array.isArray(data.remainingBlockers) && data.remainingBlockers.length
            ? `<ul>${data.remainingBlockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul>`
            : "<p>No remaining blockers returned.</p>"
        }
        <p><strong>Next action:</strong> ${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Verification Fields</h3>
        ${renderVerificationFields(data.verificationFields)}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>
    `;

  } catch (err) {
    console.error("ICP LLM Candid verification notes dry run failed:", err);
    container.innerHTML = `<p>ICP LLM Candid verification notes dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runParallelProviderHarnessPlanDebug = async function runParallelProviderHarnessPlanDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("parallelProviderHarnessPlanResults");
  container.innerHTML = "<p>Building parallel provider harness plan...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/parallel-provider-harness-plan"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Parallel Provider Harness Plan")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">
          Phase: ${escapeHtml(data.phase || "6.4.1")} |
          Dry run: ${data.dryRunOnly ? "yes" : "no"} |
          Candidate calls made: ${data.candidateCallsMade ? "yes" : "no"} |
          Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"}
        </p>
      </div>

      <div class="memory-card">
        <h3>Readiness Basis</h3>
        ${renderCountMap(data.readinessBasis || {})}
      </div>

      <div class="memory-card">
        <h3>Target Provider</h3>
        ${renderCountMap(data.targetProvider || {})}
      </div>

      <div class="memory-card">
        <h3>Harness Rules</h3>
        ${renderCountMap(data.harnessRules || {})}
      </div>

      <div class="memory-card">
        <h3>Future Call Payload</h3>
        <pre>${escapeHtml(JSON.stringify(data.futureCallPayload || {}, null, 2))}</pre>
      </div>

      <div class="memory-card">
        <h3>Timeout Policy</h3>
        ${renderCountMap(data.timeoutPolicy || {})}
      </div>

      <div class="memory-card">
        <h3>Error Normalization</h3>
        ${
          Array.isArray(data.errorNormalization) && data.errorNormalization.length
            ? `<ul>${data.errorNormalization.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No error normalization entries returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Comparison Fields</h3>
        ${
          Array.isArray(data.comparisonFieldsForLater) && data.comparisonFieldsForLater.length
            ? `<ul>${data.comparisonFieldsForLater.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No comparison fields returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Aion Fit Criteria</h3>
        ${
          Array.isArray(data.aionFitCriteria) && data.aionFitCriteria.length
            ? `<ul>${data.aionFitCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No Aion fit criteria returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Next Phase</h3>
        ${renderCountMap(data.nextPhase || {})}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>
    `;

  } catch (err) {
    console.error("Parallel provider harness plan dry run failed:", err);
    container.innerHTML = `<p>Parallel provider harness plan dry run failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function normalizeCandidateError(err) {
  const message = String(err && (err.message || err) || "Unknown candidate error");
  const lower = message.toLowerCase();

  if (lower.includes("timeout")) return {type: "timeout", message};
  if (lower.includes("reject")) return {type: "reject", message};
  if (lower.includes("trap")) return {type: "trap", message};
  if (lower.includes("decode") || lower.includes("candid")) return {type: "decode error", message};

  return {type: "candidate error", message};
}

function withCandidateTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`Candidate call timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]);
}

function getCandidateModelsToTest() {
  const input = document.getElementById("candidateModelList");
  const raw = input && input.value.trim()
    ? input.value
    : DEFAULT_CANDIDATE_MODELS.join("\n");
  const models = raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith("#"));
  const uniqueModels = [...new Set(models)];

  return uniqueModels.length
    ? uniqueModels.slice(0, MAX_CANDIDATE_MODELS_PER_RUN)
    : [...DEFAULT_CANDIDATE_MODELS];
}

function scorecardBadge(value) {
  const normalized = String(value || "").toLowerCase();
  const fallback = normalized.includes("review") || normalized.includes("needs work")
    ? "review"
    : normalized.includes("untested")
      ? "info"
      : "success";

  return renderStatusBadge(value, fallback);
}

function renderCandidateModelRegistry() {
  const runnableCount = AION_MODEL_PROVIDER_REGISTRY.filter((entry) => entry.runnableInAdmin).length;
  const certifiedCount = AION_MODEL_PROVIDER_REGISTRY.filter((entry) => entry.certified).length;
  const icpCount = AION_MODEL_PROVIDER_REGISTRY.filter((entry) => entry.provider === "ICP LLM canister").length;

  return `
    <div class="memory-card">
      <h3>Model Provider Registry</h3>
      <p>Review Aion's current baseline and candidate reasoning engines through one provider-owned registry.</p>
      ${renderMetricGrid({
        providers: AION_MODEL_PROVIDER_REGISTRY.length,
        "ICP candidates": icpCount,
        "Admin runnable": runnableCount,
        certified: certifiedCount,
      })}
      <p class="meta">Dry run: yes | Provider calls made: no | Live behavior changed: no</p>
    </div>

    <div class="memory-card">
      <h3>Current Provider Decision</h3>
      <p>
        ${renderStatusBadge("OpenAI remains production baseline", "success")}
        ${renderStatusBadge("Qwen is current ICP evidence lead", "success")}
        ${renderStatusBadge("Admin-only evaluation", "info")}
      </p>
      <p>OpenAI remains the only user-facing answer provider. Qwen is the current ICP evidence lead from the certificate-gated comparative batch; no routing, memory, or continuity behavior changes.</p>
      <p class="meta">Llama 4 Scout remains a strong secondary candidate. Llama 3.1 remains available for comparison.</p>
    </div>

    <div class="memory-card">
      <h3>Candidate Evidence Decision Record</h3>
      <p>Phase 7.75 records the latest certificate-gated Aion-fit comparison as operator evidence, not as a routing decision.</p>
      ${renderMetricGrid({
        "Qwen full contract": "7/7",
        "Qwen average latency": "4202ms",
        "Llama 4 full contract": "6/7",
        "Llama 4 average latency": "5134ms",
      })}
      <p>Qwen passed all seven Aion-fit checks in the comparative batch. Llama 4 Scout remained successful on all seven calls, with one source-language review in its memory-boundary response.</p>
      <p class="meta">This evidence supports continued Admin evaluation only. It does not certify Qwen, switch providers, or change the public OpenAI answer path.</p>
    </div>

    <div class="memory-card">
      <h3>Provider Registry</h3>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Model</th>
            <th>Status</th>
            <th>API</th>
            <th>Admin</th>
            <th>Certification</th>
          </tr>
        </thead>
        <tbody>
          ${AION_MODEL_PROVIDER_REGISTRY.map((entry) => {
            const api = entry.provider === "OpenAI"
              ? "Render"
              : getCandidateApiForModel(entry.model);
            return `
              <tr>
                <td>${escapeHtml(entry.provider)}</td>
                <td>
                  <strong>${escapeHtml(entry.model)}</strong><br>
                  <span class="meta">${escapeHtml(entry.notes || "")}</span>
                </td>
                <td>${renderStatusBadge(entry.status, entry.status.includes("baseline") ? "success" : "info")}</td>
                <td>${escapeHtml(api)}</td>
                <td>${renderStatusBadge(entry.provider === "OpenAI" ? "reference" : "testable", "info")}</td>
                <td>${renderStatusBadge(entry.certified ? "certified" : "candidate", entry.certified ? "success" : "info")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="memory-card">
      <h3>Aion Scorecard Reference</h3>
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th>OpenAI</th>
            <th>Llama 3.1</th>
            <th>Llama 4</th>
            <th>Qwen</th>
          </tr>
        </thead>
        <tbody>
          ${AION_PROVIDER_SCORECARD_REFERENCE.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.criterion)}</strong></td>
              <td>${scorecardBadge(row.openai)}</td>
              <td>${scorecardBadge(row.llama31)}</td>
              <td>${scorecardBadge(row.llama4)}</td>
              <td>${scorecardBadge(row.qwen)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p class="meta">Reference scores are operator guidance, not automatic routing decisions.</p>
    </div>

    <div class="memory-card">
      <h3>Guardrails</h3>
      <p>
        ${renderStatusBadge("OpenAI unchanged", "info")}
        ${renderStatusBadge("Admin-only tests", "info")}
        ${renderStatusBadge("No memory writes", "info")}
        ${renderStatusBadge("No provider switching", "info")}
      </p>
      <p class="meta">Qwen and Llama 4 Scout use v1_chat; Llama 3.1 stays on v0_chat.</p>
    </div>
  `;
}

window.runCandidateModelRegistryDryRun = function runCandidateModelRegistryDryRun() {
  const container = document.getElementById("candidateModelRegistryResults");
  if (container) {
    container.innerHTML = renderCandidateModelRegistry();
  }
};

function getCandidateApiForModel(model = LLM_CANDIDATE_MODEL) {
  return LLM_CANDIDATE_V1_MODELS.has(model) ? "v1_chat" : "v0_chat";
}

function toV1Messages(messages = []) {
  return messages.map((message) => {
    const content = message.content || "";
    const role = message.role || {};

    if (Object.prototype.hasOwnProperty.call(role, "system")) {
      return {system: {content}};
    }

    if (Object.prototype.hasOwnProperty.call(role, "assistant")) {
      return {
        assistant: {
          content: content ? [content] : [],
          tool_calls: [],
        },
      };
    }

    return {user: {content}};
  });
}

function extractV1ResponseText(response) {
  const content = response && response.message && response.message.content;

  if (Array.isArray(content)) {
    return content[0] || "";
  }

  return "";
}

function buildCandidateMessages(prompt, contextText = "") {
  const messages = [
    {
      role: {system: null},
      content: HARDENED_CANDIDATE_SYSTEM_PROMPT,
    },
    {
      role: {system: null},
      content: HARDENED_CONTEXT_RULE,
    },
  ];

  if (contextText.trim()) {
    messages.push({
      role: {system: null},
      content: `Use these Aion notes when answering. If the user asks what Aion is, answer from these notes instead of generic public knowledge:\n\n${contextText.trim()}`,
    });
  }

  messages.push({
    role: {user: null},
    content: `Question:
${prompt}

Write a grounded answer using exactly 3 short paragraphs separated by blank lines.
Each paragraph must be one sentence.
Keep the full answer under 75 words unless the question explicitly asks for detail.
Do not use headings, bullets, numbered lists, or separators.
Paragraph 1: answer directly and concretely.
Paragraph 2: clarify the most important reasoning, distinction, or tradeoff.
Paragraph 3: explain the practical application simply and calmly.
Do not ask follow-up questions.
If a firm recommendation is requested without decision-specific facts, say that a firm recommendation cannot be made from the available facts and explain the practical boundary.`,
  });

  return messages;
}

async function callIcpCandidate(prompt, contextText, llmActor, model = LLM_CANDIDATE_MODEL) {
  const startedAt = performance.now();
  const method = getCandidateApiForModel(model);
  const messages = buildCandidateMessages(prompt, contextText);

  try {
    const rawResponse = method === "v1_chat"
      ? await withCandidateTimeout(
          llmActor.v1_chat({
            model,
            messages: toV1Messages(messages),
            tools: [],
          }),
          LLM_CANDIDATE_TIMEOUT_MS
        )
      : await withCandidateTimeout(
          llmActor.v0_chat({
            model,
            messages,
          }),
          LLM_CANDIDATE_TIMEOUT_MS
        );
    const latencyMs = Math.round(performance.now() - startedAt);
    const response = method === "v1_chat" ? extractV1ResponseText(rawResponse) : rawResponse;

    if (typeof response !== "string") {
      throw new Error(`Unexpected response type from ${method}: ${typeof response}`);
    }

    if (!response.trim()) {
      throw new Error(`Empty response from candidate provider via ${method}`);
    }

    if (response.length > LLM_CANDIDATE_MAX_RESPONSE_CHARS) {
      throw new Error(`Oversized response from candidate provider: ${response.length} characters`);
    }

    return {
      success: true,
      method,
      latencyMs,
      response,
      responseLength: response.length,
      normalizedError: null,
    };
  } catch (err) {
    return {
      success: false,
      method,
      latencyMs: Math.round(performance.now() - startedAt),
      response: "",
      responseLength: 0,
      normalizedError: normalizeCandidateError(err),
    };
  }
}

function renderCandidateCallResult(data) {
  const normalizedError = data.normalizedError || null;
  const policyReceipt = data.policyReceipt || null;

  return `
    <div class="memory-card">
      <h3>${escapeHtml(data.title || "Manual Candidate Call Harness")}</h3>
      <p>${escapeHtml(data.summary || "")}</p>
      <p class="meta">
        Phase: ${escapeHtml(data.phase || "6.4.3")} |
        Candidate call made: ${data.candidateCallMade ? "yes" : "no"} |
        Success: ${data.success ? "yes" : "no"} |
        Latency: ${escapeHtml(String(data.latencyMs ?? "n/a"))}ms
      </p>
    </div>

    <div class="memory-card">
      <h3>Candidate</h3>
      ${renderCountMap(data.candidate || {})}
    </div>

    ${
      policyReceipt
        ? `<div class="memory-card">
            <h3>Certified Policy Receipt</h3>
            ${renderCountMap(policyReceipt)}
            <p class="meta">The policy check occurred before this browser-mediated candidate call. It did not invoke a reasoning provider.</p>
          </div>`
        : ""
    }

    <div class="memory-card">
      <h3>Prompt</h3>
      <p>${escapeHtml(data.prompt || "")}</p>
    </div>

    <div class="memory-card">
      <h3>Context</h3>
      ${renderCountMap({
        contextProvided: data.contextProvided ? "yes" : "no",
        contextLength: data.contextLength || 0,
      })}
      ${
        data.contextPreview
          ? `<p>${escapeHtml(data.contextPreview)}</p>`
          : "<p>No context supplied.</p>"
      }
    </div>

    <div class="memory-card">
      <h3>Candidate Response</h3>
      ${
        data.candidateResponse
          ? `<pre>${escapeHtml(data.candidateResponse)}</pre>`
          : "<p>No candidate response returned.</p>"
      }
    </div>

    <div class="memory-card">
      <h3>Format Check</h3>
      ${renderCandidateFormatCheck(data.candidateResponse || "")}
    </div>

    <div class="memory-card">
      <h3>Normalized Error</h3>
      ${
        normalizedError
          ? renderCountMap(normalizedError)
          : "<p>No normalized error.</p>"
      }
    </div>

    <div class="memory-card">
      <h3>Safety</h3>
      ${renderCountMap(data.safety || {})}
    </div>

    <div class="memory-card">
      <h3>Guardrails</h3>
      ${
        Array.isArray(data.guardrails) && data.guardrails.length
          ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
          : "<p>No guardrails returned.</p>"
      }
    </div>
  `;
}

function analyzeCandidateFormat(response = "") {
  const text = String(response || "").trim();
  const paragraphs = text
    ? text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  const lower = text.toLowerCase();
  const hasBulletOrNumberedList = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(text);
  const mentionsSourceLeak = /\b(supplied context|provided context|reference context|supplied notes|reference notes|production-style reference)\b/i.test(text);
  const asksFollowUp = /\?\s*$/.test(text) || /\b(can you|could you|please provide|would you like|anything else)\b/i.test(text);
  const solicitsFollowUpContext = /\b(if you provide|if you share|provide more details|share more details|tell me more about)\b/i.test(text);
  const mentionsTestHarness = /\b(provider testing|provider test|llm candidate|candidate model|test harness|this evaluation)\b/i.test(text);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const paragraphSentenceCounts = paragraphs.map((paragraph) => {
    const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
    return sentences.map((sentence) => sentence.trim()).filter(Boolean).length;
  });
  const oneSentenceParagraphs = paragraphs.length > 0 && paragraphSentenceCounts.every((count) => count === 1);

  return {
    paragraphCount: paragraphs.length,
    wordCount,
    threeParagraphs: paragraphs.length === 3,
    oneSentenceParagraphs,
    under75Words: wordCount <= 75,
    noBulletsOrNumberedLists: !hasBulletOrNumberedList,
    noSourceLeakMentions: !mentionsSourceLeak,
    noFollowUpQuestion: !asksFollowUp,
    noFollowUpSolicitation: !solicitsFollowUpContext,
    noTestHarnessMentions: !mentionsTestHarness,
  };
}

function renderCandidateFormatCheck(response = "") {
  const check = analyzeCandidateFormat(response);
  return renderCountMap({
    paragraphCount: check.paragraphCount,
    wordCount: check.wordCount,
    threeParagraphs: check.threeParagraphs ? "pass" : "review",
    oneSentenceParagraphs: check.oneSentenceParagraphs ? "pass" : "review",
    under75Words: check.under75Words ? "pass" : "review",
    noBulletsOrNumberedLists: check.noBulletsOrNumberedLists ? "pass" : "review",
    noSourceLeakMentions: check.noSourceLeakMentions ? "pass" : "review",
    noFollowUpQuestion: check.noFollowUpQuestion ? "pass" : "review",
    noFollowUpSolicitation: check.noFollowUpSolicitation ? "pass" : "review",
    noTestHarnessMentions: check.noTestHarnessMentions ? "pass" : "review",
  });
}

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

function renderCandidateResultSummaryTable(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return "<p>No candidate results returned.</p>";
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>API</th>
          <th>Status</th>
          <th>Latency</th>
          <th>Words</th>
          <th>Shape</th>
        </tr>
      </thead>
      <tbody>
        ${results.map((result) => {
          const check = analyzeCandidateFormat(result.response || "");
          const shape = [
            check.threeParagraphs ? "3 paragraphs" : "paragraphs review",
            check.oneSentenceParagraphs ? "1 sentence each" : "sentence review",
            check.under75Words ? "under 75" : "length review",
          ].join(" / ");

          return `
            <tr>
              <td>${escapeHtml(result.model || result.category || "n/a")}</td>
              <td>${escapeHtml(result.method || "n/a")}</td>
              <td>${renderStatusBadge(result.success ? "success" : "error")}</td>
              <td>${escapeHtml(String(result.latencyMs ?? "n/a"))}ms</td>
              <td>${escapeHtml(String(check.wordCount))}</td>
              <td>${escapeHtml(shape)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function candidateAnswerShapePassed(response = "") {
  const check = analyzeCandidateFormat(response);
  return check.threeParagraphs
    && check.oneSentenceParagraphs
    && check.under75Words;
}

function candidateOutputGuardrailsPassed(response = "") {
  const check = analyzeCandidateFormat(response);
  return check.noBulletsOrNumberedLists
    && check.noSourceLeakMentions
    && check.noFollowUpQuestion
    && check.noFollowUpSolicitation
    && check.noTestHarnessMentions;
}

function candidateFormatPassed(response = "") {
  return candidateAnswerShapePassed(response) && candidateOutputGuardrailsPassed(response);
}

function setCandidateTestControlsEnabled(enabled) {
  [
    "runSingleIcpTestButton",
    "runAionFitBatchButton",
    "runProductionStyleBatchButton",
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = !enabled;
    }
  });
}

function candidatePolicyPreflightPassed(data = {}) {
  const readiness = data.adminCandidateReadiness || {};
  const decision = readiness.decision || {};
  return readiness.eligible === true
    && readiness.status === "eligible_for_admin_only_adapter_review"
    && decision.providerId === "icp-llm"
    && decision.routeId === "icp-admin-candidate"
    && decision.invocationPermitted === true
    && decision.explicitOperatorAction === true
    && decision.promotionRequired === true
    && decision.automaticFallback === false;
}

function buildCandidatePolicyReceipt(data = {}) {
  const readiness = data.adminCandidateReadiness || {};
  const decision = readiness.decision || {};
  return {
    certificate: candidatePolicyPreflightPassed(data) ? "verified" : "not verified",
    provider: decision.providerId || "n/a",
    route: decision.routeId || "n/a",
    explicitAdminAction: decision.explicitOperatorAction ? "required" : "not required",
    promotion: decision.promotionRequired ? "required" : "not required",
    automaticFallback: decision.automaticFallback ? "forbidden policy violated" : "forbidden",
    icpQueries: data.canisterCallsMade ?? 0,
  };
}

function renderCandidatePolicyPreflight(data = {}, errorMessage = "") {
  const container = document.getElementById("candidatePolicyPreflightResults");
  if (!container) {
    return;
  }

  if (errorMessage) {
    container.innerHTML = `
      <div class="memory-card candidate-result-card error">
        <h3>Candidate Policy Preflight</h3>
        <p>${escapeHtml(errorMessage)}</p>
        <p class="meta">Candidate controls remain disabled. No candidate provider call was made.</p>
      </div>
    `;
    return;
  }

  const readiness = data.adminCandidateReadiness || {};
  const decision = readiness.decision || {};
  const eligible = candidatePolicyPreflightPassed(data);

  container.innerHTML = `
    <div class="memory-card candidate-result-card ${eligible ? "success" : "error"}">
      <h3>Candidate Policy Preflight</h3>
      <p>${eligible ? "Fresh certified policy evidence permits this Admin-only candidate review." : "Candidate review is blocked by the current certified policy evidence."}</p>
      ${renderMetricGrid({
        certificate: eligible ? "verified" : "not verified",
        route: `${decision.providerId || "n/a"} / ${decision.routeId || "n/a"}`,
        status: readiness.status || "review",
        "ICP queries": data.canisterCallsMade ?? 0,
      })}
      <p class="meta">Provider calls: no | Memory writes: no | Automatic switching: no</p>
      <p class="meta">${escapeHtml(readiness.reason || data.trustBoundary?.reason || "")}</p>
    </div>
  `;
}

async function requireCertifiedCandidatePolicyPreflight() {
  if (!isAuthenticated) {
    throw new Error("Please sign in first.");
  }

  const container = document.getElementById("candidatePolicyPreflightResults");
  if (container) {
    container.innerHTML = "<p>Checking certified Admin candidate policy...</p>";
  }
  setCandidateTestControlsEnabled(false);

  try {
    const res = await fetch(
      `${AIONIC_AGENT_API_BASE_URL}/admin/certified-admin-candidate-adapter-readiness`
    );
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `Candidate policy preflight failed (${res.status})`);
    }
    if (!candidatePolicyPreflightPassed(data)) {
      renderCandidatePolicyPreflight(data);
      throw new Error("Certified Admin candidate policy did not permit a candidate call.");
    }

    renderCandidatePolicyPreflight(data);
    setCandidateTestControlsEnabled(true);
    return data;
  } catch (err) {
    const message = String(err && (err.message || err) || "Candidate policy preflight failed.");
    renderCandidatePolicyPreflight({}, message);
    setCandidateTestControlsEnabled(false);
    throw err;
  }
}

window.runCertifiedCandidatePolicyPreflight = async function runCertifiedCandidatePolicyPreflight() {
  try {
    await requireCertifiedCandidatePolicyPreflight();
  } catch (err) {
    console.error("Certified candidate policy preflight failed:", err);
  }
};

function observedBatchScore(value) {
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  const label = rounded >= 5
    ? "strong"
    : rounded >= 4
      ? "promising"
      : rounded >= 3
        ? "review"
        : "needs work";

  return `${rounded}/5 ${label}`;
}

function isPerfectCandidateFraction(value = "") {
  const [numerator, denominator] = String(value).split("/").map((part) => Number(part));
  return Number.isFinite(numerator)
    && Number.isFinite(denominator)
    && denominator > 0
    && numerator === denominator;
}

function renderObservedBatchScorecard(results = []) {
  const models = [...new Set(results.map((result) => result.model).filter(Boolean))];
  if (models.length === 0) {
    return "";
  }

  const rows = models.map((model) => {
    const modelResults = results.filter((result) => result.model === model);
    const successful = modelResults.filter((result) => result.success);
    const answerShapePassed = successful.filter((result) => candidateAnswerShapePassed(result.response || ""));
    const outputGuardrailsPassed = successful.filter((result) => candidateOutputGuardrailsPassed(result.response || ""));
    const fullContractPassed = successful.filter((result) => candidateFormatPassed(result.response || ""));
    const reviewSignals = [
      ["bullets", (check) => !check.noBulletsOrNumberedLists],
      ["source language", (check) => !check.noSourceLeakMentions],
      ["follow-up question", (check) => !check.noFollowUpQuestion],
      ["follow-up solicitation", (check) => !check.noFollowUpSolicitation],
      ["harness language", (check) => !check.noTestHarnessMentions],
    ].map(([label, failed]) => ({
      label,
      count: successful.filter((result) => failed(analyzeCandidateFormat(result.response || ""))).length,
    })).filter((signal) => signal.count > 0);
    const latencies = successful
      .map((result) => result.latencyMs)
      .filter((latency) => Number.isFinite(latency));
    const averageLatency = latencies.length
      ? Math.round(latencies.reduce((total, latency) => total + latency, 0) / latencies.length)
      : null;
    const reliability = modelResults.length ? successful.length / modelResults.length : 0;
    const formatQuality = successful.length ? fullContractPassed.length / successful.length : 0;
    const latencyScore = averageLatency === null
      ? 1
      : averageLatency <= 4000
        ? 5
        : averageLatency <= 5000
          ? 4
          : averageLatency <= 6000
            ? 3
            : averageLatency <= 8000
              ? 2
              : 1;
    const observedScore = observedBatchScore(((reliability * 5) + (formatQuality * 5) + latencyScore) / 3);

    return {
      model,
      successful: `${successful.length}/${modelResults.length}`,
      answerShape: `${answerShapePassed.length}/${successful.length || 0}`,
      outputGuardrails: `${outputGuardrailsPassed.length}/${successful.length || 0}`,
      fullContract: `${fullContractPassed.length}/${successful.length || 0}`,
      latency: averageLatency === null ? "n/a" : `${averageLatency}ms`,
      observedScore,
      reviewSignals,
    };
  });

  return `
    <div class="memory-card">
      <h3>Observed Batch Scorecard</h3>
      <p>Current browser-session evidence from this batch. It separates the visible answer shape from extra output guardrails, so a format review is easy to diagnose.</p>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Successful calls</th>
            <th>3-paragraph shape</th>
            <th>Output guardrails</th>
            <th>Full contract</th>
            <th>Average latency</th>
            <th>Observed harness quality</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.model)}</strong></td>
              <td>${renderStatusBadge(row.successful, isPerfectCandidateFraction(row.successful) ? "success" : "info")}</td>
              <td>${renderStatusBadge(row.answerShape, isPerfectCandidateFraction(row.answerShape) ? "success" : "info")}</td>
              <td>${renderStatusBadge(row.outputGuardrails, isPerfectCandidateFraction(row.outputGuardrails) ? "success" : "info")}</td>
              <td>${renderStatusBadge(row.fullContract, isPerfectCandidateFraction(row.fullContract) ? "success" : "info")}</td>
              <td>${escapeHtml(row.latency)}</td>
              <td>${scorecardBadge(row.observedScore)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${rows.some((row) => row.reviewSignals.length) ? `
        <p class="meta">Review signals: ${rows.filter((row) => row.reviewSignals.length).map((row) => `${escapeHtml(row.model)}: ${row.reviewSignals.map((signal) => `${escapeHtml(signal.label)} (${signal.count})`).join(", ")}`).join(" | ")}</p>
      ` : ""}
      <p class="meta">This is a small operational scorecard, not a substitute for the Aion-fit review of actual responses.</p>
    </div>
  `;
}

window.runManualCandidateCallHarness = async function runManualCandidateCallHarness() {
  if (!isAuthenticated || !identity) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("manualCandidateCallResults");
  const contextText = valueFromInput("candidateCallContext");
  const prompt = valueFromInput("candidateCallPrompt");
  const selectedModels = getCandidateModelsToTest();

  if (!prompt) {
    alert("Enter a short test prompt first.");
    return;
  }

  let policyPreflight;
  try {
    policyPreflight = await requireCertifiedCandidatePolicyPreflight();
  } catch (_err) {
    return;
  }

  container.innerHTML = "<p>Running one Admin-only candidate call...</p>";

  const safety = {
    adminOnly: true,
    productionAnswerPath: "OpenAI only",
    candidateOutputReturnedToUser: false,
    memoryWrites: false,
    continuityChanges: false,
    automaticProviderSwitching: false,
    browserMediated: true,
  };

  const baseResult = {
    phase: "6.4.3",
    title: "Context-Bound Candidate Call Harness",
    summary: "One Admin-only ICP LLM candidate call with explicit Aion context. Output stays in Admin and cannot affect production answers.",
    candidate: {
      provider: "ICP LLM canister",
      canisterId: LLM_CANISTER_ID,
      environment: "ICP",
      model: selectedModels.join(", "),
      method: selectedModels.map(getCandidateApiForModel).join(", "),
      methodType: "update",
      streaming: false,
    },
    prompt,
    contextProvided: Boolean(contextText),
    contextLength: contextText.length,
    contextPreview: contextText.slice(0, 500),
    policyReceipt: buildCandidatePolicyReceipt(policyPreflight),
    safety,
    guardrails: [
      "Admin-only.",
      "Single manual candidate call.",
      "No production answer behavior changed.",
      "No memory writes.",
      "No continuity changes.",
      "No automatic provider switching.",
      "Candidate output remains visible only in Admin.",
      "OpenAI remains the only user-facing answer provider.",
    ],
  };

  const llmAgent = new HttpAgent({
    identity,
    host: "https://ic0.app",
  });
  const llmActor = Actor.createActor(llmIdlFactory, {
    agent: llmAgent,
    canisterId: LLM_CANISTER_ID,
  });
  if (selectedModels.length === 1) {
    const selectedModel = selectedModels[0];
    const result = await callIcpCandidate(prompt, contextText, llmActor, selectedModel);
    lastCandidateCallResult = {
      prompt,
      contextText,
      model: selectedModel,
      latencyMs: result.latencyMs,
      response: result.response,
      normalizedError: result.normalizedError,
    };

    container.innerHTML = renderCandidateCallResult({
      ...baseResult,
      candidate: {
        ...baseResult.candidate,
        model: selectedModel,
        method: result.method,
      },
      candidateCallMade: true,
      success: result.success,
      latencyMs: result.latencyMs,
      responseLength: result.responseLength,
      candidateResponse: result.response,
      normalizedError: result.normalizedError,
      method: result.method,
    });
    return;
  }

  const results = [];

  for (const model of selectedModels) {
    container.innerHTML = `<p>Running ${escapeHtml(model)}...</p>`;
    const result = await callIcpCandidate(prompt, contextText, llmActor, model);
    results.push({
      category: model,
      prompt,
      model,
      method: result.method,
      success: result.success,
      latencyMs: result.latencyMs,
      response: result.response,
      responseLength: result.responseLength,
      normalizedError: result.normalizedError,
    });
  }

  const latest = results[results.length - 1];
  lastCandidateCallResult = latest
    ? {
        prompt,
        contextText,
        model: latest.model,
        latencyMs: latest.latencyMs,
        response: latest.response,
        normalizedError: latest.normalizedError,
      }
    : null;

  container.innerHTML = renderCandidateBatchResults({
    title: "Phase 6.7.3 Multi-Model Single Prompt Candidate Test",
    summary: "Admin-only ICP LLM candidate test across the listed model strings using one shared prompt.",
    contextLength: contextText.length,
    model: selectedModels.join(", "),
    policyReceipt: buildCandidatePolicyReceipt(policyPreflight),
    results,
  });
};

function renderCandidateBatchResults(data) {
  const results = Array.isArray(data.results) ? data.results : [];
  const succeeded = results.filter((result) => result.success).length;
  const latencies = results
    .filter((result) => result.success && Number.isFinite(result.latencyMs))
    .map((result) => result.latencyMs);
  const averageLatency = latencies.length
    ? Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length)
    : null;

  return `
    <div class="memory-card">
      <h3>${escapeHtml(data.title || "Aion-Fit Candidate Batch")}</h3>
      <p>${escapeHtml(data.summary || "Admin-only ICP LLM candidate batch run using the hardened Aion context.")}</p>
      ${renderMetricGrid({
        "candidate calls": results.length,
        successes: `${succeeded}/${results.length}`,
        "average latency": `${averageLatency ?? "n/a"}ms`,
        models: data.model || LLM_CANDIDATE_MODEL,
      })}
      <p class="meta">Live behavior changed: no | Memory writes: no | Automatic provider switching: no</p>
    </div>

    <div class="memory-card">
      <h3>Result Summary</h3>
      ${renderCandidateResultSummaryTable(results)}
    </div>

    ${
      data.policyReceipt
        ? `<div class="memory-card">
            <h3>Certified Policy Receipt</h3>
            ${renderCountMap(data.policyReceipt)}
            <p class="meta">The policy check occurred before this browser-mediated batch. It did not invoke a reasoning provider.</p>
          </div>`
        : ""
    }

    ${renderObservedBatchScorecard(results)}

    <div class="memory-card">
      <h3>Guardrails</h3>
      <p>
        ${renderStatusBadge("Admin-only", "info")}
        ${renderStatusBadge("OpenAI unchanged", "info")}
        ${renderStatusBadge("No memory writes", "info")}
        ${renderStatusBadge("No provider switching", "info")}
      </p>
    </div>

    ${
      results.length
        ? results.map((result, index) => `
          <div class="memory-card candidate-result-card ${result.success ? "success" : "error"}">
            <strong>${index + 1}. ${escapeHtml(result.category)} ${renderStatusBadge(result.success ? "success" : "error")}</strong>
            <p class="meta">Model: ${escapeHtml(result.model || data.model || LLM_CANDIDATE_MODEL)} | API: ${escapeHtml(result.method || "n/a")} | Latency: ${escapeHtml(String(result.latencyMs ?? "n/a"))}ms</p>
            <h4>Prompt</h4>
            <p>${escapeHtml(result.prompt)}</p>
            ${
              result.reference
                ? `<h4>Reference Context</h4><p>${escapeHtml(result.reference)}</p>`
                : ""
            }
            <h4>Candidate Response</h4>
            ${result.response ? `<pre>${escapeHtml(result.response)}</pre>` : "<p>No candidate response returned.</p>"}
            <h4>Format Check</h4>
            ${renderCandidateFormatCheck(result.response || "")}
            <h4>Normalized Error</h4>
            ${result.normalizedError ? renderCountMap(result.normalizedError) : "<p>No normalized error.</p>"}
          </div>
        `).join("")
        : '<div class="memory-card"><p>No batch results returned.</p></div>'
    }
  `;
}
async function runCandidateBatchPromptSet({title, summary, prompts}) {
  if (!isAuthenticated || !identity) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("candidateBatchTestResults");
  const contextText = valueFromInput("candidateCallContext") || DEFAULT_AION_CANDIDATE_CONTEXT;
  const selectedModels = getCandidateModelsToTest();

  let policyPreflight;
  try {
    policyPreflight = await requireCertifiedCandidatePolicyPreflight();
  } catch (_err) {
    return;
  }

  container.innerHTML = `<p>Running ${escapeHtml(title || "Admin-only ICP batch test")}...</p>`;

  const llmAgent = new HttpAgent({
    identity,
    host: "https://ic0.app",
  });
  const llmActor = Actor.createActor(llmIdlFactory, {
    agent: llmAgent,
    canisterId: LLM_CANISTER_ID,
  });
  const results = [];
  const promptSet = Array.isArray(prompts) ? prompts : [];

  const totalRuns = selectedModels.length * promptSet.length;

  for (const model of selectedModels) {
    for (const test of promptSet) {
      const fullContext = test.reference
        ? `${contextText}

Production-style reference notes:
${test.reference}`
        : contextText;

      container.innerHTML = `<p>Running ${results.length + 1}/${totalRuns}: ${escapeHtml(model)} / ${escapeHtml(test.category)}...</p>`;
      const result = await callIcpCandidate(test.prompt, fullContext, llmActor, model);

      results.push({
        category: `${model} / ${test.category}`,
        prompt: test.prompt,
        reference: test.reference || "",
        model,
        method: result.method,
        success: result.success,
        latencyMs: result.latencyMs,
        response: result.response,
        responseLength: result.responseLength,
        normalizedError: result.normalizedError,
      });
    }
  }

  container.innerHTML = renderCandidateBatchResults({
    title,
    summary,
    contextLength: contextText.length,
    model: selectedModels.join(", "),
    policyReceipt: buildCandidatePolicyReceipt(policyPreflight),
    results,
  });
}

window.runCandidateBatchTestHarness = async function runCandidateBatchTestHarness() {
  await runCandidateBatchPromptSet({
    title: "Aion-Fit Candidate Batch",
    summary: "Admin-only ICP LLM candidate batch run using Aion identity, governance, and boundary prompts.",
    prompts: AION_FIT_BATCH_PROMPTS,
  });
};

window.runProductionStyleCandidateBatchTestHarness = async function runProductionStyleCandidateBatchTestHarness() {
  await runCandidateBatchPromptSet({
    title: "Phase 6.6.6 Production-Style Candidate Batch",
    summary: "Admin-only ICP LLM candidate batch run using production-like prompts, small reference snippets, and the required 3-paragraph answer shape.",
    prompts: PRODUCTION_STYLE_BATCH_PROMPTS,
  });
};

function renderHardeningChanges(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return "<p>No hardening changes returned.</p>";
  }

  return changes.map((change, index) => `
    <div>
      <strong>${index + 1}. ${escapeHtml(change.area || "Hardening area")}</strong>
      <p>${escapeHtml(change.change || "")}</p>
      <p class="meta">${escapeHtml(change.reason || "")}</p>
    </div>
  `).join("");
}

function renderProviderInterfaceBoundary(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No responsibility boundary returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Owner</th><th>Responsibility</th></tr></thead>
      <tbody>
        ${entries.map((entry) => `
          <tr>
            <td><strong>${escapeHtml(entry.owner || "n/a")}</strong></td>
            <td>${escapeHtml(entry.responsibility || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderProviderAdapterTable(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "<p>No provider adapters returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Provider</th><th>Model</th><th>Environment</th><th>Role</th><th>Route</th></tr></thead>
      <tbody>
        ${entries.map((entry) => `
          <tr>
            <td>${escapeHtml(entry.provider || "n/a")}</td>
            <td><strong>${escapeHtml(entry.model || "n/a")}</strong></td>
            <td>${escapeHtml(entry.environment || "n/a")}</td>
            <td>${escapeHtml(entry.role || "")}</td>
            <td>${escapeHtml(entry.route || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function nativeManifestBadge(category = "") {
  const normalized = String(category).toLowerCase();
  const fallback = normalized.includes("already native") || normalized.includes("native next")
    ? "success"
    : normalized.includes("transitional") || normalized.includes("external")
      ? "info"
      : "review";

  return renderStatusBadge(category, fallback);
}

function renderNativeManifestCapabilities(capabilities = []) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return "<p>No capabilities returned.</p>";
  }

  return `
    <table>
      <thead>
        <tr><th>Capability</th><th>Current</th><th>Future</th><th>Category</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${capabilities.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.capability || "n/a")}</strong><br><span class="meta">${escapeHtml(item.note || "")}</span></td>
            <td>${escapeHtml(item.current || "")}</td>
            <td>${escapeHtml(item.future || "")}</td>
            <td>${nativeManifestBadge(item.category || "")}</td>
            <td>${escapeHtml(item.status || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.runNativeIntelligenceManifestDebug = async function runNativeIntelligenceManifestDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("nativeIntelligenceManifestResults");
  container.innerHTML = "<p>Building Native Intelligence Manifest...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/native-intelligence-manifest"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const slice = data.firstMotokoSlice || {};
    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Native Intelligence Manifest")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p><strong>${escapeHtml(data.guidingPrinciple || "")}</strong></p>
        ${renderMetricGrid(data.categoryCounts || {})}
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"} | Provider calls made: ${data.providerCallsMade ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Capability Inventory</h3>
        ${renderNativeManifestCapabilities(data.capabilities)}
      </div>

      <div class="memory-card">
        <h3>First Motoko Slice</h3>
        <p><strong>${escapeHtml(slice.name || "")}</strong></p>
        <p>${escapeHtml(slice.scope || "")}</p>
        <h4>Excludes</h4>
        ${Array.isArray(slice.excludes) ? `<ul>${slice.excludes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No exclusions returned.</p>"}
        <h4>Success Criteria</h4>
        ${Array.isArray(slice.successCriteria) ? `<ul>${slice.successCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No success criteria returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Next Action</h3>
        <p>${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) && data.guardrails.length
          ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Native Intelligence Manifest failed:", err);
    container.innerHTML = `<p>Native Intelligence Manifest failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderContractFieldTable(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return "<p>No contract fields returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Field</th><th>Type</th><th>Rule</th></tr></thead>
      <tbody>
        ${fields.map((field) => `
          <tr>
            <td><strong>${escapeHtml(field.field || "n/a")}</strong></td>
            <td>${escapeHtml(field.type || "")}</td>
            <td>${escapeHtml(field.rule || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.runMotokoContinuityContractDebug = async function runMotokoContinuityContractDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("motokoContinuityContractResults");
  container.innerHTML = "<p>Building read-only Motoko continuity contract...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/motoko-continuity-contract"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const method = data.method || {};
    const caller = data.callerBoundary || {};
    const result = data.resultShape || {};
    const readiness = data.readiness || {};
    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Read-Only Motoko Continuity Contract")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Motoko code created: ${data.motokoCodeCreated ? "yes" : "no"} | Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Method</h3>
        ${renderCountMap(method)}
      </div>

      <div class="memory-card">
        <h3>Caller Boundary</h3>
        ${renderCountMap(caller)}
      </div>

      <div class="memory-card">
        <h3>Request</h3>
        ${renderContractFieldTable(data.requestFields)}
      </div>

      <div class="memory-card">
        <h3>Fixed Limits</h3>
        ${renderCountMap(data.fixedLimits || {})}
      </div>

      <div class="memory-card">
        <h3>Result Shape</h3>
        <h4>Success</h4>
        ${renderCountMap(result.ok || {})}
        <h4>Error Variants</h4>
        ${Array.isArray(result.errorVariants) ? `<ul>${result.errorVariants.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No error variants returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Algorithm Boundary</h3>
        ${Array.isArray(data.algorithmBoundary) ? `<ul>${data.algorithmBoundary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No algorithm boundary returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Python Parity Fixtures</h3>
        ${Array.isArray(data.pythonParityFixtures) ? `<ul>${data.pythonParityFixtures.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No fixtures returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Implementation Readiness</h3>
        ${renderCountMap(readiness)}
      </div>

      <div class="memory-card">
        <h3>Next Action</h3>
        <p>${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Motoko continuity contract failed:", err);
    container.innerHTML = `<p>Motoko continuity contract failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderPrivateModuleRoles(roles = []) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return "<p>No repository roles returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Repository</th><th>Visibility</th><th>Role</th><th>Responsibility</th></tr></thead>
      <tbody>
        ${roles.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.repository || "n/a")}</strong></td>
            <td>${escapeHtml(item.visibility || "")}</td>
            <td>${escapeHtml(item.role || "")}</td>
            <td>${escapeHtml(item.responsibility || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCompatibilityFindings(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return "<p>No compatibility findings returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Area</th><th>Current</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        ${findings.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.area || "n/a")}</strong></td>
            <td>${escapeHtml(item.current || "")}</td>
            <td>${renderStatusBadge(item.status || "")}</td>
            <td>${escapeHtml(item.action || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.runPrivateModuleIntegrationDebug = async function runPrivateModuleIntegrationDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("privateModuleIntegrationResults");
  container.innerHTML = "<p>Building private module integration plan...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/private-module-integration"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const proof = data.firstBuildProof || {};
    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Motoko Toolchain and Private Module Integration")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Repository created: ${data.repositoryCreated ? "yes" : "no"} | Submodule created: ${data.submoduleCreated ? "yes" : "no"} | Toolchain changed: ${data.toolchainChanged ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Repository Roles</h3>
        ${renderPrivateModuleRoles(data.repositoryRoles)}
      </div>

      <div class="memory-card">
        <h3>Private Module Plan</h3>
        ${renderCountMap(data.privateModulePlan || {})}
      </div>

      <div class="memory-card">
        <h3>Toolchain Compatibility</h3>
        ${renderCompatibilityFindings(data.compatibilityFindings)}
      </div>

      <div class="memory-card">
        <h3>Integration Sequence</h3>
        ${Array.isArray(data.integrationSequence) ? `<ol>${data.integrationSequence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>No sequence returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>First Build Proof</h3>
        <p><strong>${escapeHtml(proof.name || "")}</strong></p>
        <p>${escapeHtml(proof.scope || "")}</p>
        <h4>Excludes</h4>
        ${Array.isArray(proof.excludes) ? `<ul>${proof.excludes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No exclusions returned.</p>"}
        <h4>Success Criteria</h4>
        ${Array.isArray(proof.successCriteria) ? `<ul>${proof.successCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No success criteria returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Readiness</h3>
        ${renderCountMap(data.readiness || {})}
      </div>

      <div class="memory-card">
        <h3>Next Action</h3>
        <p>${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Private module integration plan failed:", err);
    container.innerHTML = `<p>Private module integration plan failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderToolchainGates(gates = []) {
  if (!Array.isArray(gates) || gates.length === 0) {
    return "<p>No compatibility gates returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Gate</th><th>Status</th><th>Evidence</th></tr></thead>
      <tbody>
        ${gates.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.gate || "n/a")}</strong></td>
            <td>${renderStatusBadge(item.status || "")}</td>
            <td>${escapeHtml(item.evidence || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.runMotokoToolchainModernizationDebug = async function runMotokoToolchainModernizationDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("motokoToolchainModernizationResults");
  container.innerHTML = "<p>Building public Motoko toolchain modernization plan...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/motoko-toolchain-modernization"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const migration = data.migrationStrategy || {};
    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Public Motoko Toolchain Modernization")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Toolchain changed: ${data.toolchainChanged ? "yes" : "no"} | Private library imported: ${data.privateLibraryImported ? "yes" : "no"} | Canister deployed: ${data.canisterDeployment ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Current State</h3>
        ${renderCountMap(data.currentState || {})}
        <h4>Existing Persistent Fields</h4>
        ${Array.isArray(data.legacyStateFields) ? `<ul>${data.legacyStateFields.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No state fields returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Target State</h3>
        ${renderCountMap(data.targetState || {})}
      </div>

      <div class="memory-card">
        <h3>Migration Strategy</h3>
        ${renderCountMap(migration)}
      </div>

      <div class="memory-card">
        <h3>Compatibility Gates</h3>
        ${renderToolchainGates(data.compatibilityGates)}
      </div>

      <div class="memory-card">
        <h3>Execution Sequence</h3>
        ${Array.isArray(data.executionSequence) ? `<ol>${data.executionSequence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>No sequence returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Holds</h3>
        ${Array.isArray(data.holds) ? `<ul>${data.holds.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No holds returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Readiness</h3>
        ${renderCountMap(data.readiness || {})}
      </div>

      <div class="memory-card">
        <h3>Next Action</h3>
        <p>${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Motoko toolchain modernization plan failed:", err);
    container.innerHTML = `<p>Motoko toolchain modernization plan failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

function renderBaselineArtifacts(artifacts = []) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return "<p>No baseline artifacts returned.</p>";
  }

  return `
    <table>
      <thead><tr><th>Artifact</th><th>Purpose</th><th>Source</th></tr></thead>
      <tbody>
        ${artifacts.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.artifact || "n/a")}</strong></td>
            <td>${escapeHtml(item.purpose || "")}</td>
            <td>${escapeHtml(item.source || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.runMotokoCompatibilityBaselineDebug = async function runMotokoCompatibilityBaselineDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("motokoCompatibilityBaselineResults");
  container.innerHTML = "<p>Building backend compatibility baseline capture plan...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/motoko-compatibility-baseline"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const capture = data.captureTool || {};
    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Public Backend Compatibility Baseline")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Canister calls made: ${data.canisterCallsMade ? "yes" : "no"} | Canister deployed: ${data.canisterDeployment ? "yes" : "no"} | Memory writes: ${data.memoryWrites ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Capture Tool</h3>
        ${renderCountMap(capture)}
      </div>

      <div class="memory-card">
        <h3>Version-Controlled Evidence</h3>
        ${renderBaselineArtifacts(data.versionControlledEvidence)}
      </div>

      <div class="memory-card">
        <h3>Capture Checks</h3>
        ${Array.isArray(data.captureChecks) ? `<ul>${data.captureChecks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No capture checks returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Not Performed</h3>
        ${Array.isArray(data.notPerformed) ? `<ul>${data.notPerformed.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No exclusions returned.</p>"}
      </div>

      <div class="memory-card">
        <h3>Next Action</h3>
        <p>${escapeHtml(data.nextAction || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Motoko compatibility baseline plan failed:", err);
    container.innerHTML = `<p>Motoko compatibility baseline plan failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runAionProviderInterfaceDesignDebug = async function runAionProviderInterfaceDesignDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("aionProviderInterfaceDesignResults");
  container.innerHTML = "<p>Building Aion provider interface design...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/aion-provider-interface-design"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Aion Provider Interface Design")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Dry run: ${data.dryRunOnly ? "yes" : "no"} | Provider calls made: ${data.providerCallsMade ? "yes" : "no"} | Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"}</p>
      </div>

      <div class="memory-card">
        <h3>Current Baseline</h3>
        ${renderCountMap(data.currentBaseline || {})}
      </div>

      <div class="memory-card">
        <h3>Aion Request Contract</h3>
        ${renderCountMap(data.aionRequestContract || {})}
      </div>

      <div class="memory-card">
        <h3>Normalized Result Contract</h3>
        ${renderCountMap(data.normalizedResultContract || {})}
      </div>

      <div class="memory-card">
        <h3>Responsibility Boundary</h3>
        ${renderProviderInterfaceBoundary(data.responsibilityBoundary)}
      </div>

      <div class="memory-card">
        <h3>Provider Adapters</h3>
        ${renderProviderAdapterTable(data.providerAdapters)}
      </div>

      <div class="memory-card">
        <h3>Current Routing</h3>
        ${renderCountMap(data.routingDecision || {})}
      </div>

      <div class="memory-card">
        <h3>Phase 7 Bridge</h3>
        ${renderCountMap(data.phase7Bridge || {})}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${Array.isArray(data.guardrails) && data.guardrails.length
          ? `<ul>${data.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : "<p>No guardrails returned.</p>"}
      </div>
    `;
  } catch (err) {
    console.error("Aion provider interface design failed:", err);
    container.innerHTML = `<p>Aion provider interface design failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

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

window.runCertifiedNativePolicyAuthorizationDebug = async function runCertifiedNativePolicyAuthorizationDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("certifiedNativePolicyAuthorizationResults");
  container.innerHTML = "<p>Building certified native policy authorization design...</p>";

  try {
    const res = await fetch("https://aionic-agent-api.onrender.com/admin/certified-native-policy-authorization");
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    const fieldRows = Array.isArray(data.proposedNativeContract) ? data.proposedNativeContract.map((field) => `
      <tr><td><strong>${escapeHtml(field.field || "")}</strong></td><td>${escapeHtml(field.type || "")}</td><td>${escapeHtml(field.purpose || "")}</td></tr>
    `).join("") : "";
    const rejectedRows = Array.isArray(data.rejectedApproaches) ? data.rejectedApproaches.map((item) => `
      <tr><td><strong>${escapeHtml(item.approach || "")}</strong></td><td>${escapeHtml(item.reason || "")}</td></tr>
    `).join("") : "";

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Certified Native Policy Authorization Design")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">Phase: ${escapeHtml(data.phase || "7.51")} | Dry run: ${data.dryRunOnly ? "yes" : "no"} | Canister calls: ${escapeHtml(data.canisterCallsMade || 0)} | Provider calls: ${data.providerCallsMade ? "yes" : "no"}</p>
      </div>
      <div class="memory-card"><h3>Current Evidence</h3>${renderCountMap(data.currentEvidence || {})}</div>
      <div class="memory-card"><h3>Selected Approach</h3>${renderCountMap(data.selectedApproach || {})}</div>
      <div class="memory-card"><h3>Proposed Native Contract</h3><table><thead><tr><th>Field</th><th>Type</th><th>Purpose</th></tr></thead><tbody>${fieldRows}</tbody></table></div>
      <div class="memory-card"><h3>Proposed Method</h3>${renderCountMap(data.proposedMethod || {})}</div>
      <div class="memory-card"><h3>Native Lifecycle</h3><ol>${(data.nativeLifecycle || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div>
      <div class="memory-card"><h3>Verifier Requirements</h3><ol>${(data.verifierRequirements || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div>
      <div class="memory-card"><h3>Failure Policy</h3><ul>${(data.failurePolicy || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Rejected Approaches</h3><table><thead><tr><th>Approach</th><th>Reason</th></tr></thead><tbody>${rejectedRows}</tbody></table></div>
      <div class="memory-card"><h3>Implementation Sequence</h3><ol>${(data.implementationSequence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div>
      <div class="memory-card"><h3>Non-Goals</h3><ul>${(data.nonGoals || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="memory-card"><h3>Guardrails</h3><ul>${(data.guardrails || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    `;
  } catch (err) {
    console.error("Certified native policy authorization design failed:", err);
    container.innerHTML = `<p>Certified native policy authorization design failed: ${escapeHtml(err.message || err)}</p>`;
  }
};

window.runCandidateHardeningPlanDebug = async function runCandidateHardeningPlanDebug() {
  if (!isAuthenticated) {
    alert("Please sign in first.");
    return;
  }

  const container = document.getElementById("candidateHardeningPlanResults");
  container.innerHTML = "<p>Building candidate hardening plan...</p>";

  try {
    const res = await fetch(
      "https://aionic-agent-api.onrender.com/admin/candidate-hardening-plan"
    );
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<p>Error: ${escapeHtml(data.error)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="memory-card">
        <h3>${escapeHtml(data.title || "Candidate Hardening Plan")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        <p class="meta">
          Phase: ${escapeHtml(data.phase || "6.6.1")} |
          Dry run: ${data.dryRunOnly ? "yes" : "no"} |
          Provider calls made: ${data.providerCallsMade ? "yes" : "no"} |
          Live behavior changed: ${data.liveBehaviorChanged ? "yes" : "no"}
        </p>
      </div>

      <div class="memory-card">
        <h3>Target Provider</h3>
        ${renderCountMap(data.targetProvider || {})}
      </div>

      <div class="memory-card">
        <h3>Observed Issue</h3>
        ${renderCountMap(data.observedIssue || {})}
      </div>

      <div class="memory-card">
        <h3>Hardening Changes</h3>
        ${renderHardeningChanges(data.hardeningChanges)}
      </div>

      <div class="memory-card">
        <h3>Hardened Prompt Preview</h3>
        <h4>System Prompt</h4>
        <p>${escapeHtml((data.hardenedPromptPreview || {}).systemPrompt || "")}</p>
        <h4>Context Rule</h4>
        <p>${escapeHtml((data.hardenedPromptPreview || {}).contextRule || "")}</p>
      </div>

      <div class="memory-card">
        <h3>Expected Improvement</h3>
        ${
          Array.isArray(data.expectedImprovement) && data.expectedImprovement.length
            ? `<ul>${data.expectedImprovement.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No expected improvements returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Success Criteria</h3>
        <p><strong>Next test prompt:</strong> ${escapeHtml(data.nextTestPrompt || "")}</p>
        ${
          Array.isArray(data.successCriteria) && data.successCriteria.length
            ? `<ul>${data.successCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p>No success criteria returned.</p>"
        }
      </div>

      <div class="memory-card">
        <h3>Next Phase</h3>
        ${renderCountMap(data.nextPhase || {})}
      </div>

      <div class="memory-card">
        <h3>Guardrails</h3>
        ${
          Array.isArray(data.guardrails) && data.guardrails.length
            ? `<ul>${data.guardrails.map((guardrail) => `<li>${escapeHtml(guardrail)}</li>`).join("")}</ul>`
            : "<p>No guardrails returned.</p>"
        }
      </div>
    `;

  } catch (err) {
    console.error("Candidate hardening plan dry run failed:", err);
    container.innerHTML = `<p>Candidate hardening plan dry run failed: ${escapeHtml(err.message || err)}</p>`;
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

function initializeCandidateHarnessContext() {
  const contextInput = document.getElementById("candidateCallContext");

  if (contextInput && !contextInput.value.trim()) {
    contextInput.value = DEFAULT_AION_CANDIDATE_CONTEXT;
  }
}

function initializeCandidateModelList() {
  const input = document.getElementById("candidateModelList");
  if (input && !input.value.trim()) {
    input.value = DEFAULT_CANDIDATE_MODELS.join("\n");
  }
}

const savedGolden = loadSavedGoldenResults();

if (savedGolden) {
  renderGoldenTests(savedGolden);
}
initializeCandidateHarnessContext();
initializeCandidateModelList();
initAuth();
