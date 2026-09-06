import RoleStatus "../src/teves_consulting_backend/lib/RoleBasedIntelligenceStatus";

let report = RoleStatus.report();
assert report.foundationVersion == "aion-role-based-intelligence-phase-9-1-foundation-v1";
assert report.phaseName == "Phase 9: Role-Based Intelligence";
assert report.architecturalSubject == "One Aion. One canonical continuity. Multiple operational roles.";
assert report.roles.size() == 3;
assert report.deferredIntegrationTargets.size() == 1;
assert report.contractDependencies.size() == 4;
assert report.artifactContracts.size() == 4;
assert report.contextBudgetProfiles.size() == 3;
assert report.acceptanceChecklist.size() == 9;
assert report.transitionModel.size() == 4;
assert report.readOnly;
assert not report.providerCallsEnabled;
assert not report.roleDrivenMemoryWritesEnabled;
assert not report.autonomousExecutionEnabled;
assert not report.publicBehaviorChanged;
assert not report.nonOperatorSurfaceAllowed;

let prime = report.roles[0];
assert prime.id == "prime";
assert prime.name == "Prime";
assert prime.lifecycleState == "available";
assert prime.assignment == "default";
assert prime.capabilities.size() == 5;
assert prime.constraints.size() == 4;
assert prime.consumesCanonicalContinuity;
assert not prime.hasIndependentIdentity;
assert not prime.hasIndependentMemoryStore;

let mirror = report.roles[1];
assert mirror.id == "mirror";
assert mirror.lifecycleState == "available";
assert mirror.assignment == "advisory";
assert mirror.capabilities[0] == "challenge Prime reasoning";
assert mirror.constraints[0] == "must remain advisory";
assert mirror.consumesCanonicalContinuity;
assert not mirror.hasIndependentIdentity;
assert not mirror.hasIndependentMemoryStore;

let engineer = report.roles[2];
assert engineer.id == "engineer";
assert engineer.lifecycleState == "available";
assert engineer.assignment == "implementation_only";
assert engineer.capabilities[0] == "translate approved direction into technical plans";
assert engineer.constraints[1] == "must not self-approve implementation";
assert engineer.consumesCanonicalContinuity;
assert not engineer.hasIndependentIdentity;
assert not engineer.hasIndependentMemoryStore;

let oracleTarget = report.deferredIntegrationTargets[0];
assert oracleTarget.id == "oracle";
assert oracleTarget.name == "Oracle";
assert oracleTarget.lifecycleState == "deferred_integration_project";
assert oracleTarget.builtByRoles.size() == 3;
assert oracleTarget.builtByRoles[0] == "prime";
assert oracleTarget.builtByRoles[1] == "mirror";
assert oracleTarget.builtByRoles[2] == "engineer";
assert not oracleTarget.phase91SelectableRole;
assert not oracleTarget.executionEnabled;
assert oracleTarget.requiresSeparateContract;

assert report.contractDependencies[0].id == "phase-7-native-continuity-authority";
assert report.contractDependencies[2].id == "phase-8-certified-provider-policy";

let primeArtifact = report.artifactContracts[0];
assert primeArtifact.kind == "prime_planning_packet";
assert primeArtifact.producedBy == "prime";
assert primeArtifact.consumedBy.size() == 2;
assert primeArtifact.operatorApprovalRequired;
assert not primeArtifact.canonicalMemoryWriteAllowed;
assert not primeArtifact.phase91ExecutionEnabled;
assert primeArtifact.requiredFields.size() == 7;

let engineerBudget = report.contextBudgetProfiles[2];
assert engineerBudget.roleId == "engineer";
assert engineerBudget.profileName == "task_specific_technical_preview";
assert engineerBudget.maxContextChars == 5000;
assert engineerBudget.requiresCanonicalContinuityRef;
assert engineerBudget.preparedByAionLayerRequired;

assert report.surfaceBoundary.adminHtmlRemainsGovernanceConsole;
assert report.surfaceBoundary.operatorHtmlExpectedForPhase9;
assert not report.surfaceBoundary.operatorHtmlBuiltInPhase91;
assert report.surfaceBoundary.sharedOperatorSessionBoundaryRequired;
assert not report.surfaceBoundary.publicAionSurfaceChanged;

