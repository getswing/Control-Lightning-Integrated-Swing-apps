# Dokumentasi Integrasi Lampu Booking

Dokumen ini menjelaskan kontrak integrasi untuk kontrol lampu booking lapang menggunakan Tuya Cloud dan Bardi 2 Gang.

Dokumen ini ditujukan untuk tim backend AWS dan tim client Swing app. Device ID Tuya asli tidak perlu diketahui oleh Swing app atau service lain di luar backend AWS.

## Tujuan Sistem

Sistem dipakai untuk mengontrol lampu lapang berdasarkan jadwal booking.

Perilaku utama:

- Saat booking mulai, lampu lapang otomatis ON.
- Saat booking selesai, lampu lapang otomatis OFF.
- Selama booking masih aktif, backend cek status lampu setiap 5 detik.
- Jika ada user mematikan saklar manual di tengah booking, backend otomatis menyalakan lampu lagi.
- Swing app dan sistem booking cukup memakai `venueCode` + `fieldCode`, bukan device ID Tuya.
- Field canonical memakai konsep `lapang_1`, `lapang_2`, dan seterusnya.

## Konsep Multi Venue

Sistem production harus mendukung banyak gedung/venue. Setiap venue bisa punya jumlah lapang berbeda, misalnya:

| Venue | `venueCode` | Contoh jumlah lapang |
|---|---|---:|
| Albatros | `albatros` | 6 |
| Melati | `melati` | 4 |
| Cihuni | `cihuni` | 8 |
| Cigaten | `cigaten` | 4-8 |
| Mawar | `mawar` | 4-8 |
| Kantil | `kantil` | 4-8 |

Gunakan field canonical berikut:

```text
lapang_1
lapang_2
lapang_3
...
lapang_8
```

Jadi kombinasi unik lapang adalah:

```text
albatros + lapang_1
albatros + lapang_6
melati   + lapang_4
cihuni   + lapang_8
```

Jika UI Flutter/Swing menampilkan label lain, backend tetap harus menerima/menyimpan mapping canonical sebagai `lapang_N`.

## Arsitektur Final

![Alur integrasi booking lampu](docs/scalable-lapang-flow.svg)

```text
Swing App / Booking System
        |
        | HTTPS API
        v
Backend AWS
        |
        | Tuya OpenAPI + HMAC signing
        v
Tuya Cloud
        |
        v
Bardi 2 Gang Switch / device lampu lain
        |
        +-- switch_1 -> Venue - Lapang ganjil
        +-- switch_2 -> Venue - Lapang genap
```

Catatan penting:

- Tuya credential hanya disimpan di backend AWS.
- Jangan taruh `TUYA_CLIENT_SECRET` di Swing app.
- Jangan expose device ID Tuya ke client.
- Client cukup memakai `venueCode` + `fieldCode`, contoh `albatros` + `lapang_1`.

## Alias Lapang

Untuk compatibility dengan prototype, alias tetap bisa dipakai dengan pola:

```text
{venueCode}_{fieldCode}
```

Contoh:

| Venue | Lapang | Alias | Tuya Channel Internal |
|---|---|---|---|
| Albatros | Lapang 1 | `albatros_lapang_1` | `switch_1` |
| Albatros | Lapang 2 | `albatros_lapang_2` | `switch_2` |
| Albatros | Lapang 3 | `albatros_lapang_3` | `switch_1` |
| Albatros | Lapang 4 | `albatros_lapang_4` | `switch_2` |
| Albatros | Lapang 5 | `albatros_lapang_5` | `switch_1` |
| Albatros | Lapang 6 | `albatros_lapang_6` | `switch_2` |
| Melati | Lapang 1 | `melati_lapang_1` | `switch_1` |
| Melati | Lapang 4 | `melati_lapang_4` | `switch_2` |

Mapping internal backend:

