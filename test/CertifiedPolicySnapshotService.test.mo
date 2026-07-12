import CertifiedPolicySnapshotService "../src/teves_consulting_backend/lib/CertifiedPolicySnapshotService";

let expectedSnapshot = "aion-provider-policy-v1\npublicAnswer|openai|openai-production-baseline|1|0|0|0\nadminCandidateEvaluation|icp-llm|icp-admin-candidate|1|1|1|0\nnativeContinuityPreview|none|native-continuity-preview|0|0|0|0";
let expectedDigest : Blob = "\E4\23\34\D4\C8\10\67\2D\2A\52\79\77\16\57\38\A8\5B\BA\7F\97\77\51\14\BC\6B\1D\3A\43\F1\F9\64\EC";

let snapshot = CertifiedPolicySnapshotService.preview(null);

assert snapshot.policyVersion == "aion-provider-policy-v1";
assert snapshot.canonicalSnapshot == expectedSnapshot;
assert snapshot.snapshotHash == expectedDigest;
assert snapshot.certificate == null;
