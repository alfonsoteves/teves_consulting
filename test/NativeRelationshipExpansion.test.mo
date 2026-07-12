import Array "mo:core/Array";
import NativeRelationshipExpansion "../src/teves_consulting_backend/lib/NativeRelationshipExpansion";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Types "../src/teves_consulting_backend/types";

let ownerA = Principal.fromText("2vxsx-fae");
let ownerB = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

func relationship(subject : Text, target : Text) : Types.Relationship {
  {
    subject;
    predicate = "supports";
    target;
    category = "fixture";
  };
};

func summary(
  id : Nat,
  owner : Principal,
  title : Text,
  memoryType : Text,
  tags : [Text],
  relationships : [Types.Relationship],
  status : Text,
) : Types.MemorySummary {
  {
    id;
    owner;
    createdAt = 1_700_000_000_000_000_000;
    updatedAt = 1_700_000_000_000_000_000;
    title;
    summary = title;
    topics = [];
    tags;
    keyDecisions = [];
    relationships;
    milestone = false;
    importance = 5;
    memoryType;
    sourceSessionId = "synthetic-fixture";
    confidence = 90;
    status;
  };
};

let technicalSource = summary(
  1,
  ownerA,
  "Backend deployment",
  "technical",
  ["motoko", "backend"],
  [relationship("backend", "release")],
  "active",
);
let technicalRelated = summary(
  2,
  ownerA,
  "Feature flag rollout",
  "decision",
  ["backend", "feature flag"],
  [relationship("feature flag", "backend")],
  "active",
);
let technicalSecond = summary(
  3,
  ownerA,
  "Backend support note",
  "technical",
  ["backend"],
  [relationship("backend", "support")],
  "active",
);
let foreignRelated = summary(
  4,
  ownerB,
  "Other owner backend note",
  "technical",
  ["backend"],
  [relationship("backend", "release")],
  "active",
);
let deprecatedRelated = summary(
  5,
  ownerA,
  "Deprecated backend warning",
  "technical",
  ["backend"],
  [relationship("backend", "legacy warning")],
  "deprecated",
);
let identityRelated = summary(
  6,
  ownerA,
  "Identity frame",
  "identity",
  ["backend"],
  [relationship("backend", "assistant")],
  "active",
);
let recipeSource = summary(
  7,
  ownerA,
  "Apple pie",
  "recipe",
  ["recipe", "fruit"],
  [relationship("apple pie", "strong apples")],
  "active",
);
let recipeRelated = summary(
  8,
  ownerA,
  "Apple filling",
  "recipe",
  ["recipe", "fruit"],
  [relationship("strong apples", "set filling")],
  "active",
);

let allSummaries = [
  technicalSource,
  technicalRelated,
  technicalSecond,
  foreignRelated,
  deprecatedRelated,
  identityRelated,
  recipeSource,
  recipeRelated,
];

func ids(entries : [NativeRelationshipExpansion.ExpandedSummary]) : [Nat] {
  entries.map(func entry { entry.summary.id });
};

let technicalExpansion = NativeRelationshipExpansion.expandForOwner(
  allSummaries,
  ownerA,
  [technicalSource],
  "How should the Motoko backend deploy?",
  99,
);

assert ids(technicalExpansion) == [2, 3];
assert technicalExpansion[0].sourceMemoryIds == [1];
assert not ids(technicalExpansion).contains(4);
assert not ids(technicalExpansion).contains(5);
assert not ids(technicalExpansion).contains(6);

let recipeExpansion = NativeRelationshipExpansion.expandForOwner(
  allSummaries,
  ownerA,
  [recipeSource],
  "Need an apple pie recipe",
  2,
);

assert ids(recipeExpansion) == [8];
assert NativeRelationshipExpansion.expandForOwner(
  allSummaries,
  ownerA,
  [technicalSource],
  "How should the Motoko backend deploy?",
  0,
) == [];
assert NativeRelationshipExpansion.expandForOwner(
  allSummaries,
  ownerA,
  [foreignRelated],
  "How should the Motoko backend deploy?",
  2,
) == [];
