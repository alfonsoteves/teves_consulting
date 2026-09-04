import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

module {
  public let schemaVersion : Text = "local_engineer_device_trust_record_v1";
  public let protocolVersion : Text = "1";
  public let keyAlgorithm : Text = "p256_ecdsa_sha256_x963";
  public let keyProtectionTrust : Text = "client_reported_advisory_not_attested";
  public let maximumTrustRecords : Nat = 100;
  public let maximumRevocationReasonCharacters : Nat = 120;
  public let x963PublicKeyBytes : Nat = 65;
  public let sha256HexCharacters : Nat = 64;
  public let fingerprintCharacters : Nat = 12;
  public let deviceIdCharacters : Nat = 47;

  public type KeyProtection = {
    #secure_enclave;
    #keychain_software;
    #unknown;
  };

  public type TrustState = {
    #paired;
    #revoked;
  };

  public type TrustRecord = {
    schemaVersion : Text;
    protocolVersion : Text;
    deviceId : Text;
    publicKeyX963 : Blob;
    publicKeySha256 : Text;
    publicKeyFingerprint : Text;
    keyAlgorithm : Text;
    keyProtection : KeyProtection;
    keyProtectionTrust : Text;
    trustState : TrustState;
    firstSeenAtNs : Int;
    pairedAtNs : Int;
    lastSeenAtNs : Int;
    revokedAtNs : ?Int;
    revocationReason : ?Text;
    approvingOperatorSessionReference : Text;
    revokingOperatorSessionReference : ?Text;
    recordVersion : Nat;
  };

  public type PairRequest = {
    schemaVersion : Text;
    protocolVersion : Text;
    deviceId : Text;
    publicKeyX963 : Blob;
    publicKeySha256 : Text;
    publicKeyFingerprint : Text;
    keyAlgorithm : Text;
    keyProtection : KeyProtection;
    keyProtectionTrust : Text;
    approvingOperatorSessionReference : Text;
    expectedRecordVersion : ?Nat;
  };

  public type TouchRequest = {
    deviceId : Text;
    expectedRecordVersion : Nat;
  };

  public type RevokeRequest = {
    deviceId : Text;
    revocationReason : ?Text;
    revokingOperatorSessionReference : Text;
  };

  public type ListRequest = {
    limit : Nat;
    cursor : ?Nat;
  };

  public type Error = {
    #not_found;
    #unauthorized;
    #revoked;
    #version_conflict;
    #invalid_record;
    #capacity_exceeded;
    #persistence_failure;
  };

  public type RecordResult = {
    #ok : TrustRecord;
    #err : Error;
  };

  public type ListResponse = {
    records : [TrustRecord];
    nextCursor : ?Nat;
  };

  public type ListResult = {
    #ok : ListResponse;
    #err : Error;
  };

  public type AuthorizationResult = {
    #ok : [Principal];
    #err : Error;
  };

  public type State = {
    records : [TrustRecord];
    authorizedServicePrincipals : [Principal];
  };

  public type InitArgs = {
    authorizedServicePrincipals : [Principal];
  };

  public type RecordMutation = {
    state : State;
    result : RecordResult;
  };

  public type ListMutation = {
    state : State;
    result : ListResult;
  };

  public type AuthorizationMutation = {
    state : State;
    result : AuthorizationResult;
  };

  func isHexChar(character : Char) : Bool {
    (character >= '0' and character <= '9') or (character >= 'a' and character <= 'f');
  };

  func isDeviceIdChar(character : Char) : Bool {
    (character >= 'A' and character <= 'Z') or (character >= 'a' and character <= 'z') or (character >= '0' and character <= '9') or character == '_' or character == '-';
  };

  func isAsciiPrintableWithoutNewline(character : Char) : Bool {
    character >= ' ' and character <= '~';
  };

  func isHexDigest(value : Text) : Bool {
    if (value.size() != sha256HexCharacters) {
      return false;
    };
    for (character in value.chars()) {
      if (not isHexChar(character)) {
        return false;
      };
    };
    true;
  };

  func isFingerprint(value : Text) : Bool {
    if (value.size() != fingerprintCharacters) {
      return false;
    };
    for (character in value.chars()) {
      if (not isHexChar(character)) {
        return false;
      };
    };
    true;
  };

  func textPrefix(value : Text, limit : Nat) : Text {
    var result = "";
    var index = 0;
    for (character in value.chars()) {
      if (index >= limit) {
        return result;
      };
      result #= Text.fromChar(character);
      index += 1;
    };
    result;
  };

  func publicKeyHasUncompressedPrefix(publicKeyX963 : Blob) : Bool {
    if (publicKeyX963.size() != x963PublicKeyBytes) {
      return false;
    };
    var index = 0;
    for (byte in publicKeyX963.vals()) {
      if (index == 0) {
        return byte == 4;
      };
      index += 1;
    };
    false;
  };

  func validDeviceId(deviceId : Text) : Bool {
    if (deviceId.size() != deviceIdCharacters or not deviceId.startsWith(#text("dev_"))) {
      return false;
    };
    for (character in deviceId.chars()) {
      if (not isDeviceIdChar(character)) {
        return false;
      };
    };
    true;
  };

  func validOptionalReason(reason : ?Text) : Bool {
    switch (reason) {
      case null { true };
      case (?text) {
        if (text.size() == 0 or text.size() > maximumRevocationReasonCharacters) {
          return false;
        };
        for (character in text.chars()) {
          if (not isAsciiPrintableWithoutNewline(character)) {
            return false;
          };
        };
        true;
      };
    };
  };

  func validRecord(record : TrustRecord) : Bool {
    if (
      record.schemaVersion != schemaVersion or record.protocolVersion != protocolVersion or record.keyAlgorithm != keyAlgorithm or record.keyProtectionTrust != keyProtectionTrust or not validDeviceId(record.deviceId) or not publicKeyHasUncompressedPrefix(record.publicKeyX963) or not isHexDigest(record.publicKeySha256) or not isFingerprint(record.publicKeyFingerprint) or record.publicKeyFingerprint != textPrefix(record.publicKeySha256, fingerprintCharacters) or record.recordVersion < 1 or record.firstSeenAtNs < 0 or record.pairedAtNs < record.firstSeenAtNs or record.pairedAtNs < 0 or record.lastSeenAtNs < record.pairedAtNs or not isHexDigest(record.approvingOperatorSessionReference)
    ) {
      return false;
    };

    switch (record.trustState) {
      case (#paired) {
        record.revokedAtNs == null and record.revocationReason == null and record.revokingOperatorSessionReference == null;
      };
      case (#revoked) {
        switch (record.revokedAtNs, record.revokingOperatorSessionReference) {
          case (?revokedAtNs, ?reference) {
            revokedAtNs >= record.lastSeenAtNs and isHexDigest(reference) and validOptionalReason(record.revocationReason);
          };
          case _ { false };
        };
      };
    };
  };

  func authorized(state : State, caller : Principal) : Bool {
    if (caller.isAnonymous()) {
      return false;
    };
    for (principal in state.authorizedServicePrincipals.values()) {
      if (principal == caller) {
        return true;
      };
    };
    false;
  };

  func findIndex(records : [TrustRecord], deviceId : Text) : ?Nat {
    var index = 0;
    for (record in records.values()) {
      if (record.deviceId == deviceId) {
        return ?index;
      };
      index += 1;
    };
    null;
  };

  func replace(records : [TrustRecord], index : Nat, replacement : TrustRecord) : [TrustRecord] {
    Array.tabulate<TrustRecord>(
      records.size(),
      func currentIndex {
        if (currentIndex == index) {
          replacement;
        } else {
          records[currentIndex];
        };
      },
    );
  };

  func invalid(callerAuthorized : Bool) : Error {
    if (callerAuthorized) { #invalid_record } else { #unauthorized };
  };

  public func sanitizeAuthorizedServicePrincipals(principals : [Principal]) : [Principal] {
    var sanitized : [Principal] = [];
    for (principal in principals.values()) {
      if (not principal.isAnonymous()) {
        var found = false;
        for (existing in sanitized.values()) {
          if (existing == principal) {
            found := true;
          };
        };
        if (not found) {
          sanitized := sanitized.concat([principal]);
        };
      };
    };
    sanitized;
  };

  public func replaceAuthorizedServicePrincipals(
    state : State,
    caller : Principal,
    principals : [Principal],
  ) : AuthorizationMutation {
    if (not authorized(state, caller)) {
      return { state; result = #err(#unauthorized) };
    };
    let sanitized = sanitizeAuthorizedServicePrincipals(principals);
    if (sanitized.size() == 0) {
      return { state; result = #err(#invalid_record) };
    };
    let next = { state with authorizedServicePrincipals = sanitized };
    { state = next; result = #ok(sanitized) };
  };

  public func get(state : State, caller : Principal, deviceId : Text) : RecordResult {
    if (not authorized(state, caller)) {
      return #err(#unauthorized);
    };
    switch (findIndex(state.records, deviceId)) {
      case null { #err(#not_found) };
      case (?index) { #ok(state.records[index]) };
    };
  };

  public func pair(state : State, caller : Principal, request : PairRequest, now : Int) : RecordMutation {
    let callerAuthorized = authorized(state, caller);
    if (not callerAuthorized) {
      return { state; result = #err(#unauthorized) };
    };
    if (
      request.schemaVersion != schemaVersion or request.protocolVersion != protocolVersion or request.keyAlgorithm != keyAlgorithm or request.keyProtectionTrust != keyProtectionTrust or not validDeviceId(request.deviceId) or not publicKeyHasUncompressedPrefix(request.publicKeyX963) or not isHexDigest(request.publicKeySha256) or not isFingerprint(request.publicKeyFingerprint) or request.publicKeyFingerprint != textPrefix(request.publicKeySha256, fingerprintCharacters) or not isHexDigest(request.approvingOperatorSessionReference)
    ) {
      return { state; result = #err(invalid(callerAuthorized)) };
    };

    switch (findIndex(state.records, request.deviceId)) {
      case null {
        if (state.records.size() >= maximumTrustRecords) {
          return { state; result = #err(#capacity_exceeded) };
        };
        let record : TrustRecord = {
          schemaVersion = request.schemaVersion;
          protocolVersion = request.protocolVersion;
          deviceId = request.deviceId;
          publicKeyX963 = request.publicKeyX963;
          publicKeySha256 = request.publicKeySha256;
          publicKeyFingerprint = request.publicKeyFingerprint;
          keyAlgorithm = request.keyAlgorithm;
          keyProtection = request.keyProtection;
          keyProtectionTrust = request.keyProtectionTrust;
          trustState = #paired;
          firstSeenAtNs = now;
          pairedAtNs = now;
          lastSeenAtNs = now;
          revokedAtNs = null;
          revocationReason = null;
          approvingOperatorSessionReference = request.approvingOperatorSessionReference;
          revokingOperatorSessionReference = null;
          recordVersion = 1;
        };
        if (not validRecord(record)) {
          return { state; result = #err(#invalid_record) };
        };
        {
          state = { state with records = state.records.concat([record]) };
          result = #ok(record);
        };
      };
      case (?index) {
        let existing = state.records[index];
        if (existing.trustState == #revoked) {
          return { state; result = #err(#revoked) };
        };
        if (existing.publicKeyX963 != request.publicKeyX963 or existing.publicKeySha256 != request.publicKeySha256) {
          return { state; result = #err(#invalid_record) };
        };
        switch (request.expectedRecordVersion) {
          case null {
            return { state; result = #err(#version_conflict) };
          };
          case (?expected) {
            if (expected != existing.recordVersion) {
              return { state; result = #err(#version_conflict) };
            };
          };
        };
        let lastSeen = if (now > existing.lastSeenAtNs) { now } else {
          existing.lastSeenAtNs;
        };
        let updated : TrustRecord = {
          existing with
          keyProtection = request.keyProtection;
          lastSeenAtNs = lastSeen;
          recordVersion = existing.recordVersion + 1;
        };
        if (not validRecord(updated)) {
          return { state; result = #err(#invalid_record) };
        };
        {
          state = {
            state with records = replace(state.records, index, updated)
          };
          result = #ok(updated);
        };
      };
    };
  };

  public func touch(state : State, caller : Principal, request : TouchRequest, now : Int) : RecordMutation {
    if (not authorized(state, caller)) {
      return { state; result = #err(#unauthorized) };
    };
    switch (findIndex(state.records, request.deviceId)) {
      case null { { state; result = #err(#not_found) } };
      case (?index) {
        let existing = state.records[index];
        if (existing.trustState == #revoked) {
          return { state; result = #err(#revoked) };
        };
        if (request.expectedRecordVersion != existing.recordVersion) {
          return { state; result = #err(#version_conflict) };
        };
        let lastSeen = if (now > existing.lastSeenAtNs) { now } else {
          existing.lastSeenAtNs;
        };
        let updated : TrustRecord = {
          existing with
          lastSeenAtNs = lastSeen;
          recordVersion = existing.recordVersion + 1;
        };
        if (not validRecord(updated)) {
          return { state; result = #err(#invalid_record) };
        };
        {
          state = {
            state with records = replace(state.records, index, updated)
          };
          result = #ok(updated);
        };
      };
    };
  };

  public func revoke(state : State, caller : Principal, request : RevokeRequest, now : Int) : RecordMutation {
    if (not authorized(state, caller)) {
      return { state; result = #err(#unauthorized) };
    };
    if (not isHexDigest(request.revokingOperatorSessionReference) or not validOptionalReason(request.revocationReason)) {
      return { state; result = #err(#invalid_record) };
    };
    switch (findIndex(state.records, request.deviceId)) {
      case null { { state; result = #err(#not_found) } };
      case (?index) {
        let existing = state.records[index];
        if (existing.trustState == #revoked) {
          return { state; result = #ok(existing) };
        };
        let revokedAt = if (now > existing.lastSeenAtNs) { now } else {
          existing.lastSeenAtNs;
        };
        let updated : TrustRecord = {
          existing with
          trustState = #revoked;
          lastSeenAtNs = revokedAt;
          revokedAtNs = ?revokedAt;
          revocationReason = request.revocationReason;
          revokingOperatorSessionReference = ?request.revokingOperatorSessionReference;
          recordVersion = existing.recordVersion + 1;
        };
        if (not validRecord(updated)) {
          return { state; result = #err(#invalid_record) };
        };
        {
          state = {
            state with records = replace(state.records, index, updated)
          };
          result = #ok(updated);
        };
      };
    };
  };

  public func list(state : State, caller : Principal, request : ListRequest) : ListResult {
    if (not authorized(state, caller)) {
      return #err(#unauthorized);
    };
    let start = switch (request.cursor) {
      case null { 0 };
      case (?cursor) { cursor };
    };
    let requestedLimit = if (request.limit == 0 or request.limit > maximumTrustRecords) {
      maximumTrustRecords;
    } else {
      request.limit;
    };
    if (start >= state.records.size()) {
      return #ok({ records = []; nextCursor = null });
    };
    var records : [TrustRecord] = [];
    var index = 0;
    var emitted = 0;
    for (record in state.records.values()) {
      if (index >= start and emitted < requestedLimit) {
        records := records.concat([record]);
        emitted += 1;
      };
      index += 1;
    };
    let next = if (start + emitted < state.records.size()) {
      ?(start + emitted);
    } else {
      null;
    };
    #ok({ records; nextCursor = next });
  };
};
