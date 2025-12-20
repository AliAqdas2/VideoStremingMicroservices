# Environment Variables Guide

This document explains all environment variables required to run the microservices application.

## Quick Summary

**For Docker Compose**: No `.env` file needed - variables are configured in `docker-compose.yml`

**For Individual Services**: Set variables per service as documented below

## Environment Variables by Service

### 1. User Account Management Service (Port 3001)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3001` | No |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/videostream_users` | Yes |
| `JWT_SECRET` | Secret key for JWT token signing/verification | `your-secret-key` | **Yes (change in production)** |
| `LOGGING_SERVICE_URL` | URL of logging service | `http://localhost:3006` | No |

**Example:**
```bash
export PORT=3001
export MONGODB_URI="mongodb://localhost:27017/videostream_users"
export JWT_SECRET="your-strong-random-secret-key-here"
export LOGGING_SERVICE_URL="http://localhost:3006"
```

---

### 2. Storage Management Service (Port 3002)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3002` | No |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/videostream_storage` | Yes |
| `STORAGE_DIR` | Directory path for storing uploaded files | `./uploads` | No |
| `LOGGING_SERVICE_URL` | URL of logging service | `http://localhost:3006` | No |

**Example:**
```bash
export PORT=3002
export MONGODB_URI="mongodb://localhost:27017/videostream_storage"
export STORAGE_DIR="./uploads"
export LOGGING_SERVICE_URL="http://localhost:3006"
```

---

### 3. Usage Monitoring Service (Port 3003)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3003` | No |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/videostream_usage` | Yes |
| `LOGGING_SERVICE_URL` | URL of logging service | `http://localhost:3006` | No |

**Example:**
```bash
export PORT=3003
export MONGODB_URI="mongodb://localhost:27017/videostream_usage"
export LOGGING_SERVICE_URL="http://localhost:3006"
```

---

### 4. Model Service (Port 3004)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3004` | No |
| `USER_SERVICE_URL` | URL of user account management service | `http://localhost:3001` | Yes |
| `STORAGE_SERVICE_URL` | URL of storage management service | `http://localhost:3002` | Yes |
| `USAGE_SERVICE_URL` | URL of usage monitoring service | `http://localhost:3003` | Yes |
| `LOGGING_SERVICE_URL` | URL of logging service | `http://localhost:3006` | No |

**Example:**
```bash
export PORT=3004
export USER_SERVICE_URL="http://localhost:3001"
export STORAGE_SERVICE_URL="http://localhost:3002"
export USAGE_SERVICE_URL="http://localhost:3003"
export LOGGING_SERVICE_URL="http://localhost:3006"
```

---

### 5. Controller Service (Port 3005)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3005` | No |
| `USER_SERVICE_URL` | URL of user account management service | `http://localhost:3001` | Yes |
| `MODEL_SERVICE_URL` | URL of model service | `http://localhost:3004` | Yes |
| `STORAGE_SERVICE_URL` | URL of storage management service | `http://localhost:3002` | Yes |
| `LOGGING_SERVICE_URL` | URL of logging service | `http://localhost:3006` | No |
| `TEMP_UPLOAD_DIR` | Directory for temporary file uploads | `./temp_uploads` | No |

**Example:**
```bash
export PORT=3005
export USER_SERVICE_URL="http://localhost:3001"
export MODEL_SERVICE_URL="http://localhost:3004"
export STORAGE_SERVICE_URL="http://localhost:3002"
export LOGGING_SERVICE_URL="http://localhost:3006"
export TEMP_UPLOAD_DIR="./temp_uploads"
```

---

### 6. Logging Service (Port 3006)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3006` | No |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/videostream_logs` | Yes |

**Example:**
```bash
export PORT=3006
export MONGODB_URI="mongodb://localhost:27017/videostream_logs"
```

---

### 7. View Generator Service (Port 3000)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Service port number | `3000` | No |
| `CONTROLLER_SERVICE_URL` | URL of controller service (used client-side) | `http://localhost:3005` | Yes |

**Note**: `CONTROLLER_SERVICE_URL` is used in the frontend JavaScript code. For production builds, you may need to inject this at build time or serve it via a configuration endpoint.

**Example:**
```bash
export PORT=3000
export CONTROLLER_SERVICE_URL="http://localhost:3005"
```

---

## Running with Docker Compose

When using `docker-compose.yml`, **no `.env` file is required**. All environment variables are already configured in the compose file with appropriate defaults for containerized deployment.

Service URLs use Docker service names:
- `http://user-acc-mgmt-serv:3001`
- `http://storage-mgmt-serv:3002`
- `http://mongodb:27017`
- etc.

To override docker-compose defaults, create a `.env` file or modify `docker-compose.yml`.

---

## Running Services Individually

When running services without Docker Compose:

1. **Start MongoDB** first (if not using Docker):
   ```bash
   mongod --dbpath ./data/db
   ```

2. **Set environment variables** for each service (see examples above)

3. **Start services** in this order:
   ```bash
   # Terminal 1: Logging Service
   cd logging-serv && npm start
   
   # Terminal 2: User Service
   cd user-acc-mgmt-serv && npm start
   
   # Terminal 3: Storage Service
   cd storage-mgmt-serv && npm start
   
   # Terminal 4: Usage Service
   cd usage-mntr-serv && npm start
   
   # Terminal 5: Model Service
   cd model-serv && npm start
   
   # Terminal 6: Controller Service
   cd controller-serv && npm start
   
   # Terminal 7: View Generator Service
   cd view-generator-serv && npm start
   ```

---

## Production / GCP Deployment

For Kubernetes/GKE deployment:

1. **Use Kubernetes Secrets** for sensitive data:
   ```yaml
   # kubernetes/secrets.yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: app-secrets
   type: Opaque
   stringData:
     jwt-secret: "your-production-secret-key"
   ```

2. **Update service URLs** in manifests:
   - Use Kubernetes service names: `http://user-acc-mgmt-serv:3001`
   - Internal communication uses ClusterIP services

3. **MongoDB URI**:
   - For cloud MongoDB: `mongodb://username:password@host:port/database`
   - For MongoDB Atlas: Use connection string from Atlas dashboard
   - For MongoDB in K8s: `mongodb://mongodb:27017/database`

---

## Security Best Practices

1. **JWT_SECRET**: 
   - Generate a strong random key: `openssl rand -base64 32`
   - Never commit to version control
   - Use different keys for different environments
   - Store in Kubernetes secrets or environment management service

2. **MongoDB Credentials**:
   - Use authentication in production
   - Format: `mongodb://username:password@host:port/database`
   - Store credentials in secrets

3. **Service URLs**:
   - Use internal service names in containerized environments
   - Use HTTPS in production
   - Configure CORS appropriately

---

## Quick Setup Script

Create a `.env` file in the project root for local development:

```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env
```

Then source it before running services:
```bash
source .env
```

---

## Troubleshooting

**Service can't connect to MongoDB:**
- Check `MONGODB_URI` is correct
- Verify MongoDB is running
- Check network/firewall settings

**Services can't find each other:**
- Verify service URLs are correct
- Check services are running on expected ports
- For Docker: Use service names, not localhost
- For local: Use localhost or 127.0.0.1

**Authentication fails:**
- Ensure `JWT_SECRET` is the same across all services that validate tokens
- Check token expiration settings

**File uploads fail:**
- Verify `STORAGE_DIR` and `TEMP_UPLOAD_DIR` exist and are writable
- Check disk space
- Verify file size limits

