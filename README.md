# Control Lighting Integrated Swing Apps

Repository ini berisi dokumentasi dan prototype integrasi kontrol lampu lapangan dari Swing Apps ke Tuya Cloud.

Fokus implementasi saat ini adalah simulasi backend untuk booking lapang. Target production harus scalable untuk banyak gedung/venue seperti Albatros, Cihuni, Cigaten, Melati, Mawar, Kantil, dan venue lain.

## Struktur Repository

| Folder | Isi |
| --- | --- |
| `tuya light control simulasi/` | Prototype web backend untuk booking, schedule, dan kontrol lampu via Tuya Cloud. |
| `Test Integration Tuya/` | Sample backend sederhana untuk eksplorasi endpoint Tuya OpenAPI. |
| `Wiring Lightning Control/` | Gambar wiring prototype kontrol lampu. |
| `Opsi Internet dilapangan/` | Referensi opsi koneksi internet di lokasi lapangan. |

## Arsitektur Target

![Alur integrasi booking lampu](tuya%20light%20control%20simulasi/docs/scalable-lapang-flow.png)

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
Bardi Smart Wall Switch 2 Gang / device lampu lain
        |
        v
Lampu Lapang per Venue
```

## Flow Booking Lampu

1. User membuat booking lapang dari Swing Apps.
2. Swing Apps mengirim booking ke Backend AWS memakai `venueCode` dan `fieldCode`, contoh `albatros` + `lapang_1`.
3. Backend AWS menyimpan booking dan mapping internal ke Tuya device/code.
4. Saat booking mulai, backend mengirim command ON ke Tuya.
5. Selama booking aktif, backend cek status lampu setiap 5 detik.
6. Jika lampu dimatikan manual saat booking masih berjalan, backend otomatis menyalakan lagi.
7. Saat booking selesai, backend mengirim command OFF.

## Konsep Scalable

Gunakan pola data ini untuk semua gedung:

```text
venueCode + fieldCode

albatros + lapang_1
albatros + lapang_2
melati   + lapang_1
cihuni   + lapang_8
```

Setiap gedung bisa punya jumlah lapang berbeda:

| Venue | Contoh jumlah lapang |
| --- | ---: |
| Albatros | 6 |
| Melati | 4 |
| Cihuni | 8 |
| Cigaten | 4-8 |
| Mawar | 4-8 |
| Kantil | 4-8 |

Untuk Bardi 2 Gang, satu device biasanya mengontrol dua lapang:

```text
albatros + lapang_1 -> device A -> switch_1
albatros + lapang_2 -> device A -> switch_2
albatros + lapang_3 -> device B -> switch_1
albatros + lapang_4 -> device B -> switch_2
```

Device ID Tuya asli tidak perlu dikirim ke Flutter/Swing Apps atau service lain. Simpan hanya di konfigurasi internal backend.

## Kontrak Data Dari Flutter

Flutter cukup mengirim booking dengan format canonical `lapang`, bukan label UI lain:

```json
{
  "venueCode": "albatros",
  "fieldCode": "lapang_1",
  "fieldNumber": 1,
  "startAt": "2026-07-02T19:00:00+07:00",
  "endAt": "2026-07-02T20:00:00+07:00",
  "bookingId": "swing_booking_123"
}
```

Jika tampilan Flutter masih memakai label lain, backend tetap menerima dan menyimpan field canonical sebagai `lapang_1`, `lapang_2`, dan seterusnya.

## Dokumentasi Utama

- [Dokumentasi integrasi booking lampu](tuya%20light%20control%20simulasi/ALBATROS_API.md)
- [Dokumentasi backend prototype](tuya%20light%20control%20simulasi/BACKEND.md)
- [Cara menjalankan prototype](tuya%20light%20control%20simulasi/Readme.md)

## Keamanan

- Jangan commit `.env`, API key, client secret, access token, atau device ID asli.
- Gunakan `.env.example` dan `data/lights.example.json` sebagai template konfigurasi.
- Untuk production di AWS, simpan secret di AWS Secrets Manager atau Parameter Store.
- Rotate secret Tuya jika pernah terlanjur dibagikan di chat, screenshot, atau commit publik.
