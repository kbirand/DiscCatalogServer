# High-Performance Scanning Protocol (V2 Tree-Mode)

This document describes the API protocol used for ultra-fast remote file scanning. This protocol minimizes database overhead by sending entire directory trees in single batch requests.

## Architecture

1.  **Client-Side Traversal**: The client walks the folder structure.
2.  **Tree-Based Payload**: Instead of sending files individually, the client sends a `{ dirPath, files[] }` payload.
3.  **Server-Side Logic**: The server resolves the `parent_id` for the folder **once**, then performs a bulk database insert for all files in that batch.

---

## API Endpoints

### 1. Start Session
Initializes a new disk scan session.

**POST** `/api/debug/start` (or `/api/disks/scan/start` in production)
*   **Body**: `{ "name": "Disk Name", "total_space": 123456789 }`
*   **Response**: `{ "success": true, "diskId": 123 }`

### 2. Send Batch (The Core Loop)
Sends a batch of files belonging to a specific directory.

**POST** `/api/debug/batch` (or `/api/disks/scan/batch` in production)
*   **Body**:
    ```json
    {
      "diskId": 123,
      "dirPath": "Photos/2023",
      "files": [
        ["IMG_001.jpg", 1024, 1700000000000],
        ["IMG_002.jpg", 2048, 1700000005000]
      ]
    }
    ```

**Parameters:**
*   `diskId`: The ID returned from the Start Session call.
*   `dirPath`: The relative path of the directory *from the disk root*.
    *   For the root folder itself, send `""` (empty string).
    *   For subfolders, send standard paths like `"Folder/Subfolder"`.
*   `files`: An array of arrays (Compact Format). Each inner array must preserve this order:
    1.  **Name** (String): File name only (e.g., `"test.txt"`).
    2.  **Size** (Integer): File size in bytes.
    3.  **Modified Time** (Integer/String): Unix timestamp (ms) or ISO Date string.

**Recommendation:** If a folder has >2000 files, split the `files` array into chunks of 2000 and send multiple requests for the same `dirPath`.

### 3. End Session
Finalizes the scan and cleans up server-side caches.

**POST** `/api/debug/end` (or `/api/disks/scan/end` in production)
*   **Body**: `{ "diskId": 123 }`
*   **Response**: `{ "success": true }`

---

## Security Implementation (Active)

The server now enforces API Key authentication for all scanner endpoints.

### Authentication Header
Every request must include the `x-api-key` header.

**Request Header:**
```http
x-api-key: change_me_scanner_key
```

(Note: In a real production setup, change this key in `server/.env` to something private).

### Server Middleware Logic
The server checks `req.headers['x-api-key']` against `process.env.SCANNER_SECRET_KEY`.

```javascript
const checkScannerKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== process.env.SCANNER_SECRET_KEY) {
        return res.status(403).json({ error: "Access Denied" });
    }
    next();
};
```

### Method 2: Bearer Token (JWT)
If the scanner is logged in as a legitimate user (e.g., an Admin), use the standard Authorization header.

**Request Header:**
```http
Authorization: Bearer <JWT_TOKEN>
```
The server verifies the token as it does for normal API requests. This typically requires the scanner client to implement a Login Flow to retrieve the token first.

---

## Implementation Checklist for Custom Client

*   [ ] **Recursive Walker**: Build a function to traverse folders recursively.
*   [ ] **Batch Aggregator**: Collect all files in the *current* folder into a list.
*   [ ] **Chunking**: If list > 2000, slice it and loop.
*   [ ] **Async Queue**: Use a concurrency limit (e.g., 3 parallel uploads) to maximize bandwidth without crashing the database.
*   [ ] **Retry Logic**: Implement retry on 500/502 errors for robustness.
