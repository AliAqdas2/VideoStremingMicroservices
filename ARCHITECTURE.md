# Architecture Documentation

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                           │
│                    (HTML, CSS, JavaScript)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              View Generator Service (Frontend)                  │
│                      Port: 3000                                  │
│              - Serves static HTML/CSS/JS                         │
│              - User interface for video streaming                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ API Calls
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Controller Service (API Gateway)                │
│                      Port: 3005                                  │
│              - Request routing & orchestration                   │
│              - Authentication middleware                         │
│              - File upload handling                               │
│              - Video streaming                                   │
└──────┬───────────────┬───────────────┬──────────────────────────┘
       │               │               │
       │               │               │
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Model Service│ │ User Service │ │ Storage Serv │
│  Port: 3004  │ │  Port: 3001  │ │  Port: 3002  │
│              │ │              │ │              │
│ Business     │ │ Auth & User  │ │ Storage      │
│ Logic        │ │ Management   │ │ Quota Mgmt   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       │                │                │
       └────────┬───────┴────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐ ┌──────────────┐
│ Usage Monitor│ │ Logging Serv │
│  Port: 3003  │ │  Port: 3006  │
│              │ │              │
│ Bandwidth    │ │ Centralized  │
│ Tracking     │ │ Logging      │
└──────────────┘ └──────────────┘
```

## Microservices Details

### 1. User Account Management Service (UserAccMgmtServ)
- **Port**: 3001
- **Database**: MongoDB (videostream_users)
- **Responsibilities**:
  - User registration and authentication
  - JWT token generation and validation
  - User profile management
  - Multi-tenant support
- **APIs**:
  - `POST /api/users/register` - Register new user
  - `POST /api/users/login` - User login
  - `GET /api/users/:userId` - Get user details
  - `GET /api/users/me` - Get current user (authenticated)

### 2. Storage Management Service (StorageMgmtServ)
- **Port**: 3002
- **Database**: MongoDB (videostream_storage)
- **Storage**: File system (50MB per user)
- **Responsibilities**:
  - Storage quota management (50MB per user)
  - File metadata tracking
  - Storage usage alerts (80% threshold)
  - Upload restrictions at 100% capacity
- **APIs**:
  - `POST /api/storage/initialize` - Initialize user storage
  - `GET /api/storage/:userId` - Get storage info
  - `GET /api/storage/:userId/can-upload` - Check upload permission
  - `POST /api/storage/:userId/add-file` - Add file metadata
  - `DELETE /api/storage/:userId/files/:filename` - Remove file metadata
  - `POST /api/storage/:userId/bulk-delete` - Bulk delete files

### 3. Usage Monitoring Service (UsageMntrServ)
- **Port**: 3003
- **Database**: MongoDB (videostream_usage)
- **Responsibilities**:
  - Daily bandwidth tracking (100MB/day limit)
  - Upload/delete volume logging
  - Automatic blocking when limit exceeded
  - Usage statistics and history
- **APIs**:
  - `GET /api/usage/:userId/can-upload` - Check bandwidth availability
  - `POST /api/usage/:userId/upload` - Record upload
  - `POST /api/usage/:userId/delete` - Record deletion
  - `GET /api/usage/:userId` - Get usage stats
  - `GET /api/usage/:userId/history` - Get usage history

### 4. Model Service (ModelServ)
- **Port**: 3004
- **Database**: None (stateless)
- **Responsibilities**:
  - Business logic orchestration
  - Upload validation (storage + bandwidth)
  - Video processing coordination
  - Dashboard data aggregation
- **APIs**:
  - `POST /api/videos/validate-upload` - Validate upload request
  - `POST /api/videos/process-upload` - Process video upload
  - `POST /api/videos/process-delete` - Process video deletion
  - `GET /api/dashboard/:userId` - Get dashboard data

### 5. Controller Service (ControllerServ)
- **Port**: 3005
- **Database**: None (stateless)
- **Responsibilities**:
  - API Gateway functionality
  - Request routing and orchestration
  - Authentication middleware
  - File upload handling
  - Video streaming
- **APIs**:
  - `POST /api/auth/register` - User registration
  - `POST /api/auth/login` - User login
  - `POST /api/videos/upload` - Upload video
  - `GET /api/videos` - List user videos
  - `GET /api/videos/stream/:userId/:filename` - Stream video
  - `DELETE /api/videos/:filename` - Delete video
  - `POST /api/videos/bulk-delete` - Bulk delete videos
  - `GET /api/dashboard` - Get dashboard

### 6. Logging Service (LoggingServ)
- **Port**: 3006
- **Database**: MongoDB (videostream_logs)
- **Responsibilities**:
  - Centralized logging
  - Log storage and retrieval
  - Log filtering and querying
  - Log statistics
- **APIs**:
  - `POST /api/logs` - Create log entry
  - `GET /api/logs` - Get logs with filters
  - `GET /api/logs/service/:service` - Get logs by service
  - `GET /api/logs/user/:userId` - Get logs by user
  - `GET /api/logs/errors` - Get error logs
  - `GET /api/logs/stats` - Get log statistics

### 7. View Generator Service (ViewGeneratorServ)
- **Port**: 3000
- **Database**: None
- **Responsibilities**:
  - Serve frontend static files
  - User interface rendering
  - Client-side API interactions
- **Endpoints**:
  - `GET /` - Main application page
  - `GET /health` - Health check

## Data Flow

### User Registration Flow
```
Client → ViewGenerator → Controller → UserService → MongoDB
                                      ↓
                                   LoggingService
