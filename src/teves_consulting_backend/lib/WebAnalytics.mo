import Array "mo:core/Array";
import Text "mo:core/Text";
import Types "../types";

module {
  public let maxDailyCounts : Nat = 2000;

  public type RecordResult = {
    counts : [Types.WebAnalyticsDailyCount];
    accepted : Bool;
  };

  public func boundedText(value : Text, limit : Nat, fallback : Text) : Text {
    let trimmed = value.trim(#predicate(func character { character == ' ' or character == '\n' or character == '\r' or character == '\t' }));
    if (trimmed.size() == 0) {
      return fallback;
    };
    if (trimmed.size() <= limit) {
      return trimmed;
    };

    var result = "";
    var index = 0;
    for (character in trimmed.chars()) {
      if (index >= limit) {
        return result;
      };
      result #= Text.fromChar(character);
      index += 1;
    };
    result;
  };

  func isDigit(character : Char) : Bool {
    character >= '0' and character <= '9';
  };

  public func validDayKey(value : Text) : Bool {
    if (value.size() != 10) {
      return false;
    };

    var index = 0;
    for (character in value.chars()) {
      let valid = switch (index) {
        case 4 { character == '-' };
        case 7 { character == '-' };
        case _ { isDigit(character) };
      };
      if (not valid) {
        return false;
      };
      index += 1;
    };
    true;
  };

  public func validPublicPagePath(value : Text) : Bool {
    value == "/" or (
      value.startsWith(#text("/")) and
      not value.startsWith(#text("//")) and
      not value.contains(#text("..")) and
      not value.contains(#text("?")) and
      not value.contains(#text("#")) and
      value != "/admin.html" and
      not value.startsWith(#text("/admin/"))
    );
  };

  func appendEntry(
    counts : [Types.WebAnalyticsDailyCount],
    maxCounts : Nat,
    entry : Types.WebAnalyticsDailyCount,
  ) : [Types.WebAnalyticsDailyCount] {
    let count = counts.size();
    if (count >= maxCounts) {
      return Array.tabulate<Types.WebAnalyticsDailyCount>(
        maxCounts,
        func index {
          if (index + 1 == maxCounts) {
            entry;
          } else {
            counts[index + 1];
          };
        },
      );
    };

    Array.tabulate<Types.WebAnalyticsDailyCount>(
      count + 1,
      func index {
        if (index == count) {
          entry;
        } else {
          counts[index];
        };
      },
    );
  };

  func refreshEntry(
    counts : [Types.WebAnalyticsDailyCount],
    matchIndex : Nat,
    entry : Types.WebAnalyticsDailyCount,
  ) : [Types.WebAnalyticsDailyCount] {
    let count = counts.size();
    Array.tabulate<Types.WebAnalyticsDailyCount>(
      count,
      func index {
        if (index + 1 == count) {
          entry;
        } else {
          let sourceIndex = if (index < matchIndex) { index } else { index + 1 };
          counts[sourceIndex];
        };
      },
    );
  };

  public func recordPageView(
    counts : [Types.WebAnalyticsDailyCount],
    maxCounts : Nat,
    dayKey : Text,
    pagePath : Text,
    pageTitle : Text,
    locale : Text,
    now : Int,
  ) : RecordResult {
    let boundedDayKey = boundedText(dayKey, 10, "unknown");
    let boundedPagePath = boundedText(pagePath, 160, "/");
    let boundedPageTitle = boundedText(pageTitle, 160, boundedPagePath);
    let boundedLocale = boundedText(locale, 8, "unknown");
    if (not validDayKey(boundedDayKey)) {
      return { counts; accepted = false };
    };
    if (boundedLocale != "en" and boundedLocale != "es") {
      return { counts; accepted = false };
    };
    if (not validPublicPagePath(boundedPagePath)) {
      return { counts; accepted = false };
    };

    var matchIndex : ?Nat = null;
    var index = 0;
    for (entry in counts.values()) {
      if (entry.dayKey == boundedDayKey and entry.pagePath == boundedPagePath and entry.locale == boundedLocale) {
        matchIndex := ?index;
      };
      index += 1;
    };

    switch (matchIndex) {
      case (?foundIndex) {
        let entry = counts[foundIndex];
        {
          counts = refreshEntry(
            counts,
            foundIndex,
            {
              dayKey = entry.dayKey;
              pagePath = entry.pagePath;
              pageTitle = boundedPageTitle;
              locale = entry.locale;
              count = entry.count + 1;
              firstSeenAt = entry.firstSeenAt;
              lastSeenAt = now;
            },
          );
          accepted = true;
        };
      };
      case null {
        {
          counts = appendEntry(
            counts,
            maxCounts,
            {
              dayKey = boundedDayKey;
              pagePath = boundedPagePath;
              pageTitle = boundedPageTitle;
              locale = boundedLocale;
              count = 1;
              firstSeenAt = now;
              lastSeenAt = now;
            },
          );
          accepted = true;
        };
      };
    };
  };
};
