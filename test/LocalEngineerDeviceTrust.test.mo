import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Trust "../src/local_engineer_device_trust_backend/lib/LocalEngineerDeviceTrust";

let service = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
let other = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
let replacement = Principal.fromBlob("\01");
let recovery = Principal.fromBlob("\02");
let alternateRecovery = Principal.fromBlob("\03");
let overflowOne = Principal.fromBlob("\04");
let overflowTwo = Principal.fromBlob("\05");
let overflowThree = Principal.fromBlob("\06");
let overflowFour = Principal.fromBlob("\07");
let overflowFive = Principal.fromBlob("\08");
let overflowSix = Principal.fromBlob("\09");
let sessionReference = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
let revokeReference = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
let digest = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
let fingerprint = "cccccccccccc";
let conflictingDigest = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
let conflictingFingerprint = "dddddddddddd";
let publicKey : Blob = "\04\01\02\03\04\05\06\07\08\09\0A\0B\0C\0D\0E\0F\10\11\12\13\14\15\16\17\18\19\1A\1B\1C\1D\1E\1F\20\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F\30\31\32\33\34\35\36\37\38\39\3A\3B\3C\3D\3E\3F\40";
let conflictingPublicKey : Blob = "\04\01\02\03\04\05\06\07\08\09\0A\0B\0C\0D\0E\0F\10\11\12\13\14\15\16\17\18\19\1A\1B\1C\1D\1E\1F\20\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F\30\31\32\33\34\35\36\37\38\39\3A\3B\3C\3D\3E\3F\41";

func repeated(text : Text, count : Nat) : Text {
  var result = "";
  var index = 0;
  while (index < count) {
    result #= text;
    index += 1;
  };
  result;
};

let deviceId = "dev_" # repeated("A", 43);

func emptyState() : Trust.State {
  {
    records = [];
    authorizedServicePrincipals = [service];
    recoveryGovernancePrincipals = [recovery];
    authorizationConfigVersion = Trust.initialAuthorizationConfigVersion;
    latestAuthorizationRecovery = null;
  };
};

func stateWithRecords(records : [Trust.TrustRecord]) : Trust.State {
  {
    records;
    authorizedServicePrincipals = [service];
    recoveryGovernancePrincipals = [recovery];
    authorizationConfigVersion = Trust.initialAuthorizationConfigVersion;
    latestAuthorizationRecovery = null;
  };
};

func serviceRotationRequest(principals : [Principal], version : Nat) : Trust.ReplaceAuthorizedServicePrincipalsRequest {
  {
    authorizedServicePrincipals = principals;
    expectedAuthorizationConfigVersion = version;
  };
};

func recoveryRequest(principals : [Principal], version : Nat, reasonCode : Trust.RecoveryReasonCode) : Trust.RecoverAuthorizedServicePrincipalsRequest {
  {
    authorizedServicePrincipals = principals;
    expectedAuthorizationConfigVersion = version;
    reasonCode;
  };
};

func digitText(value : Nat) : Text {
  switch (value) {
    case 0 { "0" };
    case 1 { "1" };
    case 2 { "2" };
    case 3 { "3" };
    case 4 { "4" };
    case 5 { "5" };
    case 6 { "6" };
    case 7 { "7" };
    case 8 { "8" };
    case _ { "9" };
  };
};

func pairRequest(expectedRecordVersion : ?Nat) : Trust.PairRequest {
  {
    schemaVersion = Trust.schemaVersion;
    protocolVersion = Trust.protocolVersion;
    deviceId;
    publicKeyX963 = publicKey;
    publicKeySha256 = digest;
    publicKeyFingerprint = fingerprint;
    keyAlgorithm = Trust.keyAlgorithm;
    keyProtection = #secure_enclave;
    keyProtectionTrust = Trust.keyProtectionTrust;
    approvingOperatorSessionReference = sessionReference;
    expectedRecordVersion;
  };
};

func assertUnauthorized(result : Trust.RecordResult) {
  switch (result) {
    case (#err(#unauthorized)) {};
    case _ { assert false };
  };
};

assert Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [service];
  recoveryGovernancePrincipals = [recovery];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [];
  recoveryGovernancePrincipals = [recovery];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [service];
  recoveryGovernancePrincipals = [];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [Principal.anonymous()];
  recoveryGovernancePrincipals = [recovery];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [service];
  recoveryGovernancePrincipals = [Principal.anonymous()];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [service, other, replacement, overflowOne, overflowTwo, overflowThree];
  recoveryGovernancePrincipals = [recovery];
});
assert not Trust.validInitialAuthorizationConfig({
  authorizedServicePrincipals = [service];
  recoveryGovernancePrincipals = [recovery, alternateRecovery, overflowOne, overflowTwo];
});
assert emptyState().authorizationConfigVersion == 1;