```text
albatros_lapang_1 -> device A + switch_1
albatros_lapang_2 -> device A + switch_2
albatros_lapang_3 -> device B + switch_1
albatros_lapang_4 -> device B + switch_2
albatros_lapang_5 -> device C + switch_1
albatros_lapang_6 -> device C + switch_2
```

Device ID Tuya asli tetap disimpan di konfigurasi internal backend AWS.

## Rekomendasi Schema Database Production

Gunakan database sebagai sumber mapping, bukan hardcode di aplikasi.

```text
venues
- id
- code              contoh: albatros
- name              contoh: Albatros
- timezone          contoh: Asia/Jakarta
- active

fields
- id
- venue_id
- code              contoh: lapang_1
- number            contoh: 1
- name              contoh: Lapang 1
- active

field_light_bindings
- id
- field_id
- provider          contoh: tuya
- device_id         device ID asli, internal backend saja
- dp_code           switch_1 / switch_2
- active

bookings
- id
- external_booking_id
- field_id
- start_at
- end_at
- status            scheduled / active / finished / cancelled

light_events
- id
- booking_id
- field_id
- action            turn_on / turn_off / enforce_on
- success
- error_message
- created_at
```

Untuk Bardi 2 Gang:

```text
jumlah_device = ceil(jumlah_lapang / 2)
```

Contoh:

| Venue | Jumlah lapang | Estimasi Bardi 2 Gang |
|---|---:|---:|
| Melati | 4 | 2 device |
| Albatros | 6 | 3 device |
| Cihuni | 8 | 4 device |

## Environment Backend AWS

Contoh environment variable yang perlu ada di backend AWS:

```env
TUYA_ENDPOINT=https://openapi-sg.iotbing.com
TUYA_CLIENT_ID=...
TUYA_CLIENT_SECRET=...
TUYA_DEFAULT_DEVICE_ID=...

APP_SESSION_SECRET=random_string_panjang
```

Rekomendasi penyimpanan secret:

- AWS Secrets Manager, atau
- AWS Systems Manager Parameter Store dengan encryption, atau
- environment variable service runtime yang aman.

Jangan commit file `.env` ke repository.

## Konfigurasi Field Internal

Backend AWS perlu punya mapping field internal seperti berikut.

Contoh konsep data:

```json
[
  {
    "alias": "albatros_lapang_1",
    "venue": "Albatros",
    "field": "Lapang 1",
    "name": "Albatros - Lapang 1",
    "tuyaDeviceId": "disimpan_di_backend_saja",
    "tuyaCode": "switch_1"
  },
  {
    "alias": "albatros_lapang_2",
    "venue": "Albatros",
    "field": "Lapang 2",
    "name": "Albatros - Lapang 2",
    "tuyaDeviceId": "disimpan_di_backend_saja",
    "tuyaCode": "switch_2"
  }
]
```

Untuk response API publik, jangan mengirim `tuyaDeviceId`.

## Kontrak Booking Dari Flutter/Swing

Request production yang disarankan:

```json
{
  "bookingId": "swing_booking_123",
  "venueCode": "albatros",
  "fieldCode": "lapang_1",
  "fieldNumber": 1,
  "startAt": "2026-07-02T19:00:00+07:00",
  "endAt": "2026-07-02T20:00:00+07:00",
  "timezone": "Asia/Jakarta"
}
```

Untuk booking multi-slot:

```json
{
  "bookingId": "swing_booking_123",
  "venueCode": "albatros",
  "fieldCode": "lapang_1",
  "fieldNumber": 1,
  "slots": [
    {
      "startAt": "2026-07-02T19:00:00+07:00",
      "endAt": "2026-07-02T20:00:00+07:00"
    },
    {
      "startAt": "2026-07-02T20:00:00+07:00",
      "endAt": "2026-07-02T21:00:00+07:00"
    }
  ]
}
```

Catatan:

