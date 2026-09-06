import CertifiedData "mo:core/CertifiedData";
import CertifiedPolicySnapshot "mo:aion_intelligence/CertifiedPolicySnapshot";
import CertifiedPolicySnapshotContract "CertifiedPolicySnapshotContract";

module {
  public func preview(
    certificate : ?Blob
  ) : CertifiedPolicySnapshotContract.Response {
    {
      policyVersion = CertifiedPolicySnapshot.policyVersion;
      canonicalSnapshot = CertifiedPolicySnapshot.canonicalSnapshot();
      snapshotHash = CertifiedPolicySnapshot.snapshotDigest();
      certificate;
    };
  };

  public func getCertified() : CertifiedPolicySnapshotContract.Response {
    preview(CertifiedData.getCertificate());
  };
};
