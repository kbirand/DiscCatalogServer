# DiskCatalog - Production Run Guide

This guide explains how to build and run the DiskCatalog application in a production environment.

## 1. Prerequisites
- **Node.js** (v18 or higher)
- **MySQL** Database running and accessible
- **Google Cloud Console** Project (for OAuth)

## 2. Environment Setup
Ensure your `.env` file in the `server/` directory is configured:

```ini
PORT=5001
DB_NAME=disk_catalog
DB_USER=root
DB_PASS=your_password
DB_HOST=localhost
JWT_SECRET=your_super_secret_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

## 3. Installation & Build

### Install Dependencies
Run this in both `client` and `server` directories if you haven't yet:
```bash
cd client && npm install
cd ../server && npm install
```

### Build Frontend
Compile the React application into static files:
```bash
cd client
npm run build
```
*This creates a `dist` folder in `client/` which the server will serve.*

## 4. Running the Application

### Manual Run
To start the application (Server + Frontend):
```bash
cd server
node index.js
```
The app will be available at: `http://localhost:3000`

### Running with PM2 (Recommended for 24/7)
If you want the app to run in the background and restart automatically:

1. Install PM2:
   ```bash
   npm install -g pm2
   ```

2. Start the App:
   ```bash
   cd server
   pm2 start index.js --name "disk-catalog"
   ```

3. View Logs:
   ```bash
   pm2 logs disk-catalog
   ```

4. Stop App:
   ```bash
   pm2 stop disk-catalog
   ```

## 5. Troubleshooting
- **White Screen?** Ensure `npm run build` completed successfully and `client/dist` exists.
- **Login Error?** Check if `VITE_GOOGLE_CLIENT_ID` is correct in `.env`.
- **Database Error?** Ensure MySQL is running and credentials in `.env` are correct.
