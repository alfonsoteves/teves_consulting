import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Time "mo:base/Time";

persistent actor {

  public type Feedback = {
    id : Nat;
    rating : Text;
    question : Text;
    answer : Text;
    timestamp : Text;
    receivedAt : Int;
  };

  stable var feedbackEntries : [Feedback] = [];
  stable var nextId : Nat = 0;

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
};