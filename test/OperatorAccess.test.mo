import Principal "mo:core/Principal";
import OperatorAccess "../src/teves_consulting_backend/lib/OperatorAccess";

let primaryOperator = Principal.fromText(
  "7t3c5-b4wkk-4hpst-vos2y-dwyjj-jhmaj-5zhbx-7tjno-vegoy-sce44-kae"
);
let ordinaryPrincipal = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

assert OperatorAccess.isOperator(primaryOperator);
assert not OperatorAccess.isOperator(ordinaryPrincipal);
assert not OperatorAccess.isOperator(Principal.anonymous());

OperatorAccess.requireOperator(primaryOperator);

let primaryStatus = OperatorAccess.getOperatorStatus(primaryOperator);
assert primaryStatus.isOperator;
assert primaryStatus.allowlistConfigured;
assert not primaryStatus.recoveryConfigured;
assert primaryStatus.operatorCount == 1;

let ordinaryStatus = OperatorAccess.getOperatorStatus(ordinaryPrincipal);
assert not ordinaryStatus.isOperator;
assert ordinaryStatus.allowlistConfigured;
assert not ordinaryStatus.recoveryConfigured;
assert ordinaryStatus.operatorCount == 1;
