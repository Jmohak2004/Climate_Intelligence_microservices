#!/usr/bin/env bash
# Build the images and deploy them to Docker Desktop's built-in Kubernetes cluster.
# The cluster runs on the Docker engine, so locally built images need no registry or loading.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=(weather-service alert-service advisory-service aws-service auth-service)

kubectl config use-context docker-desktop >/dev/null

docker compose build

kubectl apply -k k8s
kubectl -n suryarakshak rollout restart deployment "${SERVICES[@]}" frontend >/dev/null
for d in mongo "${SERVICES[@]}" frontend prometheus grafana; do
  kubectl -n suryarakshak rollout status deployment "$d" --timeout=180s
done

echo
echo "App:        http://localhost:30080"
echo "Grafana:    http://localhost:30030"
echo "Prometheus: http://localhost:30090"
kubectl -n suryarakshak get pods -o wide
