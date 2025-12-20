# Short Video Streaming Platform - Microservices Architecture

A cloud-centric microservices-based application for short video streaming, deployed on Google Cloud Platform (GCP) using Google Kubernetes Engine (GKE) and Docker.

## Project Overview

This project implements a multi-tenant, role-based video streaming platform with the following microservices:

1. **User Account Management Service** (UserAccMgmtServ) - Port 3001
2. **Storage Management Service** (StorageMgmtServ) - Port 3002
3. **Usage Monitoring Service** (UsageMntrServ) - Port 3003
4. **Model Service** (ModelServ) - Port 3004
5. **Controller Service** (ControllerServ) - Port 3005
6. **Logging Service** (LoggingServ) - Port 3006
7. **View Generator Service** (ViewGeneratorServ) - Port 3000

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    View Generator Service                    │
│                    (Frontend - Port 3000)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Controller Service                       │
│                    (Port 3005)                              │
└───────┬───────────────┬───────────────┬─────────────────────┘
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Model Service│ │ User Service │ │ Storage Serv │
│  (Port 3004) │ │  (Port 3001) │ │  (Port 3002) │
└──────┬───────┘ └──────────────┘ └──────┬───────┘
       │                                 │
       └──────────────┬──────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌──────────────┐          ┌──────────────┐
│ Usage Monitor│          │ Logging Serv  │
│  (Port 3003) │          │  (Port 3006)  │
└──────────────┘          └──────────────┘
```

## Features

### User Account Management
- User registration and authentication
- JWT-based token authentication
- Multi-tenant support
- Role-based access control

### Storage Management
- 50MB storage quota per user
- Automatic alerts at 80% usage
- Upload restrictions at 100% capacity
- File upload, delete, and bulk delete operations

### Usage Monitoring
- Daily bandwidth tracking (100MB/day limit)
- Upload/delete volume logging
- Automatic blocking when limit exceeded
- Usage statistics and history

### Video Management
- Upload short videos
- Browse user videos
- Delete individual videos
- Bulk delete functionality
- Video playback with HTML5 video player

### Logging
- Centralized logging service
- Log levels (info, warn, error, debug)
- Service-specific and user-specific log queries
- Log statistics and analytics

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **File Storage**: Google Cloud Storage (GCS)
- **Authentication**: JWT (JSON Web Tokens)
- **Frontend**: HTML, CSS, JavaScript, jQuery
- **Containerization**: Docker
- **Orchestration**: Kubernetes (GKE)
- **Cloud Platform**: Google Cloud Platform

## Local Development Setup

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- MongoDB (or use Docker)
- Google Cloud Platform account (for GCS storage)
- GCS bucket created (see `GCS_SETUP.md` for details)

### Running with Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd Project
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the application:
- Frontend: http://localhost:3000
- API Gateway (Controller): http://localhost:3005

### Running Services Individually

1. Install dependencies for each service:
```bash
cd user-acc-mgmt-serv
npm install
npm start
```

2. Repeat for each service directory.

3. Ensure MongoDB is running on `localhost:27017`

## GCP Deployment

### Prerequisites
- Google Cloud SDK installed
- GCP project with billing enabled
- GKE cluster created
- GCS bucket created (see `GCS_SETUP.md`)
- Service account with GCS permissions

### Steps

1. **Build and push Docker images to GCR:**
```bash
# Set your GCP project ID
export PROJECT_ID=your-project-id
export GCR_REGISTRY=gcr.io/$PROJECT_ID

# Build and push each service
cd user-acc-mgmt-serv
docker build -t $GCR_REGISTRY/user-acc-mgmt-serv:latest .
docker push $GCR_REGISTRY/user-acc-mgmt-serv:latest

