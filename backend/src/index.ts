import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import uploadRoutes from "./routes/upload.js";
import { createJobRoutes } from "./routes/jobs.js";
import { createQueues, createWorkers } from "./queue/setup.js";

const app = express();
const server = createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  })
);
app.use(express.json());

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId as string;
  if (userId) {
    socket.join(userId);
    console.log(`[ws] User ${userId} connected`);
  }

  socket.on("disconnect", () => {
    console.log(`[ws] User ${userId} disconnected`);
  });
});

const { transcribeQueue, renderQueue } = createQueues();
createWorkers(io);

app.use("/api/upload", uploadRoutes);
app.use("/api/jobs", createJobRoutes(transcribeQueue, renderQueue));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = parseInt(process.env.PORT ?? "4000", 10);
server.listen(port, () => {
  console.log(`[selects-backend] Running on port ${port}`);
});
