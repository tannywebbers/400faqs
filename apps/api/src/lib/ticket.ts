import crypto from "crypto";

export function generateTicket(prefix: string, length = 8): string {
  const body = crypto.randomBytes(Math.ceil(length / 2)).toString("hex").toUpperCase().slice(0, length);
  return `${prefix}-${body}`;
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function generateWaId(phone: string): string {
  return `wa_${phone.replace(/\D/g, "")}`;
}