```

### Video Upload Flow
```
Client → ViewGenerator → Controller → ModelService
                                      ├→ StorageService (validate quota)
                                      ├→ UsageService (validate bandwidth)
                                      └→ Process upload
                                      ├→ StorageService (update metadata)
                                      └→ UsageService (record usage)
                                      ↓
                                   LoggingService
```

### Video Playback Flow
```
Client → ViewGenerator → Controller → Stream video file
```

## Database Schema

### Users Collection (UserAccMgmtServ)
```javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String (hashed),
  role: String ('user' | 'admin'),
  tenantId: String,
  createdAt: Date
}
```

### Storage Collection (StorageMgmtServ)
```javascript
{
  _id: ObjectId,
  userId: String,
  usedStorage: Number (bytes),
  maxStorage: Number (50MB),
  files: [{
    filename: String,
    originalName: String,
    size: Number,
    uploadedAt: Date,
    filePath: String
  }],
  alertSent: Boolean
}
```

### Usage Collection (UsageMntrServ)
```javascript
{
  _id: ObjectId,
  userId: String,
  date: String (YYYY-MM-DD),
  uploadVolume: Number (bytes),
  deleteVolume: Number (bytes),
  totalVolume: Number (bytes),
  maxDailyBandwidth: Number (100MB),
  alertSent: Boolean,
  blocked: Boolean
}
```

### Logs Collection (LoggingServ)
```javascript
{
  _id: ObjectId,
  level: String ('info' | 'warn' | 'error' | 'debug'),
  service: String,
  message: String,
  userId: String (optional),
  timestamp: Date,
  metadata: Object (optional)
}
```

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB 7
- **File Storage**: Google Cloud Storage (GCS)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs

### Frontend
- **HTML5**: Structure
- **CSS3**: Styling with modern design
- **JavaScript**: ES6+ with jQuery
- **Video Player**: HTML5 video element

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes (GKE)
- **Cloud Platform**: Google Cloud Platform
- **Load Balancing**: Kubernetes Service (LoadBalancer)

## Deployment Architecture

### Kubernetes Deployment
- **Namespace**: videostream
- **Services**: ClusterIP (internal), LoadBalancer (frontend)
- **Replicas**: 
  - Controller: 3
  - Model: 2
  - User: 2
  - Storage: 2
  - Usage: 2
  - View Generator: 2
  - Logging: 1
  - MongoDB: 1

### Storage
- **MongoDB**: PersistentVolumeClaim (10GB)
- **Video Files**: PersistentVolumeClaim (100GB, ReadWriteMany)
- **Temporary Uploads**: Ephemeral storage

### Networking
- **Internal Communication**: ClusterIP services
- **External Access**: LoadBalancer for ViewGeneratorServ
- **Service Discovery**: Kubernetes DNS

## Security Features

1. **Authentication**: JWT-based token authentication
2. **Password Security**: bcrypt hashing with salt rounds
3. **Authorization**: Role-based access control
4. **Input Validation**: Request validation on all endpoints
5. **CORS**: Configured for cross-origin requests
6. **Secrets Management**: Kubernetes secrets for sensitive data

## Scalability Features

1. **Horizontal Scaling**: Multiple replicas per service
2. **Stateless Services**: Most services are stateless
3. **Load Balancing**: Kubernetes service load balancing
4. **Database Indexing**: Optimized MongoDB indexes
5. **Caching Ready**: Architecture supports caching layer

## Monitoring & Logging

1. **Centralized Logging**: All services log to LoggingServ
2. **Health Checks**: `/health` endpoint on all services
3. **Log Levels**: info, warn, error, debug
4. **Log Queries**: Filter by service, user, level, date range
5. **Statistics**: Log aggregation and statistics

## Design Decisions

1. **Microservices Architecture**: Separation of concerns, independent scaling
2. **API Gateway Pattern**: Controller service as single entry point
3. **Stateless Services**: Better scalability and reliability
4. **MongoDB**: Flexible schema for different data types
5. **JWT Authentication**: Stateless, scalable authentication
6. **File Storage**: Google Cloud Storage (GCS) for scalable video storage
7. **Quota Management**: Separate services for storage and bandwidth
8. **Video Streaming**: Direct streaming from GCS with public URLs or signed URLs
8. **Centralized Logging**: Easier debugging and monitoring

