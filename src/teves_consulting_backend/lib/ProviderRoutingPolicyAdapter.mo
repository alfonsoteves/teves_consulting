import ProviderPolicy "mo:aion_intelligence/ProviderPolicy";

module {
  public type Operation = {
    #publicAnswer;
    #adminCandidateEvaluation;
    #nativeContinuityPreview;
  };

  public type RoutingDecision = {
    operation : Operation;
    providerId : Text;
    routeId : Text;
    invocationPermitted : Bool;
    explicitOperatorAction : Bool;
    promotionRequired : Bool;
    automaticFallback : Bool;
  };

  func toPrivateOperation(operation : Operation) : ProviderPolicy.Operation {
    switch (operation) {
      case (#publicAnswer) { #publicAnswer };
      case (#adminCandidateEvaluation) { #adminCandidateEvaluation };
      case (#nativeContinuityPreview) { #nativeContinuityPreview };
    };
  };

  func providerId(provider : ProviderPolicy.Provider) : Text {
    switch (provider) {
      case (#openai) { "openai" };
      case (#icpLlm) { "icp-llm" };
      case (#none) { "none" };
    };
  };

  public func select(operation : Operation) : RoutingDecision {
    let decision = ProviderPolicy.decide(toPrivateOperation(operation));

    {
      operation;
      providerId = providerId(decision.provider);
      routeId = decision.routeId;
      invocationPermitted = decision.invocationPermitted;
      explicitOperatorAction = decision.explicitOperatorAction;
      promotionRequired = decision.promotionRequired;
      automaticFallback = decision.automaticFallback;
    };
  };
};
