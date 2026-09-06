import CertifiedPolicySnapshot "mo:aion_intelligence/CertifiedPolicySnapshot";
import ProviderPolicy "mo:aion_intelligence/ProviderPolicy";

module {
  public func isLinked() : Bool {
    switch (CertifiedPolicySnapshot.parse(CertifiedPolicySnapshot.canonicalSnapshot())) {
      case (#err(_)) { false };
      case (#ok(snapshot)) {
        snapshot.policyVersion == CertifiedPolicySnapshot.policyVersion and snapshot.decisions.size() == 3 and snapshot.decisions[0] == ProviderPolicy.decide(#publicAnswer) and snapshot.decisions[1] == ProviderPolicy.decide(#adminCandidateEvaluation) and snapshot.decisions[2] == ProviderPolicy.decide(#nativeContinuityPreview);
      };
    };
  };
};
