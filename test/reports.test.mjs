import test from "node:test";
import assert from "node:assert/strict";
import { companies } from "../src/companies.mjs";
import { parseYahooReports, parseKabutanReports, collectReports, mergeResults, isCollectionDue } from "../src/reports.mjs";

const yahooLink = (title, date = "20260807", id = "20260805510591") => `<a href="https://finance-frontend-pc-dist.west.edge.storage-yahoo.jp/disclosure/${date}/${id}.pdf"><h3>${title}</h3><time>8/7 15:30</time>TDnetPDF(699KB)</a>`;

test("50 unique codes and five comparison targets", () => {
  assert.equal(companies.length, 50);
  assert.equal(new Set(companies.map((company) => company.code)).size, 50);
  assert.equal(companies.filter((company) => company.comparison).length, 5);
});

test("Yahoo and Kabutan identifiers match without duplicate notifications", () => {
  const yahoo = parseYahooReports(yahooLink("2027年3月期 第1四半期決算短信"), "7550")[0];
  const kabutan = parseKabutanReports('<a href="/disclosures/pdf/20260807/140120260805510591/">2027年3月期 第1四半期決算短信</a>', "7550")[0];
  assert.equal(yahoo.id, kabutan.id);
  assert.equal(yahoo.title, "2027年3月期 第1四半期決算短信");
});

test("prefer Japanese results; exclude unrelated documents and corrections", () => {
  const html = yahooLink("Financial Results for the First Quarter of Fiscal Year 2027")
    + yahooLink("2027年3月期 第1四半期決算短信", "20260807", "20260805510592")
    + yahooLink("決算説明資料", "20261001") + yahooLink("（訂正）決算短信", "20261002")
    + yahooLink("Notice Concerning Postponement of First-Quarter Financial Results for the Fiscal Year", "20261003")
    + yahooLink("1st Half Financial Results Briefing for the Fiscal Year Ending July 31", "20261004")
    + yahooLink("Financial Results for the First Quarter of Fiscal Year 2027", "20261005");
  const results = parseYahooReports(html, "7550");
  assert.equal(results.length, 1);
  assert.match(results[0].title, /決算短信/);
});

test("source failure falls back; complete failure is surfaced", async () => {
  const company = { code: "7550" };
  const report = '<a href="/disclosures/pdf/20260807/140120260805510591/">決算短信</a>';
  const result = await collectReports(company, 1, async (url) => {
    if (url.includes("yahoo")) throw new Error("blocked");
    return report;
  });
  assert.equal(result.reports.length, 1);
  await assert.rejects(collectReports(company, 1, async () => { throw new Error("blocked"); }), /Yahoo: blocked; Kabutan: blocked/);
});

test("a failed company keeps prior PDFs and current comparison metadata", () => {
  const merged = mergeResults([{ code: "7550", comparison: "参考比較" }, { code: "3197" }],
    [{ code: "3197", reports: [{ id: "new", title: "決算短信", rawDate: "20260807" }], dataStatus: "fresh" }],
    [{ code: "7550", reports: [{ id: "cached", title: "決算短信", rawDate: "20260512" }] }]);
  assert.equal(merged[0].reports[0].id, "cached");
  assert.equal(merged[0].dataStatus, "cached");
  assert.equal(merged[0].comparison, "参考比較");
});

test("five-day cadence handles month/year boundaries and scheduler delays", () => {
  assert.equal(isCollectionDue("2026-10-29T02:00:00Z", new Date("2026-11-03T00:00:00Z")), true);
  assert.equal(isCollectionDue("2026-12-29T00:00:00Z", new Date("2027-01-02T23:59:00Z")), false);
  assert.equal(isCollectionDue("2026-12-29T00:00:00Z", new Date("2027-01-03T00:00:00Z")), true);
  assert.equal(isCollectionDue(null), true);
  assert.equal(isCollectionDue("invalid"), true);
});
