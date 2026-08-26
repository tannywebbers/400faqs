import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyAdminToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("AUTH_REQUIRED"));
      const payload = verifyAdminToken(token);
      if (!payload) return next(new Error("UNAUTHORIZED"));
      const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
      if (!admin || !admin.active) return next(new Error("UNAUTHORIZED"));
      socket.data.admin = { id: admin.id, email: admin.email, role: admin.role };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    logger.info("[socket] admin connected", socket.data.admin?.email);
    socket.join("admins");
    socket.on("disconnect", () => logger.info("[socket] admin disconnected", socket.data.admin?.email));
  });

  logger.info("[socket] io initialized");
  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitAdminEvent(event: string, data: unknown): void {
  io?.to("admins").emit(event, data);
}
