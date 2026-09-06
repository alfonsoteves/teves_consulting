import Array "mo:core/Array";
import PrivateTypes "mo:aion_intelligence/Types";
import Types "../types";

module {
  func toPrivateRelationship(relationship : Types.Relationship) : PrivateTypes.Relationship {
    {
      subject = relationship.subject;
      predicate = relationship.predicate;
      target = relationship.target;
      category = relationship.category;
    };
  };

  public func toRankableMemory(summary : Types.MemorySummary) : PrivateTypes.Memory {
    {
      id = summary.id;
      title = summary.title;
      summary = summary.summary;
      tags = summary.tags;
      topics = summary.topics;
      keyDecisions = summary.keyDecisions;
      relationships = summary.relationships.map(func relationship { toPrivateRelationship(relationship) });
      milestone = summary.milestone;
      importance = summary.importance;
      confidence = summary.confidence;
      memoryType = summary.memoryType;
      status = summary.status;
      createdAtNanos = summary.createdAt;
    };
  };

  public func toRankableMemories(summaries : [Types.MemorySummary]) : [PrivateTypes.Memory] {
    summaries.map(func summary { toRankableMemory(summary) });
  };
};
