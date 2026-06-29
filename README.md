# Control Lighting Integrated Swing Apps

## Overview

Repository ini digunakan untuk dokumentasi dan integrasi sistem kontrol lampu yang terhubung dengan aplikasi Swing menggunakan Tuya Cloud API.

---

## System Architecture

```
Booking Apps
      │
      ▼
Backend API
      │
      ▼
Tuya Cloud API
      │
      ▼
BARDI Smart Wall Switch
      │
      ▼
Lighting
```

---

## Tuya Cloud Information

| Parameter | Value |
|-----------|-------|
| Cloud Provider | Tuya IoT Cloud |
| Region | Singapore Data Center |
| Base URL | https://openapi.tuyasg.com |
| Project | lamp control |

---

## Authentication

| Parameter | Value |
|-----------|-------|
| Client ID | k383yaxtaq8fafat8ah7|
| Client Secret | e2320dd967284d0487a9309cb8b4b64d|

---

## Device Information

| Parameter | Value |
|-----------|-------|
| Device Name | BARDI Wall Switch EU 2 Gang |
| Device ID | a38c2d491bb95114f4w9cb |
| Status | Online |

---

## Service API

- IoT Core
- Authorization Token Management
- Smart Home Basic Service

---

## API Endpoints

### Get Access Token

```
GET /v1.0/token?grant_type=1
```

### Get Device Status

```
GET /v1.0/devices/{device_id}/status
```

### Send Command

```
POST /v1.0/devices/{device_id}/commands
```

---

## Development Flow

1. User melakukan booking lapangan.
2. Backend memvalidasi jadwal.
3. Backend mengambil Access Token dari Tuya Cloud.
4. Backend mengirim perintah ON/OFF ke perangkat.
5. Saklar BARDI mengontrol lampu.

---

## References

- Tuya Developer Platform
- Authentication Method
- Device Control API
