# DiskKatalog

A self-hosted **disk & folder cataloging application**. Scan external drives, USB disks, or NAS folders into a database, then browse and search their full file/directory tree later — even when the disk is **offline**. Think of it as an offline-searchable index of everything stored across all your physical media.

Built as a single deployable unit: an Express API that also serves a React single-page app, backed by MySQL/MariaDB, with Google OAuth login and an admin approval workflow.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Model](#data-model)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Install & Build](#install--build)
  - [Run](#run)
- [Deployment](#deployment)
  - [PM2](#pm2-recommended)
  - [Docker](#docker)
- [API Reference](#api-reference)
- [Authentication & Roles](#authentication--roles)
- [Troubleshooting](#troubleshooting)

---

## Features

- 📀 **Catalog physical media** — scan a connected disk/folder and store its entire file & directory hierarchy in the database.
- 🔌 **Offline browsing** — once cataloged, browse a disk's contents without the disk being plugged in.
- 🔍 **Full-tree search** — search across every cataloged disk by file/folder name, with results showing which disk and path the item lives on.
- 🗂️ **Tree file browser** — navigate directories with a familiar nested file-browser UI, including breadcrumb lineage back to the root.
- ↕️ **Drag-and-drop ordering** — reorder disks in the sidebar (powered by `@dnd-kit`).
- 👤 **Google OAuth login** — sign in with Google; no passwords stored.
- 🛡️ **Admin approval workflow** — new users land in a `pending` state and must be approved by an admin before access.
- 🧑‍💼 **Admin panel** — manage users (approve/ban, promote to admin, delete).
- 📝 **Rotating logs** — structured logging via Winston with daily file rotation.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Node / Express                      │
│                                                        │
│   /api/disks   /api/system   /api/auth   /api/admin    │
│        │            │            │           │         │
│        └──────────── Sequelize ORM ──────────┘         │
│                        │                               │
│   express.static(client/dist)  ← serves the SPA        │
└────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
     MySQL / MariaDB              React SPA (built assets)
```

The Express server ([server/index.js](server/index.js)) does double duty: it exposes the REST API **and** serves the compiled React app from `client/dist`, with a catch-all route returning `index.html` so client-side routing works. There is no separate frontend server in production.

---

## Tech Stack

**Frontend** ([client/](client/))
- React 19 + Vite 7
- Tailwind CSS 4
- `axios` (HTTP), `lucide-react` (icons)
- `@react-oauth/google` + `jwt-decode` (auth)
- `@dnd-kit/*` (drag-and-drop)

**Backend** ([server/](server/))
- Node.js 18+, Express 5
- Sequelize 6 ORM + `mysql2` driver
- `google-auth-library` (verify Google ID tokens)
- `jsonwebtoken` (app session tokens), `cookie-parser`
- `winston` + `winston-daily-rotate-file` (logging)

**Database:** MySQL / MariaDB

---

## Project Structure

```
DiskKatalog/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── components/      # AdminPanel, FileBrowser, SearchModal, Sidebar, …
│       ├── context/         # AuthContext
│       ├── App.jsx
│       └── main.jsx
├── server/                 # Express API + static host
│   ├── config/database.js   # Sequelize connection
│   ├── models/              # Disk, Entry, User
│   ├── routes/              # diskRoutes, systemRoutes, authRoutes, adminRoutes
│   ├── middleware/          # auth middleware
│   ├── utils/               # logger
│   └── index.js             # entry point
├── Docs/                   # additional docs (API, login schema, deployment)
├── ecosystem.config.js     # PM2 config
├── docker-compose.yaml     # Docker deployment
└── Dockerfile
```

---

## Data Model

Three core tables (Sequelize models in [server/models/](server/models/)):

### `disks` — a cataloged physical disk/volume
| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER | PK |
| `name` | STRING | display name |
| `serial` | STRING | unique volume/serial id |
| `total` / `used` / `free` | BIGINT | capacity in bytes |
| `order` | INTEGER | sidebar sort position |

### `entries` — a file or directory within a disk (self-referencing tree)
| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER | PK |
| `disk_id` | INTEGER | FK → `disks.id` |
| `parent_id` | INTEGER | FK → `entries.id` (null = root) |
| `name` | STRING | file/folder name |
| `type` | ENUM(`file`, `directory`) | |
| `size` | BIGINT | bytes |
| `path` | TEXT | full path on the disk |

Indexed on `parent_id`, `disk_id`, and `name` for fast tree traversal and search.

### `users`
| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER | PK |
| `name` / `email` | STRING | unique email |
| `role` | ENUM(`user`, `admin`) | |
| `status` | ENUM(`pending`, `approved`, `banned`) | gates access |
| `gallery_access` | BOOLEAN | feature flag |
| `last_login` | DATE | |

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **MySQL / MariaDB** running and reachable
- A **Google Cloud OAuth Client ID** (for login) — [Google Cloud Console](https://console.cloud.google.com/)

### Environment Variables

Create `server/.env`:

```ini
NODE_ENV=production
PORT=3012

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=disk_catalog
DB_USER=root
DB_PASSWORD=your_password

# Auth
JWT_SECRET=your_super_secret_random_string
```

Create `client/.env` (Vite needs this at **build** time):

```ini
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

> The same `VITE_GOOGLE_CLIENT_ID` must be configured as an authorized origin in your Google Cloud OAuth client.

### Install & Build

```bash
# Backend deps
cd server && npm install

# Frontend deps + build (outputs to client/dist, which the server serves)
cd ../client && npm install && npm run build
```

### Run

```bash
cd server
node index.js
```

The app is then available at `http://localhost:3012` (API **and** UI on the same port).

For frontend development with hot-reload, run the Vite dev server separately:

```bash
cd client && npm run dev
```

---

## Deployment

### PM2 (recommended)

The repo ships a [ecosystem.config.js](ecosystem.config.js) configured to run the server on port **3012** in fork mode with auto-restart:

```bash
# from the project root
pm2 start ecosystem.config.js
pm2 save
```

After making changes:

```bash
# rebuild the client only if frontend changed
cd client && npm run build

# then restart
pm2 restart diskkatalog
```

> **Note:** the server binds its port **before** connecting to the database, so a slow or temporarily unreachable DB at boot won't leave the process running without a listening socket. If the DB is down, the server still listens on 3012 and API calls return errors until the DB recovers.

### Docker

A [Dockerfile](Dockerfile) (multi-stage: builds the client, then runs the server) and [docker-compose.yaml](docker-compose.yaml) are provided. The compose file uses `network_mode: host` so the container can reach a NAS database on `localhost`.

```bash
# VITE_GOOGLE_CLIENT_ID is passed as a build arg
docker compose up -d --build
```

Configure DB credentials and `PORT` via the `environment:` block in `docker-compose.yaml`. To scan NAS-mounted volumes from inside the container, uncomment the relevant `volumes:` mappings.

---

## API Reference

All routes are mounted under `/api`. See [Docs/api.md](Docs/api.md) for full payload details.

### Disks — `/api/disks`
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all disks |
| `PUT` | `/reorder` | Reorder disks (drag-and-drop) |
| `POST` | `/scan` | Scan a disk/folder in one shot |
| `POST` | `/scan/start` | Begin a chunked scan job |
| `POST` | `/scan/batch` | Submit a batch of entries for a job |
| `POST` | `/scan/end` | Finalize a scan job |
| `POST` | `/scan/cancel`, `/scan/:jobId/cancel` | Cancel a scan |
| `GET` | `/scan/progress/:jobId` | Poll scan progress |
| `GET` | `/entries` | List entries (browse a directory level) |
| `POST` | `/search` | Search entries across disks |
| `GET` | `/lineage/:id` | Breadcrumb path from an entry to its root |
| `PUT` | `/:id` | Update a disk |
| `DELETE` | `/:id` | Delete a disk and its entries |

### System — `/api/system`
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/drives` | List drives available to the host for scanning |
| `GET` | `/list` | List a directory's contents on the host |

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/google` | Exchange a Google ID token for an app session |
| `GET` | `/me` | Current authenticated user |

### Admin — `/api/admin`
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | List all users |
| `PUT` | `/users/:id/role` | Change a user's role |
| `PUT` | `/users/:id/status` | Approve / ban a user |
| `PUT` | `/users/:id/gallery` | Toggle gallery access |
| `DELETE` | `/users/:id` | Delete a user |

---

## Authentication & Roles

1. A user signs in with Google → the frontend sends the Google ID token to `POST /api/auth/google`.
2. The server verifies the token with Google, creates the user (if new) with `status = pending`, and issues a JWT.
3. **Pending** users see an "awaiting approval" screen and cannot access data.
4. An **admin** approves them (`status = approved`) via the Admin Panel.
5. Admins can also ban users, change roles, and delete accounts.

The first admin typically needs to be promoted directly in the database (`UPDATE users SET role='admin', status='approved' WHERE email='you@example.com';`). See [Docs/LOGIN.md](Docs/LOGIN.md) and [Docs/loginmysqlstructure.md](Docs/loginmysqlstructure.md).

---

## Troubleshooting

**App shows no listening port / `pm2-ports` shows `-`**
The current process never reached `app.listen()` — historically this happened when the DB was unreachable at boot. This is now fixed (the server binds the port first). If it recurs, check the DB connection and the logs.

**`Unable to connect to the database` in the logs**
Verify `DB_HOST`, `DB_PORT`, credentials, and that MySQL/MariaDB is reachable from the server. With a proxy (e.g. ProxySQL), a "Max connect timeout reached while reaching hostgroup" error means the backend DB is down or unreachable.

**Google login fails**
Ensure `VITE_GOOGLE_CLIENT_ID` was set **at build time** (it's baked into the static bundle), and that the origin is whitelisted in the Google Cloud OAuth client.

**Logs**
Server logs are written to `server/Logs/` (PM2 out/error) and rotated daily.

---

## License

ISC
