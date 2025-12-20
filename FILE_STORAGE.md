# File Storage Location

## Current Implementation

Video files are stored on the **file system of the Controller Service**, not in the Storage Management Service.

### Storage Path Structure

```
<TEMP_UPLOAD_DIR>/
  └── <userId>/
      ├── <timestamp>-<random>-<extension>
      ├── <timestamp>-<random>-<extension>
      └── ...
```

### Storage Locations by Environment

#### 1. Local Development (Individual Services)

**Default Path**: `./temp_uploads/<userId>/<filename>`

- Set via `TEMP_UPLOAD_DIR` environment variable (default: `./temp_uploads`)
- Files are stored relative to the Controller Service working directory
- Example: `/Users/Ali/Project/controller-serv/temp_uploads/user123/video.mp4`

**To change**: Set environment variable:
```bash
export TEMP_UPLOAD_DIR="/path/to/your/storage"
```

#### 2. Docker Compose

**Path**: `/app/temp_uploads/<userId>/<filename>`

- Mounted as Docker volume: `temp_uploads`
- Volume persists between container restarts
- Volume location on host: Managed by Docker (usually in Docker's volume directory)

**Configuration**:
```yaml
# docker-compose.yml
controller-serv:
  environment:
    - TEMP_UPLOAD_DIR=/app/temp_uploads
  volumes:
    - temp_uploads:/app/temp_uploads
```

**To access files on host**:
```bash
# Find volume location
docker volume inspect project_temp_uploads

# Or mount to specific host path (modify docker-compose.yml):
volumes:
  - ./video_storage:/app/temp_uploads
```

#### 3. Kubernetes/GCP Deployment

**Path**: `/app/temp_uploads/<userId>/<filename>`

- **Current Issue**: Files are stored in ephemeral container storage
- **Problem**: Files are lost when pods restart or are rescheduled
- **Solution Needed**: Use PersistentVolume (see recommendations below)

**Current Configuration**:
```yaml
# controller-serv uses ephemeral storage
TEMP_UPLOAD_DIR=/app/temp_uploads
```

## Important Note

⚠️ **Design Issue**: The Storage Management Service has a `STORAGE_DIR` variable, but it's **not currently used** for actual file storage. It was intended for storage but the implementation stores files in the Controller Service instead.

The Storage Management Service only:
- Tracks file metadata in MongoDB
- Manages storage quotas (50MB per user)
- Validates storage availability
- **Does NOT store actual video files**

## File Flow

1. **Upload Request** → Controller Service receives file via multer
2. **Temporary Storage** → File stored in `TEMP_UPLOAD_DIR` with unique filename
3. **Validation** → Model Service validates storage quota and bandwidth
4. **Move to Permanent** → File moved to `TEMP_UPLOAD_DIR/<userId>/<filename>`
5. **Metadata Update** → Storage Management Service records metadata in MongoDB
6. **Usage Tracking** → Usage Monitoring Service records upload volume

## File Access

### Video Streaming

Files are served directly from the Controller Service:

```javascript
// controller-serv/server.js
GET /api/videos/stream/:userId/:filename
// Reads from: TEMP_UPLOAD_DIR/<userId>/<filename>
```

### File Deletion

When a video is deleted:
1. Controller Service deletes the physical file
2. Storage Management Service removes metadata from MongoDB
3. Storage quota is updated

## Recommendations for Production

### Option 1: Use PersistentVolume in Kubernetes (Recommended)

Update `kubernetes/controller-serv.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: video-storage-pvc
  namespace: videostream
spec:
  accessModes:
    - ReadWriteMany  # Allows multiple pods to access
  resources:
    requests:
      storage: 500Gi  # Adjust based on needs
---
# In controller-serv deployment:
spec:
  containers:
  - name: controller-serv
    volumeMounts:
    - name: video-storage
      mountPath: /app/temp_uploads
  volumes:
  - name: video-storage
    persistentVolumeClaim:
      claimName: video-storage-pvc
```

### Option 2: Use Google Cloud Storage (GCS) (Best for Scalability)

Store files in GCS bucket instead of local filesystem:

1. Install GCS library: `npm install @google-cloud/storage`
2. Upload files directly to GCS bucket
3. Store GCS URLs in metadata
4. Stream videos directly from GCS or use CDN

**Benefits**:
- Scalable (unlimited storage)
- Durable (no data loss)
- Accessible from all pods
- Cost-effective
- Can integrate with CDN

### Option 3: Use Network File System (NFS)

Mount NFS share that all Controller Service pods can access:

```yaml
volumes:
- name: nfs-volume
  nfs:
    server: nfs-server-ip
    path: /path/to/shared/storage
```

## Current Limitations

1. **No Persistence in Kubernetes**: Files are lost when pods restart
2. **Single Point of Failure**: All files stored in Controller Service containers
3. **Not Scalable**: Multiple Controller Service replicas can't share files easily
4. **Storage Management Service**: Has `STORAGE_DIR` but doesn't actually store files (confusing naming)

## Quick Fix for Local Development

If you want to persist files on your local machine when using Docker Compose:

Edit `docker-compose.yml`:

```yaml
controller-serv:
  volumes:
    # Change from named volume to bind mount
    - ./video_storage:/app/temp_uploads  # Creates ./video_storage on host
```

This will create a `video_storage` directory in your project root that persists files.

## Summary

- **Files are stored**: In Controller Service at `TEMP_UPLOAD_DIR/<userId>/<filename>`
- **Default local path**: `./temp_uploads/<userId>/<filename>`
- **Docker path**: `/app/temp_uploads/<userId>/<filename>` (in volume)
- **Kubernetes path**: `/app/temp_uploads/<userId>/<filename>` (ephemeral - **needs fix**)
- **Metadata stored**: In MongoDB via Storage Management Service
- **Storage quota managed**: By Storage Management Service (50MB per user)

