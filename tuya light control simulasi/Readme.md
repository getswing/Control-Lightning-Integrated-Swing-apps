# Dokumentasi Backend

Backend aplikasi ini ada di `server.js`. Server memakai Node.js bawaan tanpa framework tambahan, jadi tidak perlu `npm install`.

## Ringkasan

Backend bertugas untuk:

- Menyajikan frontend dari folder `public/`.
- Membaca konfigurasi Tuya dari `.env`.
- Membuat signature request Tuya Cloud.
- Mengambil status perangkat.
- Mengirim command ON/OFF dan brightness.
- Menyimpan jadwal harian di `data/schedules.json`.
- Menyimpan booking di `data/bookings.json`.
- Menjalankan scheduler otomatis setiap 15 detik.
- Menjaga lampu tetap ON selama booking aktif.

## Menjalankan Server

```powershell
node server.js
```

Default URL:

```text
http://localhost:4177
```

Port bisa diubah lewat `.env`:

```env
PORT=4177
```

## Environment Variables

File `.env` berisi konfigurasi rahasia dan setting perangkat.

```env
PORT=4177
TUYA_ENDPOINT=https://openapi-sg.iotbing.com
TUYA_CLIENT_ID=...
TUYA_CLIENT_SECRET=...
TUYA_DEFAULT_DEVICE_ID=...
TUYA_SWITCH_CODE=switch_1
TUYA_BRIGHTNESS_CODE=bright_value_v2
TUYA_ENABLE_BRIGHTNESS=false
```

Keterangan:

| Variable | Fungsi |
|---|---|
| `PORT` | Port server lokal. |
| `TUYA_ENDPOINT` | Endpoint Tuya Cloud sesuai data center. |
| `TUYA_CLIENT_ID` | Access ID dari Tuya IoT Project. |
| `TUYA_CLIENT_SECRET` | Secret Tuya. Jangan dibagikan. |
| `TUYA_DEFAULT_DEVICE_ID` | Device ID default jika `data/lights.json` masih placeholder. |
| `TUYA_SWITCH_CODE` | DP code untuk saklar. Untuk device ini memakai `switch_1`. |
| `TUYA_BRIGHTNESS_CODE` | DP code brightness, jika perangkat mendukung dimmer. |
| `TUYA_ENABLE_BRIGHTNESS` | `true` untuk menampilkan slider brightness, `false` untuk saklar relay biasa. |

## File Data

### `data/lights.json`

Daftar lampu/perangkat yang muncul di dashboard.

```json
[
  {
    "id": "device_id",
    "name": "Lampu Tuya",
    "room": "Utama"
  }
]
```

Jika file ini kosong atau masih berisi placeholder, backend akan memakai `TUYA_DEFAULT_DEVICE_ID`.

### `data/schedules.json`

Menyimpan jadwal harian berulang.

```json
[
  {
    "id": "uuid",
    "deviceId": "device_id",
    "name": "Jadwal Lampu",
    "time": "18:00",
    "action": "on",
    "days": [1, 2, 3, 4, 5],
    "enabled": true,
    "code": "switch_1"
  }
]
```

Nilai `days` mengikuti format JavaScript:

| Angka | Hari |
|---|---|
| `0` | Minggu |
| `1` | Senin |
| `2` | Selasa |
| `3` | Rabu |
| `4` | Kamis |
| `5` | Jumat |
| `6` | Sabtu |

### `data/bookings.json`

Menyimpan jadwal booking sekali pakai.

```json
[
  {
    "id": "uuid",
    "deviceId": "device_id",
    "title": "Meeting",
    "date": "2026-06-30",
    "startTime": "13:00",
    "endDate": "2026-06-30",
    "endTime": "14:00",
    "enabled": true,
    "code": "switch_1",
    "startedAt": "",
    "endedAt": "",
    "createdAt": "2026-06-30T06:00:00.000Z"
  }
]
```

`startedAt` akan terisi setelah lampu berhasil ON. `endedAt` akan terisi setelah lampu berhasil OFF.

## Endpoint API

Semua endpoint mengembalikan JSON.

### `GET /api/config`

Mengambil konfigurasi aman untuk frontend.

Response:

```json
{
  "ok": true,
  "configured": true,
  "endpoint": "https://openapi-sg.iotbing.com",
  "switchCode": "switch_1",
  "brightnessCode": "bright_value_v2",
  "supportsBrightness": false,
  "lights": []
}
```

`TUYA_CLIENT_SECRET` tidak pernah dikirim ke frontend.

### `GET /api/status`

Mengambil status semua perangkat dari Tuya Cloud.

Response:

```json
{
  "ok": true,
  "devices": [
    {
      "id": "device_id",
      "name": "Lampu Tuya",
      "room": "Utama",
      "online": true,
      "status": [
        { "code": "switch_1", "value": true },
        { "code": "switch_2", "value": false }
      ]
    }
  ]
}
```

