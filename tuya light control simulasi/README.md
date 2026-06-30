# Kontrol Lampu Otomatis Tuya Cloud

Web app lokal untuk mengontrol lampu Tuya via Tuya Cloud: ON/OFF, brightness, dan jadwal otomatis.

## Cara Menjalankan

1. Salin `.env.example` menjadi `.env`.
2. Isi `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, dan `TUYA_ENDPOINT` sesuai data center project di Tuya IoT Platform.
3. Isi `data/lights.json` dengan device ID lampu yang ingin dikontrol.
4. Jalankan:

```powershell
node server.js
```

Lalu buka `http://localhost:4177`.

## Format Lampu

```json
[
  {
    "id": "device_id_dari_tuya",
    "name": "Lampu Ruang Tamu",
    "room": "Ruang Tamu"
  }
]
```

## Catatan Tuya

- Pastikan perangkat sudah terhubung ke Tuya IoT Cloud project.
- Kalau ON/OFF tidak jalan, cek DP code perangkat di Tuya. Default app ini memakai `switch_led`.
- Kalau brightness tidak jalan, coba ganti `TUYA_BRIGHTNESS_CODE` ke `bright_value`.
- Jadwal berjalan selama server Node ini hidup.
