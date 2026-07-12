import ContinuityPreviewContract "../src/teves_consulting_backend/lib/ContinuityPreviewContract";
import ContinuityPreviewProjection "../src/teves_consulting_backend/lib/ContinuityPreviewProjection";

func repeated(text : Text, count : Nat) : Text {
  var result = "";
  var index = 0;

  while (index < count) {
    result #= text;
    index += 1;
  };

  result;
};

func expectNormalized(queryText : Text, expected : Text) {
  switch (ContinuityPreviewContract.normalizeQuery(queryText)) {
    case (#ok(normalized)) { assert normalized == expected };
    case (#invalidQuery) { assert false };
  };
};

func expectInvalid(queryText : Text) {
  switch (ContinuityPreviewContract.normalizeQuery(queryText)) {
    case (#ok(_)) { assert false };
    case (#invalidQuery) {};
  };
};

let memory : ContinuityPreviewProjection.MemoryPreview = {
  id = 7;
  title = "Keep continuity bounded";
  summary = "Return a safe, caller-scoped preview.";
  topics = ["continuity"];
  tags = ["motoko"];
  keyDecisions = ["No provider calls."];
  relationships = [];
  milestone = true;
  importance = 90;
  memoryType = "decision";
  confidence = 95;
  status = "active";
  score = 12;
};

let preview : ContinuityPreviewProjection.Preview = {
  queryText = "How should continuity be selected?";
  queryIntent = "technical";
  memoryCount = 3;
  rankedMemories = [memory];
};

expectNormalized(" \n\tHow should continuity be selected?\r ", "How should continuity be selected?");
expectInvalid("");
expectInvalid(" \n\t\r ");
expectInvalid(repeated("x", ContinuityPreviewContract.maximumQueryCharacters + 1));

let response = ContinuityPreviewContract.response(preview, "Continuity context\nMemory count: 3");

assert ContinuityPreviewContract.minimumQueryCharacters == 1;
assert ContinuityPreviewContract.maximumQueryCharacters == 1_500;
assert response.queryText == preview.queryText;
assert response.queryIntent == "technical";
assert response.memoryCount == 3;
assert response.rankedMemories.size() == 1;
assert response.rankedMemories[0].title == "Keep continuity bounded";
assert response.contextPreview == "Continuity context\nMemory count: 3";
