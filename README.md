# Douyin Creator Analyzer

一个本地运行的抖音博主采集与口播转写工具。输入抖音分享短链、主页链接或 `sec_uid` 后，可以采集作品标题、封面、点赞、收藏、评论、分享、发布时间、视频地址等字段，并可继续把视频口播转成文字。

> 仅建议用于个人学习、竞品研究和合规的数据分析。请遵守平台规则、版权要求和相关法律法规，不要采集或传播敏感/非公开数据。

## 功能

- 通过已登录的浏览器状态采集抖音博主作品列表。
- 支持输入分享短链、主页链接或 `sec_uid`。
- 输出 CSV 数据表。
- 可选本地 `faster-whisper` 转写口播。
- 转写过程会临时读取视频并抽取音频，完成后删除临时文件。
- 可在界面里选择输出目录。

## 目录

- `抖音博主采集器.cmd`：双击启动图形界面。
- `douyin-crawler-gui.ps1`：PowerShell 图形界面。
- `scrape-dy-creator-cdp.js`：抖音作品数据采集脚本。
- `transcribe-dy-videos.py`：视频口播转写脚本。
- `analyze.js`：分析脚本。

## 安装

需要先安装：

- Node.js 18+
- Python 3.10+
- Chrome 或 Edge 浏览器

安装 Node 依赖：

```powershell
cd D:\creator-analyzer
npm install
```

如果需要口播转写，创建 Python 环境并安装依赖：

```powershell
cd D:\creator-analyzer
python -m venv .venv-transcribe
.\.venv-transcribe\Scripts\python.exe -m pip install -U pip faster-whisper
```

## 使用

1. 双击 `D:\creator-analyzer\抖音博主采集器.cmd`。
2. 输入抖音分享短链、主页链接或 `sec_uid`。
3. 选择输出目录。
4. 首次使用先点“打开/登录浏览器”，在浏览器里登录抖音并完成验证码。
5. 回到工具，点“开始抓取”。
6. 如需口播文字，勾选“抓取后转写口播”。

输出文件默认在：

```text
D:\creator-analyzer\output
```

转写文件默认在输出目录的 `transcripts` 子目录。

## 常见问题

如果浏览器连接超时，先在工具里点“重启调试浏览器”，重新登录后再抓取。

如果转写时报文件占用，关闭正在预览的 CSV/Excel/WPS，再重新运行。程序会优先跳过已经转写过的视频。

如果 C 盘空间不足，建议把缓存目录放到 D 盘，例如：

```powershell
setx HF_HOME D:\UserCaches\huggingface
setx HUGGINGFACE_HUB_CACHE D:\UserCaches\huggingface\hub
setx PIP_CACHE_DIR D:\UserCaches\pip
setx UV_CACHE_DIR D:\UserCaches\uv
setx PLAYWRIGHT_BROWSERS_PATH D:\UserCaches\playwright
```

## GitHub 上传前检查

仓库已经通过 `.gitignore` 排除了：

- 输出数据和转写结果
- 浏览器缓存和模型缓存
- Python 虚拟环境
- Node 依赖目录
- 密钥、环境变量文件和日志数据库
- 大体积压缩包和视频/音频临时文件

上传前建议再执行一次：

```powershell
rg -a -n "sk" D:\creator-analyzer
git status --short
```
