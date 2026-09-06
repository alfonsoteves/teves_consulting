import OperatorSession "../src/teves_consulting_backend/lib/OperatorSession";
import Text "mo:core/Text";

let nonce = Text.encodeUtf8("01234567890123456789012345678901");
let differentNonce = Text.encodeUtf8("abcdefghijklmnopqrstuvwxyzABCDEF");
let invalidNonce = Text.encodeUtf8("short");
let now : Int = 1_000_000_000;

assert OperatorSession.validNonce(nonce);
assert OperatorSession.validNonce(differentNonce);
assert not OperatorSession.validNonce(invalidNonce);

let issued = OperatorSession.issue([], nonce, now);
assert issued.issued;
assert issued.grants.size() == 1;
assert issued.grants[0].expiresAt > now;

let duplicate = OperatorSession.issue(issued.grants, nonce, now + 1);
assert not duplicate.issued;
assert duplicate.grants.size() == 1;

let wrongRedemption = OperatorSession.redeem(issued.grants, differentNonce, now + 1);
assert not wrongRedemption.redeemed;
assert wrongRedemption.grants.size() == 1;

let redemption = OperatorSession.redeem(issued.grants, nonce, now + 1);
assert redemption.redeemed;
assert redemption.grants.size() == 0;

let replay = OperatorSession.redeem(redemption.grants, nonce, now + 2);
assert not replay.redeemed;
assert replay.grants.size() == 0;

let expired = OperatorSession.redeem(
  issued.grants,
  nonce,
  issued.grants[0].expiresAt,
);
assert not expired.redeemed;
assert expired.grants.size() == 0;

let rejected = OperatorSession.issue([], invalidNonce, now);
assert not rejected.issued;
assert rejected.grants.size() == 0;
