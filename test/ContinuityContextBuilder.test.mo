import ContinuityContextBuilder "../src/teves_consulting_backend/lib/ContinuityContextBuilder";
import ContinuityPreviewProjection "../src/teves_consulting_backend/lib/ContinuityPreviewProjection";
import Text "mo:core/Text";
import Types "../src/teves_consulting_backend/types";

let relationship : Types.Relationship = {
  subject = "backend";
  predicate = "stores";
  target = "continuity";
  category = "technical";
};

let preview : ContinuityPreviewProjection.Preview = {
  queryText = "How should the Motoko backend deploy?";
  queryIntent = "technical";
  memoryCount = 1;
  rankedMemories = [
    {
      id = 1;
      title = "Technical fixture";
      summary = "A Motoko backend deployment preserves continuity storage.";
      topics = ["continuity"];
      tags = ["backend", "motoko", "deployment"];
      keyDecisions = ["Keep selection owner-scoped."];
      relationships = [relationship];
      milestone = true;
      importance = 6;
      memoryType = "technical";
      confidence = 92;
      status = "active";
      score = 245;
    },
  ];
};

let context = ContinuityContextBuilder.build(preview);
let shortContext = ContinuityContextBuilder.buildWithLimit(preview, 24);
let emptyContext = ContinuityContextBuilder.buildWithLimit(preview, 0);
let oversizedContext = ContinuityContextBuilder.buildWithLimit(preview, 9_999);

assert context.contains(#text("Continuity context"));
assert context.contains(#text("Query: How should the Motoko backend deploy?"));
assert context.contains(#text("Intent: technical"));
assert context.contains(#text("Memory count: 1"));
assert context.contains(#text("Technical fixture"));
assert context.contains(#text("Keep selection owner-scoped."));
assert context.contains(#text("backend stores continuity"));
assert not context.contains(#text("owner-a-session"));
assert context.size() <= ContinuityContextBuilder.maximumContextCharacters;
assert shortContext.size() == 24;
assert emptyContext == "";
assert oversizedContext == context;
