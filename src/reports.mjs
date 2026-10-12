import * as cheerio from "cheerio";

export const requestHeaders = {
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; RestaurantIRPortal/1.0)"
};

export async function fetchResource(url, binary = false) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!binary) return await response.text();
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("Response is not a PDF");
      return buffer;
    } catch (error) {
      lastError = error;
      if (/^(403|404|405)\b/.test(error.message)) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function isResultsTitle(title) {
  if (/訂正|correction/i.test(title)) return false;
  if (title.includes("決算短信")) return true;
  return /financial results|summary of business results/i.test(title) && /fiscal year|quarter|year end/i.test(title)
    && !/presentation|material|monthly|sales flash|governance|evaluation|review report|notice|preliminary|postponement|revisions|announcement/i.test(title);
}

function selectReports(reports, limit) {
  const byDate = new Map();
  for (const report of reports) {
    const existing = byDate.get(report.rawDate);
    if (!existing || (!/[ぁ-んァ-ヶ一-龠]/.test(existing.title) && /[ぁ-んァ-ヶ一-龠]/.test(report.title))) {
      byDate.set(report.rawDate, report);
    }
  }
  return [...byDate.values()].sort((a, b) => b.rawDate.localeCompare(a.rawDate)).slice(0, limit);
}

function makeReport(code, rawDate, docId, title, pdfUrl, detailUrl) {
  return {
    id: `${code}-${rawDate}-${docId}`, docId, rawDate,
    disclosureDate: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
    title, pdfUrl, detailUrl,
    localPdfPath: `assets/pdfs/${code}/${rawDate}_${docId}.pdf`
  };
}

export function parseYahooReports(html, code, limit = 4) {
  const $ = cheerio.load(html);
  const reports = [];
  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const match = href.match(/^https:\/\/finance-frontend-pc-dist\.west\.edge\.storage-yahoo\.jp\/disclosure\/(\d{8})\/(\d{14})\.pdf$/);
    const title = $(anchor).find("h3").first().text().replace(/\s+/g, " ").trim();
    if (!match || !isResultsTitle(title)) return;
    // Yahoo omits the TDnet document prefix.
    const docId = `1401${match[2]}`;
    reports.push(makeReport(code, match[1], docId, title, href, `https://finance.yahoo.co.jp/quote/${code}.T/disclosure`));
  });
  return selectReports(reports, limit);
}

export function parseKabutanReports(html, code, limit = 4) {
  const $ = cheerio.load(html);
  const reports = [];
  $("a[href*='/disclosures/pdf/']").each((_, anchor) => {
    const title = $(anchor).text().replace(/\s+/g, " ").trim();
    const match = $(anchor).attr("href")?.match(/\/disclosures\/pdf\/(\d{8})\/(\d+)\/?$/);
    if (!match || !isResultsTitle(title)) return;
    reports.push(makeReport(code, match[1], match[2], title,
      `https://tdnet-pdf.kabutan.jp/${match[1]}/${match[2]}.pdf`,
      `https://kabutan.jp/disclosures/pdf/${match[1]}/${match[2]}/`));
  });
  return selectReports(reports, limit);
}

export async function collectReports(company, limit = 4, fetchText = fetchResource) {
  const yahooUrl = `https://finance.yahoo.co.jp/quote/${company.code}.T/disclosure`;
  async function fromKabutan() {
    const disclosurePageUrl = `https://kabutan.jp/stock/news?code=${company.code}&nmode=3`;
    const reports = [];
    for (let page = 1; page <= 8 && selectReports(reports, limit).length < limit; page += 1) {
      const url = page === 1 ? disclosurePageUrl : `${disclosurePageUrl}&page=${page}`;
      reports.push(...parseKabutanReports(await fetchText(url), company.code, limit));
    }
    if (reports.length === 0) throw new Error("No financial results on Kabutan");
    return { ...company, disclosurePageUrl, reports: selectReports(reports, limit), fetchedAt: new Date().toISOString(), dataStatus: "fresh" };
  }
  if (process.env.REPORT_SOURCE === "kabutan") {
    try { return await fromKabutan(); } catch { /* Try the other source below. */ }
  }
  try {
    const collected = [];
    for (let page = 1; page <= 8 && selectReports(collected, limit).length < limit; page += 1) {
      const html = await fetchText(page === 1 ? yahooUrl : `${yahooUrl}?page=${page}`);
      const next = parseYahooReports(html, company.code, limit);
      collected.push(...next);
      if (!html.includes("storage-yahoo.jp/disclosure/")) break;
    }
    const reports = selectReports(collected, limit);
    if (reports.length === 0) throw new Error("No financial results on Yahoo Finance");
    return { ...company, disclosurePageUrl: yahooUrl, reports, fetchedAt: new Date().toISOString(), dataStatus: "fresh" };
  } catch (yahooError) {
    try {
      return await fromKabutan();
    } catch (error) {
      throw new Error(`Yahoo: ${yahooError.message}; Kabutan: ${error.message}`);
    }
  }
}

export function mergeResults(configured, fetched, previous) {
  const current = new Map(fetched.map((company) => [company.code, company]));
  const cached = new Map(previous.map((company) => [company.code, company]));
  return configured.map((company) => {
    const fresh = current.get(company.code);
    const old = cached.get(company.code);
    return {
      ...old, ...company, ...fresh,
      reports: selectReports([...(fresh?.reports ?? []), ...(old?.reports ?? [])].filter((report) => isResultsTitle(report.title ?? "")), 4),
      dataStatus: fresh ? "fresh" : "cached"
    };
  });
}

export function isCollectionDue(lastSuccessAt, now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.floor(now.getTime() / day) - Math.floor(new Date(lastSuccessAt ?? 0).getTime() / day);
  return !Number.isFinite(elapsedDays) || elapsedDays >= 5;
}
