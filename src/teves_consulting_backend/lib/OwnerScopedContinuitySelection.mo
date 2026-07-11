import Array "mo:core/Array";
import NativeContinuitySelection "NativeContinuitySelection";
import Types "../types";

module {
  public func rankForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    queryText : Text,
  ) : [NativeContinuitySelection.RankedSummary] {
    let ownedSummaries = summaries.filter(func summary { summary.owner == owner });

    NativeContinuitySelection.rankSummaries(ownedSummaries, queryText);
  };
};
