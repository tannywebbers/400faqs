import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { updateManySettings, getAllSettings } from "../../services/settings";
import { type AdminRequest } from "../../middleware/auth";
import { emitAdminEvent } from "../../sockets";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json(ok(await getAllSettings()));
});

settingsRouter.get("/groups", async (_req, res) => {
  const rows = await prisma.setting.findMany({ select: { group: true }, distinct: ["group"], orderBy: { group: "asc" } });
  res.json(ok(rows.map((r) => r.group)));
});

const updateSchema = z.object({
  body: z.object({
    entries: z
      .array(
        z.object({
          key: z.string().min(1),
          value: z.string().max(5000),
          public: z.boolean().optional(),
          group: z.string().max(100).optional(),
          description: z.string().max(500).optional().nullable(),
        })
      )
      .min(1)
      .max(200),
  }),
});

settingsRouter.put("/", validate(updateSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: { entries: { key: string; value: string }[] } } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  await updateManySettings(body.entries);
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "UPDATE", targetType: "settings", details: { keys: body.entries.map((e) => e.key) } },
  });
  emitAdminEvent("settings:updated", { keys: body.entries.map((e) => e.key) });
  res.json(ok({ message: "Settings updated" }));
});

settingsRouter.post("/", validate(updateSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: { entries: { key: string; value: string }[] } } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  await updateManySettings(body.entries);
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "settings", details: { keys: body.entries.map((e) => e.key) } } });
  res.json(ok({ message: "Settings saved" }));
});
