import MemoryRankingAdapter "../src/teves_consulting_backend/lib/MemoryRankingAdapter";
import Principal "mo:core/Principal";
import PrivateTypes "mo:aion_intelligence/Types";
import Types "../src/teves_consulting_backend/types";

let summary : Types.MemorySummary = {
  id = 42;
  owner = Principal.fromText("2vxsx-fae");
  createdAt = 1_700_000_000_000_000_000;
  updatedAt = 1_700_000_001_000_000_000;
  title = "Adapter fixture";
  summary = "A synthetic stored summary for native ranking.";
  topics = ["continuity"];
  tags = ["technical", "motoko"];
  keyDecisions = ["Keep ranking private until parity is proven."];
  relationships = [
    {
      subject = "backend";
      predicate = "stores";
      target = "continuity";
      category = "technical";
    },
  ];
  milestone = true;
  importance = 6;
  memoryType = "technical";
  sourceSessionId = "synthetic-fixture";
  confidence = 92;
  status = "active";
};

let rankable : PrivateTypes.Memory = MemoryRankingAdapter.toRankableMemory(summary);

assert rankable.id == summary.id;
assert rankable.title == summary.title;
assert rankable.summary == summary.summary;
assert rankable.tags == summary.tags;
assert rankable.topics == summary.topics;
assert rankable.keyDecisions == summary.keyDecisions;
assert rankable.relationships.size() == 1;
assert rankable.relationships[0].subject == "backend";
assert rankable.relationships[0].predicate == "stores";
assert rankable.relationships[0].target == "continuity";
assert rankable.relationships[0].category == "technical";
assert rankable.milestone == summary.milestone;
assert rankable.importance == summary.importance;
assert rankable.confidence == summary.confidence;
assert rankable.memoryType == summary.memoryType;
assert rankable.status == summary.status;
assert rankable.createdAtNanos == summary.createdAt;

let rankedInputs = MemoryRankingAdapter.toRankableMemories([summary]);

assert rankedInputs.size() == 1;
assert rankedInputs[0] == rankable;
