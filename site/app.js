const data = window.__REPORT_DATA__ ?? { summary: {}, companies: [], latestRows: [] };
const companyListEl = document.getElementById("company-list");
const companyDetailEl = document.getElementById("company-detail");
const pdfFrameEl = document.getElementById("pdf-frame");
const reportTitleEl = document.getElementById("report-title");
const localPdfLinkEl = document.getElementById("local-pdf-link");
const sourcePdfLinkEl = document.getElementById("source-pdf-link");
const searchEl = document.getElementById("company-search");
const digestTableBodyEl = document.getElementById("digest-table-body");
const digestCardListEl = document.getElementById("digest-card-list");

let filteredCompanies = [...data.companies];
let selectedCompanyCode = filteredCompanies[0]?.code ?? null;
let selectedReportId = filteredCompanies[0]?.reports?.[0]?.id ?? null;

function resolvePdfHref(value) {
  if (!value) {
    return "#";
  }
  return /^https?:\/\//.test(value) ? value : `./${value}`;
}

function formatDateTime(raw) {
  if (!raw) {
    return "-";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function setSummary() {
  document.getElementById("stat-company-count").textContent = String(data.summary.companyCount ?? 0);
  document.getElementById("stat-report-count").textContent = String(data.summary.totalReportCount ?? 0);
  document.getElementById("stat-generated-at").textContent = formatDateTime(data.summary.generatedAt);
  document.getElementById("summary-source").textContent = `取得元: ${data.summary.source ?? "-"}`;
  document.getElementById("summary-error-count").textContent = `取得エラー: ${data.summary.errorCount ?? 0}件`;
  document.getElementById("company-count-badge").textContent = String(filteredCompanies.length);
  document.getElementById("digest-count-badge").textContent = String(data.latestRows?.length ?? 0);
}

function getSelectedCompany() {
  return filteredCompanies.find((company) => company.code === selectedCompanyCode) ?? filteredCompanies[0] ?? null;
}

function getSelectedReport(company) {
  return company?.reports.find((report) => report.id === selectedReportId) ?? company?.reports?.[0] ?? null;
}

function renderDigestTable() {
  digestTableBodyEl.innerHTML = "";
  digestCardListEl.innerHTML = "";

  for (const row of data.latestRows ?? []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.code}</td>
      <td>${row.market}</td>
      <td>${row.latestDisclosureDate ?? "-"}</td>
      <td>${row.latestReportTitle ?? "-"}</td>
      <td><a href="${resolvePdfHref(row.preferredPdfUrl)}" target="_blank" rel="noopener">開く</a></td>
    `;
    tr.addEventListener("click", () => {
      selectedCompanyCode = row.code;
      selectedReportId = data.companies.find((company) => company.code === row.code)?.reports?.[0]?.id ?? null;
      render();
    });
    digestTableBodyEl.appendChild(tr);

    const card = document.createElement("div");
    card.className = "digest-card";
    card.innerHTML = `
      <div class="digest-card-top">
        <div>
          <div class="digest-card-code">${row.code} / ${row.market}</div>
          <h3>${row.name}</h3>
        </div>
        <span class="badge">${row.latestDisclosureDate ?? "-"}</span>
      </div>
      <p class="digest-card-title">${row.latestReportTitle ?? "-"}</p>
      <div class="digest-card-actions">
        <span>最新PDFを見る</span>
        <a href="${resolvePdfHref(row.preferredPdfUrl)}" target="_blank" rel="noopener">開く</a>
      </div>
    `;
    card.addEventListener("click", () => {
      selectedCompanyCode = row.code;
      selectedReportId = data.companies.find((company) => company.code === row.code)?.reports?.[0]?.id ?? null;
      render();
    });
    digestCardListEl.appendChild(card);
  }
}

function renderCompanyList() {
  companyListEl.innerHTML = "";
  if (filteredCompanies.length === 0) {
    companyListEl.innerHTML = `<div class="empty-state">検索条件に一致する企業がありません。</div>`;
    return;
  }

  for (const company of filteredCompanies) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `company-card${company.code === selectedCompanyCode ? " is-active" : ""}`;
    button.innerHTML = `
      <div class="company-top">
        <div>
          <div class="company-code">
            <span class="company-dot" style="background:${company.accent.colorA}"></span>
            ${company.code} / ${company.market}
          </div>
          <h3>${company.name}</h3>
        </div>
        <span class="badge">${company.reports.length}件</span>
      </div>
      <div class="brand-list">
        ${company.brands.map((brand) => `<span class="tag">${brand}</span>`).join("")}
      </div>
      <div class="detail-meta">
        <span>最新開示: ${company.latestDisclosureDate ?? "-"}</span>
      </div>
    `;
    button.addEventListener("click", () => {
      selectedCompanyCode = company.code;
      selectedReportId = company.reports[0]?.id ?? null;
      render();
    });
    companyListEl.appendChild(button);
  }
}

function renderCompanyDetail() {
  const company = getSelectedCompany();
  if (!company) {
    companyDetailEl.innerHTML = `<div class="empty-state">表示できる企業データがありません。</div>`;
    return;
  }

  const report = getSelectedReport(company);
  companyDetailEl.innerHTML = `
    <div>
      <p class="eyebrow">Company Detail</p>
      <h2>${company.name}</h2>
    </div>
    <div class="detail-meta">
      <span>証券コード: ${company.code}</span>
      <span>市場: ${company.market}</span>
      <span>最新開示: ${company.latestDisclosureDate ?? "-"}</span>
      <a href="${company.disclosurePageUrl}" target="_blank" rel="noopener">開示一覧ページを開く</a>
    </div>
    <div class="brand-list">
      ${company.brands.map((brand) => `<span class="tag">${brand}</span>`).join("")}
    </div>
    <div class="report-list">
      ${company.reports.map((item) => `
        <button
          type="button"
          class="report-button${item.id === report?.id ? " is-active" : ""}"
          data-report-id="${item.id}">
          <span class="report-date">${item.disclosureDate}</span>
          <strong>${item.title}</strong>
        </button>
      `).join("")}
    </div>
  `;

  companyDetailEl.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedReportId = button.getAttribute("data-report-id");
      render();
    });
  });

  if (report) {
    reportTitleEl.textContent = `${company.name} | ${report.title}`;
    localPdfLinkEl.href = resolvePdfHref(report.preferredPdfUrl);
    sourcePdfLinkEl.href = report.pdfUrl;
    pdfFrameEl.src = resolvePdfHref(report.preferredPdfUrl);
  } else {
    reportTitleEl.textContent = "レポートを選択してください";
    localPdfLinkEl.href = "#";
    sourcePdfLinkEl.href = "#";
    pdfFrameEl.src = "about:blank";
  }
}

function applySearch() {
  const keyword = searchEl.value.trim().toLowerCase();
  filteredCompanies = data.companies.filter((company) => {
    if (!keyword) {
      return true;
    }

    const haystack = [
      company.code,
      company.name,
      company.market,
      ...(company.brands ?? [])
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });

  if (!filteredCompanies.some((company) => company.code === selectedCompanyCode)) {
    selectedCompanyCode = filteredCompanies[0]?.code ?? null;
    selectedReportId = filteredCompanies[0]?.reports?.[0]?.id ?? null;
  }
}

function render() {
  setSummary();
  renderDigestTable();
  renderCompanyList();
  renderCompanyDetail();
}

searchEl.addEventListener("input", () => {
  applySearch();
  render();
});

applySearch();
render();
