# Kontrol Lampu Otomatis Tuya Cloud

Web app lokal untuk simulasi integrasi kontrol lampu booking lapang via Tuya Cloud: ON/OFF, booking, dan jadwal otomatis.

## Cara Menjalankan

1. Salin `.env.example` menjadi `.env`.
2. Isi `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`, `TUYA_ENDPOINT`, dan `APP_PASSWORD`.
3. Salin `data/lights.example.json` menjadi `data/lights.json`, lalu isi device ID asli di backend lokal.
4. Jalankan:

```powershell
node server.js
```

Lalu buka `http://localhost:4177`.

## Format Data Lapang

Gunakan konsep canonical `lapang`, bukan label UI lain. Untuk production, Flutter/Swing Apps cukup mengirim `venueCode` dan `fieldCode` seperti `albatros` + `lapang_1`.

Contoh mapping internal backend:

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
  },
  {
    "id": "device_id_dari_tuya",
    "alias": "albatros_lapang_2",
    "venue": "Albatros",
    "field": "Lapang 2",
    "name": "Albatros - Lapang 2",
    "room": "Albatros",
    "code": "switch_2"
  }
]
```

Untuk Bardi 2 Gang, satu device dapat mengontrol dua lapang:

```text
lapang_1 -> switch_1
lapang_2 -> switch_2
```

Jika satu gedung punya 6 lapang, biasanya butuh 3 device Bardi 2 Gang.

## Catatan Tuya

- Pastikan perangkat sudah terhubung ke Tuya IoT Cloud project.
- Kalau ON/OFF tidak jalan, cek DP code perangkat di Tuya. Untuk Bardi 2 Gang biasanya memakai `switch_1` dan `switch_2`.
- Kalau brightness tidak jalan, coba ganti `TUYA_BRIGHTNESS_CODE` ke `bright_value`.
- Jadwal dan booking berjalan selama server Node ini hidup.
- Selama booking aktif, server cek status lampu tiap 5 detik dan menyalakan lagi jika saklar dimatikan manual.
