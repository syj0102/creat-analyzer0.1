#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getPageWsUrl, createCdpClient, browserFetchJson } = require("./lib/cdp-client");
const { writeCsvFile } = require("./lib/csv");
const { readMaxNotes, readOutputDir, safeFilenamePart } = require("./lib/cli");

const target = process.argv[2];
const maxNotes = readMaxNotes(process.argv[3], 60);
const outputDir = readOutputDir(process.argv, path.join(__dirname, "data"));

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function resolveMid(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("请输入 B站 UP 主主页链接或 mid");
  if (/^\d+$/.test(raw)) return raw;

  const match = raw.match(/space\.bilibili\.com\/(\d+)/) || raw.match(/[?&]mid=(\d+)/);
  if (match) return match[1];
  throw new Error("无法识别 B站 UP 主 mid，请输入 space.bilibili.com 主页链接或纯数字 mid");
}

function mixinKey(rawKey) {
  return mixinKeyEncTab.map((index) => rawKey[index]).join("").slice(0, 32);
}

function signWbi(params, key) {
  const withTime = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(withTime)
    .sort()
    .map((name) => {
      const value = String(withTime[name]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  const wRid = crypto.createHash("md5").update(query + key).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

async function main() {
  if (!target) {
    console.log("用法: node scrape-bili-creator-cdp.js <B站主页/mid> [max_notes] [--output-dir <dir>]");
    process.exit(1);
  }

  const mid = resolveMid(target);
  fs.mkdirSync(outputDir, { recursive: true });

  const cdp = await createCdpClient(await getPageWsUrl({
    preferUrlIncludes: ["bilibili.com"],
    emptyMessage: "未找到可用的 Chrome 页面，请先启动 9222 调试浏览器并登录 B站",
  }));

  try {
    await cdp.call("Runtime.enable").catch(() => {});
    await cdp.call("Page.navigate", { url: `https://space.bilibili.com/${mid}/video` }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const nav = await browserFetchJson(cdp, "https://api.bilibili.com/x/web-interface/nav");
    const wbiImg = nav?.data?.wbi_img;
    if (!wbiImg?.img_url || !wbiImg?.sub_url) {
      throw new Error(`无法获取 B站 WBI 参数: ${nav?.message || nav?.code}`);
    }

    const imgKey = wbiImg.img_url.split("/").pop().split(".")[0];
    const subKey = wbiImg.sub_url.split("/").pop().split(".")[0];
    const key = mixinKey(imgKey + subKey);

    const rows = [];
    const pages = [];
    const pageSize = 30;
    const maxPages = Math.ceil(maxNotes / pageSize) + 2;

    for (let pn = 1; rows.length < maxNotes && pn <= maxPages; pn++) {
      const query = signWbi({
        mid,
        pn,
        ps: pageSize,
        order: "pubdate",
        platform: "web",
        web_location: 1550101,
      }, key);
      const listUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;
      const json = await browserFetchJson(cdp, listUrl);
      const items = json?.data?.list?.vlist || [];
      pages.push({ pageNum: pn, code: json?.code, message: json?.message, count: items.length });
      if (json?.code !== 0) throw new Error(`B站列表接口失败: ${json?.code} ${json?.message || ""}`.trim());
      if (!items.length) break;

      for (const item of items) {
        if (rows.length >= maxNotes) break;
        let stat = {};
        let desc = item.description || "";
        try {
          const detail = await browserFetchJson(cdp, `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(item.bvid)}`);
          stat = detail?.data?.stat || {};
          desc = detail?.data?.desc || desc;
        } catch {}

        rows.push({
          id: item.aid || "",
          bvid: item.bvid || "",
          title: item.title || "",
          desc,
          author: item.author || "",
          mid: item.mid || mid,
          plays: item.play || stat.view || 0,
          likes: stat.like || "",
          coins: stat.coin || "",
          favorites: stat.favorite || "",
          comments: item.comment || stat.reply || 0,
          shares: stat.share || "",
          danmaku: item.video_review || stat.danmaku || 0,
          duration: item.length || "",
          cover: item.pic || "",
          url: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : "",
          create_time: item.created ? new Date(item.created * 1000).toISOString().slice(0, 10) : "",
        });
      }
    }

    const safeName = safeFilenamePart(rows[0]?.author, `bili_${mid}`);
    const filepath = path.join(outputDir, `bili_${safeName}_${Date.now()}.csv`);
    const headers = [
      "id", "bvid", "title", "desc", "author", "mid", "plays", "likes",
      "coins", "favorites", "comments", "shares", "danmaku", "duration",
      "cover", "url", "create_time",
    ];

    writeCsvFile(filepath, rows, headers, { bom: true });

    console.log(JSON.stringify({
      file: filepath,
      platform: "bilibili",
      mid,
      count: rows.length,
      pages,
      sample: rows[0] || null,
    }, null, 2));
  } finally {
    cdp.close();
  }
}

main().catch((error) => {
  console.error(`错误: ${error.message}`);
  process.exit(1);
});
