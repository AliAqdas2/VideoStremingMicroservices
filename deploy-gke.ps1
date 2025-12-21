# GKE Deployment Script for Video Streaming Platform
# Run this script in PowerShell from the project root directory

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,
    
    [string]$Zone = "us-central1-a",
    [string]$ClusterName = "videostream-cluster"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Video Streaming Platform - GKE Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$GCR_REGISTRY = "gcr.io/$ProjectId"
$BUCKET_NAME = "$ProjectId-videostream-videos"

# Step 1: Set GCP Project
Write-Host "[1/10] Setting GCP Project..." -ForegroundColor Yellow
gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) {
    throw "Failed to set GCP project"
}

# Step 2: Enable APIs
Write-Host "[2/10] Enabling required APIs..." -ForegroundColor Yellow
$apis = @(
    "containerregistry.googleapis.com",
    "container.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com"
)
foreach ($api in $apis) {
    gcloud services enable $api --quiet
}
Write-Host "APIs enabled" -ForegroundColor Green

# Step 3: Create GCS Bucket
Write-Host "[3/10] Creating GCS Bucket..." -ForegroundColor Yellow
$bucketUri = "gs://$BUCKET_NAME"
$bucketExists = $null
try {
    $bucketExists = gsutil ls -b $bucketUri 2>$null
} catch {
    $bucketExists = $null
}

if (-not $bucketExists) {
    $region = ($Zone -split '-')[0..1] -join '-'
    gsutil mb -l $region $bucketUri
    Write-Host "Bucket created: $BUCKET_NAME" -ForegroundColor Green
}
else {
    Write-Host "Bucket already exists" -ForegroundColor Green
}

# Step 4: Create Service Account
Write-Host "[4/10] Setting up Service Account..." -ForegroundColor Yellow
$saEmail = "videostream-gcs-sa@$ProjectId.iam.gserviceaccount.com"
$saExists = $null
try {
    $saExists = gcloud iam service-accounts list --filter="email=$saEmail" --format="value(email)" 2>$null
} catch {
    $saExists = $null
}

if (-not $saExists) {
    gcloud iam service-accounts create videostream-gcs-sa --display-name="Video Stream GCS Service Account"
    gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$saEmail" --role="roles/storage.admin" --quiet
}

if (-not (Test-Path "gcs-service-account-key.json")) {
    gcloud iam service-accounts keys create gcs-service-account-key.json --iam-account=$saEmail
    Write-Host "Service account key created" -ForegroundColor Green
}
else {
    Write-Host "Service account key already exists" -ForegroundColor Green
}

# Step 5: Create/Connect to GKE Cluster
Write-Host "[5/10] Setting up GKE Cluster..." -ForegroundColor Yellow
$clusterExists = $null
try {
    $clusterExists = gcloud container clusters list --filter="name=$ClusterName" --format="value(name)" 2>$null
} catch {
    $clusterExists = $null
}

if (-not $clusterExists) {
    Write-Host "Creating GKE cluster (this takes 5-10 minutes)..." -ForegroundColor Yellow
    gcloud container clusters create $ClusterName --num-nodes=3 --machine-type=e2-medium --zone=$Zone --project=$ProjectId
}

gcloud container clusters get-credentials $ClusterName --zone=$Zone --project=$ProjectId
Write-Host "Connected to GKE cluster" -ForegroundColor Green

# Step 6: Configure Docker and Build Images
Write-Host "[6/10] Building and pushing Docker images..." -ForegroundColor Yellow
gcloud auth configure-docker --quiet

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
    Write-Host "  Building $service..." -ForegroundColor Gray
    docker build -t "$GCR_REGISTRY/${service}:latest" "./$service" --quiet
    
    Write-Host "  Pushing $service..." -ForegroundColor Gray
    docker push "$GCR_REGISTRY/${service}:latest"
    
    Write-Host "  $service complete" -ForegroundColor Green
}

