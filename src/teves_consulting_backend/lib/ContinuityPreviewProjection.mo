import Array "mo:core/Array";
import BoundedContinuityPreview "BoundedContinuityPreview";
import MemoryRank "mo:aion_intelligence/MemoryRank";
import NativeContinuitySelection "NativeContinuitySelection";
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
  };

  func intentLabel(intent : PrivateTypes.Intent) : Text {
    switch (intent) {
      case (#identity) { "identity" };
      case (#recipe) { "recipe" };
      case (#technical) { "technical" };
      case (#general) { "general" };
    };
  };

  func toPreviewMemory(ranked : NativeContinuitySelection.RankedSummary) : MemoryPreview {
    {
      id = ranked.summary.id;
      title = ranked.summary.title;
      summary = ranked.summary.summary;
      topics = ranked.summary.topics;
      tags = ranked.summary.tags;
      keyDecisions = ranked.summary.keyDecisions;
      relationships = ranked.summary.relationships;
      milestone = ranked.summary.milestone;
      importance = ranked.summary.importance;
      memoryType = ranked.summary.memoryType;
      confidence = ranked.summary.confidence;
      status = ranked.summary.status;
      score = ranked.score;
    };
  };

  public func buildForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    queryText : Text,
    requestedLimit : Nat,
  ) : Preview {
    let memoryCount = summaries.filter(func summary { summary.owner == owner }).size();
    let ranked = BoundedContinuityPreview.previewForOwner(summaries, owner, queryText, requestedLimit);

    {
      queryText;
      queryIntent = intentLabel(MemoryRank.detectIntent(queryText));
      memoryCount;
      rankedMemories = ranked.map(func entry { toPreviewMemory(entry) });
    };
  };
};
