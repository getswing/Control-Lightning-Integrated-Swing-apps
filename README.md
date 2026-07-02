# Control Lighting Integrated Swing Apps

Repository ini berisi dokumentasi dan prototype integrasi kontrol lampu lapangan dari Swing Apps ke Tuya Cloud.

Fokus implementasi saat ini adalah simulasi backend untuk venue Albatros, dengan kontrol dua lapang menggunakan Bardi Smart Wall Switch 2 Gang.

## Struktur Repository

| Folder | Isi |
| --- | --- |
| `tuya light control simulasi/` | Prototype web backend untuk booking, schedule, dan kontrol lampu via Tuya Cloud. |
| `Test Integration Tuya/` | Sample backend sederhana untuk eksplorasi endpoint Tuya OpenAPI. |
| `Wiring Lightning Control/` | Gambar wiring prototype kontrol lampu. |
| `Opsi Internet dilapangan/` | Referensi opsi koneksi internet di lokasi lapangan. |

## Arsitektur Target

```text
Swing Apps / Booking System
        |
        v
Backend AWS
        |
        v
Tuya Cloud API
        |
        v
Bardi Smart Wall Switch 2 Gang
        |
        v
Lampu Lapang Albatros
```

## Flow Booking Lampu

1. User membuat booking lapang dari Swing Apps.
2. Swing Apps mengirim booking ke Backend AWS memakai alias lapang, contoh `albatros_lapang_1`.
3. Backend AWS menyimpan booking dan mapping internal ke Tuya device/code.
4. Saat booking mulai, backend mengirim command ON ke Tuya.
5. Selama booking aktif, backend cek status lampu setiap 5 detik.
6. Jika lampu dimatikan manual saat booking masih berjalan, backend otomatis menyalakan lagi.
7. Saat booking selesai, backend mengirim command OFF.

## Mapping Lapang Albatros

| Alias backend | Lokasi | Tuya DP code |
| --- | --- | --- |
| `albatros_lapang_1` | Albatros - Lapang 1 | `switch_1` |
| `albatros_lapang_2` | Albatros - Lapang 2 | `switch_2` |

Device ID Tuya asli tidak perlu dikirim ke Swing Apps atau service lain. Simpan hanya di konfigurasi internal backend.

## Dokumentasi Utama

- [Dokumentasi integrasi Albatros](tuya%20light%20control%20simulasi/ALBATROS_API.md)
- [Dokumentasi backend prototype](tuya%20light%20control%20simulasi/BACKEND.md)
- [Cara menjalankan prototype](tuya%20light%20control%20simulasi/Readme.md)

## Keamanan

- Jangan commit `.env`, API key, client secret, access token, atau device ID asli.
- Gunakan `.env.example` dan `data/lights.example.json` sebagai template konfigurasi.
- Untuk production di AWS, simpan secret di AWS Secrets Manager atau Parameter Store.
- Rotate secret Tuya jika pernah terlanjur dibagikan di chat, screenshot, atau commit publik.
