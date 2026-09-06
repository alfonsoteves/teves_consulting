module {
  public let foundationVersion = "aion-role-based-intelligence-phase-9-1-foundation-v1";
  public let phaseName = "Phase 9: Role-Based Intelligence";
  public let architecturalSubject = "One Aion. One canonical continuity. Multiple operational roles.";

  public type RoleDefinition = {
    id : Text;
    name : Text;
    responsibility : Text;
    capabilities : [Text];
    constraints : [Text];
    doesNotOwn : [Text];
    lifecycleState : Text;
    assignment : Text;
    consumesCanonicalContinuity : Bool;
    hasIndependentIdentity : Bool;
    hasIndependentMemoryStore : Bool;
  };

  public type DeferredIntegrationTarget = {
    id : Text;
    name : Text;
    purpose : Text;
    builtByRoles : [Text];
    lifecycleState : Text;
    phase91SelectableRole : Bool;
    executionEnabled : Bool;
    requiresSeparateContract : Bool;
  };

  public type ContractDependency = {
    id : Text;
    phase : Text;
    name : Text;
    obligation : Text;
  };

  public type RoleArtifactContract = {
    kind : Text;
    producedBy : Text;
    consumedBy : [Text];
    operatorApprovalRequired : Bool;
    canonicalMemoryWriteAllowed : Bool;
    phase91ExecutionEnabled : Bool;
    requiredFields : [Text];
  };

  public type RoleContextBudgetProfile = {
    roleId : Text;
    profileName : Text;
    maxContextChars : Nat;
    continuityScope : Text;
    allowedContext : [Text];
    excludedContext : [Text];
    requiresCanonicalContinuityRef : Bool;
    preparedByAionLayerRequired : Bool;
  };

  public type OperatorSurfaceBoundary = {
    adminHtmlPurpose : Text;
    operatorHtmlPurpose : Text;
    adminHtmlRemainsGovernanceConsole : Bool;
    operatorHtmlExpectedForPhase9 : Bool;
    operatorHtmlBuiltInPhase91 : Bool;
    sharedOperatorSessionBoundaryRequired : Bool;
    publicAionSurfaceChanged : Bool;
  };

  public type AcceptanceCheck = {
    id : Text;
    category : Text;
    requirement : Text;
    satisfied : Bool;
    evidence : Text;
  };

  public type RoleResultContract = {
    resultVersion : Text;
    requiredFields : [Text];
    prohibitedClaims : [Text];
    evidenceAndProvenanceRequired : Bool;
    operatorApprovalStateRequired : Bool;
    providerRouteDisclosureRequired : Bool;
    canonicalMemoryWriteAllowed : Bool;
    productionActionAllowed : Bool;
    phase91LiveOutputAllowed : Bool;
  };

  public type RoleRequestContract = {
    requestVersion : Text;
    requiredFields : [Text];
    requiredContextFields : [Text];
    prohibitedInputs : [Text];
    supportedRoles : [Text];
    trustedContextPreparer : Text;
    operatorApprovalRequiredForConsequentialTransitions : Bool;
    providerNeutral : Bool;
    failClosedOnMalformedRequest : Bool;
  };

  public type FailClosedRule = {
    category : Text;
    trigger : Text;
    requiredBehavior : Text;
    operatorRecoverable : Bool;
  };

  public type RolePolicy = {
    policyVersion : Text;
    oneCanonicalIdentityRequired : Bool;
    oneCanonicalContinuityRequired : Bool;
    governedMemoryOnly : Bool;
    humanAuthorityRequired : Bool;
    executionModelIndependent : Bool;
    providerPolicySeparated : Bool;
    failClosedRequired : Bool;
    hiddenRoleChainingAllowed : Bool;
    autonomousToolExecutionAllowed : Bool;
    liveInferenceAllowed : Bool;
    roleDrivenMemoryWritesAllowed : Bool;
    publicBehaviorChangesAllowed : Bool;
    oracleIntegrationTargetExecutionEnabled : Bool;
  };

  public type ContextPacketPreview = {
    packetVersion : Text;
    canonicalContinuityRef : Text;
    preparedByAionLayer : Text;
    approvalState : Text;
    prohibitedActions : [Text];
    outputExpectations : [Text];
    separateRoleContinuityRequested : Bool;
    rolePrivateMemoryRequested : Bool;
    providerSpecificRoutingIncluded : Bool;
  };

  public type RoleTransition = {
    transitionKind : Text;
    fromRole : ?Text;
    toRole : ?Text;
    approvalState : Text;
    operatorApprovalRequired : Bool;
    operatorApproved : Bool;
    supportedInPhase91 : Bool;
  };

  public type Report = {
    foundationVersion : Text;
    phaseName : Text;
    architecturalSubject : Text;
    contractDependencies : [ContractDependency];
    roles : [RoleDefinition];
    deferredIntegrationTargets : [DeferredIntegrationTarget];
    artifactContracts : [RoleArtifactContract];
    contextBudgetProfiles : [RoleContextBudgetProfile];
    surfaceBoundary : OperatorSurfaceBoundary;
    acceptanceChecklist : [AcceptanceCheck];
    requestContract : RoleRequestContract;
    resultContract : RoleResultContract;
    failClosedRules : [FailClosedRule];
    policy : RolePolicy;
    transitionModel : [RoleTransition];
    contextPacketPreview : ContextPacketPreview;
    lifecycleSummary : Text;
    readOnly : Bool;
    providerCallsEnabled : Bool;
    roleDrivenMemoryWritesEnabled : Bool;
    autonomousExecutionEnabled : Bool;
    publicBehaviorChanged : Bool;
    nonOperatorSurfaceAllowed : Bool;
    nextMilestone : Text;
  };

  func role(
    id : Text,
    name : Text,
    responsibility : Text,
    capabilities : [Text],
    constraints : [Text],
    doesNotOwn : [Text],
    lifecycleState : Text,
    assignment : Text,
  ) : RoleDefinition {
    {
      id;
      name;
      responsibility;
      capabilities;
      constraints;
      doesNotOwn;
      lifecycleState;
      assignment;
      consumesCanonicalContinuity = true;
      hasIndependentIdentity = false;
      hasIndependentMemoryStore = false;
    };
  };

  public func roles() : [RoleDefinition] {
    [
      role(
        "prime",
        "Prime",
        "Synthesis, prioritization, coordination, and final proposed direction.",
        [
          "interpret operator objectives",
          "restore relevant continuity context",
          "synthesize priorities",
          "recommend next steps",
          "propose role handoffs",
        ],
        [
          "must preserve operator authority",
          "must not self-approve consequential action",
          "must not mutate canonical memory",
          "must not choose provider routes",
        ],
        [
          "operator authority",
          "canonical memory mutation",
          "production deployment",
          "provider routing",
        ],
        "available",
        "default",
      ),
      role(
        "mirror",
        "Mirror",
        "Reflection, critique, contradiction detection, assumptions, omissions, and alternatives.",
        [
          "challenge Prime reasoning",
          "identify unsupported assumptions",
          "surface contradictions",
          "evaluate risks and tradeoffs",
          "present credible alternatives",
        ],
        [
          "must remain advisory",
          "must not own final direction",
          "must not become an execution authority",
          "must not mutate canonical memory",
        ],
        [
          "final direction",
          "operator authority",
          "canonical memory mutation",
          "production deployment",
        ],
        "available",
        "advisory",
      ),
      role(
        "engineer",
        "Engineer",
        "Implementation reasoning, technical feasibility, sequencing, tests, dependencies, and operational constraints.",
        [
          "translate approved direction into technical plans",
          "inspect repository and architecture evidence",
          "identify implementation options",
          "define validation requirements",
          "report engineering evidence",
        ],
        [
          "must require approved direction",
          "must not self-approve implementation",
          "must not deploy production changes",
          "must not alter architectural policy",
        ],
        [
          "approval of its own implementation plan",
          "production changes",
          "architectural policy changes",
          "provider routing",
        ],
        "available",
        "implementation_only",
      ),
    ];
  };

  public func deferredIntegrationTargets() : [DeferredIntegrationTarget] {
    [
      {
        id = "oracle";
        name = "Oracle";
        purpose = "Deferred research and evidence system to be designed, challenged, and built by Prime, Mirror, and Engineer.";
        builtByRoles = ["prime", "mirror", "engineer"];
        lifecycleState = "deferred_integration_project";
        phase91SelectableRole = false;
        executionEnabled = false;
        requiresSeparateContract = true;
      },
    ];
  };

  public func contractDependencies() : [ContractDependency] {
    [
      {
        id = "phase-7-native-continuity-authority";
        phase = "7";
        name = "Native caller-scoped continuity";
        obligation = "Role context must consume prepared canonical continuity and must not recreate memory selection or Python fallback.";
      },
      {
        id = "phase-7-operator-admin-security";
        phase = "7";
        name = "Backend-enforced operator/Admin boundary";
        obligation = "Role diagnostics and future controls must use the existing operator session/grant boundary.";
      },
      {
        id = "phase-8-certified-provider-policy";
        phase = "8";
        name = "Provider policy separation";
        obligation = "Role policy cannot choose provider routes, enable fallback, or mutate the production default.";
      },
      {
        id = "phase-8-deterministic-rollback";
        phase = "8";
        name = "Deterministic rollback and candidate limits";
        obligation = "Any future live role execution must remain bounded, observable, operator-approved, and reversible to OpenAI baseline.";
      },
    ];
  };

  public func artifactContracts() : [RoleArtifactContract] {
    [
      {
        kind = "prime_planning_packet";
        producedBy = "prime";
        consumedBy = ["mirror", "engineer"];
        operatorApprovalRequired = true;
        canonicalMemoryWriteAllowed = false;
        phase91ExecutionEnabled = false;
        requiredFields = ["objective", "scope", "constraints", "evidence", "risks", "recommended_next_step", "approval_state"];
      },
      {
        kind = "mirror_review_packet";
        producedBy = "mirror";
        consumedBy = ["prime", "engineer"];
        operatorApprovalRequired = true;
        canonicalMemoryWriteAllowed = false;
        phase91ExecutionEnabled = false;
        requiredFields = ["reviewed_plan_ref", "assumptions", "contradictions", "risks", "alternatives", "confidence", "approval_state"];
      },
      {
        kind = "engineer_implementation_packet";
        producedBy = "engineer";
        consumedBy = ["prime"];
        operatorApprovalRequired = true;
        canonicalMemoryWriteAllowed = false;
        phase91ExecutionEnabled = false;
        requiredFields = ["approved_task_ref", "files_or_modules", "implementation_plan", "validation_plan", "rollback_notes", "approval_state"];
      },
      {
        kind = "prime_completion_packet";
        producedBy = "prime";
        consumedBy = ["mirror", "engineer"];
        operatorApprovalRequired = true;
        canonicalMemoryWriteAllowed = false;
        phase91ExecutionEnabled = false;
        requiredFields = ["completed_work_ref", "decisions", "evidence", "unresolved_questions", "proposed_continuity_updates", "approval_state"];
      },
    ];
  };

  public func contextBudgetProfiles() : [RoleContextBudgetProfile] {
    [
      {
        roleId = "prime";
        profileName = "broad_strategic_preview";
        maxContextChars = 6000;
        continuityScope = "broader operator objective and project-state synthesis";
        allowedContext = ["canonical continuity preview", "approved project state", "operator objective", "prior approved role outputs"];
        excludedContext = ["role-private memory", "provider routing fields", "unapproved memory writes", "public behavior changes"];
        requiresCanonicalContinuityRef = true;
        preparedByAionLayerRequired = true;
      },
      {
        roleId = "mirror";
        profileName = "bounded_critique_preview";
        maxContextChars = 4500;
        continuityScope = "approved plan, evidence, assumptions, constraints, and risks";
        allowedContext = ["approved Prime packet", "supporting evidence", "constraints", "known risks"];
        excludedContext = ["unbounded memory dump", "role-private memory", "provider routing fields", "implementation authority"];
        requiresCanonicalContinuityRef = true;
        preparedByAionLayerRequired = true;
      },
      {
        roleId = "engineer";
        profileName = "task_specific_technical_preview";
        maxContextChars = 5000;
        continuityScope = "approved task packet, technical state, constraints, and validation expectations";
        allowedContext = ["approved Prime packet", "approved Mirror review", "technical state", "validation requirements"];
        excludedContext = ["business priority authority", "self-approval", "provider routing fields", "canonical memory mutation"];
        requiresCanonicalContinuityRef = true;
        preparedByAionLayerRequired = true;
      },
    ];
  };

  public func surfaceBoundary() : OperatorSurfaceBoundary {
    {
      adminHtmlPurpose = "System governance, diagnostics, policy, and operator/Admin status.";
      operatorHtmlPurpose = "Future private daily workspace for Prime, Mirror, and Engineer workflows.";
      adminHtmlRemainsGovernanceConsole = true;
      operatorHtmlExpectedForPhase9 = true;
      operatorHtmlBuiltInPhase91 = false;
      sharedOperatorSessionBoundaryRequired = true;
      publicAionSurfaceChanged = false;
    };
  };

  public func acceptanceChecklist() : [AcceptanceCheck] {
    [
      {
        id = "one-aion-identity";
        category = "identity";
        requirement = "Prime, Mirror, and Engineer must not create separate identities.";
        satisfied = true;
        evidence = "All role definitions set hasIndependentIdentity=false.";
      },
      {
        id = "canonical-continuity-only";
        category = "continuity";
        requirement = "Roles must consume canonical Aion continuity through bounded views.";
        satisfied = true;
        evidence = "Role definitions consume canonical continuity and context packets require canonicalContinuityRef.";
      },
      {
        id = "no-role-private-memory";
        category = "memory";
        requirement = "Roles must not create independent memory stores or write canonical memory in 9.1.";
        satisfied = true;
        evidence = "Role definitions set hasIndependentMemoryStore=false; roleDrivenMemoryWritesAllowed=false; artifact contracts disallow memory writes.";
      },
      {
        id = "operator-authority-preserved";
        category = "authority";
        requirement = "Consequential transitions must require explicit operator approval.";
        satisfied = true;
        evidence = "Prime-to-Mirror, Mirror-to-Engineer, and Engineer-to-action transitions require operator approval.";
      },
      {
        id = "provider-policy-separated";
        category = "provider";
        requirement = "Role policy must not choose provider routes or alter production defaults.";
        satisfied = true;
        evidence = "providerPolicySeparated=true; provider route change requests fail closed; Phase 8 provider policy remains the routing authority.";
      },
      {
        id = "read-only-foundation";
        category = "execution";
        requirement = "Phase 9.1 must remain local, mock-only, or read-only.";
        satisfied = true;
        evidence = "providerCallsEnabled=false, liveInferenceAllowed=false, autonomousExecutionEnabled=false, and tool execution requests fail closed.";
      },
      {
        id = "public-surface-unchanged";
        category = "public_surface";
        requirement = "Phase 9.1 must not change public Aion behavior.";
        satisfied = true;
        evidence = "publicBehaviorChanged=false and publicBehaviorChangesAllowed=false.";
      },
      {
        id = "oracle-deferred-target";
        category = "scope";
        requirement = "Oracle must not be selectable as a Phase 9.1 operational role.";
        satisfied = true;
        evidence = "Oracle is represented only as a deferred integration target with phase91SelectableRole=false and executionEnabled=false.";
      },
      {
        id = "operator-surface-deferred";
        category = "surface";
        requirement = "operator.html may be expected for Phase 9 but must not be built as part of 9.1.";
        satisfied = true;
        evidence = "surfaceBoundary.operatorHtmlExpectedForPhase9=true and operatorHtmlBuiltInPhase91=false.";
      },
    ];
  };

  public func resultContract() : RoleResultContract {
    {
      resultVersion = "aion-role-result-phase-9-1-preview-v1";
      requiredFields = [
        "roleId",
        "accepted",
        "executionState",
        "approvalState",
        "failureCategory",
        "rejectionReason",
        "diagnostics",
        "canonicalContinuityPreserved",
        "oneAionIdentityPreserved",
      ];
      prohibitedClaims = [
        "provider call completed",
        "memory write completed",
        "tool execution completed",
        "production deployment completed",
        "public behavior changed",
        "Oracle behavior executed",
      ];
      evidenceAndProvenanceRequired = true;
      operatorApprovalStateRequired = true;
      providerRouteDisclosureRequired = true;
      canonicalMemoryWriteAllowed = false;
      productionActionAllowed = false;
      phase91LiveOutputAllowed = false;
    };
  };

  public func requestContract() : RoleRequestContract {
    {
      requestVersion = "aion-role-request-phase-9-1-preview-v1";
      requiredFields = [
        "roleId",
        "context",
        "transition",
        "liveInferenceRequested",
        "memoryWriteRequested",
        "toolExecutionRequested",
        "publicBehaviorChangeRequested",
        "providerRouteChangeRequested",
      ];
      requiredContextFields = [
        "canonicalContinuityRef",
        "preparedByAionLayer",
        "currentOperatorObjective",
        "approvalState",
        "prohibitedActions",
        "outputExpectations",
      ];
      prohibitedInputs = [
        "separate role continuity",
        "role-private memory",
        "provider-specific routing",
        "live inference",
        "memory write",
        "tool execution",
        "public behavior change",
      ];
      supportedRoles = ["prime", "mirror", "engineer"];
      trustedContextPreparer = "aion-continuity-and-governance";
      operatorApprovalRequiredForConsequentialTransitions = true;
      providerNeutral = true;
      failClosedOnMalformedRequest = true;
    };
  };

  public func failClosedRules() : [FailClosedRule] {
    [
      {
        category = "role_not_available";
        trigger = "Requested role is not available as a Phase 9.1 operational role.";
        requiredBehavior = "Reject request before any provider call, memory write, or tool execution.";
        operatorRecoverable = true;
      },
      {
        category = "integration_target_not_role";
        trigger = "Oracle or another integration target is requested as an operational role.";
        requiredBehavior = "Reject request and preserve target as deferred project scope.";
        operatorRecoverable = true;
      },
      {
        category = "missing_canonical_continuity";
        trigger = "Context omits canonical continuity reference or canonical shared context.";
        requiredBehavior = "Reject request before role preview.";
        operatorRecoverable = true;
      },
      {
        category = "untrusted_context_preparer";
        trigger = "Context packet was not prepared by the Aion continuity and governance layer.";
        requiredBehavior = "Reject request to prevent role-owned continuity selection.";
        operatorRecoverable = true;
      },
      {
        category = "separate_role_continuity_requested";
        trigger = "Request asks for separate role continuity.";
        requiredBehavior = "Reject request and preserve one canonical continuity.";
        operatorRecoverable = true;
      },
      {
        category = "role_private_memory_requested";
        trigger = "Request asks for role-private memory.";
        requiredBehavior = "Reject request and preserve one governed memory system.";
        operatorRecoverable = true;
      },
      {
        category = "live_inference_requested";
        trigger = "Request asks for live role inference during 9.1.";
        requiredBehavior = "Reject request because 9.1 is read-only/mock-only.";
        operatorRecoverable = true;
      },
      {
        category = "memory_write_requested";
        trigger = "Request asks for role-driven memory write.";
        requiredBehavior = "Reject request and require existing governed memory process.";
        operatorRecoverable = true;
      },
      {
        category = "tool_execution_requested";
        trigger = "Request asks for autonomous tool execution.";
        requiredBehavior = "Reject request and require explicit operator-approved execution outside 9.1.";
        operatorRecoverable = true;
      },
      {
        category = "public_behavior_change_requested";
        trigger = "Request asks to change public Aion behavior.";
        requiredBehavior = "Reject request and preserve public surface.";
        operatorRecoverable = true;
      },
      {
        category = "provider_route_change_requested";
        trigger = "Request or context includes provider routing changes.";
        requiredBehavior = "Reject request and preserve Phase 8 provider policy authority.";
        operatorRecoverable = true;
      },
      {
        category = "unsupported_transition";
        trigger = "Transition is not supported by Phase 9.1.";
        requiredBehavior = "Reject request before role preview.";
        operatorRecoverable = true;
      },
      {
        category = "transition_role_mismatch";
        trigger = "Requested role does not match transition target or source.";
        requiredBehavior = "Reject request before role preview.";
        operatorRecoverable = true;
      },
      {
        category = "missing_operator_approval";
        trigger = "Consequential transition lacks explicit operator approval.";
        requiredBehavior = "Reject request until operator approval is present.";
        operatorRecoverable = true;
      },
    ];
  };

  public func policy() : RolePolicy {
    {
      policyVersion = foundationVersion;
      oneCanonicalIdentityRequired = true;
      oneCanonicalContinuityRequired = true;
      governedMemoryOnly = true;
      humanAuthorityRequired = true;
      executionModelIndependent = true;
      providerPolicySeparated = true;
      failClosedRequired = true;
      hiddenRoleChainingAllowed = false;
      autonomousToolExecutionAllowed = false;
      liveInferenceAllowed = false;
      roleDrivenMemoryWritesAllowed = false;
      publicBehaviorChangesAllowed = false;
      oracleIntegrationTargetExecutionEnabled = false;
    };
  };

  public func contextPacketPreview() : ContextPacketPreview {
    {
      packetVersion = "aion-role-context-packet-phase-9-1-preview-v1";
      canonicalContinuityRef = "canonical-aion-continuity";
      preparedByAionLayer = "aion-continuity-and-governance";
      approvalState = "operator_review_required";
      prohibitedActions = [
        "provider calls",
        "memory writes",
        "tool execution",
        "public behavior changes",
        "production deployment",
        "provider routing changes",
      ];
      outputExpectations = [
        "read-only role status",
        "bounded role responsibility",
        "explicit approval state",
        "fail-closed diagnostics",
      ];
      separateRoleContinuityRequested = false;
      rolePrivateMemoryRequested = false;
      providerSpecificRoutingIncluded = false;
    };
  };

  public func transitionModel() : [RoleTransition] {
    [
      {
        transitionKind = "objective_to_prime";
        fromRole = null;
        toRole = ?"prime";
        approvalState = "operator_approved";
        operatorApprovalRequired = false;
        operatorApproved = true;
        supportedInPhase91 = true;
      },
      {
        transitionKind = "prime_to_mirror";
        fromRole = ?"prime";
        toRole = ?"mirror";
        approvalState = "operator_review_required";
        operatorApprovalRequired = true;
        operatorApproved = false;
        supportedInPhase91 = true;
      },
      {
        transitionKind = "mirror_to_engineer";
        fromRole = ?"mirror";
        toRole = ?"engineer";
        approvalState = "operator_review_required";
        operatorApprovalRequired = true;
        operatorApproved = false;
        supportedInPhase91 = true;
      },
      {
        transitionKind = "engineer_to_approved_action";
        fromRole = ?"engineer";
        toRole = null;
        approvalState = "operator_review_required";
        operatorApprovalRequired = true;
        operatorApproved = false;
        supportedInPhase91 = true;
      },
    ];
  };

  public func report() : Report {
    {
      foundationVersion;
      phaseName;
      architecturalSubject;
      contractDependencies = contractDependencies();
      roles = roles();
      deferredIntegrationTargets = deferredIntegrationTargets();
      artifactContracts = artifactContracts();
      contextBudgetProfiles = contextBudgetProfiles();
      surfaceBoundary = surfaceBoundary();
      acceptanceChecklist = acceptanceChecklist();
      requestContract = requestContract();
      resultContract = resultContract();
      failClosedRules = failClosedRules();
      policy = policy();
      transitionModel = transitionModel();
      contextPacketPreview = contextPacketPreview();
      lifecycleSummary = "Prime, Mirror, and Engineer are bounded operational roles; Oracle is preserved as a deferred integration project they may later build under a separate contract.";
      readOnly = true;
      providerCallsEnabled = false;
      roleDrivenMemoryWritesEnabled = false;
      autonomousExecutionEnabled = false;
      publicBehaviorChanged = false;
      nonOperatorSurfaceAllowed = false;
      nextMilestone = "9.2_roles_and_rules_in_product";
    };
  };
};
