import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";
import { companies } from "./companies.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(projectRoot, "site");
const pdfRoot = path.join(siteRoot, "assets", "pdfs");
const dataRoot = path.join(projectRoot, "data");
const logsRoot = path.join(projectRoot, "logs");
const manifestPath = path.join(dataRoot, "manifest.json");
const siteDataPath = path.join(siteRoot, "data.js");
const runLogPath = path.join(logsRoot, "latest-run.json");

async function loadDotEnv(dotEnvPath) {
  try {
    const text = await fs.readFile(dotEnvPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separator = line.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator).trim();
      if (!key || process.env[key]) {
        continue;
      }

      let value = line.slice(separator + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env is optional.
  }
}

function formatIsoDate(rawDate) {
  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
}

function buildDisclosureUrl(code) {
  return `https://kabutan.jp/stock/news?code=${code}&nmode=3`;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPdfUrl(rawDate, docId) {
  return `https://tdnet-pdf.kabutan.jp/${rawDate}/${docId}.pdf`;
}

function isJapaneseTitle(title) {
  return /[ぁ-んァ-ヶ一-龠]/.test(title);
}

function isCorrectionNotice(title) {
  const normalized = title.toLowerCase();
  return title.includes("訂正") || title.includes("一部訂正") || normalized.includes("correction");
}

function isQuarterlyResultsTitle(title) {
  if (isCorrectionNotice(title)) {
    return false;
  }

  if (title.includes("決算短信")) {
    return true;
  }

  const normalized = title.toLowerCase();
  if (!normalized.includes("financial results")) {
    return false;
  }

  const blockedWords = [
    "presentation",
    "material",
    "monthly",
    "sales flash",
    "governance",
    "evaluation",
    "review report",
    "notice regarding",
    "preliminary"
  ];

  if (blockedWords.some((word) => normalized.includes(word))) {
    return false;
  }

  return normalized.includes("fiscal year") || normalized.includes("quarter");
}

function extractDocParts(detailUrl) {
  const match = detailUrl.match(/\/disclosures\/pdf\/(\d{8})\/(\d+)\/?$/);
  if (!match) {
    return null;
  }

  return {
    rawDate: match[1],
    docId: match[2],
    disclosureDate: formatIsoDate(match[1])
  };
}

function buildLocalPdfPath(companyCode, rawDate, docId) {
  const fileName = `${rawDate}_${docId}.pdf`;
  return {
    absolute: path.join(pdfRoot, companyCode, fileName),
    relative: `assets/pdfs/${companyCode}/${fileName}`
  };
}

function buildPreferredPdfUrl(localPdfPath, sourcePdfUrl) {
  if (!DOWNLOAD_PDFS) {
    return sourcePdfUrl;
  }
  return localPdfPath;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function downloadBinary(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadManifest() {
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return {
      version: 1,
      knownReportIds: [],
      companies: [],
      updatedAt: null
    };
  }
}

function parseIntegerEnv(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sendableMailConfig() {
  const requiredKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "MAIL_TO"];
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return null;
  }

  return {
    host: process.env.SMTP_HOST,
    port: parseIntegerEnv(process.env.SMTP_PORT, 587),
    secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    from: process.env.MAIL_FROM,
    to: process.env.MAIL_TO
  };
}

function formatJstDateTime(rawDate) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(rawDate));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function buildNotificationHtml(summary, newReports, latestRows) {
  const cards = [
    ["更新時刻", formatJstDateTime(summary.generatedAt)],
    ["監視企業数", `${summary.companyCount}社`],
    ["保存済みPDF", `${summary.totalReportCount}件`],
    ["新着PDF", `${newReports.length}件`]
  ];

  const rows = newReports.length > 0
    ? newReports.map((report) => `
        <tr>
          <td>${escapeHtml(report.companyName)}</td>
          <td>${escapeHtml(report.companyCode)}</td>
          <td>${escapeHtml(report.disclosureDate)}</td>
          <td>${escapeHtml(report.title)}</td>
          <td><a href="${escapeHtml(report.pdfUrl)}">PDF</a></td>
        </tr>
      `).join("")
    : `<tr><td colspan="5">今回は新着PDFはありませんでした。</td></tr>`;

  const digestRows = latestRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.latestDisclosureDate ?? "-")}</td>
      <td>${escapeHtml(row.latestReportTitle ?? "-")}</td>
      <td><a href="${escapeHtml(row.latestReportPdfUrl)}">PDF</a></td>
    </tr>
  `).join("");

  return `
    <div style="font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; background:#f7f3eb; padding:24px; color:#1b1c1e;">
      <div style="max-width:900px; margin:0 auto; background:#fffdf8; border-radius:20px; padding:28px; border:1px solid #f0e3d3;">
        <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#8a6f50;">Restaurant IR Update</p>
        <h1 style="margin:0 0 16px; font-size:28px; line-height:1.2;">飲食上場20社 決算PDFアップデート</h1>
        <p style="margin:0 0 20px; color:#5f5d59;">20社の最新決算短信PDFを確認した結果を、ざっくり見やすくまとめています。</p>
        <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:24px;">
          ${cards.map(([label, value]) => `
            <div style="background:#fbf3e8; border-radius:16px; padding:16px; border:1px solid #efdfcb;">
              <div style="font-size:12px; color:#7a756d; margin-bottom:8px;">${escapeHtml(label)}</div>
              <div style="font-size:22px; font-weight:700;">${escapeHtml(value)}</div>
            </div>
          `).join("")}
        </div>
        <h2 style="font-size:18px; margin:0 0 12px;">今回の新着</h2>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">企業名</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">コード</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">開示日</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">タイトル</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">リンク</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <h2 style="font-size:18px; margin:24px 0 12px;">20社の最新一覧</h2>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">企業名</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">コード</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">最新開示日</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">最新タイトル</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #ead7c0;">PDF</th>
            </tr>
          </thead>
          <tbody>${digestRows}</tbody>
        </table>
        <p style="margin:20px 0 0; font-size:13px; color:#6f6b64;">
          サイト: <a href="${escapeHtml(PUBLIC_SITE_URL)}">${escapeHtml(PUBLIC_SITE_URL)}</a>
        </p>
      </div>
    </div>
  `;
}

async function sendNotification(summary, newReports, latestRows) {
  const mailConfig = sendableMailConfig();
  if (!mailConfig) {
    return { sent: false, reason: "mail config missing" };
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: mailConfig.auth
  });

  const lines = [
    `更新時刻: ${formatJstDateTime(summary.generatedAt)}`,
    `監視企業数: ${summary.companyCount}社`,
    `保存済みPDF: ${summary.totalReportCount}件`,
    `新着PDF: ${newReports.length}件`,
    `サイト: ${PUBLIC_SITE_URL}`,
    ""
  ];

  if (newReports.length > 0) {
    lines.push("今回の新着:");
    for (const report of newReports) {
      lines.push(`- ${report.companyName} (${report.companyCode}) / ${report.disclosureDate} / ${report.title}`);
      lines.push(`  ${report.pdfUrl}`);
    }
  } else {
    lines.push("今回は新着PDFはありませんでした。");
  }

  lines.push("");
  lines.push("20社の最新一覧:");
  for (const row of latestRows) {
    lines.push(`- ${row.latestDisclosureDate ?? "-"} / ${row.name} (${row.code})`);
    lines.push(`  ${row.latestReportTitle ?? "-"}`);
    lines.push(`  ${row.latestReportPdfUrl}`);
  }

  const info = await transporter.sendMail({
    from: mailConfig.from,
    to: mailConfig.to,
    subject: `[飲食決算PDF] ${newReports.length > 0 ? `${newReports.length}件更新` : "定期サマリー"}`,
    text: lines.join("\n"),
    html: buildNotificationHtml(summary, newReports, latestRows)
  });

  return {
    sent: true,
    accepted: info.accepted,
    rejected: info.rejected,
    messageId: info.messageId
  };
}

function buildCompanyTone(company) {
  const hash = crypto.createHash("md5").update(company.code).digest("hex");
  const hue = Number.parseInt(hash.slice(0, 2), 16) % 360;
  return {
    colorA: `hsl(${hue} 70% 60%)`,
    colorB: `hsl(${(hue + 35) % 360} 70% 48%)`
  };
}

async function fetchCompanyReports(company) {
  const disclosurePageUrl = buildDisclosureUrl(company.code);
  const reportsByDate = new Map();
  const maxPagesToScan = 8;

  for (let page = 1; page <= maxPagesToScan && reportsByDate.size < MAX_REPORTS_PER_COMPANY; page += 1) {
    const pagedUrl = page === 1 ? disclosurePageUrl : `${disclosurePageUrl}&page=${page}`;
    const html = await fetchText(pagedUrl);
    const $ = cheerio.load(html);

    $("a[href*='/disclosures/pdf/']").each((_, anchor) => {
      const title = normalizeWhitespace($(anchor).text());
      if (!isQuarterlyResultsTitle(title)) {
        return;
      }

      const href = $(anchor).attr("href");
      if (!href) {
        return;
      }

      const detailUrl = new URL(href, "https://kabutan.jp").toString();
      const parts = extractDocParts(detailUrl);
      if (!parts) {
        return;
      }

      const nextReport = {
        id: `${company.code}-${parts.rawDate}-${parts.docId}`,
        docId: parts.docId,
        rawDate: parts.rawDate,
        disclosureDate: parts.disclosureDate,
        title,
        detailUrl,
        pdfUrl: buildPdfUrl(parts.rawDate, parts.docId),
        localPdfPath: buildLocalPdfPath(company.code, parts.rawDate, parts.docId).relative
      };

      const existing = reportsByDate.get(parts.rawDate);
      if (!existing || (!isJapaneseTitle(existing.title) && isJapaneseTitle(nextReport.title))) {
        reportsByDate.set(parts.rawDate, nextReport);
      }
    });
  }

  const reports = [...reportsByDate.values()]
    .sort((left, right) => right.rawDate.localeCompare(left.rawDate))
    .slice(0, MAX_REPORTS_PER_COMPANY);

  if (reports.length === 0) {
    throw new Error("決算短信PDFが見つかりませんでした");
  }

  return {
    ...company,
    disclosurePageUrl,
    accent: buildCompanyTone(company),
    reports
  };
}

async function downloadMissingReports(companyReports, previousReportIds, newReportsCollector) {
  for (const company of companyReports) {
    for (const report of company.reports) {
      const localPdfPath = buildLocalPdfPath(company.code, report.rawDate, report.docId);
      if (DOWNLOAD_PDFS) {
        await ensureDirectory(path.dirname(localPdfPath.absolute));
        try {
          await fs.access(localPdfPath.absolute);
        } catch {
          const binary = await downloadBinary(report.pdfUrl);
          await fs.writeFile(localPdfPath.absolute, binary);
        }
      }

      if (!previousReportIds.has(report.id)) {
        newReportsCollector.push({
          companyCode: company.code,
          companyName: company.name,
          disclosureDate: report.disclosureDate,
          title: report.title,
          pdfUrl: report.pdfUrl
        });
      }
    }
  }
}

function buildSitePayload(companyReports, summary) {
  const latestRows = companyReports.map((company) => {
    const latestReport = company.reports[0] ?? null;
    return {
      code: company.code,
      name: company.name,
      market: company.market,
      brands: company.brands,
      latestDisclosureDate: latestReport?.disclosureDate ?? "",
      latestReportTitle: latestReport?.title ?? "",
      latestReportPdfUrl: latestReport?.pdfUrl ?? "",
      latestLocalPdfPath: latestReport?.localPdfPath ?? "",
      preferredPdfUrl: latestReport
        ? buildPreferredPdfUrl(latestReport.localPdfPath, latestReport.pdfUrl)
        : ""
    };
  }).sort((left, right) => String(right.latestDisclosureDate).localeCompare(String(left.latestDisclosureDate)));

  return {
    summary,
    latestRows,
    companies: companyReports.map((company) => ({
      code: company.code,
      slug: company.slug,
      name: company.name,
      brands: company.brands,
      market: company.market,
      accent: company.accent,
      disclosurePageUrl: company.disclosurePageUrl,
      latestDisclosureDate: company.reports[0]?.disclosureDate ?? null,
      reports: company.reports.map((report) => ({
        ...report,
        preferredPdfUrl: buildPreferredPdfUrl(report.localPdfPath, report.pdfUrl)
      }))
    }))
  };
}

async function writeSiteData(payload) {
  const content = `window.__REPORT_DATA__ = ${JSON.stringify(payload, null, 2)};\n`;
  await fs.writeFile(siteDataPath, content, "utf8");
}

async function writeManifest(payload) {
  const nextManifest = {
    version: 1,
    updatedAt: payload.summary.generatedAt,
    knownReportIds: payload.companies.flatMap((company) => company.reports.map((report) => report.id)),
    companies: payload.companies
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
}

async function writeRunLog(log) {
  await fs.writeFile(runLogPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await loadDotEnv(path.join(projectRoot, ".env"));

const MAX_REPORTS_PER_COMPANY = parseIntegerEnv(process.env.MAX_REPORTS_PER_COMPANY, 4);
const DOWNLOAD_PDFS = (process.env.DOWNLOAD_PDFS ?? "true").toLowerCase() !== "false";
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? "4180"}`;
const REQUEST_HEADERS = {
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
};

