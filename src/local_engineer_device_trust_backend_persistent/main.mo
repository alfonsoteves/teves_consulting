import Time "mo:core/Time";
import Trust "../local_engineer_device_trust_backend/lib/LocalEngineerDeviceTrust";

shared ({ caller = _installer }) persistent actor class LocalEngineerDeviceTrustBackendPersistent(init : Trust.InstallArgs) {
  transient let initialState = switch (Trust.installState(init)) {
    case (?state) { state };
    case null {
      assert false;
      {
        records = [];
        authorizedServicePrincipals = [];
        recoveryGovernancePrincipals = [];
        authorizationConfigVersion = Trust.initialAuthorizationConfigVersion;
        latestAuthorizationRecovery = null;
      };
    };
  };

  var records : [Trust.TrustRecord] = initialState.records;
  var authorizedServicePrincipals : [Principal] = initialState.authorizedServicePrincipals;
  var recoveryGovernancePrincipals : [Principal] = initialState.recoveryGovernancePrincipals;
  var authorizationConfigVersion : Nat = initialState.authorizationConfigVersion;
  var latestAuthorizationRecovery : ?Trust.AuthorizationRecoveryProvenance = initialState.latestAuthorizationRecovery;

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
