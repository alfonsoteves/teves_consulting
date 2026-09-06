import Array "mo:core/Array";
import MemoryRank "mo:aion_intelligence/MemoryRank";
import MemoryRankingAdapter "MemoryRankingAdapter";
import RelationshipExpansion "mo:aion_intelligence/RelationshipExpansion";
import Types "../types";

module {
  public let maximumExpandedSummaries : Nat = RelationshipExpansion.maximumExpandedMemories;

  public type ExpandedSummary = {
    summary : Types.MemorySummary;
    score : Nat;
    inputIndex : Nat;
    sourceMemoryIds : [Nat];
  };

  public func expandForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    selected : [Types.MemorySummary],
    queryText : Text,
    requestedLimit : Nat,
  ) : [ExpandedSummary] {
    let ownedSummaries = summaries.filter(func summary { summary.owner == owner });
    let selectedOwnedSummaries = selected.filter(func summary { summary.owner == owner });

    if (selectedOwnedSummaries.size() == 0) {
      return [];
    };

    let expanded = RelationshipExpansion.expand(
      MemoryRankingAdapter.toRankableMemories(selectedOwnedSummaries),
      MemoryRankingAdapter.toRankableMemories(ownedSummaries),
      MemoryRank.detectIntent(queryText),
      requestedLimit,
    );

    expanded.map(
      func entry {
        {
          summary = ownedSummaries[entry.inputIndex];
          score = entry.score;
          inputIndex = entry.inputIndex;
          sourceMemoryIds = entry.sourceMemoryIds;
        };
      }
    );
  };
};
