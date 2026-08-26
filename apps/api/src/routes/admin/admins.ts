import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { hashPassword } from "../../lib/password";
import { type AdminRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/auth";

export const adminsRouter = Router();

adminsRouter.get("/", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  const [total, items] = await Promise.all([
    prisma.admin.count({ where }),
    prisma.admin.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true } }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const adminSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).optional(),
    role: z.enum(["SUPER_ADMIN", "ADMIN"]).default("ADMIN"),
    active: z.boolean().optional().default(true),
  }),
});

adminsRouter.post("/", requireRole(["SUPER_ADMIN"]), validate(adminSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof adminSchema.shape.body> } }).validated.body;
  const actor = (req as unknown as AdminRequest).admin;
  const existing = await prisma.admin.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) throw new AppError(409, "An admin with that email already exists");
  const admin = await prisma.admin.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      password: await hashPassword(body.password ?? "change-me-1234"),
      role: body.role,
      active: body.active,
    },
  });
  await prisma.auditLog.create({ data: { adminId: actor.id, action: "CREATE", targetType: "admin", targetId: admin.id, details: { email: admin.email } } });
  res.json(ok({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active }));
});

adminsRouter.patch("/:id", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const { name, role, active, password } = req.body as { name?: string; role?: "SUPER_ADMIN" | "ADMIN"; active?: boolean; password?: string };
  const actor = (req as unknown as AdminRequest).admin;
  const existing = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Admin not found");
  if (existing.id === actor.id && active === false) throw new AppError(400, "You cannot disable your own account");
  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (role) data.role = role;
  if (typeof active === "boolean") data.active = active;
  if (password) data.password = await hashPassword(password);
  const admin = await prisma.admin.update({ where: { id: existing.id }, data });
  await prisma.auditLog.create({ data: { adminId: actor.id, action: "UPDATE", targetType: "admin", targetId: admin.id, details: Object.keys(data) } });
  res.json(ok({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active }));
});

adminsRouter.delete("/:id", requireRole(["SUPER_ADMIN"]), async (req, res) => {
  const actor = (req as unknown as AdminRequest).admin;
  const existing = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Admin not found");
  if (existing.id === actor.id) throw new AppError(400, "You cannot delete your own account");
  await prisma.admin.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: actor.id, action: "DELETE", targetType: "admin", targetId: existing.id } });
  res.json(ok({ message: "Admin deleted" }));
});
