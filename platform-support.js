const path = require("path");

const SUPPORTED_PLATFORMS = {
  douyin: {
    aliases: ["dy", "douyin", "抖音"],
    label: "抖音",
    mediaCrawlerPlatform: "dy",
    domains: ["douyin.com", "iesdouyin.com"],
    stableScript: "scrape-dy-creator-cdp.js",
  },
  xhs: {
    aliases: ["xhs", "xiaohongshu", "小红书", "red"],
    label: "小红书",
    mediaCrawlerPlatform: "xhs",
    domains: ["xiaohongshu.com", "xhslink.com"],
  },
  kuaishou: {
    aliases: ["ks", "kuaishou", "快手"],
    label: "快手",
    mediaCrawlerPlatform: "ks",
    domains: ["kuaishou.com", "gifshow.com"],
  },
  bilibili: {
    aliases: ["bili", "bilibili", "b站", "哔哩哔哩"],
    label: "B站",
    mediaCrawlerPlatform: "bili",
    domains: ["bilibili.com", "b23.tv"],
    stableScript: "scrape-bili-creator-cdp.js",
  },
  weibo: {
    aliases: ["wb", "weibo", "微博"],
    label: "微博",
    mediaCrawlerPlatform: "wb",
    domains: ["weibo.com", "weibo.cn"],
  },
  tieba: {
    aliases: ["tieba", "baidu_tieba", "贴吧", "百度贴吧"],
    label: "百度贴吧",
    mediaCrawlerPlatform: "tieba",
    domains: ["tieba.baidu.com"],
  },
  zhihu: {
    aliases: ["zhihu", "知乎"],
    label: "知乎",
    mediaCrawlerPlatform: "zhihu",
    domains: ["zhihu.com", "zhuanlan.zhihu.com"],
  },
};

function normalizePlatform(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw || raw === "auto" || raw === "自动") return "auto";

  for (const [key, config] of Object.entries(SUPPORTED_PLATFORMS)) {
    if (config.aliases.some((alias) => alias.toLowerCase() === raw)) return key;
  }

  throw new Error(`不支持的平台：${input}`);
}

function detectPlatform(target) {
  const raw = String(target || "").trim();
  if (!raw) return null;
  if (/^MS4wLjAB/i.test(raw)) return "douyin";

  let host = "";
  try {
    const url = raw.match(/^https?:\/\//i) ? new URL(raw) : new URL(`https://${raw}`);
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }

  for (const [key, config] of Object.entries(SUPPORTED_PLATFORMS)) {
    if (config.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return key;
    }
  }

  return null;
}

function resolvePlatform(inputPlatform, target) {
  const normalized = normalizePlatform(inputPlatform || "auto");
  if (normalized !== "auto") return normalized;

  const detected = detectPlatform(target);
  if (!detected) {
    throw new Error("无法自动识别平台，请手动指定 dy/xhs/ks/bili/wb/tieba/zhihu");
  }
  return detected;
}

function buildMediaCrawlerArgs({ platform, target, maxNotes, outputDir, loginType = "qrcode" }) {
  const config = SUPPORTED_PLATFORMS[platform];
  if (!config) throw new Error(`不支持的平台：${platform}`);

  return [
    "run",
    "main.py",
    "--platform",
    config.mediaCrawlerPlatform,
    "--lt",
    loginType,
    "--type",
    "creator",
    "--creator_id",
    target,
    "--crawler_max_notes_count",
    String(maxNotes),
    "--save_data_option",
    "csv",
    "--save_data_path",
    outputDir,
    "--get_comment",
    "false",
    "--get_sub_comment",
    "false",
  ];
}

function buildStableDouyinArgs({ rootDir, target, maxNotes, outputDir }) {
  return [
    path.join(rootDir, SUPPORTED_PLATFORMS.douyin.stableScript),
    target,
    String(maxNotes),
    "--output-dir",
    outputDir,
  ];
}

function buildStableBilibiliArgs({ rootDir, target, maxNotes, outputDir }) {
  return [
    path.join(rootDir, SUPPORTED_PLATFORMS.bilibili.stableScript),
    target,
    String(maxNotes),
    "--output-dir",
    outputDir,
  ];
}

module.exports = {
  SUPPORTED_PLATFORMS,
  normalizePlatform,
  detectPlatform,
  resolvePlatform,
  buildMediaCrawlerArgs,
  buildStableDouyinArgs,
  buildStableBilibiliArgs,
};
