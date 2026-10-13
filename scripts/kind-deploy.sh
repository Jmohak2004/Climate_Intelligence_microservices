#!/usr/bin/env bash
# Create a 4-node kind cluster, load the locally built images into it and deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=(weather-service alert-service advisory-service aws-service auth-service)
CLUSTER=suryarakshak

kind get clusters | grep -qx "$CLUSTER" || kind create cluster --config k8s/kind-config.yaml
kubectl config use-context "kind-$CLUSTER" >/dev/null

for svc in "${SERVICES[@]}"; do
  docker build -f docker/service.Dockerfile --build-arg SERVICE="$svc" -t "suryarakshak/$svc:latest" .
done
docker build -t suryarakshak/frontend:latest client

for img in "${SERVICES[@]}" frontend; do
  kind load docker-image "suryarakshak/$img:latest" --name "$CLUSTER"
done
docker pull mongo:7
kind load docker-image mongo:7 --name "$CLUSTER"

kubectl apply -k k8s
kubectl -n suryarakshak rollout restart deployment "${SERVICES[@]}" frontend >/dev/null
for d in mongo "${SERVICES[@]}" frontend; do
  kubectl -n suryarakshak rollout status deployment "$d" --timeout=180s
done

echo
echo "Running at http://localhost:8081"
kubectl -n suryarakshak get pods -o wide
