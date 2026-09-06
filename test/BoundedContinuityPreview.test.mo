import Array "mo:core/Array";
import BoundedContinuityPreview "../src/teves_consulting_backend/lib/BoundedContinuityPreview";
import NativeContinuitySelection "../src/teves_consulting_backend/lib/NativeContinuitySelection";
import OwnerScopedContinuitySelection "../src/teves_consulting_backend/lib/OwnerScopedContinuitySelection";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Types "../src/teves_consulting_backend/types";

let ownerA = Principal.fromText("2vxsx-fae");
let ownerB = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

func summary(id : Nat, owner : Principal, title : Text, importance : Nat) : Types.MemorySummary {
  {
    id;
    owner;
    createdAt = 1_700_000_000_000_000_000;
    updatedAt = 1_700_000_000_000_000_000;
    title;
    summary = "Synthetic continuity fixture.";
    topics = [];
    tags = ["continuity"];
    keyDecisions = [];
    relationships = [];
    milestone = false;
    importance;
    memoryType = "session";
    sourceSessionId = "synthetic-fixture";
    confidence = 80;
    status = "active";
  };
};

let ownerASummaries = [
  summary(1, ownerA, "One", 1),
  summary(2, ownerA, "Two", 2),
  summary(3, ownerA, "Three", 3),
  summary(4, ownerA, "Four", 4),
  summary(5, ownerA, "Five", 5),
  summary(6, ownerA, "Six", 6),
];

let allSummaries = ownerASummaries.concat([summary(99, ownerB, "Other owner", 10)]);
let queryText = "General continuity";

func ids(entries : [NativeContinuitySelection.RankedSummary]) : [Nat] {
  entries.map(func entry { entry.summary.id });
};

let fullSelection = OwnerScopedContinuitySelection.rankForOwner(allSummaries, ownerA, queryText);
let maximumPreview = BoundedContinuityPreview.previewForOwner(allSummaries, ownerA, queryText, 99);
let shortPreview = BoundedContinuityPreview.previewForOwner(allSummaries, ownerA, queryText, 2);
let emptyPreview = BoundedContinuityPreview.previewForOwner(allSummaries, ownerA, queryText, 0);

assert BoundedContinuityPreview.maximumRankedSummaries == 5;
assert fullSelection.size() == 6;
assert maximumPreview.size() == 5;
assert ids(maximumPreview) == [6, 5, 4, 3, 2];
assert not ids(maximumPreview).contains(99);
assert ids(shortPreview) == [6, 5];
assert emptyPreview == [];
