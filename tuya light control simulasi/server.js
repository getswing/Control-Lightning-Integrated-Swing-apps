import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4177);
const TUYA_ENDPOINT = (process.env.TUYA_ENDPOINT || "https://openapi.tuyaus.com").replace(/\/$/, "");
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID || "";
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET || "";
const TUYA_LIGHTS_FILE = resolveAppPath(process.env.TUYA_LIGHTS_FILE || "./data/lights.json");
const SCHEDULES_FILE = path.join(__dirname, "data", "schedules.json");
const BOOKINGS_FILE = path.join(__dirname, "data", "bookings.json");
const SWITCH_CODE = process.env.TUYA_SWITCH_CODE || "switch_led";
const BRIGHTNESS_CODE = process.env.TUYA_BRIGHTNESS_CODE || "bright_value_v2";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || TUYA_CLIENT_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_COOKIE = "tuya_light_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let tokenCache = { accessToken: "", expireAt: 0 };
let lastAutomationMinute = "";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === "/" && !isAuthenticated(req)) {
      redirect(res, "/login.html");
      return;
    }

    if (url.pathname === "/login.html" && isAuthenticated(req)) {
      redirect(res, "/");
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Tuya Light Control running at http://localhost:${PORT}`);
});

setInterval(() => {
  runAutomation().catch((error) => {
    console.error("Automation error:", error.message);
  });
}, 5_000);

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    sendJson(res, 200, {
      ok: true,
      authenticated: isAuthenticated(req),
      loginEnabled: Boolean(APP_PASSWORD)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    if (!APP_PASSWORD) {
      sendJson(res, 503, { ok: false, error: "APP_PASSWORD belum diisi di .env" });
      return;
    }

    if (!safeEqual(String(body.password || ""), APP_PASSWORD)) {
      sendJson(res, 401, { ok: false, error: "Password salah" });
      return;
    }

    setSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!isAuthenticated(req)) {
    sendJson(res, 401, { ok: false, error: "Login diperlukan" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/fields") {
    const fields = await readLights();
    const statuses = await Promise.all(fields.map(async (field) => {
      try {
        const status = await getDeviceStatus(field.id);
        return publicField(field, status);
      } catch (error) {
        return { ...publicField(field, []), online: false, error: error.message };
      }
    }));
    sendJson(res, 200, { ok: true, fields: statuses });
    return;
  }

  const fieldToggleMatch = url.pathname.match(/^\/api\/fields\/([^/]+)\/toggle$/);
  if (req.method === "POST" && fieldToggleMatch) {
    const field = await findFieldByAlias(fieldToggleMatch[1]);
    const body = await readBody(req);
    const result = await sendTuyaCommands(field.id, [{ code: field.code || SWITCH_CODE, value: Boolean(body.on) }]);
    sendJson(res, 200, { ok: true, field: publicField(field), result });
    return;
  }

  const fieldStatusMatch = url.pathname.match(/^\/api\/fields\/([^/]+)\/status$/);
  if (req.method === "GET" && fieldStatusMatch) {
    const field = await findFieldByAlias(fieldStatusMatch[1]);
    const status = await getDeviceStatus(field.id);
    sendJson(res, 200, { ok: true, field: publicField(field, status) });
    return;
  }

  const fieldBookingMatch = url.pathname.match(/^\/api\/fields\/([^/]+)\/bookings$/);
  if (req.method === "POST" && fieldBookingMatch) {
    const field = await findFieldByAlias(fieldBookingMatch[1]);
    const body = await readBody(req);
    const bookings = await readBookings();
    const booking = normalizeBooking({
      ...body,
      deviceId: field.id,
      code: field.code || SWITCH_CODE,
      fieldAlias: field.alias,
      title: body.title || `${field.name} Booking`
    });
    ensureNoBookingOverlap(bookings, booking);
    bookings.push(booking);
    await writeBookings(bookings);
    sendJson(res, 201, { ok: true, booking: publicBooking(booking, field) });
    return;
  }

  const fieldScheduleMatch = url.pathname.match(/^\/api\/fields\/([^/]+)\/schedules$/);
  if (req.method === "POST" && fieldScheduleMatch) {
    const field = await findFieldByAlias(fieldScheduleMatch[1]);
    const body = await readBody(req);
    const schedules = await readSchedules();
    const schedule = normalizeSchedule({
      ...body,
      deviceId: field.id,
      code: field.code || SWITCH_CODE,
      fieldAlias: field.alias
    });
    schedules.push(schedule);
    await writeSchedules(schedules);
    sendJson(res, 201, { ok: true, schedule: publicSchedule(schedule, field) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    const lights = await readLights();
    sendJson(res, 200, {
      ok: true,
      configured: Boolean(TUYA_CLIENT_ID && TUYA_CLIENT_SECRET),
      endpoint: TUYA_ENDPOINT,
      switchCode: SWITCH_CODE,
      brightnessCode: BRIGHTNESS_CODE,
      supportsBrightness: Boolean(process.env.TUYA_ENABLE_BRIGHTNESS === "true"),
      lights
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const lights = await readLights();
    const statuses = await Promise.all(lights.map(async (light) => {
      try {
        const status = await tuyaRequest("GET", `/v1.0/iot-03/devices/${light.id}/status`);
        return { ...light, online: true, status: status.result || [] };
      } catch (error) {
        return { ...light, online: false, error: error.message, status: [] };
      }
    }));
    sendJson(res, 200, { ok: true, devices: statuses });
    return;
  }

  const commandMatch = url.pathname.match(/^\/api\/lights\/([^/]+)\/(toggle|brightness|command)$/);
  if (req.method === "POST" && commandMatch) {
    const [, deviceId, action] = commandMatch;
    const body = await readBody(req);
    let commands;

    if (action === "toggle") {
      commands = [{ code: body.code || SWITCH_CODE, value: Boolean(body.on) }];
    } else if (action === "brightness") {
      const value = Math.max(10, Math.min(1000, Number(body.value)));
      commands = [{ code: body.code || BRIGHTNESS_CODE, value }];
    } else {
      commands = Array.isArray(body.commands) ? body.commands : [{ code: body.code, value: body.value }];
    }

    const result = await sendTuyaCommands(deviceId, commands);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/schedules") {
    sendJson(res, 200, { ok: true, schedules: await readSchedules() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/schedules") {
    const body = await readBody(req);
    const schedules = await readSchedules();
    const schedule = normalizeSchedule(body);
    schedules.push(schedule);
    await writeSchedules(schedules);
    sendJson(res, 201, { ok: true, schedule });
    return;
  }

  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleMatch && req.method === "DELETE") {
    const id = scheduleMatch[1];
    const schedules = (await readSchedules()).filter((item) => item.id !== id);
    await writeSchedules(schedules);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    sendJson(res, 200, { ok: true, bookings: await readBookings() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(req);
    const bookings = await readBookings();
    const booking = normalizeBooking(body);
    ensureNoBookingOverlap(bookings, booking);
    bookings.push(booking);
    await writeBookings(bookings);
    sendJson(res, 201, { ok: true, booking });
    return;
  }

  const bookingMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookingMatch && req.method === "DELETE") {
    const id = bookingMatch[1];
    const bookings = (await readBookings()).filter((item) => item.id !== id);
    await writeBookings(bookings);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Route tidak ditemukan" });
}

async function sendTuyaCommands(deviceId, commands) {
  if (!deviceId) throw new Error("Device ID kosong");
  if (!commands?.length || commands.some((command) => !command.code)) {
    throw new Error("Command tidak valid");
  }

  return tuyaRequest("POST", `/v1.0/iot-03/devices/${deviceId}/commands`, { commands });
}

async function tuyaRequest(method, requestPath, body) {
  if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
    throw new Error("TUYA_CLIENT_ID dan TUYA_CLIENT_SECRET belum diisi di .env");
  }

  const accessToken = requestPath.startsWith("/v1.0/token") ? "" : await getAccessToken();
  const bodyText = body ? JSON.stringify(body) : "";
  const timestamp = Date.now().toString();
  const contentHash = crypto.createHash("sha256").update(bodyText).digest("hex");
  const stringToSign = [method.toUpperCase(), contentHash, "", requestPath].join("\n");
  const signPayload = TUYA_CLIENT_ID + accessToken + timestamp + stringToSign;
  const sign = crypto.createHmac("sha256", TUYA_CLIENT_SECRET).update(signPayload).digest("hex").toUpperCase();

  const response = await fetch(TUYA_ENDPOINT + requestPath, {
    method,
    headers: {
      "client_id": TUYA_CLIENT_ID,
      "access_token": accessToken,
      "sign": sign,
      "t": timestamp,
      "sign_method": "HMAC-SHA256",
      "Content-Type": "application/json"
    },
    body: bodyText || undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.msg || data.message || `Tuya API error ${response.status}`);
  }
  return data;
}

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expireAt) {
    return tokenCache.accessToken;
  }

  const data = await tuyaRequest("GET", "/v1.0/token?grant_type=1");
  tokenCache = {
    accessToken: data.result.access_token,
    expireAt: Date.now() + Math.max(60, Number(data.result.expire_time || 3600) - 120) * 1000
  };
  return tokenCache.accessToken;
}

async function runAutomation() {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  if (minuteKey !== lastAutomationMinute) {
    lastAutomationMinute = minuteKey;
    await runDueSchedules(now, hhmm);
    await runBookingTransitions(now);
  }

  await enforceActiveBookings(now);
}

async function runDueSchedules(now, hhmm) {
  const day = now.getDay();
  const schedules = await readSchedules();
  const due = schedules.filter((item) => item.enabled && item.time === hhmm && item.days.includes(day));

  await Promise.allSettled(due.map((item) => {
    const commands = [{ code: item.code || SWITCH_CODE, value: item.action === "on" }];
    return sendTuyaCommands(item.deviceId, commands);
  }));
}

async function runBookingTransitions(now) {
  const currentMinute = dateToDayNumber(formatDate(now)) * 1440 + now.getHours() * 60 + now.getMinutes();
  const bookings = await readBookings();
  let changed = false;

  const actions = bookings.flatMap((booking) => {
    if (!booking.enabled) return [];

    const due = [];
    if (!booking.endedAt && currentMinute >= bookingEndMinute(booking)) {
      due.push({ booking, field: "endedAt", on: false });
    } else if (!booking.startedAt && currentMinute >= bookingStartMinute(booking)) {
      due.push({ booking, field: "startedAt", on: true });
    }
    return due;
  });

  const results = await Promise.allSettled(actions.map((action) => {
    const commands = [{ code: action.booking.code || SWITCH_CODE, value: action.on }];
    return sendTuyaCommands(action.booking.deviceId, commands);
  }));

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    actions[index].booking[actions[index].field] = new Date().toISOString();
    changed = true;
  });

  if (changed) {
    await writeBookings(bookings);
  }
}

async function enforceActiveBookings(now) {
  const currentMinute = dateToDayNumber(formatDate(now)) * 1440 + now.getHours() * 60 + now.getMinutes();
  const bookings = await readBookings();
  const activeBookings = bookings.filter((booking) => {
    if (!booking.enabled || booking.endedAt) return false;
    return bookingStartMinute(booking) <= currentMinute && currentMinute < bookingEndMinute(booking);
  });

  const uniqueTargets = new Map();
  activeBookings.forEach((booking) => {
    const code = booking.code || SWITCH_CODE;
    uniqueTargets.set(`${booking.deviceId}:${code}`, { deviceId: booking.deviceId, code });
  });

  await Promise.allSettled([...uniqueTargets.values()].map(async (target) => {
    const status = await getDeviceStatus(target.deviceId);
    const isOn = status.find((item) => item.code === target.code)?.value === true;
    if (!isOn) {
      await sendTuyaCommands(target.deviceId, [{ code: target.code, value: true }]);
    }
  }));
}

async function getDeviceStatus(deviceId) {
  const status = await tuyaRequest("GET", `/v1.0/iot-03/devices/${deviceId}/status`);
  return status.result || [];
}

function normalizeSchedule(body) {
  if (!body.deviceId || !body.time || !["on", "off"].includes(body.action)) {
    throw new Error("Jadwal perlu deviceId, time, dan action");
  }

  const days = Array.isArray(body.days) && body.days.length
    ? body.days.map(Number).filter((day) => day >= 0 && day <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  return {
    id: crypto.randomUUID(),
    deviceId: body.deviceId,
    name: body.name || "Jadwal Lampu",
    time: body.time,
    action: body.action,
    days,
    enabled: body.enabled !== false,
    code: body.code || SWITCH_CODE,
    fieldAlias: body.fieldAlias || ""
  };
}

function normalizeBooking(body) {
  if (!body.deviceId || !body.date || !body.startTime || !body.endTime) {
    throw new Error("Booking perlu lampu, tanggal, jam mulai, dan jam selesai");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new Error("Format tanggal booking tidak valid");
  }

  if (!/^\d{2}:\d{2}$/.test(body.startTime) || !/^\d{2}:\d{2}$/.test(body.endTime)) {
    throw new Error("Format jam booking tidak valid");
  }

  const startMinute = timeToMinute(body.startTime);
  const endMinute = timeToMinute(body.endTime);
  const crossesMidnight = endMinute <= startMinute;

  return {
    id: crypto.randomUUID(),
    deviceId: body.deviceId,
    title: body.title || "Booking",
    date: body.date,
    startTime: body.startTime,
    endDate: crossesMidnight ? addDays(body.date, 1) : body.date,
    endTime: body.endTime,
    enabled: body.enabled !== false,
    code: body.code || SWITCH_CODE,
    fieldAlias: body.fieldAlias || "",
    startedAt: "",
    endedAt: "",
    createdAt: new Date().toISOString()
  };
}

function ensureNoBookingOverlap(bookings, nextBooking) {
  const nextStart = bookingStartMinute(nextBooking);
  const nextEnd = bookingEndMinute(nextBooking);
  const overlap = bookings.find((booking) => {
    if (!booking.enabled || booking.deviceId !== nextBooking.deviceId) return false;
    if ((booking.code || SWITCH_CODE) !== (nextBooking.code || SWITCH_CODE)) return false;
    const start = bookingStartMinute(booking);
    const end = bookingEndMinute(booking);
    return nextStart < end && start < nextEnd;
  });

  if (overlap) {
    throw new Error(`Booking bentrok dengan "${overlap.title}"`);
  }
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(__dirname, "public", safePath));
  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  res.end(await fs.readFile(filePath));
}

async function readLights() {
  const raw = await fs.readFile(TUYA_LIGHTS_FILE, "utf8").catch(() => "[]");
  const lights = JSON.parse(raw);
  const defaultDeviceId = process.env.TUYA_DEFAULT_DEVICE_ID;
  const hasOnlyPlaceholder = lights.length === 1 && lights[0]?.id === "contoh_device_id_lampu";

  if ((!lights.length || hasOnlyPlaceholder) && defaultDeviceId) {
    return [
      {
        id: defaultDeviceId,
        alias: process.env.TUYA_DEFAULT_FIELD_ALIAS || "default_field",
        venue: process.env.TUYA_DEFAULT_VENUE || "Default Venue",
        field: process.env.TUYA_DEFAULT_FIELD_NAME || "Default Field",
        name: process.env.TUYA_DEFAULT_DEVICE_NAME || "Lampu Tuya",
        room: process.env.TUYA_DEFAULT_ROOM || "Utama",
        code: SWITCH_CODE
      }
    ];
  }

  return lights;
}

async function findFieldByAlias(alias) {
  const fields = await readLights();
  const field = fields.find((item) => item.alias === alias);
  if (!field) {
    throw new Error(`Field alias tidak ditemukan: ${alias}`);
  }
  return field;
}

function publicField(field, status = []) {
  const code = field.code || SWITCH_CODE;
  const value = status.find((item) => item.code === code)?.value;
  return {
    alias: field.alias,
    venue: field.venue,
    field: field.field,
    name: field.name,
    code,
    online: status.length > 0,
    on: value === true
  };
}

function publicBooking(booking, field) {
  return {
    id: booking.id,
    fieldAlias: booking.fieldAlias || field?.alias || "",
    venue: field?.venue || "",
    field: field?.field || "",
    title: booking.title,
    date: booking.date,
    startTime: booking.startTime,
    endDate: booking.endDate,
    endTime: booking.endTime,
    enabled: booking.enabled,
    startedAt: booking.startedAt,
    endedAt: booking.endedAt
  };
}

function publicSchedule(schedule, field) {
  return {
    id: schedule.id,
    fieldAlias: schedule.fieldAlias || field?.alias || "",
    venue: field?.venue || "",
    field: field?.field || "",
    time: schedule.time,
    action: schedule.action,
    days: schedule.days,
    enabled: schedule.enabled
  };
}

async function readSchedules() {
  const raw = await fs.readFile(SCHEDULES_FILE, "utf8").catch(() => "[]");
  return JSON.parse(raw);
}

async function writeSchedules(schedules) {
  await fs.writeFile(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

async function readBookings() {
  const raw = await fs.readFile(BOOKINGS_FILE, "utf8").catch(() => "[]");
  return JSON.parse(raw);
}

async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { "Location": location });
  res.end();
}

function isAuthenticated(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return false;

  const [expiresText, nonce, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!expires || !nonce || !signature || Date.now() > expires) return false;

  const expected = signSession(`${expiresText}.${nonce}`);
  return safeEqual(signature, expected);
}

function setSessionCookie(res) {
  const expires = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${expires}.${nonce}`;
  const token = `${payload}.${signSession(payload)}`;
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function signSession(payload) {
  return crypto.createHmac("sha256", APP_SESSION_SECRET).update(payload).digest("hex");
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }).filter(([key]) => key));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAppPath(value) {
  return path.isAbsolute(value) ? value : path.join(__dirname, value);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

function timeToMinute(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateToDayNumber(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return Math.floor(date.getTime() / 86_400_000);
}

function bookingStartMinute(booking) {
  return dateToDayNumber(booking.date) * 1440 + timeToMinute(booking.startTime);
}

function bookingEndMinute(booking) {
  return dateToDayNumber(booking.endDate || booking.date) * 1440 + timeToMinute(booking.endTime);
}
