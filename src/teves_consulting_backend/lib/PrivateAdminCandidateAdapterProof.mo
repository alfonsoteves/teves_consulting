import AdminCandidateAdapter "mo:aion_intelligence/AdminCandidateAdapter";
import ProviderAdapterContract "mo:aion_intelligence/ProviderAdapterContract";
import ProviderPolicy "mo:aion_intelligence/ProviderPolicy";

module {
  let request : ProviderAdapterContract.AionRequest = {
    queryText = "What is the next bounded step?";
    knowledgeContext = "Use the supplied Aion evidence.";
    continuityContext = null;
    answerRules = "Keep the result concise and non-directive.";
  };

  func candidateHandoff() : ProviderAdapterContract.ProviderHandoff {
    {
      operation = #adminCandidateEvaluation;
      decision = ProviderPolicy.decide(#adminCandidateEvaluation);
      request;
      timeoutMs = 30_000;
    };
  };

  public func authorizesAdminCandidateOnly() : Bool {
    switch (AdminCandidateAdapter.authorize(candidateHandoff())) {
      case (#ok(authorization)) {
        authorization.provider == #icpLlm and authorization.routeId == "icp-admin-candidate" and authorization.explicitOperatorAction and authorization.promotionRequired and not authorization.automaticFallback;
      };
      case (#err(_)) { false };
    };
  };

  public func acceptsNormalizedTimeout() : Bool {
    let timeout : ProviderAdapterContract.ProviderResult = {
      answer = null;
      provider = #icpLlm;
      model = "llama4-scout";
      latencyMs = 30_000;
      normalizedError = ?#timeout;
    };

    AdminCandidateAdapter.acceptsResult(candidateHandoff(), timeout);
  };

  public func blocksPublicAnswer() : Bool {
    let publicHandoff : ProviderAdapterContract.ProviderHandoff = {
      operation = #publicAnswer;
      decision = ProviderPolicy.decide(#publicAnswer);
      request;
      timeoutMs = 30_000;
    };

    switch (AdminCandidateAdapter.authorize(publicHandoff)) {
      case (#err(#operationNotAdminCandidate)) { true };
      case (_) { false };
    };
  };

  public func blocksProviderFreeContinuity() : Bool {
    let continuityHandoff : ProviderAdapterContract.ProviderHandoff = {
      operation = #nativeContinuityPreview;
      decision = ProviderPolicy.decide(#nativeContinuityPreview);
      request;
      timeoutMs = 30_000;
    };

    switch (AdminCandidateAdapter.authorize(continuityHandoff)) {
      case (#err(#operationNotAdminCandidate)) { true };
      case (_) { false };
    };
  };
};
