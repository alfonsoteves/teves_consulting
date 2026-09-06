import Array "mo:core/Array";
import MemoryRank "mo:aion_intelligence/MemoryRank";
import MemoryRankingAdapter "MemoryRankingAdapter";
import Types "../types";

module {
  public type RankedSummary = {
    summary : Types.MemorySummary;
    score : Int;
    inputIndex : Nat;
  };

  public func rankSummaries(summaries : [Types.MemorySummary], queryText : Text) : [RankedSummary] {
    let rankableMemories = MemoryRankingAdapter.toRankableMemories(summaries);
    let rankedMemories = MemoryRank.rank(rankableMemories, queryText);

    rankedMemories.map(
      func rankedMemory {
        {
          summary = summaries[rankedMemory.inputIndex];
          score = rankedMemory.score;
          inputIndex = rankedMemory.inputIndex;
        };
      }
    );
  };
};
