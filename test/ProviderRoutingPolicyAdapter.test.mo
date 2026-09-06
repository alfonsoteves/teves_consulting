import ProviderRoutingPolicyAdapter "../src/teves_consulting_backend/lib/ProviderRoutingPolicyAdapter";

let publicAnswer = ProviderRoutingPolicyAdapter.select(#publicAnswer);
assert publicAnswer.providerId == "openai";
assert publicAnswer.routeId == "openai-production-baseline";
assert publicAnswer.invocationPermitted;
assert not publicAnswer.explicitOperatorAction;
assert not publicAnswer.promotionRequired;
assert not publicAnswer.automaticFallback;

let candidate = ProviderRoutingPolicyAdapter.select(#adminCandidateEvaluation);
assert candidate.providerId == "icp-llm";
assert candidate.routeId == "icp-admin-candidate";
assert candidate.invocationPermitted;
assert candidate.explicitOperatorAction;
assert candidate.promotionRequired;
assert not candidate.automaticFallback;

let preview = ProviderRoutingPolicyAdapter.select(#nativeContinuityPreview);
assert preview.providerId == "none";
assert preview.routeId == "native-continuity-preview";
assert not preview.invocationPermitted;
assert not preview.explicitOperatorAction;
assert not preview.promotionRequired;
assert not preview.automaticFallback;
