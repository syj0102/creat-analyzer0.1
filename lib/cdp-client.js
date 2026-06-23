const WebSocket = require("ws");

const DEFAULT_CDP_VERSION_URL = "http://127.0.0.1:9222/json/version";
const DEFAULT_CDP_LIST_URL = "http://127.0.0.1:9222/json/list";

async function getBrowserWsUrl(versionUrl = DEFAULT_CDP_VERSION_URL) {
  const resp = await fetch(versionUrl);
  if (!resp.ok) throw new Error(`无法连接 Chrome CDP: ${resp.status}`);

  const json = await resp.json();
  if (!json.webSocketDebuggerUrl) {
    throw new Error("Chrome CDP 未返回 webSocketDebuggerUrl，请确认浏览器使用 --remote-debugging-port=9222 启动");
  }
  return json.webSocketDebuggerUrl;
}

async function getPageWsUrl({ listUrl = DEFAULT_CDP_LIST_URL, preferUrlIncludes = [], emptyMessage } = {}) {
  const resp = await fetch(listUrl);
  if (!resp.ok) throw new Error(`无法读取 Chrome 页面列表: ${resp.status}`);

  const targets = await resp.json();
  const pages = targets.filter((page) => page.type === "page" && page.webSocketDebuggerUrl);

  for (const keyword of preferUrlIncludes) {
    const matched = pages.find((page) => (page.url || "").includes(keyword));
    if (matched) return matched.webSocketDebuggerUrl;
  }

  const page = pages[0];
  if (!page) {
    throw new Error(emptyMessage || "未找到可用的 Chrome 页面，请先启动 9222 调试浏览器并登录目标平台");
  }
  return page.webSocketDebuggerUrl;
}

function createCdpClient(wsUrl, { connectTimeoutMs = 15000, callTimeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    let settled = false;
    const pending = new Map();

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error("连接页面 CDP 超时"));
      }
    }, connectTimeoutMs);

    function failPending(error) {
      for (const { rej, timer } of pending.values()) {
        clearTimeout(timer);
        rej(error);
      }
      pending.clear();
    }

    ws.on("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);

      resolve({
        call(method, params = {}) {
          if (ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error("CDP 连接已关闭"));
          }

          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params }));

          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              if (pending.has(msgId)) {
                pending.delete(msgId);
                rej(new Error(`CDP 调用超时: ${method}`));
              }
            }, callTimeoutMs);

            pending.set(msgId, { res, rej, timer });
          });
        },
        close() {
          try { ws.close(); } catch {}
        },
      });
    });

    ws.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        reject(new Error(`连接页面 CDP 失败: ${error.message}`));
        return;
      }
      failPending(error);
    });

    ws.on("close", () => {
      failPending(new Error("CDP 连接已关闭"));
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!msg.id || !pending.has(msg.id)) return;
      const { res, rej, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);

      if (msg.error) {
        rej(new Error(`${msg.error.message || "CDP error"} ${msg.error.data || ""}`.trim()));
      } else {
        res(msg.result);
      }
    });
  });
}

async function browserFetchJson(cdp, url) {
  const expression = `fetch(${JSON.stringify(url)}, { credentials: "include", headers: { referer: location.href } }).then(r => r.json())`;
  const result = await cdp.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "浏览器 fetch 执行失败");
  }

  return result.result.value;
}

module.exports = {
  DEFAULT_CDP_VERSION_URL,
  DEFAULT_CDP_LIST_URL,
  getBrowserWsUrl,
  getPageWsUrl,
  createCdpClient,
  browserFetchJson,
};
