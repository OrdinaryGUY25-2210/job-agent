# Instalasi Online (GitHub + Railway)

Panduan dari nol sampai aplikasi (dashboard + API) berjalan online di Railway dengan database Postgres dari Railway.

> Arsitektur deploy: **satu service monolith** dari root repo. Build mengeksekusi migrasi DB lalu membangun dashboard; saat runtime `scripts/start.mjs` menjalankan API di port internal (3001) dan dashboard (`next start`) di port publik (3000). Dashboard mem-proxy `/api/*` → API internal via `INTERNAL_API_URL` (default `http://localhost:3001`), jadi satu domain saja cukup.

---

## 1. Prasyarat

- Akun [GitHub](https://github.com)
- Akun [Railway](https://railway.app) (login pakai GitHub juga bisa)
- Git di komputer: jika belum ada, install lewat PowerShell admin:
  ```powershell
  winget install Git.Git
  ```
  (Alternatif tanpa baris perintah: [GitHub Desktop](https://desktop.github.com) atau VS Code > Source Control.)
- Node.js 20.11+ hanya diperlukan untuk menjalankan **Runner** di laptop (lihat bagian 6).

---

## 2. Commit & push ke GitHub

Jalankan dari folder proyek (`C:\code\job-agent`):

```powershell
git init
git add .
git commit -m "jobagent: phase 1 - dashboard, api, runner"
```

Buat repo di GitHub (publik/privat) lalu hubungkan:

```powershell
git remote add origin https://github.com/<USERNAME>/<NAMA-REPO>.git
git branch -M main
git push -u origin main
```

Tanpa Git CLI: buat repo kosong di github.com, lalu pakai GitHub Desktop (File > Add local repository > Publish) atau VS Code (push via Source Control > Publish Branch).

> File penting untuk deploy ikut ter-commit: `railway.json` (root), `scripts/start.mjs`, `apps/*`, `packages/*`. Yang **tidak** ikut (sudah di `.gitignore`): `node_modules`, `.next`, `.env*`, folder CV/browser profile.

---

## 3. Deploy database Postgres di Railway

1. Buka [railway.app](https://railway.app) → **New Project**.
2. Pilih **Provision Postgres** (template *PostgreSQL*). Tunggu status `Ready`.
3. Klik service Postgres → tab **Variables** → salin nilai `DATABASE_URL`.

---

## 4. Deploy aplikasi dari GitHub

1. Di Railway: **New Project** → **Deploy from GitHub repo**.
   - Pertama kali harus **Connect GitHub account** dan izinkan Railway mengakses repo tersebut.
   - Pilih repo `nama-anda/job-agent`.
2. Railway otomatis mendeteksi `railway.json` di root →
   - *Build command*: `npm install --include=dev && npm run db:migrate && npm run build -w @jobagent/web`
   - *Start command*: `node scripts/start.mjs`
   - *Healthcheck*: `/`
   (Nilai ini sudah ada di `railway.json`; tidak perlu diubah secara manual kecuali ingin me-replace lewat menu **Settings > Deploy**.)

### 4.1 Set environment variables

Buka service hasil deploy → tab **Variables**, tambahkan:

| Nama | Contoh | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | (dari Postgres section 3) | Wajib |
| `JWT_SECRET` | string acak ≥ 16 karakter | Wajib — pakai password generator |
| `NODE_ENV` | `production` | Disarankan |
| `WEB_ORIGIN` | `https://<nama-proyek>.up.railway.app` | Asal CORS; isi dengan domain public project |
| `STORAGE_DIR` | `./uploads` | Folder CV/upload (lihat catatan di bawah) |
| `INTERNAL_API_URL` | `http://localhost:3001` | Default sudah benar; diisi hanya kalau API dipindah |

Cara membuat `JWT_SECRET` acak: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` atau pakai generator online.

### 4.2 Deploy

- Set selesai, Railway akan menjalankan build (migrasi DB otomatis tereksekusi karena `npm run db:migrate` ada di build command).
- Setelah status **Deploy Success** + **Service Healthy**, buka tab **Settings → Networking** → **Generate Domain** → buka URL-nya.
- Verifikasi: buka `/api/health` → jawaban `{"ok":true,...}`.

> Butuh migration manual? Jalankan lewat Railway: tab **Settings → Command** → `railway run npm run db:migrate` (kalau pakai Railway CLI). Tidak perlu jika build terakhir sukses, karena migrasi sudah jalan saat build.

---

## 5. Penggunaan pertama

1. Buka domain dashboard → daftar akun (email + password min 8 karakter).
2. Login → menu **Settings**: isi profil, set preferensi pekerjaan, portal mana saja yang boleh dibuka agent, dan **upload CV**.
3. Menu **Agent** → buat task *discovery* (misal portal `linkedin.com`). Task akan antri sampai ada runner yang online.

---

## 6. Runner di laptop (yang membuka job portal sungguhan)

Runner tidak berjalan di Railway — Railway hanya "otak" & dasbor. Runner membuka browser di laptop Anda. Di komputer dengan Node 20.11+:

```powershell
cd C:\code\job-agent
npm install --include=dev
npx playwright install chromium

# salin .env.example ke .env.local lalu isi:
#   RUNNER_API_URL=https://<nama-proyek>.up.railway.app
#   RUNNER_EMAIL=<email akun dashboard>
#   RUNNER_PASSWORD=<password akun dashboard>
#   RUNNER_CV_DIR=./cv          (taruh CV dengan nama file yang SAMA seperti di Settings)
#   RUNNER_HEADLESS=false

npm run dev:runner
```

Runner login ke API, mendaftar sebagai agent session, lalu memproses task antrian (discover & apply) dengan safety: allowlist domain, berhenti jika ada CAPTCHA/password/pertanyaan yang jawabannya belum ada di Answer Memory.

---

## 7. Catatan penting untuk produksi

- **Upload/CV**: `STORAGE_DIR` default menulis ke disk service Railway yang bersifat *ephemeral* — file hilang saat redeploy. Untuk permanen, (a) pasang volume Railway `railway add volume` dan set `STORAGE_DIR` ke mount path-nya, atau (b) pindah ke object storage (S3/R2) pada fase berikutnya. Runner sebenarnya membaca CV dari folder lokalnya sendiri (`RUNNER_CV_DIR`).
- **Cookie**: di produksi (`NODE_ENV=production`) cookie session memakai flag `secure`, jadi harus diakses lewat HTTPS — domain Railway sudah HTTPS.
- **JWT_SECRET**: jangan commit ke repo; cukup variabel Railway.
- **Database**: pakai `Railway Postgres`. Migrasi skema dilakukan lewat file SQL di `packages/database/migrations` + `npm run db:migrate`.
- **Runner harus online** agar task diproses. Antrian aman tersimpan di DB (`agent_tasks`); jika runner mati, task tetap menunggu.

---

## 8. Referensi CLI (opsional)

```powershell
# install Railway CLI & GitHub CLI (Windows)
winget install Railway.Railway
winget install GitHub.cli

gh auth login                # login GitHub
railway login                # buka browser untuk login Railway
railway link                 # hubungkan folder proyek ke project Railway
railway variables set JWT_SECRET=... NODE_ENV=production
railway up                   # deploy langsung dari folder (tanpa GitHub)
```