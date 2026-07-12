import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "types";
import CertifiedPolicyLifecycle "lib/CertifiedPolicyLifecycle";
import ContinuityPreviewContract "lib/ContinuityPreviewContract";
import ContinuityPreviewService "lib/ContinuityPreviewService";
import ProviderRoutePreviewContract "lib/ProviderRoutePreviewContract";
import ProviderRoutePreviewService "lib/ProviderRoutePreviewService";
import SummaryAccess "lib/SummaryAccess";

actor {
  CertifiedPolicyLifecycle.refresh();

  var feedbackEntries : [Types.Feedback] = [];
  var nextId : Nat = 0;
  var memorySummaries : [Types.MemorySummary] = [];
  var nextMemoryId : Nat = 0;

  public shared ({ caller }) func whoami() : async Text {
    caller.toText();
  };

  public shared func addFeedback(
    rating : Text,
    question : Text,
    answer : Text,
    timestamp : Text,
  ) : async Bool {
    let feedback : Types.Feedback = {
      id = nextId;
      rating;
      question;
      answer;
      timestamp;
      receivedAt = Time.now();
    };

    feedbackEntries := feedbackEntries.concat([feedback]);
    nextId += 1;
    true;
  };

  public query func getFeedbackCount() : async Nat {
    feedbackEntries.size();
  };

  public query func getFeedbackEntries() : async [Types.Feedback] {
    feedbackEntries;
  };

  public query func getRecentFeedback(limit : Nat) : async [Types.Feedback] {
    SummaryAccess.recent(feedbackEntries, limit);
  };

  public shared ({ caller }) func storeSummary(
    title : Text,
    summary : Text,
    topics : [Text],
    tags : [Text],
    keyDecisions : [Text],
    relationships : [Types.Relationship],
    milestone : Bool,
    importance : Nat,
    memoryType : Text,
    sourceSessionId : Text,
    confidence : Nat,
    status : Text,
  ) : async Nat {
    let id = nextMemoryId;
    let now = Time.now();
    let entry : Types.MemorySummary = {
      id;
      owner = caller;
      createdAt = now;
      updatedAt = now;
      title;
      summary;
      topics;
      tags;
      keyDecisions;
      relationships;
      milestone;
      importance;
      memoryType;
      sourceSessionId;
      confidence;
      status;
    };

    memorySummaries := memorySummaries.concat([entry]);
    nextMemoryId += 1;
    id;
  };

  public shared query ({ caller }) func getMyRecentSummaries(
    limit : Nat
  ) : async [Types.MemorySummary] {
    SummaryAccess.recent(SummaryAccess.forOwner(memorySummaries, caller), limit);
  };

  public shared query ({ caller }) func getMyMilestoneSummaries() : async [Types.MemorySummary] {
    SummaryAccess.milestones(memorySummaries, caller);
  };

  public shared query ({ caller }) func getMyAllSummaries() : async [Types.MemorySummary] {
    SummaryAccess.forOwner(memorySummaries, caller);
  };

  public shared query ({ caller }) func previewMyContinuity(
    queryText : Text
  ) : async ContinuityPreviewContract.Result {
    if (caller.isAnonymous()) {
      #err(#unauthenticated);
    } else {
      ContinuityPreviewService.previewForOwner(memorySummaries, caller, queryText);
    };
  };

  public query func previewAionProviderRoute(
    operation : ProviderRoutePreviewContract.Operation
  ) : async ProviderRoutePreviewContract.Response {
    ProviderRoutePreviewService.preview(operation);
  };

  public shared ({ caller }) func deleteSummaryById(id : Nat) : async Bool {
    let before = memorySummaries.size();
    memorySummaries := SummaryAccess.removeById(memorySummaries, caller, id);
    memorySummaries.size() < before;
  };

  public shared ({ caller }) func deleteAllMySummaries() : async Bool {
    memorySummaries := SummaryAccess.withoutOwner(memorySummaries, caller);
    true;
  };
};
