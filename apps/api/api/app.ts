import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../src/app";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  app(req, res);
}