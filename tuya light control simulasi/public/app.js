const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const state = {
  lights: [],
  devices: [],
  schedules: [],
  bookings: [],
  switchCode: "switch_led",
  brightnessCode: "bright_value_v2",
  supportsBrightness: false
};

const cloudStatus = document.querySelector("#cloudStatus");
const deviceGrid = document.querySelector("#deviceGrid");
const scheduleDevice = document.querySelector("#scheduleDevice");
const scheduleForm = document.querySelector("#scheduleForm");
const scheduleList = document.querySelector("#scheduleList");
const dayPicker = document.querySelector("#dayPicker");
const refreshBtn = document.querySelector("#refreshBtn");
const bookingForm = document.querySelector("#bookingForm");
const bookingDevice = document.querySelector("#bookingDevice");
const bookingList = document.querySelector("#bookingList");

refreshBtn.addEventListener("click", refreshStatus);
scheduleForm.addEventListener("submit", addSchedule);
bookingForm.addEventListener("submit", addBooking);

boot();

async function boot() {
  renderDays();
  setDefaultBookingDate();
  await loadConfig();
  await Promise.all([refreshStatus(), loadSchedules(), loadBookings()]);
}

async function loadConfig() {
  const config = await api("/api/config");
  state.lights = config.lights || [];
  state.switchCode = config.switchCode || "switch_led";
  state.brightnessCode = config.brightnessCode || "bright_value_v2";
  state.supportsBrightness = Boolean(config.supportsBrightness);
  cloudStatus.textContent = config.configured ? "Cloud siap" : ".env kosong";
  cloudStatus.className = `status-pill ${config.configured ? "ready" : "missing"}`;
  scheduleDevice.innerHTML = state.lights.map((light) => (
    `<option value="${escapeHtml(light.id)}">${escapeHtml(light.name)}</option>`
  )).join("");
  bookingDevice.innerHTML = scheduleDevice.innerHTML;
}

async function refreshStatus() {
  deviceGrid.innerHTML = `<div class="empty">Memuat status lampu...</div>`;
  const data = await api("/api/status").catch((error) => ({ error: error.message, devices: [] }));
  state.devices = data.devices || [];
  renderDevices(data.error);
}

async function loadSchedules() {
  const data = await api("/api/schedules");
  state.schedules = data.schedules || [];
  renderSchedules();
}

async function loadBookings() {
  const data = await api("/api/bookings");
  state.bookings = data.bookings || [];
  renderBookings();
}

function renderDevices(error) {
  if (error) {
    deviceGrid.innerHTML = `<div class="empty">${escapeHtml(error)}</div>`;
    return;
  }

  if (!state.devices.length) {
    deviceGrid.innerHTML = `<div class="empty">Belum ada lampu. Isi file data/lights.json.</div>`;
    return;
  }

  deviceGrid.innerHTML = state.devices.map((device) => {
    const isOn = readStatus(device, state.switchCode) === true;
    const brightness = Number(readStatus(device, state.brightnessCode) || readStatus(device, "bright_value") || 500);
    const brightnessControl = state.supportsBrightness ? `
        <div class="brightness">
          <label>
            <span>Brightness</span>
            <span>${Math.round(brightness / 10)}%</span>
          </label>
          <input type="range" min="10" max="1000" value="${brightness}" step="10" onchange="setBrightness('${escapeAttr(device.id)}', this.value)">
        </div>
      ` : "";
    return `
      <article class="device-card">
        <div class="device-row">
          <div>
            <h2>${escapeHtml(device.name)}</h2>
            <p class="room">${escapeHtml(device.room || "Tanpa ruangan")} · ${device.online ? "online" : "perlu cek"}</p>
          </div>
          <label class="switch" title="Nyalakan atau matikan lampu">
            <input type="checkbox" ${isOn ? "checked" : ""} onchange="toggleLight('${escapeAttr(device.id)}', this.checked)">
            <span></span>
          </label>
        </div>
        ${brightnessControl}
      </article>
    `;
  }).join("");
}

