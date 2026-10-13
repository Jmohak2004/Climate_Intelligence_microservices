#!/usr/bin/env bash
# Build all images inside Minikube's Docker daemon and deploy them to the cluster.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICES=(weather-service alert-service advisory-service aws-service auth-service)

minikube status >/dev/null 2>&1 || minikube start --driver=docker
eval "$(minikube docker-env)"

for svc in "${SERVICES[@]}"; do
  docker build -f docker/service.Dockerfile --build-arg SERVICE="$svc" -t "suryarakshak/$svc:latest" .
done
docker build -t suryarakshak/frontend:latest client

kubectl apply -k k8s
# Images are tagged :latest and rebuilt in place, so restart to pick up new builds.
kubectl -n suryarakshak rollout restart deployment "${SERVICES[@]}" frontend >/dev/null
for d in mongo "${SERVICES[@]}" frontend; do
  kubectl -n suryarakshak rollout status deployment "$d" --timeout=180s
done

echo
echo "SuryaRakshak is running. Opening the frontend URL:"
minikube service frontend -n suryarakshak --url
