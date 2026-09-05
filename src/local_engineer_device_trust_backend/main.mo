import Time "mo:core/Time";
import Trust "lib/LocalEngineerDeviceTrust";

shared ({ caller = _installer }) actor class LocalEngineerDeviceTrustBackend(init : Trust.InitArgs) {
  assert Trust.validInitialAuthorizationConfig(init);

  var records : [Trust.TrustRecord] = [];
  var authorizedServicePrincipals : [Principal] = Trust.sanitizeAuthorizedServicePrincipals(
    init.authorizedServicePrincipals
  );
  var recoveryGovernancePrincipals : [Principal] = Trust.sanitizeRecoveryGovernancePrincipals(
    init.recoveryGovernancePrincipals
  );
  var authorizationConfigVersion : Nat = Trust.initialAuthorizationConfigVersion;
  var latestAuthorizationRecovery : ?Trust.AuthorizationRecoveryProvenance = null;

  func state() : Trust.State {
    {
      records;
      authorizedServicePrincipals;
      recoveryGovernancePrincipals;
      authorizationConfigVersion;
      latestAuthorizationRecovery;
    };
  };

  func commit(next : Trust.State) {
    records := next.records;
    authorizedServicePrincipals := next.authorizedServicePrincipals;
    recoveryGovernancePrincipals := next.recoveryGovernancePrincipals;
    authorizationConfigVersion := next.authorizationConfigVersion;
    latestAuthorizationRecovery := next.latestAuthorizationRecovery;
  };

  public shared query ({ caller }) func getLocalEngineerDeviceTrust(
    deviceId : Text
  ) : async Trust.RecordResult {
    Trust.get(state(), caller, deviceId);
  };

  public shared ({ caller }) func readLocalEngineerDeviceTrustAuthoritatively(
    deviceId : Text
  ) : async Trust.RecordResult {
    Trust.authoritativeRead(state(), caller, deviceId);
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
    request : Trust.ReplaceAuthorizedServicePrincipalsRequest
  ) : async Trust.AuthorizationResult {
    let mutation = Trust.replaceAuthorizedServicePrincipals(state(), caller, request);
    commit(mutation.state);
    mutation.result;
  };

  public shared ({ caller }) func recoverLocalEngineerDeviceTrustAuthorizedPrincipals(
    request : Trust.RecoverAuthorizedServicePrincipalsRequest
  ) : async Trust.AuthorizationConfigResult {
    let mutation = Trust.recoverAuthorizedServicePrincipals(state(), caller, request, Time.now());
    commit(mutation.state);
    mutation.result;
  };

  public shared query ({ caller }) func getLocalEngineerDeviceTrustAuthorizationConfig() : async Trust.AuthorizationConfigResult {
    Trust.authorizationConfig(state(), caller);
  };
};
