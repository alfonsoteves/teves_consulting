import Array "mo:core/Array";
import PrivateCertifiedPolicyDigestProof "PrivateCertifiedPolicyDigestProof";
import PrivateCertifiedPolicySnapshotProof "PrivateCertifiedPolicySnapshotProof";
import PrivateProviderPolicyProof "PrivateProviderPolicyProof";
import PrivatePlanningIntentProof "PrivatePlanningIntentProof";
import PrivateRankerProof "PrivateRankerProof";
import Types "../types";

module {
  public func privateRankerBuildProof() : Bool {
    PrivateRankerProof.isLinked();
  };

  public func privateProviderPolicyBuildProof() : Bool {
    PrivateProviderPolicyProof.isLinked();
  };

  public func privateCertifiedPolicySnapshotBuildProof() : Bool {
    PrivateCertifiedPolicySnapshotProof.isLinked();
  };

  public func privateCertifiedPolicyDigestBuildProof() : Bool {
    PrivateCertifiedPolicyDigestProof.isLinked();
  };

  public func privatePlanningIntentBuildProof() : Bool {
    PrivatePlanningIntentProof.isLinked();
  };

  public func recent<T>(entries : [T], limit : Nat) : [T] {
    let count = entries.size();

    if (count <= limit) {
      entries;
    } else {
      Array.tabulate<T>(limit, func index { entries[count - limit + index] });
    };
  };

  public func forOwner(entries : [Types.MemorySummary], owner : Principal) : [Types.MemorySummary] {
    entries.filter(func entry { entry.owner == owner });
  };

  public func milestones(entries : [Types.MemorySummary], owner : Principal) : [Types.MemorySummary] {
    entries.filter(func entry { entry.owner == owner and entry.milestone });
  };

  public func removeById(
    entries : [Types.MemorySummary],
    owner : Principal,
    id : Nat,
  ) : [Types.MemorySummary] {
    entries.filter(func entry { not (entry.owner == owner and entry.id == id) });
  };

  public func withoutOwner(entries : [Types.MemorySummary], owner : Principal) : [Types.MemorySummary] {
    entries.filter(func entry { entry.owner != owner });
  };
};
