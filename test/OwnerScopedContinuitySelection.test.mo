import Array "mo:core/Array";
import OwnerScopedContinuitySelection "../src/teves_consulting_backend/lib/OwnerScopedContinuitySelection";
import Principal "mo:core/Principal";
import Types "../src/teves_consulting_backend/types";

let ownerA = Principal.fromText("2vxsx-fae");
let ownerB = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
let ownerC = Principal.fromText("aaaaa-aa");

func summary(
  id : Nat,
  owner : Principal,
  title : Text,
  text : Text,
  tags : [Text],
  importance : Nat,
  confidence : Nat,
  memoryType : Text,
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
    relationships = [];
    milestone = false;
    importance;
    memoryType;
    sourceSessionId = "synthetic-fixture";
    confidence;
    status = "active";
  };
};

let summaries = [
  summary(
    1,
    ownerA,
    "Identity frame",
    "A continuity assistant supports the operator.",
    ["identity", "continuity"],
    4,
    95,
    "identity",
  ),
  summary(
    2,
    ownerA,
    "Potato meal",
    "A simple potato recipe supports repeatable meals.",
    ["recipe", "potato"],
    5,
    90,
    "recipe",
  ),
  summary(
    99,
    ownerB,
    "Other owner technical record",
    "A Motoko backend deployment preserves continuity storage.",
    ["backend", "motoko", "deployment"],
    10,
    100,
    "technical",
  ),
];

func rankedIds(owner : Principal) : [Nat] {
  OwnerScopedContinuitySelection.rankForOwner(
    summaries,
    owner,
    "How should the Motoko backend deploy?",
  ).map(func entry { entry.summary.id });
};

assert rankedIds(ownerA) == [1, 2];
assert rankedIds(ownerB) == [99];
assert rankedIds(ownerC) == [];
