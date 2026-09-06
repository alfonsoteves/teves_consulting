import CertifiedData "mo:core/CertifiedData";
import CertifiedPolicySnapshot "mo:aion_intelligence/CertifiedPolicySnapshot";

module {
  public func refresh() {
    CertifiedData.set(CertifiedPolicySnapshot.snapshotDigest());
  };

  public func digestIsCertifiable() : Bool {
    CertifiedPolicySnapshot.snapshotDigest().size() == 32;
  };
};
