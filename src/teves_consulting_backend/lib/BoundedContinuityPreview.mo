import Array "mo:core/Array";
import NativeContinuitySelection "NativeContinuitySelection";
import OwnerScopedContinuitySelection "OwnerScopedContinuitySelection";
import Types "../types";

module {
  public let maximumRankedSummaries : Nat = 5;

  func take<T>(entries : [T], limit : Nat) : [T] {
    let boundedLimit = if (limit < entries.size()) { limit } else {
      entries.size();
    };

    Array.tabulate<T>(boundedLimit, func index { entries[index] });
  };

  public func previewForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    queryText : Text,
    requestedLimit : Nat,
  ) : [NativeContinuitySelection.RankedSummary] {
    let limit = if (requestedLimit < maximumRankedSummaries) {
      requestedLimit;
    } else {
      maximumRankedSummaries;
    };
    let ranked = OwnerScopedContinuitySelection.rankForOwner(summaries, owner, queryText);

    take(ranked, limit);
  };
};