function renderDays() {
  dayPicker.innerHTML = dayNames.map((name, index) => `
    <label>
      <input type="checkbox" value="${index}" checked>
      <span>${name}</span>
    </label>
  `).join("");
}

function renderSchedules() {
  if (!state.schedules.length) {
    scheduleList.innerHTML = `<div class="empty">Belum ada jadwal.</div>`;
    return;
  }

  scheduleList.innerHTML = state.schedules.map((schedule) => {
    const light = state.lights.find((item) => item.id === schedule.deviceId);
    const days = schedule.days.map((day) => dayNames[day]).join(", ");
    return `
      <div class="schedule-item">
        <div>
          <strong>${schedule.time} · ${schedule.action.toUpperCase()}</strong>
          <small>${escapeHtml(light?.name || schedule.deviceId)} · ${days}</small>
        </div>
        <button class="delete" onclick="deleteSchedule('${escapeAttr(schedule.id)}')">Hapus</button>
      </div>
    `;
  }).join("");
}

function renderBookings() {
  const sorted = [...state.bookings].sort((a, b) => {
    return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
  });

  if (!sorted.length) {
    bookingList.innerHTML = `<div class="empty">Belum ada booking.</div>`;
    return;
  }

  bookingList.innerHTML = sorted.map((booking) => {
    const light = state.lights.find((item) => item.id === booking.deviceId);
    const endDate = booking.endDate && booking.endDate !== booking.date ? ` ${booking.endDate}` : "";
    const progress = booking.endedAt
      ? `<small class="done">Selesai</small>`
      : booking.startedAt
        ? `<small class="done">Sedang aktif</small>`
        : `<small>Menunggu</small>`;

    return `
      <div class="schedule-item">
        <div>
          <strong>${escapeHtml(booking.title)}</strong>
          <small>${booking.date} ${booking.startTime} -${endDate} ${booking.endTime}</small>
          <small>${escapeHtml(light?.name || booking.deviceId)}</small>
          ${progress}
        </div>
        <button class="delete" onclick="deleteBooking('${escapeAttr(booking.id)}')">Hapus</button>
      </div>
    `;
  }).join("");
}

async function addSchedule(event) {
  event.preventDefault();
  const form = new FormData(scheduleForm);
  const days = [...dayPicker.querySelectorAll("input:checked")].map((input) => Number(input.value));
  await api("/api/schedules", {
    method: "POST",
    body: JSON.stringify({
      deviceId: scheduleDevice.value,
      time: document.querySelector("#scheduleTime").value,
      action: form.get("action"),
      days
    })
  });
  scheduleForm.reset();
  renderDays();
  await loadSchedules();
}

async function addBooking(event) {
  event.preventDefault();
  await api("/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      title: document.querySelector("#bookingTitle").value,
      deviceId: bookingDevice.value,
      date: document.querySelector("#bookingDate").value,
      startTime: document.querySelector("#bookingStart").value,
      endTime: document.querySelector("#bookingEnd").value
    })
  });
  bookingForm.reset();
  setDefaultBookingDate();
  await loadBookings();
}

async function toggleLight(deviceId, on) {
  await api(`/api/lights/${encodeURIComponent(deviceId)}/toggle`, {
    method: "POST",
    body: JSON.stringify({ on })
  });
  await refreshStatus();
}

async function setBrightness(deviceId, value) {
  await api(`/api/lights/${encodeURIComponent(deviceId)}/brightness`, {
    method: "POST",
    body: JSON.stringify({ value: Number(value) })
  });
  await refreshStatus();
}

async function deleteSchedule(id) {
  await api(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadSchedules();
}

async function deleteBooking(id) {
  await api(`/api/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadBookings();
}

function readStatus(device, code) {
  return device.status.find((item) => item.code === code)?.value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Request gagal");
  }
  return data;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("'", "&#039;");
}

function setDefaultBookingDate() {
  const field = document.querySelector("#bookingDate");
  if (!field || field.value) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  field.value = `${year}-${month}-${day}`;
}

window.toggleLight = toggleLight;
window.setBrightness = setBrightness;
window.deleteSchedule = deleteSchedule;
window.deleteBooking = deleteBooking;
