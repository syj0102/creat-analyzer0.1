const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseCsvObjects } = require("./lib/csv");
const { cleanNumber, normalizeRows, normalizeCsvFile, STANDARD_HEADERS } = require("./lib/normalize-csv");

assert.strictEqual(cleanNumber("1.2万"), "12000");
assert.strictEqual(cleanNumber("3k"), "3000");
assert.strictEqual(cleanNumber("8,888"), "8888");
assert.strictEqual(cleanNumber("未知"), "未知");

const rows = parseCsvObjects(`标题,点赞,评论,收藏,分享,发布时间,视频链接,封面\n"第一条,带逗号",1.2万,33,4k,5,2026-06-26,https://example.com/a,cover-a\n第二条,100,20,30,40,2026-06-25,https://example.com/b,cover-b\n`);

assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0]["标题"], "第一条,带逗号");

const normalized = normalizeRows(rows, { sourceFile: "bilibili_demo.csv" });
assert.deepStrictEqual(Object.keys(normalized[0]), STANDARD_HEADERS);
assert.strictEqual(normalized[0].platform, "bilibili");
assert.strictEqual(normalized[0].title, "第一条,带逗号");
assert.strictEqual(normalized[0].likes, "12000");
assert.strictEqual(normalized[0].collects, "4000");
assert.strictEqual(normalized[0].url, "https://example.com/a");
assert.strictEqual(normalized[0].raw_index, "1");
assert.strictEqual(normalized[0].source_file, "bilibili_demo.csv");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-csv-"));
const input = path.join(tmpDir, "xhs_demo.csv");
const output = path.join(tmpDir, "normalized.csv");
fs.writeFileSync(input, "note_title,liked_count,comment_count,collected_count,note_url\n测试标题,10,2,3,https://example.com/note\n", "utf8");
const result = normalizeCsvFile(input, output);
assert.strictEqual(result.rows, 1);
assert.ok(fs.existsSync(output));
const outputRows = parseCsvObjects(fs.readFileSync(output, "utf8"));
assert.strictEqual(outputRows[0].platform, "xhs");
assert.strictEqual(outputRows[0].title, "测试标题");
assert.strictEqual(outputRows[0].likes, "10");
assert.strictEqual(outputRows[0].comments, "2");
assert.strictEqual(outputRows[0].collects, "3");

console.log("csv normalizer tests passed");
