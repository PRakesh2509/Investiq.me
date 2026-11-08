import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_PATTERNS = [
  { name: "yahoo", regex: /yahoo/i },
  { name: "yfinance", regex: /yfinance/i },
  { name: "finance.yahoo", regex: /finance\.yahoo/i },
  { name: "query1.finance", regex: /query1\.finance/i },
  { name: "query2.finance", regex: /query2\.finance/i },
  { name: "^NSEI", regex: /\^NSEI/i },
  { name: "^NSEBANK", regex: /\^NSEBANK/i },
  { name: "^BSESN", regex: /\^BSESN/i },
  { name: "NSEI symbol", regex: /\bNSEI\b/ },
];

const EXCLUDED_FILES = new Set([
  path.normalize("src/lib/__tests__/strict-dhan-lock.test.ts"),
  path.normalize("scripts/assert-no-yahoo.mjs"),
]);

const SEARCH_DIRS = ["src"];

let violations = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.normalize(fullPath);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".output" && entry.name !== ".git") {
        scanDir(fullPath);
      }
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.has(relPath)) continue;
      if (!/\.(ts|tsx|js|jsx|json|md|html|css|mjs)$/i.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        // Exclude legitimate words containing 'nsei' like 'nseindia.com' or 'license'
        if (line.includes("nseindia.com") || line.includes("NSEINDIA")) return;
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(line)) {
            console.error(`❌ VIOLATION [${pattern.name}]: ${relPath}:${idx + 1}`);
            console.error(`   ${line.trim()}`);
            violations++;
          }
        }
      });
    }
  }
}

for (const dir of SEARCH_DIRS) {
  if (fs.existsSync(dir)) scanDir(dir);
}

if (violations > 0) {
  console.error(`\nFAILED: Found ${violations} forbidden reference(s). Strict Dhan-only policy violated.`);
  process.exit(1);
} else {
  console.log("✅ PASSED: Strict Dhan-only policy verified. Zero forbidden references found across repository.");
  process.exit(0);
}