const startedAt = new Date();
await ensureDirectory(pdfRoot);
await ensureDirectory(dataRoot);
await ensureDirectory(logsRoot);

const previousManifest = await loadManifest();
const previousReportIds = new Set(previousManifest.knownReportIds ?? []);
const companyResults = [];
const errors = [];

for (const company of companies) {
  try {
    const result = await fetchCompanyReports(company);
    companyResults.push(result);
  } catch (error) {
    errors.push({
      code: company.code,
      name: company.name,
      error: String(error?.message ?? error)
    });
  }
  await delay(250);
}

const newReports = [];
await downloadMissingReports(companyResults, previousReportIds, newReports);

const generatedAt = new Date().toISOString();
const summary = {
  generatedAt,
  startedAt: startedAt.toISOString(),
  companyCount: companyResults.length,
  configuredCompanyCount: companies.length,
  totalReportCount: companyResults.reduce((sum, company) => sum + company.reports.length, 0),
  newReportCount: newReports.length,
  errorCount: errors.length,
  source: "kabutan.jp / tdnet-pdf.kabutan.jp",
  maxReportsPerCompany: MAX_REPORTS_PER_COMPANY
};

const payload = buildSitePayload(companyResults, summary);
await writeSiteData(payload);
await writeManifest(payload);

let notification = { sent: false, reason: "not requested" };
const notifyAlways = (process.env.REPORT_NOTIFY_ALWAYS ?? "false").toLowerCase() === "true";
if (newReports.length > 0 || notifyAlways) {
  try {
    notification = await sendNotification(summary, newReports, payload.latestRows);
  } catch (error) {
    notification = {
      sent: false,
      reason: String(error?.message ?? error)
    };
  }
}

const runLog = {
  summary,
  notification,
  errors,
  newReports
};

await writeRunLog(runLog);
console.log(JSON.stringify(runLog, null, 2));
