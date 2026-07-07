require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const tenantRoutes = require("./routes/tenant.routes");
const leadRoutes = require("./routes/lead.routes");
const pipelineRoutes = require("./routes/pipeline.routes");
const messageRoutes = require("./routes/message.routes");
const replyRoutes = require("./routes/reply.routes");
const kbRoutes = require("./routes/knowledgeBase.routes");
const agentLogRoutes = require("./routes/agentLog.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.CORS_ORIGIN || "http://localhost:3000";
    if (!origin || allowed === "*" || allowed.split(",").map(s => s.trim()).includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", tenantRoutes); // /api/me, /api/tenant/users
app.use("/api/leads", leadRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/replies", replyRoutes);
app.use("/api/knowledge-base", kbRoutes);
app.use("/api/agent-logs", agentLogRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
