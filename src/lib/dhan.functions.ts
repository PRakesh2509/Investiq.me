import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getDhanCredentials,
  testDhanConnection,
  persistDhanCredentials,
  setDhanRuntimeCredentials,
} from "./dhan.server";
import fs from "fs";
import path from "path";

export const getDhanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const envClientId = process.env.DHAN_CLIENT_ID?.trim() || "1114340693";
  const creds = getDhanCredentials();
  if (!creds) {
    return {
      connected: false,
      clientId: null,
      configuredClientId: envClientId,
      feedSource: "NSE Real-time Feed (Fallback Active)",
    };
  }

  const cid = creds.clientId;
  const masked = cid.length > 4 ? `${cid.slice(0, 3)}****${cid.slice(-3)}` : cid;

  return {
    connected: true,
    clientId: masked,
    configuredClientId: cid,
    feedSource: "DhanHQ Live Direct Feed",
  };
});

export const connectDhanAccount = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        clientId: z.string().min(1, "Client ID is required"),
        accessToken: z.string().min(1, "Access Token is required"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const creds = {
      clientId: data.clientId.trim(),
      accessToken: data.accessToken.trim(),
    };

    const test = await testDhanConnection(creds);
    if (!test.ok) {
      return { ok: false, message: test.message || "Failed to authenticate with DhanHQ" };
    }

    const saved = persistDhanCredentials(creds);
    return {
      ok: true,
      message: "DhanHQ account connected! Direct live feed is now active.",
      savedToEnv: saved,
    };
  });

export const disconnectDhanAccount = createServerFn({ method: "POST" }).handler(async () => {
  setDhanRuntimeCredentials(null);
  delete process.env.DHAN_CLIENT_ID;
  delete process.env.DHAN_ACCESS_TOKEN;

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf8");
      content = content.replace(/DHAN_CLIENT_ID=.*/g, 'DHAN_CLIENT_ID=""');
      content = content.replace(/DHAN_ACCESS_TOKEN=.*/g, 'DHAN_ACCESS_TOKEN=""');
      fs.writeFileSync(envPath, content, "utf8");
    }
  } catch {}

  return { ok: true, message: "Disconnected DhanHQ. Reverted to NSE live feed." };
});
