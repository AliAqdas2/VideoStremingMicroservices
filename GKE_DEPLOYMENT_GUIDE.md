# Complete GKE Deployment Guide for Video Streaming Platform

## 📋 Overview

This guide will walk you through deploying your **Video Streaming Microservices Application** to **Google Kubernetes Engine (GKE)** step by step.

### Architecture Summary

- **7 Microservices**: UserAccMgmtServ, StorageMgmtServ, UsageMntrServ, ModelServ, ControllerServ, LoggingServ, ViewGeneratorServ
- **Database**: MongoDB
- **Storage**: Google Cloud Storage (GCS)
- **Orchestration**: Kubernetes on GKE
- **Container Registry**: Google Container Registry (GCR)

---

## 🔧 Prerequisites

### 1. Install Required Tools

**On Windows**, open PowerShell as Administrator:

```powershell
# Install Google Cloud SDK
# Download from: https://cloud.google.com/sdk/docs/install-sdk#windows
# Or use winget:
winget install Google.CloudSDK

# Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop

# After installing gcloud, install kubectl:
gcloud components install kubectl
```

### 2. Create GCP Account & Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., `videostream-project`)
3. Enable billing for the project
4. Note your **Project ID** (you'll need this throughout)

---

## 🚀 Step-by-Step Deployment

### Step 1: Authenticate with GCP

Open PowerShell in your project directory:

```powershell
# Navigate to your project
cd "C:\Users\LENOVO\Desktop\projects-only\projects-only\VideoStremingMicroservices"

# Login to Google Cloud
gcloud auth login

# Set your project
$PROJECT_ID = "YOUR_PROJECT_ID"  # Replace with your actual Project ID
gcloud config set project $PROJECT_ID

# Verify
gcloud config get-value project
```

### Step 2: Enable Required GCP APIs

```powershell
# Enable Container Registry
gcloud services enable containerregistry.googleapis.com

# Enable Kubernetes Engine
gcloud services enable container.googleapis.com

# Enable Cloud Storage
gcloud services enable storage.googleapis.com

# Enable IAM API
gcloud services enable iam.googleapis.com
```

### Step 3: Create GCS Bucket for Video Storage

```powershell
# Create a bucket (name must be globally unique)
$BUCKET_NAME = "$PROJECT_ID-videostream-videos"
gsutil mb -l us-central1 gs://$BUCKET_NAME

# Set CORS policy for web access
@"
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
"@ | Out-File -Encoding UTF8 cors.json

gsutil cors set cors.json gs://$BUCKET_NAME
Remove-Item cors.json
```

### Step 4: Create Service Account for GCS

```powershell
# Create service account
gcloud iam service-accounts create videostream-gcs-sa `
    --display-name="Video Stream GCS Service Account"

# Grant Storage Admin permissions
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:videostream-gcs-sa@$PROJECT_ID.iam.gserviceaccount.com" `
    --role="roles/storage.admin"

# Create and download key file
gcloud iam service-accounts keys create gcs-service-account-key.json `
    --iam-account=videostream-gcs-sa@$PROJECT_ID.iam.gserviceaccount.com

# Verify the key was created
Get-Content gcs-service-account-key.json
```

### Step 5: Create GKE Cluster

```powershell
# Create the cluster (this takes 5-10 minutes)
gcloud container clusters create videostream-cluster `
    --num-nodes=3 `
    --machine-type=e2-medium `
    --zone=us-central1-a `
    --project=$PROJECT_ID

# Get credentials for kubectl
gcloud container clusters get-credentials videostream-cluster `
    --zone=us-central1-a `
    --project=$PROJECT_ID

# Verify connection
kubectl cluster-info
kubectl get nodes
```

### Step 6: Build and Push Docker Images

```powershell
# Configure Docker to use GCR
gcloud auth configure-docker

# Set registry URL
$GCR_REGISTRY = "gcr.io/$PROJECT_ID"

# Build and push all services
$services = @(
    "user-acc-mgmt-serv",
    "storage-mgmt-serv",
    "usage-mntr-serv",
    "model-serv",
    "controller-serv",
    "logging-serv",
    "view-generator-serv"
)

foreach ($service in $services) {
    Write-Host "Building $service..." -ForegroundColor Green
    docker build -t "$GCR_REGISTRY/${service}:latest" "./$service"

    Write-Host "Pushing $service..." -ForegroundColor Green
    docker push "$GCR_REGISTRY/${service}:latest"

    Write-Host "✓ $service complete" -ForegroundColor Cyan
}
```

### Step 7: Update Kubernetes Configuration Files

You need to replace `YOUR_PROJECT_ID` in all Kubernetes YAML files:

```powershell
# Update all YAML files with your Project ID
$files = Get-ChildItem -Path "kubernetes" -Filter "*.yaml"
foreach ($file in $files) {
    (Get-Content $file.FullName) -replace 'YOUR_PROJECT_ID', $PROJECT_ID | Set-Content $file.FullName
    Write-Host "Updated $($file.Name)" -ForegroundColor Green
}
```

### Step 8: Create Kubernetes Secrets

```powershell
# Create namespace first
kubectl apply -f kubernetes/namespace.yaml

# Create GCS secret from service account key
kubectl create secret generic gcp-storage-key `
    --from-file=key.json=gcs-service-account-key.json `
    --namespace=videostream

# Create JWT secret (generate a strong random key)
$JWT_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
kubectl create secret generic app-secrets `
    --from-literal=jwt-secret=$JWT_SECRET `
    --namespace=videostream

# Update ConfigMap with your bucket name
(Get-Content kubernetes/gcs-config.yaml) `
    -replace 'YOUR_PROJECT_ID', $PROJECT_ID `
    -replace 'videostream-videos', $BUCKET_NAME | Set-Content kubernetes/gcs-config.yaml

kubectl apply -f kubernetes/gcs-config.yaml
```

### Step 9: Deploy to Kubernetes

```powershell
# Deploy MongoDB
kubectl apply -f kubernetes/mongodb.yaml
Write-Host "Waiting for MongoDB to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=ready pod -l app=mongodb -n videostream --timeout=300s

# Deploy Logging Service first (dependency)
kubectl apply -f kubernetes/logging-serv.yaml
Start-Sleep -Seconds 10

# Deploy other services
kubectl apply -f kubernetes/user-acc-mgmt-serv.yaml
kubectl apply -f kubernetes/storage-mgmt-serv.yaml
kubectl apply -f kubernetes/usage-mntr-serv.yaml
kubectl apply -f kubernetes/model-serv.yaml
kubectl apply -f kubernetes/controller-serv.yaml
kubectl apply -f kubernetes/view-generator-serv.yaml

Write-Host "All services deployed!" -ForegroundColor Green
```

### Step 10: Verify Deployment

```powershell
# Check all pods are running
kubectl get pods -n videostream

# Check all services
kubectl get svc -n videostream

# Wait for all pods to be ready
kubectl wait --for=condition=ready pod --all -n videostream --timeout=300s
```

### Step 11: Get Application URL

```powershell
# Get the external IP of the frontend service
kubectl get svc view-generator-serv -n videostream

# The EXTERNAL-IP will take a few minutes to provision
# Re-run the command until you see an IP address instead of <pending>
```

---

## 🌐 Access Your Application

Once you have the external IP, open your browser and go to:

```
http://EXTERNAL_IP:3000
```

---

## 🔍 Troubleshooting Commands

```powershell
# View logs for a specific service
kubectl logs -f deployment/controller-serv -n videostream

# Describe a pod for debugging
kubectl describe pod -l app=controller-serv -n videostream

# Check events
kubectl get events -n videostream --sort-by='.lastTimestamp'

# Enter a pod for debugging
kubectl exec -it deployment/controller-serv -n videostream -- /bin/sh

# Check MongoDB connection
kubectl exec -it deployment/mongodb -n videostream -- mongosh

# Restart a deployment
kubectl rollout restart deployment/controller-serv -n videostream
```

---

## 📊 Load Testing

After deployment, run load tests:

```powershell
# Install Locust
pip install locust

# Navigate to load-testing folder
cd load-testing

# Run Locust (replace with your external IP)
locust -f locustfile.py --host=http://EXTERNAL_IP:3000
```

Open http://localhost:8089 to access Locust web UI.

---

## 💰 Cost Management

### Estimated Costs (Free Tier Eligible)

- **GKE Cluster**: ~$70-100/month for 3 e2-medium nodes
- **GCS Storage**: First 5GB free, then $0.020/GB/month
- **Container Registry**: ~$0.10/GB/month

### To Reduce Costs:

```powershell
# Scale down when not in use
kubectl scale deployment --all --replicas=0 -n videostream

# Delete cluster when done (re-run Step 5 to recreate)
gcloud container clusters delete videostream-cluster --zone=us-central1-a
```

---

## 🧹 Cleanup

To delete everything:

```powershell
# Delete all Kubernetes resources
kubectl delete namespace videostream

# Delete GKE cluster
gcloud container clusters delete videostream-cluster --zone=us-central1-a --quiet

# Delete GCS bucket (optional)
gsutil rm -r gs://$BUCKET_NAME

# Delete container images (optional)
foreach ($service in $services) {
    gcloud container images delete "gcr.io/$PROJECT_ID/${service}:latest" --quiet
}
```

---

## ✅ Deployment Checklist

- [ ] GCP Account created with billing enabled
- [ ] Project created and Project ID noted
- [ ] Google Cloud SDK installed
- [ ] Docker Desktop installed and running
- [ ] kubectl installed
- [ ] Authenticated with `gcloud auth login`
- [ ] APIs enabled (Container, Storage, IAM)
- [ ] GCS bucket created
- [ ] Service account created with key
- [ ] GKE cluster created
- [ ] Docker images built and pushed to GCR
- [ ] Kubernetes YAML files updated with Project ID
- [ ] Secrets created (GCS key, JWT secret)
- [ ] All services deployed
- [ ] External IP obtained
- [ ] Application accessible via browser
- [ ] Load testing completed

---

## 📝 For Your Project Report

Include the following:

1. **Working URL**: `http://EXTERNAL_IP:3000`
2. **Architecture Diagram**: Use draw.io or similar
3. **API Endpoints**: Document from your services
4. **Load Test Results**: Screenshots from Locust
5. **Deployment Screenshots**: GCP Console, kubectl outputs

Good luck with your project! 🎉
