// run-build.js — Builds the Next.js dashboard.
// Usage: node run-build.js  (from the dashboard/ directory)
// Workaround for the & in the parent directory path which breaks npm run build on Windows.
const { spawn } = require("child_process");
const path = require("path");

const dashboardDir = __dirname;
const nextBin = path.join(dashboardDir, "node_modules", "next", "dist", "bin", "next");

console.log("Building dashboard…\n");

const proc = spawn(process.execPath, [nextBin, "build"], {
  cwd: dashboardDir,
  stdio: "inherit",
  shell: false,
  env: { ...process.env, NODE_ENV: "production" },
});

proc.on("exit", (code) => process.exit(code ?? 0));
proc.on("error", (err) => { console.error("Spawn error:", err.message); process.exit(1); });
