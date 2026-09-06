import MemoryRank "mo:aion_intelligence/MemoryRank";

module {
  public func isLinked() : Bool {
    switch (MemoryRank.detectIntent("What is the next action for Aion?")) {
      case (#planning) { true };
      case (_) { false };
    };
  };
};
