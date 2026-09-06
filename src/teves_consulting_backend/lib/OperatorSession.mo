import Array "mo:core/Array";
import Sha256 "mo:sha2/Sha256";

module {
  public type Grant = {
    digest : Blob;
    expiresAt : Int;
  };

  public type Issuance = {
    grants : [Grant];
    issued : Bool;
  };

  public type Redemption = {
    grants : [Grant];
    redeemed : Bool;
  };

  let nonceSize : Nat = 32;
  let maximumActiveGrants : Nat = 8;
  let grantLifetimeNs : Int = 300_000_000_000;

  public func validNonce(nonce : Blob) : Bool {
    nonce.size() == nonceSize;
  };

  func digest(nonce : Blob) : Blob {
    Sha256.fromBlob(#sha256, nonce);
  };

  public func prune(grants : [Grant], now : Int) : [Grant] {
    var active : [Grant] = [];

    for (grant in grants.values()) {
      if (grant.expiresAt > now) {
        active := Array.concat(active, [grant]);
      };
    };

    active;
  };

  func containsDigest(grants : [Grant], target : Blob) : Bool {
    for (grant in grants.values()) {
      if (grant.digest == target) {
        return true;
      };
    };

    false;
  };

  public func issue(grants : [Grant], nonce : Blob, now : Int) : Issuance {
    let active = prune(grants, now);

    if (not validNonce(nonce) or active.size() >= maximumActiveGrants) {
      return { grants = active; issued = false };
    };

    let nonceDigest = digest(nonce);
    if (containsDigest(active, nonceDigest)) {
      return { grants = active; issued = false };
    };

    {
      grants = Array.concat(active, [{ digest = nonceDigest; expiresAt = now + grantLifetimeNs }]);
      issued = true;
    };
  };

  public func redeem(grants : [Grant], nonce : Blob, now : Int) : Redemption {
    let active = prune(grants, now);
    if (not validNonce(nonce)) {
      return { grants = active; redeemed = false };
    };

    let nonceDigest = digest(nonce);
    var remaining : [Grant] = [];
    var redeemed = false;

    for (grant in active.values()) {
      if (not redeemed and grant.digest == nonceDigest) {
        redeemed := true;
      } else {
        remaining := Array.concat(remaining, [grant]);
      };
    };

    { grants = remaining; redeemed };
  };
};
