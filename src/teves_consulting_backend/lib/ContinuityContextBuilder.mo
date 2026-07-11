import ContinuityPreviewProjection "ContinuityPreviewProjection";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Types "../types";

module {
  public let maximumContextCharacters : Nat = 6_000;

  func truncate(text : Text, limit : Nat) : Text {
    if (text.size() <= limit) {
      return text;
    };

    var result = "";
    var index = 0;

    for (character in text.chars()) {
      if (index >= limit) {
        return result;
      };

      result #= Text.fromChar(character);
      index += 1;
    };

    result;
  };

  func relationshipsText(relationships : [Types.Relationship]) : Text {
    var result = "";

    for (relationship in relationships.values()) {
      let item = relationship.subject # " " # relationship.predicate # " " # relationship.target;
      result := if (result == "") { item } else { result # "; " # item };
    };

    result;
  };

  func memoryText(memory : ContinuityPreviewProjection.MemoryPreview) : Text {
    var result = "- [" # memory.memoryType # "] " # memory.title # "\n" # memory.summary;

    if (memory.keyDecisions.size() > 0) {
      result #= "\nDecisions: " # memory.keyDecisions.values().join("; ");
    };

    let relationships = relationshipsText(memory.relationships);
    if (relationships != "") {
      result #= "\nRelationships: " # relationships;
    };

    result # "\n";
  };

  func render(preview : ContinuityPreviewProjection.Preview) : Text {
    var result = "Continuity context\nQuery: " # preview.queryText # "\nIntent: " # preview.queryIntent # "\nMemory count: " # preview.memoryCount.toText() # "\n";

    for (memory in preview.rankedMemories.values()) {
      result #= "\n" # memoryText(memory);
    };

    result;
  };

  public func build(preview : ContinuityPreviewProjection.Preview) : Text {
    buildWithLimit(preview, maximumContextCharacters);
  };

  public func buildWithLimit(
    preview : ContinuityPreviewProjection.Preview,
    requestedLimit : Nat,
  ) : Text {
    let limit = if (requestedLimit < maximumContextCharacters) {
      requestedLimit;
    } else {
      maximumContextCharacters;
    };

    truncate(render(preview), limit);
  };
};
