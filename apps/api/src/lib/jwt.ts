import jwt from "jsonwebtoken";
import { config } from "../config";

export type AdminTokenPayload = {
  sub: string;
  email: string;
  role: string;
};

export function signAdminToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { email: payload.email, role: payload.role },
    config.jwt.secret,
    { subject: payload.id, expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"] }
  );
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    return { sub: decoded.sub as string, email: decoded.email as string, role: decoded.role as string };
  } catch {
    return null;
  }
}
