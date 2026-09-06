import ProviderRoutePreviewService "../src/teves_consulting_backend/lib/ProviderRoutePreviewService";

let publicAnswer = ProviderRoutePreviewService.preview(#publicAnswer);
assert publicAnswer.operation == #publicAnswer;
assert publicAnswer.providerId == "openai";
assert publicAnswer.routeId == "openai-production-baseline";
assert publicAnswer.invocationPermitted;
assert not publicAnswer.explicitOperatorAction;
assert not publicAnswer.promotionRequired;
assert not publicAnswer.automaticFallback;

let candidate = ProviderRoutePreviewService.preview(#adminCandidateEvaluation);
assert candidate.operation == #adminCandidateEvaluation;
assert candidate.providerId == "icp-llm";
assert candidate.routeId == "icp-admin-candidate";
assert candidate.invocationPermitted;
assert candidate.explicitOperatorAction;
assert candidate.promotionRequired;
assert not candidate.automaticFallback;

let nativePreview = ProviderRoutePreviewService.preview(#nativeContinuityPreview);
assert nativePreview.operation == #nativeContinuityPreview;
assert nativePreview.providerId == "none";
assert nativePreview.routeId == "native-continuity-preview";
assert not nativePreview.invocationPermitted;
assert not nativePreview.explicitOperatorAction;
assert not nativePreview.promotionRequired;
assert not nativePreview.automaticFallback;
