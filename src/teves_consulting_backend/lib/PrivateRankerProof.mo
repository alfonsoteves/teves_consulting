import MemoryRank "mo:aion_intelligence/MemoryRank";

module {
  public func isLinked() : Bool {
    switch (MemoryRank.detectIntent("How should the Motoko backend deploy?")) {
      case (#technical) { true };
      case _ { false };
    };
  };
};