- `fieldCode` wajib memakai format `lapang_N`.
- Jangan kirim device ID Tuya dari Flutter.
- Jangan kirim DP code Tuya seperti `switch_1` dari Flutter.
- Label tampilan di aplikasi boleh berbeda, tetapi kontrak backend tetap memakai konsep lapang.

## Auth

Prototype saat ini memakai login cookie sederhana. Untuk AWS production, auth bisa disesuaikan dengan sistem utama.

Minimal requirement:

- Semua endpoint kontrol lampu wajib authenticated.
- API dari Swing app ke backend AWS harus lewat HTTPS.
- Token/session harus bisa divalidasi backend.

Contoh prototype login:

```http
POST /api/auth/login
Content-Type: application/json
```

Request:

```json
{
  "password": "password_admin"
}
```

Response berhasil:

```json
{
  "ok": true
}
```

Server mengirim cookie:

```text
tuya_light_session=...
```

## Endpoint API Untuk Client

Base URL production contoh:

```text
https://api-domain-kamu.com
```

Base URL prototype lokal:

```text
http://localhost:4177
```

### 1. List Lapang

```http
GET /api/fields
```

Response:

```json
{
  "ok": true,
  "fields": [
    {
      "alias": "albatros_lapang_1",
      "venue": "Albatros",
      "field": "Lapang 1",
      "name": "Albatros - Lapang 1",
      "code": "switch_1",
      "online": true,
      "on": false
    },
    {
      "alias": "albatros_lapang_2",
      "venue": "Albatros",
      "field": "Lapang 2",
      "name": "Albatros - Lapang 2",
      "code": "switch_2",
      "online": true,
      "on": false
    }
  ]
}
```

Catatan:

- `alias` adalah ID bisnis yang dipakai client.
- `online` berarti backend berhasil membaca status dari Tuya.
- `on` adalah status lampu channel tersebut.
- `code` boleh dikembalikan untuk debug, tapi client tidak harus bergantung ke field ini.

### 2. Cek Status Satu Lapang

```http
GET /api/fields/{fieldAlias}/status
```

Contoh:

```http
GET /api/fields/albatros_lapang_1/status
```

Response:

```json
{
  "ok": true,
  "field": {
    "alias": "albatros_lapang_1",
    "venue": "Albatros",
    "field": "Lapang 1",
    "name": "Albatros - Lapang 1",
    "code": "switch_1",
    "online": true,
    "on": true
  }
}
```

### 3. ON/OFF Manual

```http
POST /api/fields/{fieldAlias}/toggle
Content-Type: application/json
```

Menyalakan Lapang 1:

```http
POST /api/fields/albatros_lapang_1/toggle
```

```json
{
  "on": true
}
```

Mematikan Lapang 1:

```json
{
  "on": false
}
```

Response:

```json
{
  "ok": true,
  "field": {
    "alias": "albatros_lapang_1",
    "venue": "Albatros",
    "field": "Lapang 1",
    "name": "Albatros - Lapang 1",
    "code": "switch_1",
    "online": false,
    "on": false
  },
  "result": {
    "success": true,
    "result": true
  }
}
```

Catatan:

- Jika ada booking aktif untuk lapang tersebut, lalu user mematikan manual, scheduler akan menyalakan lagi maksimal sekitar 5 detik kemudian.

### 4. Buat Booking Lapang

```http
POST /api/fields/{fieldAlias}/bookings
Content-Type: application/json
```

Contoh:

```http
POST /api/fields/albatros_lapang_1/bookings
```

Request:

```json
{
  "title": "Booking Futsal 19.00",
  "date": "2026-07-02",
  "startTime": "19:00",
  "endTime": "20:00"
}
```

Response:

```json
{
  "ok": true,
  "booking": {
    "id": "uuid",
    "fieldAlias": "albatros_lapang_1",
    "venue": "Albatros",
    "field": "Lapang 1",
    "title": "Booking Futsal 19.00",
    "date": "2026-07-02",
    "startTime": "19:00",
    "endDate": "2026-07-02",
    "endTime": "20:00",
    "enabled": true,
    "startedAt": "",
    "endedAt": ""
  }
}
```