assert report.acceptanceChecklist[0].id == "one-aion-identity";
assert report.acceptanceChecklist[0].satisfied;
assert report.acceptanceChecklist[4].id == "provider-policy-separated";
assert report.acceptanceChecklist[4].satisfied;
assert report.acceptanceChecklist[7].id == "oracle-deferred-target";
assert report.acceptanceChecklist[7].satisfied;

assert report.requestContract.requestVersion == "aion-role-request-phase-9-1-preview-v1";
assert report.requestContract.requiredFields.size() == 8;
assert report.requestContract.requiredContextFields.size() == 6;
assert report.requestContract.prohibitedInputs.size() == 7;
assert report.requestContract.supportedRoles.size() == 3;
assert report.requestContract.supportedRoles[0] == "prime";
assert report.requestContract.trustedContextPreparer == "aion-continuity-and-governance";
assert report.requestContract.operatorApprovalRequiredForConsequentialTransitions;
assert report.requestContract.providerNeutral;
assert report.requestContract.failClosedOnMalformedRequest;

assert report.resultContract.resultVersion == "aion-role-result-phase-9-1-preview-v1";
assert report.resultContract.requiredFields.size() == 9;
assert report.resultContract.prohibitedClaims.size() == 6;
assert report.resultContract.evidenceAndProvenanceRequired;
assert report.resultContract.operatorApprovalStateRequired;
assert report.resultContract.providerRouteDisclosureRequired;
assert not report.resultContract.canonicalMemoryWriteAllowed;
assert not report.resultContract.productionActionAllowed;
assert not report.resultContract.phase91LiveOutputAllowed;

assert report.failClosedRules.size() == 14;
assert report.failClosedRules[3].category == "untrusted_context_preparer";
assert report.failClosedRules[10].category == "provider_route_change_requested";
assert report.failClosedRules[13].category == "missing_operator_approval";
assert report.failClosedRules[13].operatorRecoverable;

assert report.policy.oneCanonicalIdentityRequired;
assert report.policy.oneCanonicalContinuityRequired;
assert report.policy.governedMemoryOnly;
assert report.policy.humanAuthorityRequired;
assert report.policy.executionModelIndependent;
assert report.policy.providerPolicySeparated;
assert report.policy.failClosedRequired;
assert not report.policy.hiddenRoleChainingAllowed;
assert not report.policy.autonomousToolExecutionAllowed;
assert not report.policy.liveInferenceAllowed;
assert not report.policy.roleDrivenMemoryWritesAllowed;
assert not report.policy.publicBehaviorChangesAllowed;
assert not report.policy.oracleIntegrationTargetExecutionEnabled;

let transitions = report.transitionModel;
assert transitions[0].transitionKind == "objective_to_prime";
assert transitions[0].fromRole == null;
assert transitions[0].toRole == ?"prime";
assert transitions[0].operatorApproved;
assert transitions[0].supportedInPhase91;
assert transitions[1].transitionKind == "prime_to_mirror";
assert transitions[1].fromRole == ?"prime";
assert transitions[1].toRole == ?"mirror";
assert transitions[1].operatorApprovalRequired;
assert not transitions[1].operatorApproved;
assert transitions[1].approvalState == "operator_review_required";
assert transitions[2].transitionKind == "mirror_to_engineer";
assert transitions[2].supportedInPhase91;
assert transitions[3].transitionKind == "engineer_to_approved_action";
assert transitions[3].operatorApprovalRequired;
assert transitions[3].supportedInPhase91;

assert report.contextPacketPreview.canonicalContinuityRef == "canonical-aion-continuity";
assert report.contextPacketPreview.approvalState == "operator_review_required";
assert not report.contextPacketPreview.separateRoleContinuityRequested;
assert not report.contextPacketPreview.rolePrivateMemoryRequested;
assert not report.contextPacketPreview.providerSpecificRoutingIncluded;
