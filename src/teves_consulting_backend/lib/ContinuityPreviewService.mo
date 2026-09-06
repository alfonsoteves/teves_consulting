import BoundedContinuityPreview "BoundedContinuityPreview";
import ContinuityContextBuilder "ContinuityContextBuilder";
import ContinuityPreviewContract "ContinuityPreviewContract";
import ContinuityPreviewProjection "ContinuityPreviewProjection";
import Types "../types";

module {
  public func previewForOwner(
    summaries : [Types.MemorySummary],
    owner : Principal,
    queryText : Text,
  ) : ContinuityPreviewContract.Result {
    switch (ContinuityPreviewContract.normalizeQuery(queryText)) {
      case (#invalidQuery) { #err(#invalidQuery) };
      case (#ok(normalizedQuery)) {
        let preview = ContinuityPreviewProjection.buildForOwner(
          summaries,
          owner,
          normalizedQuery,
          BoundedContinuityPreview.maximumRankedSummaries,
        );

        #ok(ContinuityPreviewContract.response(preview, ContinuityContextBuilder.build(preview)));
      };
    };
  };
};
