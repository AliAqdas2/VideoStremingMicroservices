# Google Cloud Storage (GCS) Setup Guide

This guide explains how to set up Google Cloud Storage for video file storage in the application.

## Overview

The application uses Google Cloud Storage (GCS) to store video files instead of local file system storage. This provides:
- Scalable storage (no size limits)
- High availability
- Better performance for streaming
- Cost-effective storage
- Easy integration with CDN

## Prerequisites

1. Google Cloud Platform account with billing enabled
2. GCP project created
3. gcloud CLI installed and configured

## Step 1: Create GCS Bucket

```bash
# Set your project ID
export PROJECT_ID=your-project-id
export BUCKET_NAME=videostream-videos

# Set project
gcloud config set project $PROJECT_ID

# Create bucket
gsutil mb -p $PROJECT_ID -c STANDARD -l us-central1 gs://$BUCKET_NAME

# Make bucket publicly readable (for video streaming)
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# Or for private access with signed URLs (more secure):
# Keep bucket private and use signed URLs in the application
```

### Bucket Configuration Options

**Public Access (Recommended for video streaming):**
- Videos are publicly accessible via direct URLs
- Faster streaming (no URL signing needed)
- Use CORS configuration for browser access

**Private Access with Signed URLs:**
- More secure
- URLs expire after set time
- Requires URL signing on each request

## Step 2: Create Service Account

```bash
# Create service account
gcloud iam service-accounts create videostream-storage \
    --display-name="Video Streaming Storage Service Account"

# Grant storage admin role
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:videostream-storage@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Create and download key
gcloud iam service-accounts keys create key.json \
    --iam-account=videostream-storage@${PROJECT_ID}.iam.gserviceaccount.com
```

## Step 3: Configure CORS (For Browser Video Playback)

Create a CORS configuration file `cors.json`:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Range", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS configuration:
```bash
gsutil cors set cors.json gs://$BUCKET_NAME
```

## Step 4: Local Development Setup

### Option 1: Using Service Account Key File

1. Download the service account key JSON file (created in Step 2)
2. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   export GCS_BUCKET_NAME=videostream-videos
   export GCS_PROJECT_ID=your-project-id
   ```
3. Run the application:
   ```bash
   cd controller-serv
   npm install
   npm start
   ```

### Option 2: Using gcloud CLI Authentication

```bash
# Authenticate
gcloud auth application-default login

# Set environment variables
export GCS_BUCKET_NAME=videostream-videos
export GCS_PROJECT_ID=your-project-id

# Run application
cd controller-serv
npm install
npm start
```

## Step 5: Docker Compose Setup

Update `docker-compose.yml`:

```yaml
controller-serv:
  environment:
    - GCS_BUCKET_NAME=videostream-videos
    - GCS_PROJECT_ID=your-project-id
    - GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json
  volumes:
    - ./key.json:/var/secrets/google/key.json:ro
```

Or use environment variables from `.env` file.

## Step 6: Kubernetes/GKE Setup

### Create ConfigMap

```bash
kubectl create configmap app-config \
  --from-literal=gcs-bucket-name=videostream-videos \
  --from-literal=gcp-project-id=your-project-id \
  --namespace=videostream
```

### Create Secret from Service Account Key

```bash
kubectl create secret generic gcp-storage-key \
  --from-file=key.json=./key.json \
  --namespace=videostream
```

### Update Deployment

The `kubernetes/controller-serv.yaml` already includes GCS configuration. Just apply:

```bash
kubectl apply -f kubernetes/gcs-config.yaml
kubectl apply -f kubernetes/controller-serv.yaml
```

### Using Workload Identity (Recommended for GKE)

For better security, use Workload Identity instead of service account keys:

1. Enable Workload Identity on your GKE cluster
2. Create Kubernetes service account:
   ```bash
   kubectl create serviceaccount gcs-sa --namespace=videostream
   ```
3. Bind to GCP service account:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     videostream-storage@${PROJECT_ID}.iam.gserviceaccount.com \
     --role roles/iam.workloadIdentityUser \
     --member "serviceAccount:${PROJECT_ID}.svc.id.goog[videostream/gcs-sa]"
   
   kubectl annotate serviceaccount gcs-sa \
     --namespace=videostream \
     iam.gke.io/gcp-service-account=videostream-storage@${PROJECT_ID}.iam.gserviceaccount.com
   ```
4. Update deployment to use the service account:
   ```yaml
   spec:
     serviceAccountName: gcs-sa
   ```

## Step 7: Environment Variables

Required environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `GCS_BUCKET_NAME` | GCS bucket name | `videostream-videos` |
| `GCS_PROJECT_ID` | GCP project ID | `my-project-123` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key (for local/dev) | `/path/to/key.json` |

**Note**: In GKE with Workload Identity, `GOOGLE_APPLICATION_CREDENTIALS` is not needed.

## Step 8: Verify Setup

1. Check bucket exists:
   ```bash
   gsutil ls gs://videostream-videos
   ```

2. Test upload (via application):
   - Start the application
   - Upload a video through the UI
   - Check bucket:
     ```bash
     gsutil ls -r gs://videostream-videos/
     ```

3. Check health endpoint:
   ```bash
   curl http://localhost:3005/health
   # Should show: {"status":"healthy","service":"ControllerServ","gcsEnabled":true,"bucket":"videostream-videos"}
   ```

## File Structure in GCS

Files are stored with the following structure:
```
gs://videostream-videos/
  └── <userId>/
      ├── <timestamp>-<random>.mp4
      ├── <timestamp>-<random>.mp4
      └── ...
```

Example:
```
gs://videostream-videos/
  └── 507f1f77bcf86cd799439011/
      ├── 1699123456789-1234567890.mp4
      └── 1699123500000-9876543210.mp4
```

## Security Considerations

1. **Public vs Private Bucket**:
   - Public: Easier setup, videos directly accessible
   - Private: More secure, requires signed URLs

2. **IAM Roles**:
   - Use least privilege principle
   - `storage.admin` is used here, but `storage.objectAdmin` is sufficient

3. **CORS Configuration**:
   - Restrict origins to your domain in production
   - Only allow necessary HTTP methods

4. **Service Account Keys**:
   - Keep keys secure
   - Rotate keys regularly
   - Use Workload Identity in GKE when possible

## Troubleshooting

### Error: "Bucket doesn't exist"
- Verify bucket name is correct
- Check bucket exists: `gsutil ls gs://your-bucket-name`
- Verify project ID is correct

### Error: "Permission denied"
- Check service account has correct IAM roles
- Verify service account key is valid
- For GKE, check Workload Identity binding

### Videos not streaming in browser
- Check CORS configuration
- Verify bucket is publicly readable (if using public URLs)
- Check browser console for CORS errors

### Upload fails silently
- Check application logs
- Verify file size doesn't exceed 50MB limit
- Check storage quota limits

## Cost Estimation

GCS storage pricing (as of 2024):
- Standard storage: ~$0.020 per GB/month
- Network egress: First 1GB free, then ~$0.12 per GB

Example for 1000 users with 50MB each:
- Storage: 50GB × $0.020 = $1/month
- Data transfer: Depends on views

Use GCS lifecycle policies to move old videos to cheaper storage classes.

## Migration from Local Storage

If you have existing videos in local storage:

1. Install gsutil if not already installed
2. Upload existing files:
   ```bash
   gsutil -m cp -r ./temp_uploads/* gs://videostream-videos/
   ```
3. Update metadata in MongoDB to include GCS paths
4. Test streaming before removing local files

