# Tuya Sample Backend

Sample backend Node.js untuk akses Tuya OpenAPI tanpa expose `client_secret`, `access_token`, atau `sign` ke frontend.

## Setup

```bash
cp .env.example .env
```

Isi `.env`:

```env
PORT=3000
TUYA_ENDPOINT=https://openapi-sg.iotbing.com
TUYA_CLIENT_ID=isi_client_id_tuya
TUYA_CLIENT_SECRET=isi_client_secret_tuya
TUYA_DEFAULT_DEVICE_ID=a38c2d491bb95114f4w9cb
```

Jalankan:

```bash
npm start
```

Backend jalan di:

```text
http://localhost:3000
```

## Endpoint

Ambil token Tuya dan simpan di memory cache:

```bash
curl http://localhost:3000/tuya/token
```

Cek detail device default dari `.env`:

```bash
curl http://localhost:3000/tuya/device
```

Cek status device:

```bash
curl http://localhost:3000/tuya/device/status
```

Cek function/capability device:

```bash
curl http://localhost:3000/tuya/device/functions
```

Kirim command standar Tuya:

```bash
curl -X POST http://localhost:3000/tuya/device/commands \
  -H "Content-Type: application/json" \
  -d '{"switch_1":false}'
```

Kirim shadow properties seperti curl kamu:

```bash
curl -X POST http://localhost:3000/tuya/device/shadow/properties \
  -H "Content-Type: application/json" \
  -d '{"switch_1":false}'
```

Atau pakai explicit device id:

```bash
curl -X POST http://localhost:3000/tuya/devices/a38c2d491bb95114f4w9cb/shadow/properties \
  -H "Content-Type: application/json" \
  -d '{"properties":{"switch_1":false}}'
```

## Catatan

- `access_token` di-cache di memory. Untuk production, simpan token di database atau cache service.
- Jangan expose `TUYA_CLIENT_SECRET` ke frontend.
- Kalau token dari curl lama sudah pernah dibagikan, rotate secret/token di Tuya IoT Platform.
- Curl original kamu perlu escaping JSON kalau dijalankan di shell:

```bash
--data '{"properties":{"switch_1":false}}'
```
