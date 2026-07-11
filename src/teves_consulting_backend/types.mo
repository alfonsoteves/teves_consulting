module {
  public type Feedback = {
    id : Nat;
    rating : Text;
    question : Text;
    answer : Text;
    timestamp : Text;
    receivedAt : Int;
  };

  public type Relationship = {
    subject : Text;
    predicate : Text;
    target : Text;
    category : Text;
  };

  public type MemorySummary = {
    id : Nat;
    owner : Principal;
    createdAt : Int;
    updatedAt : Int;
    title : Text;
    summary : Text;
    topics : [Text];
    tags : [Text];
    keyDecisions : [Text];
    relationships : [Relationship];
    milestone : Bool;
    importance : Nat;
    memoryType : Text;
    sourceSessionId : Text;
    confidence : Nat;
    status : Text;
  };
};
