import Principal "mo:core/Principal";

module {
  public type Status = {
    isOperator : Bool;
    allowlistConfigured : Bool;
    recoveryConfigured : Bool;
    operatorCount : Nat;
  };

  let primaryOperatorText = "7t3c5-b4wkk-4hpst-vos2y-dwyjj-jhmaj-5zhbx-7tjno-vegoy-sce44-kae";
  let recoveryOperatorText : ?Text = null;

  public func isOperator(caller : Principal) : Bool {
    if (caller.isAnonymous()) {
      false;
    } else if (caller.toText() == primaryOperatorText) {
      true;
    } else {
      switch (recoveryOperatorText) {
        case (?recovery) { caller.toText() == recovery };
        case null { false };
      };
    };
  };

  public func requireOperator(caller : Principal) {
    assert isOperator(caller);
  };

  public func getOperatorStatus(caller : Principal) : Status {
    let recoveryConfigured = switch (recoveryOperatorText) {
      case (?_) { true };
      case null { false };
    };

    {
      isOperator = isOperator(caller);
      allowlistConfigured = true;
      recoveryConfigured;
      operatorCount = if (recoveryConfigured) { 2 } else { 1 };
    };
  };
};
