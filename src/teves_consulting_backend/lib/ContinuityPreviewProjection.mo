import Array "mo:core/Array";
import BoundedContinuityPreview "BoundedContinuityPreview";
import Int "mo:core/Int";
import MemoryRank "mo:aion_intelligence/MemoryRank";
import NativeContinuitySelection "NativeContinuitySelection";
import NativeRelationshipExpansion "NativeRelationshipExpansion";
import PrivateTypes "mo:aion_intelligence/Types";
import Types "../types";

module {
  public type MemoryPreview = {
    id : Nat;
    title : Text;
    summary : Text;
    topics : [Text];
    tags : [Text];
    keyDecisions : [Text];
    relationships : [Types.Relationship];
    milestone : Bool;
    importance : Nat;
    memoryType : Text;
    confidence : Nat;
    status : Text;
    score : Int;
  };

  public type Preview = {
    queryText : Text;
    queryIntent : Text;
    memoryCount : Nat;
    rankedMemories : [MemoryPreview];
    expandedMemories : [MemoryPreview];
  };

  func intentLabel(intent : PrivateTypes.Intent) : Text {
    switch (intent) {
      case (#identity) { "identity" };
      case (#recipe) { "recipe" };
      case (#technical) { "technical" };
      case (#general) { "general" };
    };
  };

  func toPreviewMemory(summary : Types.MemorySummary, score : Int) : MemoryPreview {
    {
      id = summary.id;
      title = summary.title;
      summary = summary.summary;
      topics = summary.topics;
      tags = summary.tags;
      keyDecisions = summary.keyDecisions;
      relationships = summary.relationships;
      milestone = summary.milestone;
      importance = summary.importance;
      memoryType = summary.memoryType;
      confidence = summary.confidence;
      status = summary.status;
      score;
    };
  };

  func rankedPreviewMemory(ranked : NativeContinuitySelection.RankedSummary) : MemoryPreview {
    toPreviewMemory(ranked.summary, ranked.score);
  };

  func expandedPreviewMemory(expanded : NativeRelationshipExpansion.ExpandedSummary) : MemoryPreview {
    toPreviewMemory(expanded.summary, Int.fromNat(expanded.score));
  };

  public func buildForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    queryText : Text,
    requestedLimit : Nat,
  ) : Preview {
    let memoryCount = summaries.filter(func summary { summary.owner == owner }).size();
    let ranked = BoundedContinuityPreview.previewForOwner(summaries, owner, queryText, requestedLimit);
    let expanded = NativeRelationshipExpansion.expandForOwner(
      summaries,
      owner,
      ranked.map(func entry { entry.summary }),
      queryText,
      NativeRelationshipExpansion.maximumExpandedSummaries,
    );

    {
      queryText;
      queryIntent = intentLabel(MemoryRank.detectIntent(queryText));
      memoryCount;
      rankedMemories = ranked.map(func entry { rankedPreviewMemory(entry) });
      expandedMemories = expanded.map(func entry { expandedPreviewMemory(entry) });
    };
  };
};
