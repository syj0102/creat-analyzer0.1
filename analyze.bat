@echo off
:: 博主内容分析工具 — 爬取 + AI 分析 + Obsidian 报告
:: 用法: analyze.bat quick xhs "博主主页URL"  或  analyze.bat analyze data.csv
node "%~dp0analyze.js" %*
