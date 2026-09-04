import Time "mo:core/Time";
import Trust "lib/LocalEngineerDeviceTrust";

shared ({ caller = _installer }) actor class LocalEngineerDeviceTrustBackend(init : Trust.InitArgs) {
  var records : [Trust.TrustRecord] = [];
  var authorizedServicePrincipals : [Principal] = Trust.sanitizeAuthorizedServicePrincipals(
    init.authorizedServicePrincipals
  );

  func state() : Trust.State {
    {
      records;
      authorizedServicePrincipals;
    };
  };

  func commit(next : Trust.State) {
    records := next.records;
    authorizedServicePrincipals := next.authorizedServicePrincipals;
  };

  public shared query ({ caller }) func getLocalEngineerDeviceTrust(
    deviceId : Text
  ) : async Trust.RecordResult {
    Trust.get(state(), caller, deviceId);
  };

  public shared ({ caller }) func pairLocalEngineerDevice(
    request : Trust.PairRequest
  ) : async Trust.RecordResult {
    let mutation = Trust.pair(state(), caller, request, Time.now());
    commit(mutation.state);
    mutation.result;
  };

  public shared ({ caller }) func touchLocalEngineerPairedDevice(
    request : Trust.TouchRequest
  ) : async Trust.RecordResult {
    let mutation = Trust.touch(state(), caller, request, Time.now());
    commit(mutation.state);
    mutation.result;
  };

  public shared ({ caller }) func revokeLocalEngineerDevice(
    request : Trust.RevokeRequest
  ) : async Trust.RecordResult {
    let mutation = Trust.revoke(state(), caller, request, Time.now());
    commit(mutation.state);
    mutation.result;
  };

  public shared query ({ caller }) func listLocalEngineerDeviceTrust(
    request : Trust.ListRequest
  ) : async Trust.ListResult {
    Trust.list(state(), caller, request);
  };

  public shared ({ caller }) func replaceLocalEngineerDeviceTrustAuthorizedPrincipals(
    principals : [Principal]
  ) : async Trust.AuthorizationResult {
    let mutation = Trust.replaceAuthorizedServicePrincipals(state(), caller, principals);
    commit(mutation.state);
    mutation.result;
  };
};
