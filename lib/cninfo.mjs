const TOP_SEARCH_URL = "https://www.cninfo.com.cn/new/information/topSearch/query";
const QUERY_URL = "https://www.cninfo.com.cn/new/hisAnnouncement/query";
const ATTACHMENT_ORIGIN = "https://static.cninfo.com.cn";
const EARLIEST_DATE = "2001-01-01";
const PAGE_SIZE = 30;
const MAX_PAGES = 100;
const MAX_RETRIES = 3;

const REPORT_TYPE_ALIASES = new Map(Object.entries({
  annual: "annual", annual_report: "annual", yearly: "annual", ndbg: "annual",
  "年报": "annual", "年度报告": "annual",
  semiannual: "semiannual", semi_annual: "semiannual", half_year: "semiannual",
  "half-year": "semiannual", bndbg: "semiannual", "半年度报告": "semiannual",
  "半年报": "semiannual", "中报": "semiannual",
  q1: "q1", first_quarter: "q1", yjdbg: "q1", "一季报": "q1", "第一季度报告": "q1",
  q3: "q3", third_quarter: "q3", sjdbg: "q3", "三季报": "q3", "第三季度报告": "q3",
  prospectus: "prospectus", ipo: "prospectus", "招股书": "prospectus",
  "招股说明书": "prospectus", "招股意向书": "prospectus",
}));

const REPORT_TYPE_SPECS = {
  annual: { label: "年度报告", category: "category_ndbg_szsh", phrases: ["年度报告", "年报"] },
  semiannual: { label: "半年度报告", category: "category_bndbg_szsh", phrases: ["半年度报告", "中期报告"] },
  q1: { label: "第一季度报告", category: "category_yjdbg_szsh", phrases: ["第一季度报告", "一季度报告"] },
  q3: { label: "第三季度报告", category: "category_sjdbg_szsh", phrases: ["第三季度报告", "三季度报告"] },
  prospectus: { label: "招股书", category: "", phrases: ["招股说明书", "招股意向书", "招股书"] },
};

const EXCLUDED = ["摘要", "确认意见", "取消", "更正", "补充", "说明", "提示", "致歉", "修订", "英文"];
const PROSPECTUS_EXCLUDED = [...EXCLUDED, "关于", "意见", "核查", "验证", "问询", "回复", "公告", "审计报告", "附件", "附录"];

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
];

export function normalizeStockCode(value) {
  const code = String(value ?? "").trim();
  if (!/^[0-9]{6}$/.test(code)) throw new Error("stock_code must contain exactly six ASCII digits");
  return code;
}

export function normalizeReportType(value = "annual") {
  const key = String(value || "annual").trim().toLowerCase().replaceAll(" ", "_");
  const result = REPORT_TYPE_ALIASES.get(key);
  if (!result) throw new Error(`Unsupported report_type '${value}'. Supported: ${Object.keys(REPORT_TYPE_SPECS).join(", ")}`);
  return result;
}

export function resolveAttachmentUrl(value) {
  if (typeof value !== "string" || !value || /[\s\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid attachment URL");
  }
  const url = new URL(value, `${ATTACHMENT_ORIGIN}/`);
  if (url.protocol !== "https:" || url.hostname !== "static.cninfo.com.cn" || url.port || url.username || url.password) {
    throw new Error("Attachment URLs must use https://static.cninfo.com.cn");
  }
  url.hash = "";
  return url.toString();
}

function compactTitle(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

export function isReportTitle(title, reportType = "annual", year) {
  const normalized = normalizeReportType(reportType);
  const compact = compactTitle(title);
  if (normalized === "prospectus") {
    if (!REPORT_TYPE_SPECS.prospectus.phrases.some((phrase) => compact.includes(phrase))) return false;
    const remainder = compact.replace(/招股说明书|招股意向书|招股书/g, "");
    return !PROSPECTUS_EXCLUDED.some((word) => remainder.includes(word));
  }
  if (EXCLUDED.some((word) => compact.includes(word))) return false;
  const yearPattern = year == null ? "\\d{4}" : String(year).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phrasePattern = REPORT_TYPE_SPECS[normalized].phrases.join("|");
  return new RegExp(`^.*${yearPattern}年?(?:${phrasePattern})(?:[（(]更新后[)）])?$`).test(compact);
}

function dateRange() {
  return `${EARLIEST_DATE}~${new Date().toISOString().slice(0, 10)}`;
}

function headers() {
  return {
    accept: "application/json, text/javascript, */*; q=0.01",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: "https://www.cninfo.com.cn",
    referer: "https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/notice",
    "x-requested-with": "XMLHttpRequest",
    "user-agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postFormJson(url, data, fetchImpl = fetch) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: headers(),
        body: new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value ?? "")])),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        if (response.status !== 429 && response.status >= 400 && response.status < 500) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error.status && error.status !== 429 && error.status >= 400 && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < MAX_RETRIES - 1) await delay(500 * (2 ** attempt) + Math.random() * 250);
  }
  throw lastError || new Error("CNINFO request failed");
}

