import ContinuityPreviewService "../src/teves_consulting_backend/lib/ContinuityPreviewService";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
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
  importance : Nat,
  relationships : [Types.Relationship],
) : Types.MemorySummary {
  {
    id;
    owner;
    createdAt = 1_700_000_000_000_000_000;
    updatedAt = 1_700_000_000_000_000_000;
    title;
    summary = "General continuity fixture.";
    topics = [];
    tags = [];
    keyDecisions = [];
    relationships;
    milestone = false;
    importance;
    memoryType = "session";
    sourceSessionId = "private-session";
    confidence = 90;
    status = "active";
  };
};

let result = ContinuityPreviewService.previewForOwner(
  [
    summary(1, ownerA, "Selected backend source", 10, [relationship("backend", "release")]),
    summary(2, ownerA, "Ranked filler one", 9, []),
    summary(3, ownerA, "Ranked filler two", 8, []),
    summary(4, ownerA, "Ranked filler three", 7, []),
    summary(5, ownerA, "Ranked filler four", 6, []),
    summary(6, ownerA, "Related backend candidate", 1, [relationship("backend", "support")]),
    summary(99, ownerB, "Other owner backend candidate", 20, [relationship("backend", "release")]),
  ],
  ownerA,
  "General continuity",
);

switch (result) {
  case (#err(_)) { assert false };
  case (#ok(response)) {
    assert response.memoryCount == 6;
    assert response.rankedMemories.size() == 5;
    assert response.expandedMemories.size() == 1;
    assert response.expandedMemories[0].id == 6;
    assert not response.rankedMemories.map(func memory { memory.id }).contains(99);
    assert not response.expandedMemories.map(func memory { memory.id }).contains(99);
    assert response.contextPreview.contains(#text("Relationship-expanded memories"));
    assert response.contextPreview.contains(#text("Related backend candidate"));
    assert not response.contextPreview.contains(#text("Other owner backend candidate"));
    assert not response.contextPreview.contains(#text("private-session"));
  };
};
