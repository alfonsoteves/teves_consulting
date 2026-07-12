module {
  public type Response = {
    policyVersion : Text;
    canonicalSnapshot : Text;
    snapshotHash : Blob;
    certificate : ?Blob;
  };
};
