import ContinuityPreviewProjection "../src/teves_consulting_backend/lib/ContinuityPreviewProjection";
import Principal "mo:core/Principal";
import Types "../src/teves_consulting_backend/types";

let ownerA = Principal.fromText("2vxsx-fae");
let ownerB = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

func summary(
  id : Nat,
  owner : Principal,
  sourceSessionId : Text,
  createdAt : Int,
) : Types.MemorySummary {
  {
    id;
    owner;
    createdAt;
    updatedAt = createdAt + 1;
    title = "Technical fixture";
    summary = "A Motoko backend deployment preserves continuity storage.";
    topics = ["continuity"];
    tags = ["backend", "motoko", "deployment"];
    keyDecisions = ["Keep selection owner-scoped."];
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
    sourceSessionId;
    confidence = 92;
    status = "active";
  };
};

let ownerAMemory = summary(1, ownerA, "owner-a-session", 1_700_000_000_000_000_000);
let ownerBMemory = summary(99, ownerB, "owner-b-session", 1_700_000_001_000_000_000);
let preview = ContinuityPreviewProjection.buildForOwner(
  [ownerAMemory, ownerBMemory],
  ownerA,
  "How should the Motoko backend deploy?",
  5,
);

assert preview.queryText == "How should the Motoko backend deploy?";
assert preview.queryIntent == "technical";
assert preview.memoryCount == 1;
assert preview.rankedMemories.size() == 1;

let memory = preview.rankedMemories[0];

assert memory.id == 1;
assert memory.title == "Technical fixture";
assert memory.summary == "A Motoko backend deployment preserves continuity storage.";
assert memory.topics == ["continuity"];
assert memory.tags == ["backend", "motoko", "deployment"];
assert memory.keyDecisions == ["Keep selection owner-scoped."];
assert memory.relationships.size() == 1;
assert memory.relationships[0].category == "technical";
assert memory.milestone;
assert memory.importance == 6;
assert memory.memoryType == "technical";
assert memory.confidence == 92;
assert memory.status == "active";
assert memory.score > 0;
