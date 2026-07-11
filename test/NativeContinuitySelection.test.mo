import Array "mo:core/Array";
import NativeContinuitySelection "../src/teves_consulting_backend/lib/NativeContinuitySelection";
import Principal "mo:core/Principal";
import Types "../src/teves_consulting_backend/types";

let owner = Principal.fromText("2vxsx-fae");

func relationship(subject : Text, predicate : Text, target : Text, category : Text) : Types.Relationship {
  { subject; predicate; target; category };
};

func summary(
  id : Nat,
  title : Text,
  text : Text,
  tags : [Text],
  relationships : [Types.Relationship],
  importance : Nat,
  confidence : Nat,
  memoryType : Text,
  status : Text,
) : Types.MemorySummary {
  {
    id;
    owner;
    createdAt = 1_700_000_000_000_000_000;
    updatedAt = 1_700_000_000_000_000_000;
    title;
    summary = text;
    topics = [];
    tags;
    keyDecisions = [];
    relationships;
    milestone = false;
    importance;
    memoryType;
    sourceSessionId = "synthetic-fixture";
    confidence;
    status;
  };
};

let rankedCorpus = [
  summary(
    1,
    "Identity frame",
    "A continuity assistant supports the operator.",
    ["identity", "continuity"],
    [relationship("operator", "uses", "assistant", "identity")],
    4,
    95,
    "identity",
    "active",
  ),
  summary(
    2,
    "Potato meal",
    "A simple potato recipe supports repeatable meals.",
    ["recipe", "potato"],
    [],
    5,
    90,
    "recipe",
    "active",
  ),
  summary(
    3,
    "Backend deployment",
    "A Motoko backend deployment preserves continuity storage.",
    ["backend", "motoko", "deployment"],
    [relationship("backend", "stores", "continuity", "technical")],
    6,
    92,
    "technical",
    "active",
  ),
  summary(
    4,
    "Retired recipe",
    "An old recipe note is no longer active.",
    ["recipe"],
    [],
    2,
    40,
    "recipe",
    "deprecated",
  ),
];

let tieCorpus = [
  summary(10, "Tie alpha", "General continuity note.", [], [], 3, 80, "session", "active"),
  summary(11, "Tie beta", "General continuity note.", [], [], 3, 80, "session", "active"),
];

func rankedIds(summaries : [Types.MemorySummary], queryText : Text) : [Nat] {
  NativeContinuitySelection.rankSummaries(summaries, queryText).map(func entry { entry.summary.id });
};

assert rankedIds(rankedCorpus, "Who am I?") == [1, 3, 2, 4];
assert rankedIds(rankedCorpus, "Need a potato recipe") == [2, 1, 4, 3];
assert rankedIds(rankedCorpus, "How should the Motoko backend deploy?") == [3, 1, 2, 4];
assert rankedIds(tieCorpus, "General continuity") == [10, 11];
