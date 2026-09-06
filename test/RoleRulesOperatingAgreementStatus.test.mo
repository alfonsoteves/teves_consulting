import Rules "../src/teves_consulting_backend/lib/RoleRulesOperatingAgreementStatus";

let report = Rules.report();
assert report.agreementVersion == Rules.agreementVersion;
assert report.milestone == "Phase 9.2: Roles and Rules in Product";
assert report.rolePolicyQuestion == "What reasoning responsibility is needed?";
assert report.providerPolicyQuestion == "Which execution route performs it?";
assert report.roles.size() == 3;
assert report.rules.size() == 8;
assert report.transitionRules.size() == 4;
assert report.outputInfluenceRules.size() == 3;
assert report.surfaceRules.size() == 2;
assert report.acceptanceChecklist.size() == 5;
assert report.readOnly;
assert not report.liveInferenceEnabled;
assert not report.consequentialActionsEnabled;
assert not report.publicBehaviorChanged;

let prime = report.roles[0];
assert prime.roleId == "prime";
assert prime.owns[0] == "direction synthesis";
assert prime.doesNotOwn[0] == "operator authority";

let providerRule = report.rules[2];
assert providerRule.id == "role-policy-provider-policy-separation";
assert providerRule.category == "provider_policy";
assert providerRule.operatorVisible;
assert providerRule.severity == "blocking";

let transitionRule = report.transitionRules[1];
assert transitionRule.transition == "prime_to_mirror";
assert transitionRule.operatorApprovalRequired;
assert not transitionRule.autonomousRoleTransferAllowed;
assert transitionRule.failClosedWithoutApproval;

let operatorSurface = report.surfaceRules[1];
assert operatorSurface.surfaceId == "operator.html";
assert operatorSurface.operatorSessionRequired;
assert not operatorSurface.publicSurfaceAllowed;
assert not operatorSurface.consequentialActionsAllowed;
