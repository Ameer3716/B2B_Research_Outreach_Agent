// run-dev.js — Start the Next.js dev server for the dashboard.
// Usage: node run-dev.js  (from anywhere)
// Workaround for the & in the parent directory path which causes cmd.exe to fail.
const { spawn } = require("child_process");
const path = require("path");

const dashboardDir = path.join(__dirname);
const nextBin = path.join(dashboardDir, "node_modules", "next", "dist", "bin", "next");

console.log("Starting dashboard dev server at http://localhost:3000\n");

const proc = spawn(process.execPath, [nextBin, "dev", "--port", "3000"], {
  cwd: dashboardDir,
  stdio: "inherit",
  shell: false,
  env: { ...process.env },
});

proc.on("exit", (code) => process.exit(code ?? 0));
proc.on("error", (err) => { console.error("Error:", err.message); process.exit(1); });