# Repeat for all services...
```

2. **Update Kubernetes manifests:**
   - Edit `kubernetes/*.yaml` files
   - Replace `YOUR_PROJECT_ID` with your actual GCP project ID

3. **Create namespace:**
```bash
kubectl apply -f kubernetes/namespace.yaml
```

4. **Create secrets:**
```bash
kubectl apply -f kubernetes/secrets.yaml
```

5. **Deploy services:**
```bash
kubectl apply -f kubernetes/mongodb.yaml
kubectl apply -f kubernetes/user-acc-mgmt-serv.yaml
kubectl apply -f kubernetes/storage-mgmt-serv.yaml
kubectl apply -f kubernetes/usage-mntr-serv.yaml
kubectl apply -f kubernetes/logging-serv.yaml
kubectl apply -f kubernetes/model-serv.yaml
kubectl apply -f kubernetes/controller-serv.yaml
kubectl apply -f kubernetes/view-generator-serv.yaml
```

6. **Configure GCS:**
```bash
# Update gcs-config.yaml with your bucket name and project ID
kubectl apply -f kubernetes/gcs-config.yaml

# Create secret with GCS service account key
kubectl create secret generic gcp-storage-key \
  --from-file=key.json=./key.json \
  --namespace=videostream
```

7. **Get external IP:**
```bash
kubectl get svc view-generator-serv -n videostream
```

**Note**: For detailed GCS setup instructions, see `GCS_SETUP.md`

## API Documentation

### Authentication Endpoints

#### Register User
```
POST /api/auth/register
Body: {
  "username": "string",
  "email": "string",
  "password": "string"
}
```

#### Login
```
POST /api/auth/login
Body: {
  "email": "string",
  "password": "string"
}
Response: {
  "token": "jwt-token",
  "user": { ... }
}
```

### Video Endpoints

#### Upload Video
```
POST /api/videos/upload
Headers: Authorization: Bearer <token>
Body: FormData with 'video' file
```

#### List Videos
```
GET /api/videos
Headers: Authorization: Bearer <token>
```

#### Delete Video
```
DELETE /api/videos/:filename
Headers: Authorization: Bearer <token>
```

#### Bulk Delete
```
POST /api/videos/bulk-delete
Headers: Authorization: Bearer <token>
Body: {
  "filenames": ["file1", "file2"]
}
```

### Dashboard
```
GET /api/dashboard
Headers: Authorization: Bearer <token>
Response: {
  "user": { ... },
  "storage": { ... },
  "usage": { ... }
}
```

## Load Testing

See `load-testing/README.md` for detailed instructions on running load tests with Locust.

Quick start:
```bash
cd load-testing
pip install -r requirements.txt
locust -f locustfile.py --host=http://localhost:3005
```

## Environment Variables

### User Account Management Service
- `PORT`: Service port (default: 3001)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `LOGGING_SERVICE_URL`: Logging service URL

### Storage Management Service
- `PORT`: Service port (default: 3002)
- `MONGODB_URI`: MongoDB connection string
- `STORAGE_DIR`: Directory for file storage
- `LOGGING_SERVICE_URL`: Logging service URL

### Usage Monitoring Service
- `PORT`: Service port (default: 3003)
- `MONGODB_URI`: MongoDB connection string
- `LOGGING_SERVICE_URL`: Logging service URL

### Model Service
- `PORT`: Service port (default: 3004)
- `USER_SERVICE_URL`: User service URL
- `STORAGE_SERVICE_URL`: Storage service URL
- `USAGE_SERVICE_URL`: Usage service URL
- `LOGGING_SERVICE_URL`: Logging service URL

### Controller Service
- `PORT`: Service port (default: 3005)
- `USER_SERVICE_URL`: User service URL
- `MODEL_SERVICE_URL`: Model service URL
- `STORAGE_SERVICE_URL`: Storage service URL
- `LOGGING_SERVICE_URL`: Logging service URL
- `GCS_BUCKET_NAME`: Google Cloud Storage bucket name (default: videostream-videos)
- `GCS_PROJECT_ID`: GCP project ID
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to GCS service account key (for local/dev)

### Logging Service
- `PORT`: Service port (default: 3006)
- `MONGODB_URI`: MongoDB connection string

### View Generator Service
- `PORT`: Service port (default: 3000)
- `CONTROLLER_SERVICE_URL`: Controller service URL

## Project Structure

```
Project/
├── user-acc-mgmt-serv/     # User authentication & management
├── storage-mgmt-serv/       # Storage quota management
├── usage-mntr-serv/         # Bandwidth monitoring
├── model-serv/              # Business logic
├── controller-serv/         # API gateway & orchestration
├── logging-serv/            # Centralized logging
├── view-generator-serv/     # Frontend UI
├── load-testing/            # Load testing scripts
├── kubernetes/              # K8s deployment manifests
├── docker-compose.yml       # Local development setup
└── README.md                # This file
```

## Testing

### Health Checks
All services expose a `/health` endpoint:
```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
# ... etc
```

## Monitoring

- All services log to the centralized logging service
- View logs: `GET /api/logs` on logging service
- Filter by service, user, level, or date range

## Security Considerations

- JWT tokens for authentication
- Password hashing with bcrypt
- Input validation on all endpoints
- CORS configuration
- Environment variables for sensitive data

## Future Enhancements

- Video transcoding
- CDN integration for video delivery
- Real-time notifications
- Advanced analytics dashboard
- Multi-region deployment
- Auto-scaling based on load

## Contributors

- [Your Team Members]

## License

[Specify License]

## Contact

For questions or issues, please contact [your-email@example.com]

