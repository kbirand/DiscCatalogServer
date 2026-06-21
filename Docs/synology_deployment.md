# Deploying DiskKatalog on Synology NAS (Container Manager)

This guide explains how to deploy the application on your Synology NAS using Container Manager (Docker), connecting to the NAS's built-in MariaDB.

## Prerequisites

1.  **Synology NAS** with **Container Manager** (formerly Docker) installed.
2.  **MariaDB** installed on the NAS (via Package Center).
3.  **SSH Access** to your NAS (for building the image, or you can build on your Mac and push to Docker Hub).

---

## Step 1: Prepare the Database

Since you are using the NAS's built-in MariaDB, we need to ensure the container can access it.

1.  **Check MariaDB Port:** Open Synology **MariaDB** package. Note the port (usually `3306` or `3307`).
2.  **Create Database:** Use phpMyAdmin or CLI to create the `disk_catalog` database.
3.  **User Access:**
    *   If using **Host Network** (Recommended below): You can use your standard SQL user.
    *   **Crucial:** Ensure the user has permissions to connect from `127.0.0.1` and `localhost`.

---

## Step 2: Build the Docker Image

You need to build the Docker image. You can do this on your Mac.

1.  **Check Environment Variables:**
    Ensure `client/.env` has `VITE_API_TARGET` set to the NAS IP or domain if you plan to access it remotely, OR effectively it should be relative.
    *Actually, with our latest code, the frontend uses relative paths, so no specific IP config is needed for the build!*

2.  **Build Command:**
    Run this in the root `DiskKatalog` folder on your Mac:
    ```bash
    # Replace 'yourusername' with your Docker Hub username
    docker build -t yourusername/disk-catalog:latest . --platform linux/amd64
    ```
    *(Note: We add `--platform linux/amd64` because Synology is usually Intel/AMD, while your Mac is likely Apple Silicon. This ensures compatibility.)*

3.  **Push to Registry:**
    ```bash
    docker push yourusername/disk-catalog:latest
    ```

---

## Step 3: Configure Synology Container Manager

1.  Open **Container Manager** on your NAS.
2.  Go to **Registry** -> **Settings** -> **Add** (if using a private repo) or search for your image `yourusername/disk-catalog` directly if public. Download it.
3.  Go to **Image**, select the image, and click **Run**.

### General Settings
*   **Container Name:** `disk-catalog`
*   **Enable auto-restart**: Checked.

### Advanced Settings

#### capabilities
*   Enable `Execute High Privilege` (Often needed to read mounted disk volumes properly).

#### Network (CRITICAL)
*   Select **host** mode.
    *   *Why?* This allows the container to easily access the MariaDB running on the NAS on `localhost:3306` (or 3307) without complex bridging.
    *   *Port Warning:* The app listens on **3000**. Ensure port 3000 is not used by another NAS service.

#### Volume Settings (The Disks)
You need to map the actual NAS storage volumes so the scanner can see them.
*   Click **Add Folder**.
*   **Host Path:** `/volume1` (or whichever volume contains your data/USB drives).
*   **Container Path:** `/volume1`
*   *Tip:* You might want to map specific subfolders if you don't want to expose the whole volume. E.g., Host `/volume1/MyShare` -> Container `/volume1/MyShare`.
*   **Permissions:** Ensure the container has Read access (or Read/Write if you want the app to Rename/Delete/Move files).

#### Environment Variables
Add the following variables:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | The port the app listens on. |
| `DB_HOST` | `127.0.0.1` | Localhost (since we are in Host Network mode). |
| `DB_USER` | `root` | Your MariaDB user (or create a dedicated one). |
| `DB_PASSWORD`| `your_nas_db_password` | Your MariaDB password. |
| `DB_NAME` | `disk_catalog` | The DB name. |
| `DB_PORT` | `3306` | (Optional) Check your MariaDB settings (default 3306, Synology often 3307). |
| `DB_DIALECT` | `mysql` | |
| `JWT_SECRET` | `your_secure_secret` | Random string for login sessions. |
| `VITE_GOOGLE_CLIENT_ID` | `your_client_id...` | Needs to be in the container context too for good measure. |

---

### Method 1: Manual Setup (Classic Image Run)
1.  Open **Container Manager**.
2.  Go to **Image**, pull your image, and click **Run**.
3.  Manually configure Network (Host), Volumes, and Environment Variables as shown in the UI wizard.

### Method 2: Docker Compose Service (Recommended)
This is cleaner and easier to update.

1.  Open **Container Manager**.
2.  Go to **Project** -> **Create**.
3.  **Name:** `DiskKatalog`.
4.  **Path:** Select a folder on your NAS (e.g., `/docker/disk-catalog`) to store the config.
5.  **Source:** Select "Create docker-compose.yaml".
6.  Paste the contents of the `docker-compose.yaml` file we created.
    *   *Make sure to update the Image Name and Password!*
7.  Click **Next** and **Done**.

The application will start automatically. To update it later, you just stop the project, pull the new image, and start it again.

## Step 4: Access the App
Open `http://<YOUR_NAS_IP>:3000` in your browser.

### Troubleshooting
*   **Database Error?** Check the `DB_PORT`. Synology MariaDB 10 often defaults to **3307**. Update the `DB_PORT` variable accordingly.
*   **Scan Error?** If you can't see files, check the **Volume Mapping** and **Container Permissions** (High Privilege might be required).
*   **Login Error?** Ensure you added `http://<YOUR_NAS_IP>:3000` to the **Authorized Origins** in your Google Cloud Console.
