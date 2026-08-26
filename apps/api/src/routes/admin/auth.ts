import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { signAdminToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { validate } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimit";
import { AppError, ok } from "../../lib/response";
import { requireAuth, type AdminRequest } from "../../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

authRouter.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: { email: string; password: string } } }).validated.body;
  const admin = await prisma.admin.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!admin || !admin.active) throw new AppError(401, "Invalid credentials");
  const valid = await verifyPassword(body.password, admin.password);
  if (!valid) throw new AppError(401, "Invalid credentials");

  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "LOGIN", targetType: "admin", targetId: admin.id } });

  const token = signAdminToken({ id: admin.id, email: admin.email, role: admin.role });
  res.json(
    ok({
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    })
  );
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const { id } = (req as AdminRequest).admin;
  const admin = await prisma.admin.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true, createdAt: true },
  });
  res.json(ok(admin));
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
});

authRouter.post("/change-password", requireAuth, validate(changePasswordSchema), async (req, res) => {
  const { id } = (req as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: { currentPassword: string; newPassword: string } } }).validated.body;
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw new AppError(404, "Admin not found");
  const valid = await verifyPassword(body.currentPassword, admin.password);
  if (!valid) throw new AppError(401, "Current password is incorrect");
  await prisma.admin.update({ where: { id }, data: { password: await hashPassword(body.newPassword) } });
  await prisma.auditLog.create({ data: { adminId: id, action: "CHANGE_PASSWORD", targetType: "admin", targetId: id } });
  res.json(ok({ message: "Password changed" }));
});
