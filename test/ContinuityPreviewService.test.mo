import ContinuityPreviewService "../src/teves_consulting_backend/lib/ContinuityPreviewService";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Types "../src/teves_consulting_backend/types";

let ownerA = Principal.fromText("2vxsx-fae");
let ownerB = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

func summary(
  id : Nat,
  owner : Principal,
  title : Text,
  text : Text,
  tags : [Text],
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
    importance = 6;
    memoryType = "technical";
    sourceSessionId = "private-session";
    confidence = 92;
    status = "active";
  };
};

let result = ContinuityPreviewService.previewForOwner(
  [
    summary(
      1,
      ownerA,
      "Owner A backend",
      "A Motoko backend preserves continuity storage.",
      ["motoko", "backend"],
    ),
    summary(
      99,
      ownerB,
      "Owner B backend",
      "An unrelated owner record must stay private.",
      ["motoko", "backend"],
    ),
  ],
  ownerA,
  "  How should the Motoko backend deploy?  ",
);

switch (result) {
  case (#err(_)) { assert false };
  case (#ok(response)) {
    assert response.queryText == "How should the Motoko backend deploy?";
    assert response.queryIntent == "technical";
    assert response.memoryCount == 1;
    assert response.rankedMemories.size() == 1;
    assert response.rankedMemories[0].id == 1;
    assert response.contextPreview.contains(#text("Owner A backend"));
    assert not response.contextPreview.contains(#text("Owner B backend"));
    assert not response.contextPreview.contains(#text("private-session"));
  };
};

switch (ContinuityPreviewService.previewForOwner([], ownerA, " \n\t\r ")) {
  case (#err(#invalidQuery)) {};
  case _ { assert false };
};
