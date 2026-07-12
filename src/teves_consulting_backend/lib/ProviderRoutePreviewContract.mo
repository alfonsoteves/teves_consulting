module {
  public type Operation = {
    #publicAnswer;
    #adminCandidateEvaluation;
    #nativeContinuityPreview;
  };

  public type Response = {
    operation : Operation;
    providerId : Text;
    routeId : Text;
    invocationPermitted : Bool;
    explicitOperatorAction : Bool;
    promotionRequired : Bool;
    automaticFallback : Bool;
  };
};
