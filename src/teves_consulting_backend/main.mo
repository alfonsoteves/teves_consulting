import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";
import Principal "mo:base/Principal";

persistent actor {

  public type Feedback = {
    id : Nat;
    rating : Text;
    question : Text;
    answer : Text;
    timestamp : Text;
    receivedAt : Int;
  };

  public type MemorySummary = {
    id : Nat;
    owner : Principal;
    createdAt : Int;
    title : Text;
    summary : Text;
    keyDecisions : [Text];
    tags : [Text];
    milestone : Bool;
  };

  stable var feedbackEntries : [Feedback] = [];
  stable var nextId : Nat = 0;
  stable var memorySummaries : [MemorySummary] = [];
  stable var nextMemoryId : Nat = 0;

  public shared(msg) func whoami() : async Text {
    Principal.toText(msg.caller)
  };

  public shared func addFeedback(
    rating : Text,
    question : Text,
    answer : Text,
    timestamp : Text
  ) : async Bool {

    let feedback : Feedback = {
      id = nextId;
      rating = rating;
      question = question;
      answer = answer;
      timestamp = timestamp;
      receivedAt = Int.abs(Time.now());
    };

    feedbackEntries := Array.append(feedbackEntries, [feedback]);

    nextId += 1;

    return true;
  };

  public query func getFeedbackCount() : async Nat {
    feedbackEntries.size();
  };
  
  public query func getFeedbackEntries() : async [Feedback] {
    feedbackEntries
  };
  public query func getRecentFeedback(limit : Nat) : async [Feedback] {
    let size = feedbackEntries.size();

    if (limit >= size) {
      feedbackEntries
    } else {
      let start = size - limit;
      Array.tabulate<Feedback>(
        limit,
        func(i : Nat) : Feedback {
          feedbackEntries[start + i]
        }
      )
    }
  };

  public shared(msg) func storeSummary(
    title : Text,
    summary : Text,
    keyDecisions : [Text],
    tags : [Text],
    milestone : Bool
  ) : async Nat {
    let id = nextMemoryId;

    let entry : MemorySummary = {
      id = id;
      owner = msg.caller;
      createdAt = Time.now();
      title = title;
      summary = summary;
      keyDecisions = keyDecisions;
      tags = tags;
      milestone = milestone;
    };

    memorySummaries := Array.append<MemorySummary>(memorySummaries, [entry]);
    nextMemoryId += 1;

    id
  };

  public shared query(msg) func getMyRecentSummaries(limit : Nat) : async [MemorySummary] {
    let mine = Array.filter<MemorySummary>(
      memorySummaries,
      func(entry : MemorySummary) : Bool {
        entry.owner == msg.caller
      }
    );

    let count = mine.size();

    if (count <= limit) {
      mine
    } else {
      Array.tabulate<MemorySummary>(
        limit,
        func(i : Nat) : MemorySummary {
          mine[count - limit + i]
        }
      )
    }
  };

  public shared query(msg) func getMyMilestoneSummaries() : async [MemorySummary] {

    Array.filter<MemorySummary>(
      memorySummaries,
      func(summary : MemorySummary) : Bool {
        summary.owner == msg.caller and summary.milestone
      }
    )

  };
  public shared query(msg) func getMyAllSummaries() : async [MemorySummary] {
    Array.filter<MemorySummary>(
      memorySummaries,
      func(entry : MemorySummary) : Bool {
        entry.owner == msg.caller
      }
    )
  };

    public shared(msg) func deleteSummaryById(id : Nat) : async Bool {

    let before = memorySummaries.size();

    memorySummaries := Array.filter<MemorySummary>(
      memorySummaries,
      func(entry : MemorySummary) : Bool {
        not (
          entry.owner == msg.caller
          and entry.id == id
        )
      }
    );

    memorySummaries.size() < before
  };
  
  public shared(msg) func deleteAllMySummaries() : async Bool {
    memorySummaries := Array.filter<MemorySummary>(
      memorySummaries,
      func(entry : MemorySummary) : Bool {
        entry.owner != msg.caller
      }
    );

    true
  };
};