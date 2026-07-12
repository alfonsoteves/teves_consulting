import ContinuityPreviewProjection "ContinuityPreviewProjection";
import Text "mo:core/Text";

module {
  public let minimumQueryCharacters : Nat = 1;
  public let maximumQueryCharacters : Nat = 1_500;

  public type ValidatedQuery = {
    #ok : Text;
    #invalidQuery;
  };

  public type Error = {
    #unauthenticated;
    #invalidQuery;
    #internalError;
  };

  public type Response = {
    queryText : Text;
    queryIntent : Text;
    memoryCount : Nat;
    rankedMemories : [ContinuityPreviewProjection.MemoryPreview];
    contextPreview : Text;
  };

  public type Result = {
    #ok : Response;
    #err : Error;
  };

  func isBoundaryWhitespace(character : Char) : Bool {
    character == ' ' or character == '\n' or character == '\r' or character == '\t';
  };

  public func normalizeQuery(queryText : Text) : ValidatedQuery {
    let normalized = queryText.trim(#predicate(isBoundaryWhitespace));

    if (normalized.size() < minimumQueryCharacters or normalized.size() > maximumQueryCharacters) {
      #invalidQuery;
    } else {
      #ok(normalized);
    };
  };

  public func response(
    preview : ContinuityPreviewProjection.Preview,
    contextPreview : Text,
  ) : Response {
    {
      queryText = preview.queryText;
      queryIntent = preview.queryIntent;
      memoryCount = preview.memoryCount;
      rankedMemories = preview.rankedMemories;
      contextPreview;
    };
  };
};