### `POST /api/lights/:deviceId/toggle`

Menyalakan atau mematikan lampu.

Request:

```json
{
  "on": true
}
```

Backend akan mengirim command:

```json
{
  "commands": [
    { "code": "switch_1", "value": true }
  ]
}
```

### `POST /api/lights/:deviceId/brightness`

Mengubah brightness jika perangkat mendukung dimmer.

Request:

```json
{
  "value": 500
}
```

Nilai brightness dibatasi dari `10` sampai `1000`.

### `POST /api/lights/:deviceId/command`

Endpoint command manual untuk DP code custom.

Request:

```json
{
  "commands": [
    { "code": "switch_2", "value": true }
  ]
}
```

Atau:

```json
{
  "code": "switch_2",
  "value": true
}
```

### `GET /api/schedules`

Mengambil semua jadwal harian.

### `POST /api/schedules`

Membuat jadwal harian.

Request:

```json
{
  "deviceId": "device_id",
  "time": "18:00",
  "action": "on",
  "days": [1, 2, 3, 4, 5]
}
```

`action` hanya boleh `on` atau `off`.

### `DELETE /api/schedules/:id`

Menghapus jadwal harian.

### `GET /api/bookings`

Mengambil semua booking.

### `POST /api/bookings`

Membuat booking baru.

Request:

```json
{
  "title": "Meeting Ruang A",
  "deviceId": "device_id",
  "date": "2026-06-30",
  "startTime": "13:00",
  "endTime": "14:00"
}
```

Jika `endTime` lebih kecil atau sama dengan `startTime`, backend menganggap booking melewati tengah malam dan otomatis mengisi `endDate` ke hari berikutnya.

Backend juga menolak booking yang bentrok dengan booking aktif lain pada device yang sama.

### `DELETE /api/bookings/:id`

Menghapus booking.

## Cara Kerja Scheduler

Scheduler berjalan dengan:

```js
setInterval(runDueSchedules, 15_000);
```

Setiap 15 detik server mengecek waktu saat ini. Transisi jadwal harian dan start/end booking hanya diproses sekali per menit, tetapi pengecekan booking aktif berjalan setiap 15 detik.

Untuk mencegah command start/end dikirim berkali-kali dalam menit yang sama, backend menyimpan:

- `lastAutomationMinute`

### Jadwal Harian

Jika waktu sekarang sama dengan `schedule.time` dan hari sekarang ada di `schedule.days`, backend mengirim:

```json
{ "code": "switch_1", "value": true }
```

atau:

```json
{ "code": "switch_1", "value": false }
```

sesuai nilai `action`.

### Booking

Untuk booking:

- Pada `date + startTime`, lampu ON.
- Pada `endDate + endTime`, lampu OFF.
- Jika command ON berhasil, `startedAt` diisi.
- Jika command OFF berhasil, `endedAt` diisi.
- Selama booking aktif, server mengambil status device dari Tuya Cloud setiap 15 detik.
- Jika status `switch_1` berubah menjadi `false` di tengah booking, server otomatis mengirim ON lagi.

Dengan cara ini, booking yang sudah dieksekusi tidak akan mengulang transisi start/end, tetapi lampu tetap dijaga ON selama rentang booking.

## Tuya Cloud Signing

Backend membuat signature Tuya dengan HMAC-SHA256.

Alur request:

1. Ambil access token dari `/v1.0/token?grant_type=1`.
2. Simpan token sementara di memory sampai mendekati expired.
3. Buat hash body request memakai SHA256.
4. Buat `stringToSign`.
5. Buat signature memakai `TUYA_CLIENT_SECRET`.
6. Kirim request ke Tuya dengan header:

```text
client_id
access_token
sign
t
sign_method
Content-Type
```

## Catatan Keamanan

- Jangan commit `.env`.
- Jangan taruh `TUYA_CLIENT_SECRET` di frontend.
- Semua request Tuya Cloud harus lewat backend.
- Jika aplikasi dipasang di server publik, tambahkan login/session sebelum dipakai banyak user.

## Troubleshooting

### Saklar tidak berubah

Cek DP code di `/api/status`. Untuk device ini status menunjukkan:

```json
{ "code": "switch_1", "value": true }
```

Maka `.env` harus memakai:

```env
TUYA_SWITCH_CODE=switch_1
```

### Device punya dua channel

Status menunjukkan `switch_1` dan `switch_2`. Saat ini UI utama memakai `switch_1`. Untuk mengontrol channel 2, kirim command manual ke:

```text
POST /api/lights/:deviceId/command
```

dengan body:

```json
{
  "code": "switch_2",
  "value": true
}
```

### Booking tidak jalan

Pastikan:

- Server Node masih hidup.
- Jam komputer benar.
- Tanggal memakai format `YYYY-MM-DD`.
- Jam memakai format `HH:mm`.
- Booking belum punya `startedAt` atau `endedAt`.
