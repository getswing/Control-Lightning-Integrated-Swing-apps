# Kontrol Lampu Otomatis Tuya Cloud

Web app lokal untuk simulasi integrasi kontrol lampu lapang Albatros via Tuya Cloud: ON/OFF, booking, dan jadwal otomatis.

## Cara Menjalankan

1. Salin `.env.example` menjadi `.env`.
2. Isi `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, `TUYA_ENDPOINT`, dan `APP_PASSWORD`.
3. Salin `data/lights.example.json` menjadi `data/lights.json`, lalu isi device ID asli di backend lokal.
4. Jalankan:

```powershell
node server.js
```

Lalu buka `http://localhost:4177`.

## Format Lapang Albatros

```json
[
  {
    "id": "device_id_dari_tuya",
    "alias": "albatros_lapang_1",
    "venue": "Albatros",
    "field": "Lapang 1",
    "name": "Albatros - Lapang 1",
    "room": "Albatros",
    "code": "switch_1"
  }
]
```

## Catatan Tuya

- Pastikan perangkat sudah terhubung ke Tuya IoT Cloud project.
- Kalau ON/OFF tidak jalan, cek DP code perangkat di Tuya. Default app ini memakai `switch_led`.
- Kalau brightness tidak jalan, coba ganti `TUYA_BRIGHTNESS_CODE` ke `bright_value`.
- Jadwal dan booking berjalan selama server Node ini hidup.
- Selama booking aktif, server cek status lampu tiap 5 detik dan menyalakan lagi jika saklar dimatikan manual.
