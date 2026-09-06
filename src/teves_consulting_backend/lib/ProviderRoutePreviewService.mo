import ProviderRoutePreviewContract "ProviderRoutePreviewContract";
import ProviderRoutingPolicyAdapter "ProviderRoutingPolicyAdapter";

module {
  func toAdapterOperation(
    operation : ProviderRoutePreviewContract.Operation
  ) : ProviderRoutingPolicyAdapter.Operation {
    switch (operation) {
      case (#publicAnswer) { #publicAnswer };
      case (#adminCandidateEvaluation) { #adminCandidateEvaluation };
      case (#nativeContinuityPreview) { #nativeContinuityPreview };
    };
  };

  public func preview(
    operation : ProviderRoutePreviewContract.Operation
  ) : ProviderRoutePreviewContract.Response {
    let decision = ProviderRoutingPolicyAdapter.select(toAdapterOperation(operation));

    {
      operation;
      providerId = decision.providerId;
      routeId = decision.routeId;
      invocationPermitted = decision.invocationPermitted;
      explicitOperatorAction = decision.explicitOperatorAction;
      promotionRequired = decision.promotionRequired;
      automaticFallback = decision.automaticFallback;
    };
  };
};
