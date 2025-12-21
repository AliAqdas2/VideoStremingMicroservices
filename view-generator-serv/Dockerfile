FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Set build-time environment variable for the API URL
ARG CONTROLLER_SERVICE_URL=http://104.154.135.248:3005
ENV CONTROLLER_SERVICE_URL=$CONTROLLER_SERVICE_URL

# Build the React + Vite app
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies for Express server
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY server.js ./

# Set production environment
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
