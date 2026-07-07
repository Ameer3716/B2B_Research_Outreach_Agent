const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`B2B Outreach Agent backend (Milestone 1-4) listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Dashboard:    http://localhost:3000  (npm run dev inside dashboard/)`);
});
