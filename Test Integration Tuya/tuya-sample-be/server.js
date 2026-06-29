import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

loadEnvFile();

const config = {
  port: Number(process.env.PORT || 3000),
  endpoint: process.env.TUYA_ENDPOINT || "https://openapi-sg.iotbing.com",
  clientId: process.env.TUYA_CLIENT_ID,
  clientSecret: process.env.TUYA_CLIENT_SECRET,
  defaultDeviceId: process.env.TUYA_DEFAULT_DEVICE_ID,
};

let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expireAt: 0,
};

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/tuya/token/refresh") {
      await refreshToken();
      sendJson(res, 200, safeTokenResponse());
      return;
    }

    if (req.method === "GET" && url.pathname === "/tuya/token") {
      await getAccessToken();
      sendJson(res, 200, safeTokenResponse());
      return;
    }

    const route = matchDeviceRoute(url.pathname);
    if (!route) {
      sendJson(res, 404, { error: "Route not found" });
      return;
    }

    const deviceId = route.deviceId || config.defaultDeviceId;
    if (!deviceId) {
      sendJson(res, 400, {
        error: "Device id is required. Set TUYA_DEFAULT_DEVICE_ID or use /tuya/devices/:deviceId/...",
      });
      return;
    }

    if (req.method === "GET" && route.action === "detail") {
      const result = await tuyaRequest("GET", `/v1.0/devices/${deviceId}`);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && route.action === "status") {
      const result = await tuyaRequest("GET", `/v1.0/devices/${deviceId}/status`);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && route.action === "functions") {
      const result = await tuyaRequest("GET", `/v1.0/devices/${deviceId}/functions`);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && route.action === "commands") {
      const body = await readJson(req);
      const result = await tuyaRequest("POST", `/v1.0/devices/${deviceId}/commands`, {
        body: {
          commands: normalizeCommands(body),
        },
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && route.action === "shadowProperties") {
      const body = await readJson(req);
      const properties = body.properties || body;
      const result = await tuyaRequest(
        "POST",
        `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`,
        {
          body: { properties },
        },
      );
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, {
      error: error.message || "Internal server error",
      details: error.details,
    });
  }
});

server.listen(config.port, () => {
  console.log(`Tuya sample backend running at http://localhost:${config.port}`);
});

function matchDeviceRoute(pathname) {
  if (pathname === "/tuya/device") return { action: "detail" };
  if (pathname === "/tuya/device/status") return { action: "status" };
  if (pathname === "/tuya/device/functions") return { action: "functions" };
  if (pathname === "/tuya/device/commands") return { action: "commands" };
  if (pathname === "/tuya/device/shadow/properties") return { action: "shadowProperties" };

  const match = pathname.match(/^\/tuya\/devices\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (!match) return null;

  const [, deviceId, part1, part2] = match;
  if (!part1) return { deviceId, action: "detail" };
  if (part1 === "status") return { deviceId, action: "status" };
  if (part1 === "functions") return { deviceId, action: "functions" };
  if (part1 === "commands") return { deviceId, action: "commands" };
  if (part1 === "shadow" && part2 === "properties") {
    return { deviceId, action: "shadowProperties" };
  }

  return null;
}

async function getAccessToken() {
  requireConfig();

  if (tokenCache.accessToken && Date.now() < tokenCache.expireAt - 60_000) {
    return tokenCache.accessToken;
  }

  const result = await tuyaRawRequest("GET", "/v1.0/token", {
    query: { grant_type: "1" },
    tokenRequired: false,
  });

  updateTokenCache(result);
  return tokenCache.accessToken;
}

async function refreshToken() {
  requireConfig();

  if (!tokenCache.refreshToken) {
    await getAccessToken();
    return tokenCache.accessToken;
  }

  const result = await tuyaRawRequest("GET", `/v1.0/token/${tokenCache.refreshToken}`, {
    tokenRequired: false,
  });

  updateTokenCache(result);
  return tokenCache.accessToken;
}

async function tuyaRequest(method, path, options = {}) {
  await getAccessToken();
  return tuyaRawRequest(method, path, {
    ...options,
    tokenRequired: true,
  });
}

async function tuyaRawRequest(method, path, options = {}) {
  requireConfig();

  const query = options.query || {};
  const bodyText = options.body === undefined ? "" : JSON.stringify(options.body);
  const signedPath = buildSignedPath(path, query);
  const t = Date.now().toString();
  const accessToken = options.tokenRequired ? tokenCache.accessToken : "";
  const sign = createTuyaSign({
    method,
    path: signedPath,
    bodyText,
    t,
    accessToken,
  });

  const headers = {
    client_id: config.clientId,
    t,
    sign_method: "HMAC-SHA256",
    sign,
  };

  if (options.tokenRequired) {
    headers.access_token = accessToken;
  }

  if (bodyText) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${config.endpoint}${signedPath}`, {
    method,
    headers,
    body: bodyText || undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok || parsed?.success === false) {
    const error = new Error(parsed?.msg || `Tuya API error: HTTP ${response.status}`);
    error.status = response.ok ? 502 : response.status;
    error.details = parsed;
    throw error;
  }

  return parsed;
}

function createTuyaSign({ method, path, bodyText, t, accessToken }) {
  const contentSha256 = sha256(bodyText || "");
  const stringToSign = `${method.toUpperCase()}\n${contentSha256}\n\n${path}`;
  const signSource = `${config.clientId}${accessToken || ""}${t}${stringToSign}`;

  return crypto
    .createHmac("sha256", config.clientSecret)
    .update(signSource, "utf8")
    .digest("hex")
    .toUpperCase();
}

function buildSignedPath(path, query = {}) {
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return path;

  entries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.append(key, String(value));
  }

  return `${path}?${params.toString()}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function updateTokenCache(response) {
  const result = response?.result;
  if (!result?.access_token) {
    const error = new Error("Tuya token response does not contain access_token");
    error.status = 502;
    error.details = response;
    throw error;
  }

  tokenCache = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || tokenCache.refreshToken,
    expireAt: Date.now() + Number(result.expire_time || 0) * 1000,
  };
}

function normalizeCommands(body) {
  if (Array.isArray(body.commands)) return body.commands;

  const source = body.properties || body;
  return Object.entries(source).map(([code, value]) => ({ code, value }));
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeTokenResponse() {
  return {
    ok: true,
    accessToken: mask(tokenCache.accessToken),
    refreshToken: mask(tokenCache.refreshToken),
    expireAt: tokenCache.expireAt ? new Date(tokenCache.expireAt).toISOString() : null,
  };
}

function mask(value) {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function requireConfig() {
  const missing = [];
  if (!config.clientId) missing.push("TUYA_CLIENT_ID");
  if (!config.clientSecret) missing.push("TUYA_CLIENT_SECRET");

  if (missing.length > 0) {
    const error = new Error(`Missing env: ${missing.join(", ")}`);
    error.status = 500;
    throw error;
  }
}

function loadEnvFile() {
  if (!fs.existsSync(".env")) return;

  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