Validasi:

- `date` format `YYYY-MM-DD`.
- `startTime` dan `endTime` format `HH:mm`.
- Jika `endTime <= startTime`, backend boleh menganggap booking melewati tengah malam dan mengisi `endDate` ke hari berikutnya.
- Booking yang bentrok di alias lapang yang sama harus ditolak.
- Booking Lapang 1 dan Lapang 2 boleh di jam yang sama karena alias berbeda.

Contoh bentrok:

```text
albatros_lapang_1 19:00-20:00
albatros_lapang_1 19:30-20:30 -> harus ditolak
```

Contoh tidak bentrok:

```text
albatros_lapang_1 19:00-20:00
albatros_lapang_2 19:00-20:00 -> boleh
```

### 5. Buat Jadwal Harian

```http
POST /api/fields/{fieldAlias}/schedules
Content-Type: application/json
```

Contoh:

```http
POST /api/fields/albatros_lapang_2/schedules
```

Request:

```json
{
  "time": "18:00",
  "action": "on",
  "days": [1, 2, 3, 4, 5]
}
```

Response:

```json
{
  "ok": true,
  "schedule": {
    "id": "uuid",
    "fieldAlias": "albatros_lapang_2",
    "venue": "Albatros",
    "field": "Lapang 2",
    "time": "18:00",
    "action": "on",
    "days": [1, 2, 3, 4, 5],
    "enabled": true
  }
}
```

Format `days`:

| Angka | Hari |
|---|---|
| `0` | Minggu |
| `1` | Senin |
| `2` | Selasa |
| `3` | Rabu |
| `4` | Kamis |
| `5` | Jumat |
| `6` | Sabtu |

## Logic Booking Lampu

Backend AWS wajib menjalankan scheduler.

### Start Booking

Saat waktu sekarang mencapai `date + startTime`:

```text
send Tuya command ON ke field alias terkait
isi startedAt
```

Contoh:

```text
booking albatros_lapang_1 mulai 19:00
backend kirim ON ke Tuya device + switch_1
```

### End Booking

Saat waktu sekarang mencapai `endDate + endTime`:

```text
send Tuya command OFF ke field alias terkait
isi endedAt
```

Contoh:

```text
booking albatros_lapang_1 selesai 20:00
backend kirim OFF ke Tuya device + switch_1
```

### Enforce ON Selama Booking Aktif

Ini requirement penting.

Selama booking aktif:

```text
setiap 5 detik:
  ambil semua booking aktif
  untuk tiap booking aktif:
    cek status lampu ke Tuya
    jika status OFF:
      kirim command ON lagi
```

Pseudocode:

```js
setInterval(async () => {
  const activeBookings = await getActiveBookings(now);

  for (const booking of activeBookings) {
    const field = findFieldByAlias(booking.fieldAlias);
    const status = await tuya.getDeviceStatus(field.tuyaDeviceId);
    const isOn = status[field.tuyaCode] === true;

    if (!isOn) {
      await tuya.sendCommand(field.tuyaDeviceId, field.tuyaCode, true);
    }
  }
}, 5000);
```

Dengan logic ini:

- Jika user mematikan saklar manual saat booking aktif, lampu akan menyala lagi.
- Koreksi terjadi maksimal sekitar 5 detik setelah status terbaca OFF.
- Setelah booking selesai, backend tidak lagi enforce ON dan akan mengirim OFF.

## Data Model Rekomendasi

### Field

```json
{
  "alias": "albatros_lapang_1",
  "venue": "Albatros",
  "field": "Lapang 1",
  "name": "Albatros - Lapang 1",
  "tuyaDeviceId": "secret/internal",
  "tuyaCode": "switch_1",
  "enabled": true
}
```

### Booking

