module {
  public let agreementVersion = "aion-role-rules-phase-9-2-operating-agreement-v1";
  public let milestone = "Phase 9.2: Roles and Rules in Product";

  public type RoleSummary = {
    roleId : Text;
    owns : [Text];
    doesNotOwn : [Text];
    receivesContinuity : Text;
    outputMayInfluence : [Text];
    operatorApprovalRequiredBefore : [Text];
  };

  public type RoleRule = {
    id : Text;
    title : Text;
    category : Text;
    appliesTo : [Text];
    requirement : Text;
    enforcement : Text;
    validatorId : Text;
    operatorVisible : Bool;
    severity : Text;
  };

  public type GovernedTransitionRule = {
    transition : Text;
    description : Text;
    operatorApprovalRequired : Bool;
    autonomousRoleTransferAllowed : Bool;
    failClosedWithoutApproval : Bool;
  };

  public type OutputInfluenceRule = {
    artifactKind : Text;
    producedBy : Text;
    mayInfluenceLaterWork : Bool;
    influenceRequiresOperatorReview : Bool;
    canonicalMemoryWriteAllowed : Bool;
    providerRouteChangeAllowed : Bool;
    implementationAuthorizationAllowed : Bool;
  };

  public type SurfaceRule = {
    surfaceId : Text;
    purpose : Text;
    operatorSessionRequired : Bool;
    publicSurfaceAllowed : Bool;
    consequentialActionsAllowed : Bool;
  };

  public type RuleAcceptanceCheck = {
    id : Text;
    requirement : Text;
    satisfied : Bool;
    evidence : Text;
  };

  public type Report = {
    agreementVersion : Text;
    milestone : Text;
    purpose : Text;
    rolePolicyQuestion : Text;
    providerPolicyQuestion : Text;
    roles : [RoleSummary];
    rules : [RoleRule];
    transitionRules : [GovernedTransitionRule];
    outputInfluenceRules : [OutputInfluenceRule];
    surfaceRules : [SurfaceRule];
    acceptanceChecklist : [RuleAcceptanceCheck];
    readOnly : Bool;
    liveInferenceEnabled : Bool;
    consequentialActionsEnabled : Bool;
    publicBehaviorChanged : Bool;
    canonicalContinuityOwner : Text;
    trustedContextPreparer : Text;
    nextMilestone : Text;
  };

  public func roles() : [RoleSummary] {
    [
      {
        roleId = "prime";
        owns = ["direction synthesis", "priority framing", "coordination proposal", "final proposed next step"];
        doesNotOwn = ["operator authority", "provider routing", "canonical memory writes", "production deployment"];
        receivesContinuity = "Broader canonical continuity and approved project state prepared by Aion.";
        outputMayInfluence = ["Mirror critique request", "Engineer implementation packet", "operator decision packet"];
        operatorApprovalRequiredBefore = ["Mirror handoff when consequential", "Engineer handoff", "implementation or external action"];
      },
      {
        roleId = "mirror";
        owns = ["critique", "assumption checks", "contradiction detection", "credible alternatives"];
        doesNotOwn = ["final direction", "implementation authority", "provider routing", "memory mutation"];
        receivesContinuity = "Approved plan, evidence, assumptions, risks, and constraints prepared by Aion.";
        outputMayInfluence = ["Prime revision", "Engineer constraints", "operator reject/revise decision"];
        operatorApprovalRequiredBefore = ["Engineer handoff", "plan revision acceptance", "implementation or external action"];
      },
      {
        roleId = "engineer";
        owns = ["technical feasibility", "implementation sequencing", "validation planning", "rollback planning"];
        doesNotOwn = ["self-approval", "production deployment", "architectural policy changes", "provider routing"];
        receivesContinuity = "Approved task packet, approved critique, technical state, and validation expectations prepared by Aion.";
        outputMayInfluence = ["operator-approved implementation", "Prime completion packet", "validation checklist"];
        operatorApprovalRequiredBefore = ["file changes when delegated", "deployment", "memory update proposal", "public behavior change"];
      },
    ];
  };

  public func rules() : [RoleRule] {
    let allRoles = ["prime", "mirror", "engineer"];
    [
      {
        id = "one-aion-identity";
        title = "Roles are bounded Aion responsibilities";
        category = "identity";
        appliesTo = allRoles;
        requirement = "Prime, Mirror, and Engineer must not claim separate identity or autonomous personhood.";
        enforcement = "Reject any role request or output that represents a role as an independent entity.";
        validatorId = "reject-independent-role-identity";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "canonical-continuity-only";
        title = "Continuity remains canonical";
        category = "continuity";
        appliesTo = allRoles;
        requirement = "Every role must consume a bounded view over canonical Aion continuity.";
        enforcement = "Reject missing canonical continuity, role-private continuity, or untrusted context preparation.";
        validatorId = "require-canonical-continuity";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "role-policy-provider-policy-separation";
        title = "Role policy does not route providers";
        category = "provider_policy";
        appliesTo = allRoles;
        requirement = "Role policy answers what reasoning responsibility is needed; provider policy answers which execution route performs it.";
        enforcement = "Reject provider route change attempts from role requests, context, or outputs.";
        validatorId = "reject-provider-route-mutation";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "operator-approval-boundary";
        title = "Consequential movement requires approval";
        category = "approval";
        appliesTo = allRoles;
        requirement = "Consequential transitions and actions require operator review or approval.";
        enforcement = "Reject Prime-to-Mirror, Mirror-to-Engineer, or Engineer-to-action movement when required approval is missing.";
        validatorId = "require-operator-approval";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "governed-workflow-transitions";
        title = "Transitions are Aion workflow transitions";
        category = "transition";
        appliesTo = allRoles;
        requirement = "Role transitions must be governed Aion workflow state changes, not autonomous role-to-role control transfer.";
        enforcement = "Reject hidden chaining and unsupported transition kinds.";
        validatorId = "reject-autonomous-role-transfer";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "output-influence-is-proposal";
        title = "Role output may influence but not authorize";
        category = "output_influence";
        appliesTo = allRoles;
        requirement = "Role outputs may influence later work only as operator-visible proposals, critiques, or plans.";
        enforcement = "Reject self-approval, memory writes, provider route changes, and implementation authorization claims.";
        validatorId = "require-output-as-proposal";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "private-operator-surface";
        title = "Roles & Rules is private operator product";
        category = "surface";
        appliesTo = allRoles;
        requirement = "Roles & Rules may be inspected only through backend-enforced operator session boundaries.";
        enforcement = "Block unauthenticated operator surfaces and public Aion exposure.";
        validatorId = "require-operator-private-surface";
        operatorVisible = true;
        severity = "blocking";
      },
      {
        id = "phase-9-2-read-only";
        title = "9.2 remains inspection-only";
        category = "scope";
        appliesTo = allRoles;
        requirement = "Phase 9.2 must not perform live inference, consequential actions, memory writes, or public behavior changes.";
        enforcement = "Reject live inference and consequential action requests until a later approved milestone.";
        validatorId = "enforce-phase-9-2-read-only";
        operatorVisible = true;
        severity = "blocking";
      },
    ];
  };

  public func transitionRules() : [GovernedTransitionRule] {
    [
      { transition = "objective_to_prime"; description = "Operator objective enters Prime as a planning responsibility."; operatorApprovalRequired = false; autonomousRoleTransferAllowed = false; failClosedWithoutApproval = false },
      { transition = "prime_to_mirror"; description = "Approved Prime proposal may move to Mirror for critique."; operatorApprovalRequired = true; autonomousRoleTransferAllowed = false; failClosedWithoutApproval = true },
      { transition = "mirror_to_engineer"; description = "Approved critique or revised plan may move to Engineer for implementation reasoning."; operatorApprovalRequired = true; autonomousRoleTransferAllowed = false; failClosedWithoutApproval = true },
      { transition = "engineer_to_approved_action"; description = "Engineer plan may become an approved next action only after operator review."; operatorApprovalRequired = true; autonomousRoleTransferAllowed = false; failClosedWithoutApproval = true },
    ];
  };

  public func outputInfluenceRules() : [OutputInfluenceRule] {
    [
      { artifactKind = "prime_planning_packet"; producedBy = "prime"; mayInfluenceLaterWork = true; influenceRequiresOperatorReview = true; canonicalMemoryWriteAllowed = false; providerRouteChangeAllowed = false; implementationAuthorizationAllowed = false },
      { artifactKind = "mirror_review_packet"; producedBy = "mirror"; mayInfluenceLaterWork = true; influenceRequiresOperatorReview = true; canonicalMemoryWriteAllowed = false; providerRouteChangeAllowed = false; implementationAuthorizationAllowed = false },
      { artifactKind = "engineer_implementation_packet"; producedBy = "engineer"; mayInfluenceLaterWork = true; influenceRequiresOperatorReview = true; canonicalMemoryWriteAllowed = false; providerRouteChangeAllowed = false; implementationAuthorizationAllowed = false },
    ];
  };

  public func surfaceRules() : [SurfaceRule] {
    [
      { surfaceId = "admin.html"; purpose = "Governance, diagnostics, policy comparison, and phase status."; operatorSessionRequired = true; publicSurfaceAllowed = false; consequentialActionsAllowed = false },
      { surfaceId = "operator.html"; purpose = "Private daily Roles & Rules workspace for inspecting role responsibilities and approval boundaries."; operatorSessionRequired = true; publicSurfaceAllowed = false; consequentialActionsAllowed = false },
    ];
  };

  public func acceptanceChecklist() : [RuleAcceptanceCheck] {
    [
      { id = "operator-can-inspect-rules"; requirement = "The operator can inspect role ownership, non-ownership, continuity, approval, and output influence rules."; satisfied = true; evidence = "Operating agreement exposes role summaries, rules, transition rules, output influence rules, and surface rules." },
      { id = "rules-are-typed-and-testable"; requirement = "Rules are represented as typed policies and validators."; satisfied = true; evidence = "Rule validator IDs and deterministic contracts provide fail-closed checks." },
      { id = "provider-policy-separation-preserved"; requirement = "Role policy and provider policy remain separate."; satisfied = true; evidence = "The agreement preserves separate rolePolicyQuestion and providerPolicyQuestion fields and rejects provider route changes." },
      { id = "workflow-transitions-governed"; requirement = "Role transitions are governed Aion workflow transitions."; satisfied = true; evidence = "Transition rules set autonomousRoleTransferAllowed=false and require approval for consequential transitions." },
      { id = "phase-9-2-remains-read-only"; requirement = "9.2 introduces no live inference, memory writes, public behavior changes, or consequential actions."; satisfied = true; evidence = "readOnly=true, liveInferenceEnabled=false, consequentialActionsEnabled=false, publicBehaviorChanged=false." },
    ];
  };

  public func report() : Report {
    {
      agreementVersion = agreementVersion;
      milestone = milestone;
      purpose = "Expose an enforceable operator-visible agreement for Prime, Mirror, and Engineer responsibilities, boundaries, continuity, approval, and output influence.";
      rolePolicyQuestion = "What reasoning responsibility is needed?";
      providerPolicyQuestion = "Which execution route performs it?";
      roles = roles();
      rules = rules();
      transitionRules = transitionRules();
      outputInfluenceRules = outputInfluenceRules();
      surfaceRules = surfaceRules();
      acceptanceChecklist = acceptanceChecklist();
      readOnly = true;
      liveInferenceEnabled = false;
      consequentialActionsEnabled = false;
      publicBehaviorChanged = false;
      canonicalContinuityOwner = "Aion continuity and governance layer";
      trustedContextPreparer = "aion-continuity-and-governance";
      nextMilestone = "Phase 9.3: Grounded Role Context Packets";
    };
  };
}
