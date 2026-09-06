import ProviderPolicy "mo:aion_intelligence/ProviderPolicy";

module {
  public func isLinked() : Bool {
    let publicAnswer = ProviderPolicy.decide(#publicAnswer);
    let candidate = ProviderPolicy.decide(#adminCandidateEvaluation);
    let preview = ProviderPolicy.decide(#nativeContinuityPreview);

    publicAnswer.provider == #openai and publicAnswer.invocationPermitted and not publicAnswer.automaticFallback and candidate.provider == #icpLlm and candidate.explicitOperatorAction and candidate.promotionRequired and not candidate.automaticFallback and preview.provider == #none and not preview.invocationPermitted;
  };
};