let sanitized = Trust.sanitizeAuthorizedServicePrincipals([service, service]);
assert sanitized.size() == 1;
assert sanitized[0] == service;

let sanitizedRecovery = Trust.sanitizeRecoveryGovernancePrincipals([alternateRecovery, recovery, recovery]);
assert sanitizedRecovery.size() == 2;
assert sanitizedRecovery[0] == recovery;
assert sanitizedRecovery[1] == alternateRecovery;

let unauthorizedRotation = Trust.replaceAuthorizedServicePrincipals(emptyState(), other, serviceRotationRequest([other], 1));
switch (unauthorizedRotation.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let staleRotation = Trust.replaceAuthorizedServicePrincipals(emptyState(), service, serviceRotationRequest([other], 2));
switch (staleRotation.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};

let recoveryOnlyRotation = Trust.replaceAuthorizedServicePrincipals(emptyState(), recovery, serviceRotationRequest([other], 1));
switch (recoveryOnlyRotation.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let invalidRotation = Trust.replaceAuthorizedServicePrincipals(emptyState(), service, serviceRotationRequest([Principal.anonymous()], 1));
switch (invalidRotation.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};

let emptyRotation = Trust.replaceAuthorizedServicePrincipals(emptyState(), service, serviceRotationRequest([], 1));
switch (emptyRotation.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};

let overLimitRotation = Trust.replaceAuthorizedServicePrincipals(
  emptyState(),
  service,
  serviceRotationRequest([service, other, replacement, overflowOne, overflowTwo, overflowThree], 1),
);
switch (overLimitRotation.result) {
  case (#err(#capacity_exceeded)) {};
  case _ { assert false };
};

let rotated = Trust.replaceAuthorizedServicePrincipals(emptyState(), service, serviceRotationRequest([other, other], 1));
switch (rotated.result) {
  case (#ok(principals)) {
    assert principals.size() == 1;
    assert principals[0] == other;
  };
  case _ { assert false };
};
assert rotated.state.authorizationConfigVersion == 2;
assert rotated.state.recoveryGovernancePrincipals.size() == 1;
assert rotated.state.recoveryGovernancePrincipals[0] == recovery;
switch (Trust.get(rotated.state, service, deviceId)) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

switch (Trust.authorizationConfig(rotated.state, recovery)) {
  case (#ok(config)) {
    assert config.authorizationConfigVersion == 2;
    assert config.authorizedServicePrincipals.size() == 1;
    assert config.authorizedServicePrincipals[0] == other;
    assert config.recoveryGovernancePrincipals.size() == 1;
    assert config.recoveryGovernancePrincipals[0] == recovery;
    assert config.latestAuthorizationRecovery == null;
  };
  case _ { assert false };
};

let unauthorizedPair = Trust.pair(emptyState(), other, pairRequest(null), 1_000);
assertUnauthorized(unauthorizedPair.result);
assert unauthorizedPair.state.records.size() == 0;

let paired = Trust.pair(emptyState(), service, pairRequest(null), 1_000);
switch (paired.result) {
  case (#ok(record)) {
    assert record.recordVersion == 1;
    assert record.trustState == #paired;
    assert record.firstSeenAtNs == 1_000;
    assert record.pairedAtNs == 1_000;
    assert record.lastSeenAtNs == 1_000;
    assert record.revokedAtNs == null;
  };
  case _ { assert false };
};

let noVersionReconnect = Trust.pair(
  paired.state,
  service,
  { pairRequest(null) with keyProtection = #keychain_software },
  2_000,
);
switch (noVersionReconnect.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};
switch (Trust.get(noVersionReconnect.state, service, deviceId)) {
  case (#ok(record)) {
    assert record.recordVersion == 1;
    assert record.trustState == #paired;
    assert record.publicKeyX963 == publicKey;
    assert record.publicKeySha256 == digest;
    assert record.publicKeyFingerprint == fingerprint;
    assert record.keyProtection == #secure_enclave;
    assert record.firstSeenAtNs == 1_000;
    assert record.pairedAtNs == 1_000;
    assert record.lastSeenAtNs == 1_000;
    assert record.approvingOperatorSessionReference == sessionReference;
  };
  case _ { assert false };
};

assertUnauthorized(Trust.get(paired.state, other, deviceId));
switch (Trust.list(paired.state, other, { limit = 10; cursor = null })) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let reconnected = Trust.pair(
  paired.state,
  service,
  { pairRequest(?1) with keyProtection = #keychain_software },
  2_000,
);
switch (reconnected.result) {
  case (#ok(record)) {
    assert record.recordVersion == 2;
    assert record.firstSeenAtNs == 1_000;
    assert record.pairedAtNs == 1_000;
    assert record.lastSeenAtNs == 2_000;
    assert record.keyProtection == #keychain_software;
    assert record.publicKeyX963 == publicKey;
    assert record.publicKeySha256 == digest;
    assert record.publicKeyFingerprint == fingerprint;
    assert record.approvingOperatorSessionReference == sessionReference;
  };
  case _ { assert false };
};

let staleReconnect = Trust.pair(reconnected.state, service, pairRequest(?1), 3_000);
switch (staleReconnect.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};
switch (Trust.get(staleReconnect.state, service, deviceId)) {
  case (#ok(record)) {
    assert record.recordVersion == 2;
    assert record.lastSeenAtNs == 2_000;
    assert record.keyProtection == #keychain_software;
  };
  case _ { assert false };
};

let conflictingDigestReconnect = Trust.pair(
  reconnected.state,
  service,
  {
    pairRequest(?2) with
    publicKeySha256 = conflictingDigest;
    publicKeyFingerprint = conflictingFingerprint;
    keyProtection = #keychain_software;
  },
  3_000,
);
switch (conflictingDigestReconnect.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};
switch (Trust.get(conflictingDigestReconnect.state, service, deviceId)) {
  case (#ok(record)) {
    assert record.recordVersion == 2;
    assert record.lastSeenAtNs == 2_000;
    assert record.publicKeyX963 == publicKey;
    assert record.publicKeySha256 == digest;
    assert record.publicKeyFingerprint == fingerprint;
    assert record.keyProtection == #keychain_software;
  };
  case _ { assert false };
};

let conflictingPublicKeyReconnect = Trust.pair(
  reconnected.state,
  service,
  { pairRequest(?2) with publicKeyX963 = conflictingPublicKey },
  3_000,
);
switch (conflictingPublicKeyReconnect.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};
switch (Trust.get(conflictingPublicKeyReconnect.state, service, deviceId)) {
  case (#ok(record)) {
    assert record.recordVersion == 2;
    assert record.lastSeenAtNs == 2_000;
    assert record.publicKeyX963 == publicKey;
    assert record.publicKeySha256 == digest;
    assert record.publicKeyFingerprint == fingerprint;
  };
  case _ { assert false };
};

let unauthorizedTouch = Trust.touch(reconnected.state, other, { deviceId; expectedRecordVersion = 2 }, 3_000);
assertUnauthorized(unauthorizedTouch.result);

let touched = Trust.touch(reconnected.state, service, { deviceId; expectedRecordVersion = 2 }, 3_000);
switch (touched.result) {
  case (#ok(record)) {
    assert record.recordVersion == 3;
    assert record.lastSeenAtNs == 3_000;
  };
  case _ { assert false };
};

let staleTouch = Trust.touch(touched.state, service, { deviceId; expectedRecordVersion = 2 }, 4_000);
switch (staleTouch.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};

let unauthorizedRevoke = Trust.revoke(
  touched.state,
  other,
  {
    deviceId;
    revocationReason = ?"owner requested";
    revokingOperatorSessionReference = revokeReference;
  },
  4_000,
);
assertUnauthorized(unauthorizedRevoke.result);

let revoked = Trust.revoke(
  touched.state,
  service,
  {
    deviceId;
    revocationReason = ?"owner requested";
    revokingOperatorSessionReference = revokeReference;
  },
  4_000,
);
switch (revoked.result) {
  case (#ok(record)) {
    assert record.trustState == #revoked;
    assert record.recordVersion == 4;
    assert record.revokedAtNs == ?4_000;
    assert record.revocationReason == ?"owner requested";
    assert record.revokingOperatorSessionReference == ?revokeReference;
  };
  case _ { assert false };
};

let repeatedRevoke = Trust.revoke(
  revoked.state,
  service,
  {
    deviceId;
    revocationReason = ?"different";
    revokingOperatorSessionReference = sessionReference;
  },
  5_000,
);
switch (repeatedRevoke.result) {
  case (#ok(record)) {
    assert record.trustState == #revoked;
    assert record.recordVersion == 4;
    assert record.revokedAtNs == ?4_000;
    assert record.revocationReason == ?"owner requested";
    assert record.revokingOperatorSessionReference == ?revokeReference;
  };
  case _ { assert false };
};

let revokedPair = Trust.pair(revoked.state, service, pairRequest(?4), 5_000);
switch (revokedPair.result) {
  case (#err(#revoked)) {};
  case _ { assert false };
};

let revokedNullVersionPair = Trust.pair(revoked.state, service, pairRequest(null), 5_000);
switch (revokedNullVersionPair.result) {
  case (#err(#revoked)) {};
  case _ { assert false };
};

let revokedTouch = Trust.touch(revoked.state, service, { deviceId; expectedRecordVersion = 4 }, 5_000);
switch (revokedTouch.result) {
  case (#err(#revoked)) {};
  case _ { assert false };
};

switch (Trust.list(revoked.state, service, { limit = 10; cursor = null })) {
  case (#ok(response)) {
    assert response.records.size() == 1;
    assert response.nextCursor == null;
    assert response.records[0].trustState == #revoked;
  };
  case _ { assert false };
};

let recordsBeforeNormalRotation = revoked.state.records;
let normalRotationWithRecords = Trust.replaceAuthorizedServicePrincipals(
  revoked.state,
  service,
  serviceRotationRequest([other], 1),
);
switch (normalRotationWithRecords.result) {
  case (#ok(principals)) {
    assert principals.size() == 1;
    assert principals[0] == other;
  };
  case _ { assert false };
};
assert normalRotationWithRecords.state.records == recordsBeforeNormalRotation;
assert normalRotationWithRecords.state.authorizationConfigVersion == 2;

let unauthorizedRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  service,
  recoveryRequest([replacement], 1, #lost_service_principal),
  6_000,
);
switch (unauthorizedRecovery.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let anonymousRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  Principal.anonymous(),
  recoveryRequest([replacement], 1, #lost_service_principal),
  6_000,
);
switch (anonymousRecovery.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let staleRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  recovery,
  recoveryRequest([replacement], 2, #lost_service_principal),
  6_000,
);
switch (staleRecovery.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};

let emptyRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  recovery,
  recoveryRequest([], 1, #lost_service_principal),
  6_000,
);
switch (emptyRecovery.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};

let overLimitRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  recovery,
  recoveryRequest([service, other, replacement, overflowOne, overflowTwo, overflowThree], 1, #lost_service_principal),
  6_000,
);
switch (overLimitRecovery.result) {
  case (#err(#capacity_exceeded)) {};
  case _ { assert false };
};

let anonymousReplacementRecovery = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  recovery,
  recoveryRequest([Principal.anonymous()], 1, #lost_service_principal),
  6_000,
);
switch (anonymousReplacementRecovery.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};

let recovered = Trust.recoverAuthorizedServicePrincipals(
  revoked.state,
  recovery,
  recoveryRequest([replacement], 1, #compromised_service_principal),
  6_000,
);
switch (recovered.result) {
  case (#ok(config)) {
    assert config.authorizedServicePrincipals.size() == 1;
    assert config.authorizedServicePrincipals[0] == replacement;
    assert config.recoveryGovernancePrincipals.size() == 1;
    assert config.recoveryGovernancePrincipals[0] == recovery;
    assert config.authorizationConfigVersion == 2;
    switch (config.latestAuthorizationRecovery) {
      case (?provenance) {
        assert provenance.recoveryCaller == recovery;
        assert provenance.recoveredAtNs == 6_000;
        assert provenance.authorizationConfigVersion == 2;
        assert provenance.reasonCode == #compromised_service_principal;
        assert provenance.previousAuthorizedServicePrincipalsDigest.size() == Trust.sha256HexCharacters;
        assert provenance.newAuthorizedServicePrincipalsDigest.size() == Trust.sha256HexCharacters;
        assert provenance.previousAuthorizedServicePrincipalsDigest != provenance.newAuthorizedServicePrincipalsDigest;
      };
      case null { assert false };
    };
  };
  case _ { assert false };
};
assert recovered.state.records == revoked.state.records;
switch (Trust.get(recovered.state, service, deviceId)) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};
switch (Trust.get(recovered.state, replacement, deviceId)) {
  case (#ok(record)) {
    assert record.trustState == #revoked;
    assert record.recordVersion == 4;
    assert record.revokedAtNs == ?4_000;
    assert record.revocationReason == ?"owner requested";
  };
  case _ { assert false };
};
switch (Trust.get(recovered.state, recovery, deviceId)) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};
switch (Trust.list(recovered.state, recovery, { limit = 10; cursor = null })) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};
switch (Trust.authorizationConfig(recovered.state, Principal.anonymous())) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};
let recoveryOnlyPair = Trust.pair(recovered.state, recovery, pairRequest(null), 7_000);
switch (recoveryOnlyPair.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};
let recoveryOnlyRevoke = Trust.revoke(
  recovered.state,
  recovery,
  {
    deviceId;
    revocationReason = ?"bad";
    revokingOperatorSessionReference = revokeReference;
  },
  7_000,
);
switch (recoveryOnlyRevoke.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let serviceWinsRotation = Trust.replaceAuthorizedServicePrincipals(
  emptyState(),
  service,
  serviceRotationRequest([other], 1),
);
switch (serviceWinsRotation.result) {
  case (#ok(_)) {};
  case _ { assert false };
};
let staleRecoveryAfterServiceWin = Trust.recoverAuthorizedServicePrincipals(
  serviceWinsRotation.state,
  recovery,
  recoveryRequest([replacement], 1, #compromised_service_principal),
  8_000,
);
switch (staleRecoveryAfterServiceWin.result) {
  case (#err(#version_conflict)) {};
  case _ { assert false };
};
let recoveredAfterReload = Trust.recoverAuthorizedServicePrincipals(
  serviceWinsRotation.state,
  recovery,
  recoveryRequest([replacement], 2, #compromised_service_principal),
  8_100,
);
switch (recoveredAfterReload.result) {
  case (#ok(config)) {
    assert config.authorizationConfigVersion == 3;
    assert config.authorizedServicePrincipals[0] == replacement;
  };
  case _ { assert false };
};

let recoveryWins = Trust.recoverAuthorizedServicePrincipals(
  emptyState(),
  recovery,
  recoveryRequest([replacement], 1, #compromised_service_principal),
  8_200,
);
switch (recoveryWins.result) {
  case (#ok(_)) {};
  case _ { assert false };
};
let staleServiceAfterRecoveryWin = Trust.replaceAuthorizedServicePrincipals(
  recoveryWins.state,
  service,
  serviceRotationRequest([other], 1),
);
switch (staleServiceAfterRecoveryWin.result) {
  case (#err(#unauthorized)) {};
  case _ { assert false };
};

let secondDeviceId = "dev_" # repeated("B", 43);
let pairedAndRevoked = Trust.pair(
  revoked.state,
  service,
  { pairRequest(null) with deviceId = secondDeviceId },
  9_000,
);
switch (pairedAndRevoked.result) {
  case (#ok(record)) {
    assert record.trustState == #paired;
    assert record.recordVersion == 1;
  };
  case _ { assert false };
};
let recordsBeforeRecovery = pairedAndRevoked.state.records;
let recoveredPairedAndRevoked = Trust.recoverAuthorizedServicePrincipals(
  pairedAndRevoked.state,
  recovery,
  recoveryRequest([replacement], 1, #lost_service_principal),
  9_100,
);
switch (recoveredPairedAndRevoked.result) {
  case (#ok(_)) {};
  case _ { assert false };
};
assert recoveredPairedAndRevoked.state.records == recordsBeforeRecovery;
switch (Trust.get(recoveredPairedAndRevoked.state, replacement, deviceId)) {
  case (#ok(record)) { assert record.trustState == #revoked };
  case _ { assert false };
};
switch (Trust.get(recoveredPairedAndRevoked.state, replacement, secondDeviceId)) {
  case (#ok(record)) { assert record.trustState == #paired };
  case _ { assert false };
};

var capacityRecords : [Trust.TrustRecord] = [];
var capacityIndex = 0;
while (capacityIndex < Trust.maximumTrustRecords) {
  let id = "dev_" # repeated("A", 41) # digitText(capacityIndex / 10) # digitText(capacityIndex % 10);
  let request = { pairRequest(null) with deviceId = id };
  let next = Trust.pair(stateWithRecords(capacityRecords), service, request, 10_000 + capacityIndex);
  switch (next.result) {
    case (#ok(_)) { capacityRecords := next.state.records };
    case _ { assert false };
  };
  capacityIndex += 1;
};

let overCapacity = Trust.pair(
  stateWithRecords(capacityRecords),
  service,
  { pairRequest(null) with deviceId = "dev_" # repeated("B", 43) },
  20_000,
);
switch (overCapacity.result) {
  case (#err(#capacity_exceeded)) {};
  case _ { assert false };
};

let malformed = Trust.pair(emptyState(), service, { pairRequest(null) with publicKeyX963 = "\04\01" }, 1_000);
switch (malformed.result) {
  case (#err(#invalid_record)) {};
  case _ { assert false };
};