```json
{
  "id": "uuid",
  "fieldAlias": "albatros_lapang_1",
  "title": "Booking Futsal 19.00",
  "date": "2026-07-02",
  "startTime": "19:00",
  "endDate": "2026-07-02",
  "endTime": "20:00",
  "enabled": true,
  "startedAt": null,
  "endedAt": null,
  "createdAt": "2026-07-02T12:00:00.000Z"
}
```

### Schedule

```json
{
  "id": "uuid",
  "fieldAlias": "albatros_lapang_2",
  "time": "18:00",
  "action": "on",
  "days": [1, 2, 3, 4, 5],
  "enabled": true
}
```

## Tuya Command Internal

Contoh command ON untuk Lapang 1:

```json
{
  "commands": [
    {
      "code": "switch_1",
      "value": true
    }
  ]
}
```

Contoh command OFF untuk Lapang 2:

```json
{
  "commands": [
    {
      "code": "switch_2",
      "value": false
    }
  ]
}
```

Endpoint Tuya internal:

```text
POST /v1.0/iot-03/devices/{deviceId}/commands
```

## Tuya Signing

Backend AWS harus membuat signature Tuya menggunakan HMAC-SHA256.

Alur umum:

1. Ambil access token dari Tuya.
2. Cache token sampai mendekati expired.
3. Untuk setiap request, buat SHA256 hash dari body.
4. Buat `stringToSign`.
5. Buat signature HMAC-SHA256 menggunakan `TUYA_CLIENT_SECRET`.
6. Kirim request ke Tuya dengan header yang diperlukan.

Header umum:

```text
client_id
access_token
sign
t
sign_method: HMAC-SHA256
Content-Type: application/json
```

## Error Response Rekomendasi

Gunakan bentuk error konsisten:

```json
{
  "ok": false,
  "error": "Booking bentrok dengan booking lain"
}
```

Contoh status HTTP:

| Kondisi | HTTP |
|---|---|
| Belum login / token invalid | `401` |
| Field alias tidak ditemukan | `404` |
| Booking bentrok | `409` |
| Validasi request gagal | `400` |
| Tuya gagal / upstream error | `502` |
| Error internal | `500` |

## Checklist Implementasi AWS

- [ ] Simpan Tuya credential di secret manager.
- [ ] Buat mapping venue, lapang, dan field alias untuk semua venue.
- [ ] Implement Tuya token caching.
- [ ] Implement Tuya HMAC signing.
- [ ] Implement endpoint `GET /api/fields`.
- [ ] Implement endpoint `GET /api/fields/:alias/status`.
- [ ] Implement endpoint `POST /api/fields/:alias/toggle`.
- [ ] Implement endpoint `POST /api/fields/:alias/bookings`.
- [ ] Implement endpoint `POST /api/fields/:alias/schedules`.
- [ ] Implement validasi booking bentrok per `fieldAlias`.
- [ ] Implement start booking -> ON.
- [ ] Implement end booking -> OFF.
- [ ] Implement enforce ON setiap 5 detik selama booking aktif.
- [ ] Jangan expose device ID Tuya ke Swing app.
- [ ] Jangan expose Tuya secret ke Swing app.
- [ ] Tambahkan logging untuk command ON/OFF dan kegagalan Tuya.

## Catatan Untuk Swing App

Swing app cukup menyimpan:

```text
baseUrl backend AWS
auth token/session
field alias
```

Swing app tidak perlu menyimpan:

```text
Tuya client ID
Tuya client secret
Tuya device ID
Tuya code switch_1/switch_2
```

Contoh request dari Swing app:

```http
POST https://api-domain-kamu.com/api/fields/albatros_lapang_1/bookings
Content-Type: application/json
Authorization: Bearer <token>
```

```json
{
  "title": "Booking Albatros Lapang 1",
  "date": "2026-07-02",
  "startTime": "19:00",
  "endTime": "20:00"
}
```

Backend AWS yang bertanggung jawab menerjemahkan alias tersebut menjadi command Tuya.