function reportQuery(page, stockCode, reportType, column, plate, stockValue = "") {
  const spec = REPORT_TYPE_SPECS[reportType];
  return {
    pageNum: page,
    pageSize: PAGE_SIZE,
    tabName: "fulltext",
    column,
    stock: stockValue,
    searchkey: reportType === "prospectus" ? (stockValue ? "招股" : `${stockCode} 招股`) : (stockValue ? "" : stockCode),
    secid: "",
    plate,
    category: spec.category,
    trade: "",
    seDate: dateRange(),
  };
}

async function queryPage(page, stockCode, reportType, column, plate, stockValue, fetchImpl) {
  const payload = await postFormJson(
    QUERY_URL,
    reportQuery(page, stockCode, reportType, column, plate, stockValue),
    fetchImpl,
  );
  if (!payload || typeof payload !== "object" || !("announcements" in payload)) throw new Error("Invalid announcement response");
  if (payload.announcements != null && !Array.isArray(payload.announcements)) throw new Error("Invalid announcements list");
  return payload.announcements || [];
}

async function paginate(fetchPage) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const items = await fetchPage(page);
    if (!items.length) return all;
    all.push(...items);
    if (items.length < PAGE_SIZE) return all;
  }
  throw Object.assign(new Error(`Pagination limit reached (${MAX_PAGES})`), { partialReports: all });
}

function isBseCode(code) {
  return code.startsWith("4") || code.startsWith("8") || code.startsWith("92");
}

async function resolveOrgId(stockCode, fetchImpl) {
  const hits = await postFormJson(TOP_SEARCH_URL, { keyWord: stockCode, maxNum: 10 }, fetchImpl);
  if (!Array.isArray(hits)) throw new Error("Invalid orgId response");
  const item = hits.find((entry) => String(entry.code) === stockCode && entry.orgId) || hits.find((entry) => entry.orgId);
  return item ? { code: String(item.code), orgId: String(item.orgId) } : null;
}

function formatReports(reports) {
  return reports.map((report) => {
    let adjunctUrl = "";
    let attachmentError;
    try {
      adjunctUrl = report.adjunctUrl ? resolveAttachmentUrl(report.adjunctUrl) : "";
    } catch (error) {
      attachmentError = error.message;
    }
    return {
      announcementTitle: report.announcementTitle || "",
      announcementTime: report.announcementTime || "",
      secCode: report.secCode || "",
      secName: report.secName || "",
      adjunctUrl,
      ...(attachmentError ? { attachmentError } : {}),
    };
  });
}

export async function queryReports(stockCode, reportType = "annual", year, fetchImpl = fetch) {
  const code = normalizeStockCode(stockCode);
  const normalizedType = normalizeReportType(reportType);
  const all = [];
  const errors = [];
  const allowedCodes = new Set([code]);

  for (const [column, plate, label] of [["sse", "sh", "沪市"], ["szse", "sz", "深市"]]) {
    try {
      all.push(...await paginate((page) => queryPage(page, code, normalizedType, column, plate, "", fetchImpl)));
    } catch (error) {
      if (Array.isArray(error.partialReports)) all.push(...error.partialReports);
      errors.push(`${label}: ${error.message}`);
    }
  }

  if (isBseCode(code)) {
    try {
      const resolved = await resolveOrgId(code, fetchImpl);
      if (!resolved) throw new Error(`Could not resolve orgId for ${code}`);
      allowedCodes.add(resolved.code);
      const stockValue = `${resolved.code},${resolved.orgId}`;
      all.push(...await paginate((page) => queryPage(page, resolved.code, normalizedType, "bj", "bj", stockValue, fetchImpl)));
    } catch (error) {
      if (Array.isArray(error.partialReports)) all.push(...error.partialReports);
      errors.push(`北交所: ${error.message}`);
    }
  }

  const seen = new Set();
  const filtered = all.filter((item) => {
    const secCode = String(item.secCode || "");
    if (!allowedCodes.has(secCode)) return false;
    const key = `${secCode}\u0000${item.announcementTitle || ""}\u0000${item.adjunctUrl || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (!isReportTitle(item.announcementTitle, normalizedType, year)) return false;
    if (normalizedType === "prospectus" && year != null) {
      const time = typeof item.announcementTime === "number"
        ? new Date(item.announcementTime).toISOString().slice(0, 4)
        : String(item.announcementTime || "").slice(0, 4);
      if (time !== String(year)) return false;
    }
    return true;
  });

  return {
    success: errors.length === 0,
    status: errors.length ? (filtered.length ? "partial" : "error") : "complete",
    stock_code: code,
    report_type: normalizedType,
    year: year ?? null,
    count: filtered.length,
    reports: formatReports(filtered),
    ...(errors.length ? { errors, error: errors.join("; ") } : {}),
    message: errors.length
      ? `Query incomplete: ${errors.join("; ")}`
      : `Found ${filtered.length} ${normalizedType} report(s)${year == null ? "" : ` for year ${year}`}`,
  };
}

export const internals = { reportQuery, formatReports };
