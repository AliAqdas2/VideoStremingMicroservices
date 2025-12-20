# Deployment Guide

This guide provides step-by-step instructions for deploying the Video Streaming Platform to Google Cloud Platform (GCP) using Google Kubernetes Engine (GKE).

## Prerequisites

1. **Google Cloud Account**
   - Create a GCP account at https://cloud.google.com
   - Enable billing
   - Create a new project

2. **Install Required Tools**
   ```bash
   # Install Google Cloud SDK
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   
   # Install kubectl
   gcloud components install kubectl
   
   # Install Docker Desktop
   # Download from: https://www.docker.com/products/docker-desktop
   ```

3. **Authenticate**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

## Step 1: Create GKE Cluster

```bash
# Set your project ID
export PROJECT_ID=your-project-id
gcloud config set project ${PROJECT_ID}

# Enable required APIs
gcloud services enable container.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Create GKE cluster
gcloud container clusters create videostream-cluster \
  --num-nodes=3 \
  --machine-type=e2-medium \
  --zone=us-central1-a \
  --project=${PROJECT_ID}

# Get credentials
gcloud container clusters get-credentials videostream-cluster \
  --zone=us-central1-a \
  --project=${PROJECT_ID}
```

## Step 2: Build and Push Docker Images

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment script
./deploy.sh ${PROJECT_ID}
```

Or manually:

```bash
export PROJECT_ID=your-project-id
export GCR_REGISTRY=gcr.io/${PROJECT_ID}

# Configure Docker
gcloud auth configure-docker

# Build and push each service
cd user-acc-mgmt-serv
docker build -t ${GCR_REGISTRY}/user-acc-mgmt-serv:latest .
docker push ${GCR_REGISTRY}/user-acc-mgmt-serv:latest
cd ..

# Repeat for all services...
```

## Step 3: Update Kubernetes Manifests

1. Replace `YOUR_PROJECT_ID` in all Kubernetes YAML files:
   ```bash
   # Using sed (macOS/Linux)
   find kubernetes/ -name "*.yaml" -type f -exec sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" {} \;
   
   # Or manually edit each file
   ```

2. Update secrets in `kubernetes/secrets.yaml`:
   - Change JWT secret to a strong random key

## Step 4: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f kubernetes/namespace.yaml

# Create secrets
kubectl apply -f kubernetes/secrets.yaml

# Deploy MongoDB
kubectl apply -f kubernetes/mongodb.yaml

# Wait for MongoDB to be ready
kubectl wait --for=condition=ready pod -l app=mongodb -n videostream --timeout=300s

# Deploy services
kubectl apply -f kubernetes/logging-serv.yaml
kubectl apply -f kubernetes/user-acc-mgmt-serv.yaml
kubectl apply -f kubernetes/storage-mgmt-serv.yaml
kubectl apply -f kubernetes/usage-mntr-serv.yaml
kubectl apply -f kubernetes/model-serv.yaml
kubectl apply -f kubernetes/controller-serv.yaml
kubectl apply -f kubernetes/view-generator-serv.yaml
```

## Step 5: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n videostream

# Check services
kubectl get svc -n videostream

# Get external IP for frontend
kubectl get svc view-generator-serv -n videostream

# View logs
kubectl logs -f deployment/view-generator-serv -n videostream
```

## Step 6: Access the Application

1. Get the external IP:
   ```bash
   kubectl get svc view-generator-serv -n videostream
   ```

2. Open browser to: `http://EXTERNAL_IP:3000`

## Troubleshooting

### Pods not starting
```bash
# Check pod status
kubectl describe pod <pod-name> -n videostream

# Check logs
kubectl logs <pod-name> -n videostream
```

### Image pull errors
- Ensure images are pushed to GCR
- Check image names in YAML files match GCR registry
- Verify service account has permissions

### MongoDB connection issues
- Check MongoDB pod is running: `kubectl get pods -n videostream | grep mongodb`
- Verify service name is correct in environment variables
- Check MongoDB logs: `kubectl logs -f deployment/mongodb -n videostream`

### Storage issues
- Ensure PVC is created: `kubectl get pvc -n videostream`
- Check storage class is available: `kubectl get storageclass`

## Scaling

```bash
# Scale controller service
kubectl scale deployment controller-serv --replicas=5 -n videostream

# Scale view generator service
kubectl scale deployment view-generator-serv --replicas=3 -n videostream
```

## Updating Services

```bash
# After pushing new images, restart deployments
kubectl rollout restart deployment/user-acc-mgmt-serv -n videostream
kubectl rollout restart deployment/storage-mgmt-serv -n videostream
# ... etc
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace videostream

# Delete cluster (optional)
gcloud container clusters delete videostream-cluster \
  --zone=us-central1-a \
  --project=${PROJECT_ID}
```

## Cost Optimization

- Use preemptible nodes for development
- Set up auto-scaling
- Use Cloud Storage for video files instead of PVC
- Implement horizontal pod autoscaling

## Security Best Practices

1. Use Kubernetes secrets for sensitive data
2. Enable network policies
3. Use TLS/SSL for external traffic
4. Implement RBAC
5. Regular security updates
6. Use private GKE clusters for production

