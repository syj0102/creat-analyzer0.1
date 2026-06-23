const path = require("path");

function readOptionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] || null;
}

function readOutputDir(argv, defaultDir) {
  return readOptionValue(argv, "--output-dir") || defaultDir;
}

function readMaxNotes(value, fallback = 60) {
  const parsed = parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeFilenamePart(value, fallback) {
  return String(value || fallback || "output")
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80) || fallback || "output";
}

function resolveProjectPath(...parts) {
  return path.join(__dirname, "..", ...parts);
}

module.exports = {
  readOptionValue,
  readOutputDir,
  readMaxNotes,
  safeFilenamePart,
  resolveProjectPath,
};
