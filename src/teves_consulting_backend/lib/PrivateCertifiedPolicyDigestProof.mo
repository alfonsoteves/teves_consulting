import CertifiedPolicySnapshot "mo:aion_intelligence/CertifiedPolicySnapshot";

module {
  let expectedDigest : Blob = "\E4\23\34\D4\C8\10\67\2D\2A\52\79\77\16\57\38\A8\5B\BA\7F\97\77\51\14\BC\6B\1D\3A\43\F1\F9\64\EC";

  public func isLinked() : Bool {
    CertifiedPolicySnapshot.snapshotDigest() == expectedDigest and CertifiedPolicySnapshot.snapshotDigest().size() == 32;
  };
};