# Step 7: Update Kubernetes YAML files
Write-Host "[7/10] Updating Kubernetes configuration..." -ForegroundColor Yellow
$files = Get-ChildItem -Path "kubernetes" -Filter "*.yaml"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $content = $content -replace 'YOUR_PROJECT_ID', $ProjectId
    $content = $content -replace 'videostream-videos', $BUCKET_NAME
    Set-Content $file.FullName $content
}
Write-Host "YAML files updated" -ForegroundColor Green

# Step 8: Create Kubernetes Resources
Write-Host "[8/10] Creating Kubernetes namespace and secrets..." -ForegroundColor Yellow
kubectl apply -f kubernetes/namespace.yaml

# Delete existing secrets if they exist
kubectl delete secret gcp-storage-key -n videostream --ignore-not-found
kubectl delete secret app-secrets -n videostream --ignore-not-found

# Create secrets
kubectl create secret generic gcp-storage-key --from-file=key.json=gcs-service-account-key.json --namespace=videostream

$chars = @()
$chars += (65..90) | ForEach-Object { [char]$_ }
$chars += (97..122) | ForEach-Object { [char]$_ }
$chars += (48..57) | ForEach-Object { [char]$_ }
$JWT_SECRET = -join ($chars | Get-Random -Count 32)
kubectl create secret generic app-secrets --from-literal=jwt-secret=$JWT_SECRET --namespace=videostream

kubectl apply -f kubernetes/gcs-config.yaml
Write-Host "Secrets created" -ForegroundColor Green

# Step 9: Deploy Services
Write-Host "[9/10] Deploying services to Kubernetes..." -ForegroundColor Yellow

# Deploy MongoDB first
kubectl apply -f kubernetes/mongodb.yaml
Write-Host "  Waiting for MongoDB..." -ForegroundColor Gray
kubectl wait --for=condition=ready pod -l app=mongodb -n videostream --timeout=300s

# Deploy services in order
kubectl apply -f kubernetes/logging-serv.yaml
Start-Sleep -Seconds 5

$deployFiles = @(
    "user-acc-mgmt-serv.yaml",
    "storage-mgmt-serv.yaml",
    "usage-mntr-serv.yaml",
    "model-serv.yaml",
    "controller-serv.yaml",
    "view-generator-serv.yaml"
)

foreach ($file in $deployFiles) {
    kubectl apply -f "kubernetes/$file"
    Write-Host "  Deployed $file" -ForegroundColor Green
}

# Step 10: Verify and Get URL
Write-Host "[10/10] Verifying deployment..." -ForegroundColor Yellow
Write-Host "Waiting for all pods to be ready..." -ForegroundColor Gray
kubectl wait --for=condition=ready pod --all -n videostream --timeout=300s

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

kubectl get pods -n videostream
Write-Host ""
kubectl get svc -n videostream
Write-Host ""

Write-Host "Getting external IP (may take 1-2 minutes)..." -ForegroundColor Yellow
$attempts = 0
$maxAttempts = 12
$externalIP = $null

while ((-not $externalIP) -and ($attempts -lt $maxAttempts)) {
    $attempts++
    try {
        $externalIP = kubectl get svc view-generator-serv -n videostream -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
    } catch {
        $externalIP = $null
    }
    if (-not $externalIP) {
        Write-Host "  Waiting for external IP... ($attempts/$maxAttempts)" -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }
}

Write-Host ""
if ($externalIP) {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  APPLICATION URL: http://${externalIP}:3000" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
}
else {
    Write-Host "External IP not ready yet. Run this command to check:" -ForegroundColor Yellow
    Write-Host "  kubectl get svc view-generator-serv -n videostream" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  View logs:    kubectl logs -f deployment/controller-serv -n videostream"
Write-Host "  All pods:     kubectl get pods -n videostream"
Write-Host "  Scale up:     kubectl scale deployment --all --replicas=3 -n videostream"
Write-Host ""
