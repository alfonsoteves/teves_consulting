import HttpsOutcallPolicy "mo:aion_intelligence/HttpsOutcallPolicy";
import Nat64 "mo:core/Nat64";

module {
  public type Header = { name : Text; value : Text };

  public type HttpMethod = { #get; #post; #head };

  public type HttpResponsePayload = {
    status : Nat;
    headers : [Header];
    body : Blob;
  };

  public type TransformArgs = {
    response : HttpResponsePayload;
    context : Blob;
  };

  public type TransformContext = {
    function : shared query TransformArgs -> async HttpResponsePayload;
    context : Blob;
  };

  public type HttpRequestArgs = {
    url : Text;
    max_response_bytes : ?Nat64;
    headers : [Header];
    body : ?Blob;
    method : HttpMethod;
    transform : ?TransformContext;
    is_replicated : ?Bool;
  };

  public type Receipt = {
    url : Text;
    status : Nat;
    responseBytes : Nat;
    isReplicated : Bool;
  };

  let managementCanister : actor {
    http_request : HttpRequestArgs -> async HttpResponsePayload;
  } = actor "aaaaa-aa";

  public func requestForProbe() : HttpRequestArgs {
    let policy = HttpsOutcallPolicy.nonReplicatedProbe();
    assert HttpsOutcallPolicy.validate(policy) == #ok;

    {
      url = policy.url;
      max_response_bytes = ?Nat64.fromNat(policy.maxResponseBytes);
      headers = [];
      body = null;
      method = #get;
      transform = null;
      is_replicated = ?false;
    };
  };

  public func probe() : async Receipt {
    let policy = HttpsOutcallPolicy.nonReplicatedProbe();
    let response = await (with cycles = policy.attachedCycles) managementCanister.http_request(
      requestForProbe()
    );

    {
      url = policy.url;
      status = response.status;
      responseBytes = response.body.size();
      isReplicated = false;
    };
  };
};
