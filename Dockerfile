# Build Stage for Client
# Using node:18-bullseye based on your example preference for stability
FROM node:18-bullseye

WORKDIR /app

# Copy dependency definitions
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies (doing this first caches these layers)
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build the frontend
# Pass build-time variables
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# This creates /app/client/dist
RUN cd client && npm run build

# Remove client source to save space, but keep 'dist'
# We also need to keep package.json for some tools if needed, but mostly cleanup
# (Optional optimization: prune dev dependencies)
RUN cd client && rm -rf src node_modules

# Expose the application port
EXPOSE 3001

# Set the working directory to server for the runtime
WORKDIR /app/server

# Start the server
CMD ["node", "index.js"]
