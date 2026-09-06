import ProviderAdapterContract "mo:aion_intelligence/ProviderAdapterContract";
import ProviderPolicy "mo:aion_intelligence/ProviderPolicy";

module {
  let request : ProviderAdapterContract.AionRequest = {
    queryText = "How should Aion respond?";
    knowledgeContext = "Grounded Aion knowledge.";
    continuityContext = null;
    answerRules = "Use the Aion answer contract.";
  };

  func publicHandoff() : ProviderAdapterContract.ProviderHandoff {
    {
      operation = #publicAnswer;
      decision = ProviderPolicy.decide(#publicAnswer);
      request;
      timeoutMs = 30_000;
    };
  };

  public func permitsPublicHandoff() : Bool {
    ProviderAdapterContract.validateHandoff(publicHandoff()) == #ok;
  };

  public func acceptsNormalizedTimeout() : Bool {
    let timeoutResult : ProviderAdapterContract.ProviderResult = {
      answer = null;
      provider = #openai;
      model = "gpt-5.4-mini";
      latencyMs = 30_000;
      normalizedError = ?#timeout;
    };

    ProviderAdapterContract.validateResult(publicHandoff(), timeoutResult) == #ok;
  };

  public func blocksProviderFreeContinuity() : Bool {
    let continuityHandoff : ProviderAdapterContract.ProviderHandoff = {
      operation = #nativeContinuityPreview;
      decision = ProviderPolicy.decide(#nativeContinuityPreview);
      request;
      timeoutMs = 30_000;
    };

    ProviderAdapterContract.validateHandoff(continuityHandoff) == #err(#invocationNotPermitted);
  };
};
