#!/bin/bash

# GCP Deployment Script
# Usage: ./deploy.sh [PROJECT_ID]

set -e

PROJECT_ID=${1:-"your-project-id"}
GCR_REGISTRY="gcr.io/${PROJECT_ID}"

echo "Building and pushing Docker images to GCR..."

# Set GCP project
gcloud config set project ${PROJECT_ID}

# Configure Docker to use gcloud as a credential helper
gcloud auth configure-docker

# Services to build and push
SERVICES=(
  "user-acc-mgmt-serv"
  "storage-mgmt-serv"
  "usage-mntr-serv"
  "model-serv"
  "controller-serv"
  "logging-serv"
  "view-generator-serv"
)

for service in "${SERVICES[@]}"; do
  echo "Building ${service}..."
  docker build -t ${GCR_REGISTRY}/${service}:latest ./${service}
  
  echo "Pushing ${service}..."
  docker push ${GCR_REGISTRY}/${service}:latest
  
  echo "✓ ${service} pushed successfully"
done

echo ""
echo "All images pushed successfully!"
echo "Next steps:"
echo "1. Update kubernetes/*.yaml files with your PROJECT_ID: ${PROJECT_ID}"
echo "2. Apply Kubernetes manifests: kubectl apply -f kubernetes/"

