const path = require("path");
const { readCsvFile, writeCsvFile } = require("./csv");

const STANDARD_HEADERS = [
  "platform",
  "title",
  "publish_time",
  "likes",
  "comments",
  "collects",
  "shares",
  "url",
  "cover",
  "desc",
  "transcript",
  "views",
  "raw_index",
  "source_file",
];

const FIELD_ALIASES = {
  platform: ["platform", "平台"],
  title: ["title", "note_title", "desc", "标题", "笔记标题", "视频标题"],
  publish_time: ["publish_time", "time", "create_time", "发布时间", "发布日期", "发布时间文本"],
  likes: ["likes", "liked_count", "like_count", "点赞", "点赞数"],
  comments: ["comments", "comment_count", "评论", "评论数"],
  collects: ["collects", "collected_count", "collect_count", "收藏", "收藏数"],
  shares: ["shares", "share_count", "分享", "分享数"],
  url: ["url", "note_url", "video_url", "aweme_url", "视频链接", "笔记链接", "链接"],
  cover: ["cover", "cover_url", "image_list", "封面", "封面链接"],
  desc: ["desc", "description", "content", "正文", "描述", "简介"],
  transcript: ["transcript", "口播", "口播内容", "转写", "转写文本"],
  views: ["views", "view_count", "播放", "播放量"],
};

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
}

function buildLookup(row) {
  const lookup = new Map();
  Object.keys(row || {}).forEach((key) => {
    lookup.set(normalizeKey(key), key);
  });
  return lookup;
}

function firstValue(row, lookup, aliases) {
  for (const alias of aliases) {
    const actualKey = lookup.get(normalizeKey(alias));
    if (!actualKey) continue;
    const value = row[actualKey];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function cleanNumber(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const normalized = text
    .replace(/,/g, "")
    .replace(/次/g, "")
    .replace(/人/g, "")
    .trim();

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(万|w|W|k|K)?$/);
  if (!match) return text;

  const num = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(num)) return text;
  if (unit === "万" || unit === "w" || unit === "W") return String(Math.round(num * 10000));
  if (unit === "k" || unit === "K") return String(Math.round(num * 1000));
  return String(Math.round(num));
}

function guessPlatform(row, sourceFile = "") {
  const joined = `${sourceFile} ${Object.values(row || {}).join(" ")}`.toLowerCase();
  if (/douyin|\bdy\b|抖音|iesdouyin/.test(joined)) return "douyin";
  if (/bilibili|\bbili\b|b23\.tv|b站|哔哩/.test(joined)) return "bilibili";
  if (/xiaohongshu|\bxhs\b|xhslink|小红书/.test(joined)) return "xhs";
  if (/kuaishou|\bks\b|gifshow|快手/.test(joined)) return "kuaishou";
  if (/weibo|\bwb\b|微博/.test(joined)) return "weibo";
  if (/zhihu|知乎/.test(joined)) return "zhihu";
  if (/tieba|贴吧/.test(joined)) return "tieba";
  return "unknown";
}

function normalizeRecord(row, index, sourceFile = "") {
  const lookup = buildLookup(row);
  const record = {};

  for (const header of STANDARD_HEADERS) {
    if (header === "raw_index") record[header] = String(index + 1);
    else if (header === "source_file") record[header] = sourceFile;
    else if (header === "platform") record[header] = firstValue(row, lookup, FIELD_ALIASES.platform) || guessPlatform(row, sourceFile);
    else record[header] = firstValue(row, lookup, FIELD_ALIASES[header] || [header]);
  }

  record.likes = cleanNumber(record.likes);
  record.comments = cleanNumber(record.comments);
  record.collects = cleanNumber(record.collects);
  record.shares = cleanNumber(record.shares);
  record.views = cleanNumber(record.views);

  if (!record.desc && record.title && firstValue(row, lookup, ["desc", "description", "content", "正文"]) !== record.title) {
    record.desc = firstValue(row, lookup, ["desc", "description", "content", "正文"]);
  }

  return record;
}

function normalizeRows(rows, { sourceFile = "" } = {}) {
  return rows.map((row, index) => normalizeRecord(row, index, sourceFile));
}

function normalizeCsvFile(inputPath, outputPath) {
  const rows = readCsvFile(inputPath);
  const sourceFile = path.basename(inputPath);
  const normalizedRows = normalizeRows(rows, { sourceFile });
  writeCsvFile(outputPath, normalizedRows, STANDARD_HEADERS, { bom: true });
  return {
    inputPath,
    outputPath,
    rows: normalizedRows.length,
    headers: STANDARD_HEADERS,
  };
}

module.exports = {
  STANDARD_HEADERS,
  FIELD_ALIASES,
  cleanNumber,
  guessPlatform,
  normalizeRecord,
  normalizeRows,
  normalizeCsvFile,
};
