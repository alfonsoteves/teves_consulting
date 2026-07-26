import WebAnalytics "../src/teves_consulting_backend/lib/WebAnalytics";
import Types "../src/teves_consulting_backend/types";

func entry(dayKey : Text, pagePath : Text, locale : Text, count : Nat) : Types.WebAnalyticsDailyCount {
  {
    dayKey;
    pagePath;
    pageTitle = pagePath;
    locale;
    count;
    firstSeenAt = 1;
    lastSeenAt = 1;
  };
};

assert WebAnalytics.validDayKey("2026-07-26");
assert not WebAnalytics.validDayKey("2026-7-26");
assert not WebAnalytics.validDayKey("2026-07-aa");

assert WebAnalytics.validPublicPagePath("/");
assert WebAnalytics.validPublicPagePath("/insights.html");
assert WebAnalytics.validPublicPagePath("/es/insights.html");
assert not WebAnalytics.validPublicPagePath("//evil.example");
assert not WebAnalytics.validPublicPagePath("/../admin.html");
assert not WebAnalytics.validPublicPagePath("/admin.html");
assert not WebAnalytics.validPublicPagePath("/admin/settings");
assert not WebAnalytics.validPublicPagePath("/insights.html?x=1");

let first = WebAnalytics.recordPageView([], 3, "2026-07-26", "/insights.html", "Insights", "en", 10);
assert first.accepted;
assert first.counts.size() == 1;
assert first.counts[0].count == 1;
assert first.counts[0].pageTitle == "Insights";

let second = WebAnalytics.recordPageView(first.counts, 3, "2026-07-26", "/insights.html", "Insights Updated", "en", 20);
assert second.accepted;
assert second.counts.size() == 1;
assert second.counts[0].count == 2;
assert second.counts[0].firstSeenAt == 10;
assert second.counts[0].lastSeenAt == 20;
assert second.counts[0].pageTitle == "Insights Updated";

let rejectedDay = WebAnalytics.recordPageView(second.counts, 3, "bad-day", "/insights.html", "Insights", "en", 30);
assert not rejectedDay.accepted;
assert rejectedDay.counts.size() == 1;
assert rejectedDay.counts[0].count == 2;

let rejectedLocale = WebAnalytics.recordPageView(second.counts, 3, "2026-07-26", "/insights.html", "Insights", "fr", 30);
assert not rejectedLocale.accepted;
assert rejectedLocale.counts.size() == 1;
assert rejectedLocale.counts[0].count == 2;

let rejectedPath = WebAnalytics.recordPageView(second.counts, 3, "2026-07-26", "/admin.html", "Admin", "en", 30);
assert not rejectedPath.accepted;
assert rejectedPath.counts.size() == 1;
assert rejectedPath.counts[0].count == 2;

let capped = WebAnalytics.recordPageView(
  [entry("2026-07-24", "/one.html", "en", 1), entry("2026-07-25", "/two.html", "en", 1), entry("2026-07-26", "/three.html", "en", 1)],
  3,
  "2026-07-27",
  "/four.html",
  "Four",
  "en",
  40,
);
assert capped.accepted;
assert capped.counts.size() == 3;
assert capped.counts[0].pagePath == "/two.html";
assert capped.counts[2].pagePath == "/four.html";
