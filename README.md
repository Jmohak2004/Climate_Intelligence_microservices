# SuryaRakshak

Smart heatwave surveillance and advisory system for Indian regions.

## Project Structure
- `/client` - React frontend (Vite)
- `/server` - Express API backend (Open-Meteo & NASA POWER integration)

## Data sources

Everything shown as a measurement comes from a live public API (none needs a key). There are no machine-learning
models: risk is computed with the NWS heat-index equations (Rothfusz regression, Steadman formula below 26.7°C)
and fixed risk bands.

| Source | Used for |
|---|---|
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Current conditions, hourly and 7-day forecast, UV, tamper-check baseline |
| [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5) | 30-day anomaly chart and the 10-year heat-exposure ranking |
| [NASA POWER](https://power.larc.nasa.gov/docs/services/api/) | Latest available daily maximum temperature (lags real time by a few days) |
| [Nominatim / OpenStreetMap](https://nominatim.org/release-docs/latest/api/Search/) | Geocoding when adding a region |

If a source is unreachable the API reports it (`live: false`, or an HTTP 502/503) rather than substituting numbers.

Not live data: the health advisories are general guidance, the cooling centers are labelled `sample` placeholders until
real ones are registered via `POST /api/resources`, the AWS stations are a simulation for demonstrating tamper
detection (they hold no readings until telemetry is posted), and the logins are demo credentials.

## Render Deployment Settings (Backend)

When creating a **Web Service** on [Render.com](https://render.com):

- **Environment**: `Node`
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start` (or `node src/index.js`)

Or simply use the included Blueprint by selecting **New -> Blueprint** and connecting your repository (`render.yaml` will configure everything automatically).

## Vercel Deployment Settings (Frontend)

1. Deploy the `/client` directory on Vercel or point the Vercel Root Directory to `client`.
2. Add Environment Variable in Vercel settings:
   ```
   VITE_API_BASE_URL=https://<your-render-backend-name>.onrender.com
   ```

## Microservice Architecture (Docker Desktop + Minikube)

The Express monolith in `/server` is also split into independent services under `/services`
(the monolith is kept for the Render/Vercel deployments above).

| Service | Port | Owns | Routes |
|---|---|---|---|
| `frontend` (nginx) | 80 | React build + API gateway | `/` and routing of `/api/*` |
| `weather-service` | 3001 | regions, forecast, climate history | `/api/dashboard`, `/api/regions`, `/api/forecast`, `/api/analytics`, `/api/exposure`, `/api/health` |
| `alert-service` | 3002 | alerts | `/api/alerts` |
| `advisory-service` | 3003 | advisories, cooling centers | `/api/health-advisories`, `/api/resources` |
| `aws-service` | 3004 | AWS stations, security logs | `/api/aws/*` |
| `auth-service` | 3005 | demo login | `/api/auth/*` |
| `mongo` | 27017 | one database per service (`suryarakshak_<service>`) | |

`weather-service` (dashboard) and `aws-service` (tamper alerts) call `alert-service` over HTTP;
if it is down they degrade gracefully. Every service exposes `/healthz` (liveness) and `/readyz` (readiness, waits for MongoDB).

### Docker Desktop (Compose)
```bash
docker compose up --build        # app at http://localhost:8080
docker compose down              # add -v to also delete the Mongo volume
```
Each backend service is also published on its own host port (3001-3005) for direct testing.

### Kubernetes on Docker Desktop
Enable Kubernetes in Docker Desktop (Settings → Kubernetes, kubeadm), then:
```bash
./scripts/docker-desktop-deploy.sh                               # builds images, applies k8s/, waits for rollout
kubectl -n suryarakshak get deploy,pods                          # one Deployment per microservice
kubectl -n suryarakshak scale deploy --all --replicas=0          # stop everything (kubectl apply -k k8s restores it)
kubectl delete namespace suryarakshak                            # tear down
```
The app is served at http://localhost:30080. The cluster runs on Docker Desktop's own engine, so locally built
images are used directly without a registry.

Optional: the [Kubernetes Dashboard](https://github.com/kubernetes/dashboard) shows per-deployment status charts:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml
kubectl -n kubernetes-dashboard create serviceaccount admin-user
kubectl create clusterrolebinding admin-user --clusterrole=view --serviceaccount=kubernetes-dashboard:admin-user
kubectl -n kubernetes-dashboard create token admin-user          # login token
kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard 8443:443
```
Open https://localhost:8443, sign in with the token, choose the `suryarakshak` namespace and open Workloads.

### Kubernetes on kind (multi-node)
```bash
./scripts/kind-deploy.sh         # creates a 4-node kind cluster, loads the images, deploys; app at http://localhost:8081
```

### Kubernetes on Minikube
```bash
./scripts/minikube-deploy.sh     # starts Minikube (docker driver), builds images in its daemon, applies k8s/, prints the URL
kubectl -n suryarakshak get pods
minikube service frontend -n suryarakshak          # open in browser
kubectl delete namespace suryarakshak               # tear down
```
Images are built directly into Minikube's Docker daemon (`eval $(minikube docker-env)`), so no registry is needed.
Each service runs 2 replicas behind a ClusterIP Service; the frontend is exposed as a NodePort.
Re-run the script after code changes to rebuild and roll out.

### Monitoring (Prometheus + Grafana)
Every service exposes Prometheus metrics at `/metrics` (via `prom-client` in `services/common`):

| Metric | Meaning |
|---|---|
| `http_requests_total{method,route,status}` | Requests handled, by route pattern and status code |
| `http_request_duration_seconds` | Request latency histogram |
| `service_ready` | 1 when the service and its database are ready |
| `service_calls_total{target,outcome}` | Calls to other microservices, success or failure |
| `process_*`, `nodejs_*` | CPU, memory, event-loop lag and other Node.js defaults |

Prometheus discovers service pods through their `prometheus.io/scrape` and `prometheus.io/port` annotations
(it only has read access to pods in the `suryarakshak` namespace). Grafana is provisioned with the Prometheus
data source and a **SuryaRakshak Microservices** dashboard, viewable without signing in.

| | Kubernetes | Compose |
|---|---|---|
| Grafana | http://localhost:30030 | http://localhost:3000 |
| Prometheus | http://localhost:30090 | http://localhost:9090 |

Config lives in `k8s/monitoring/` (shared by both setups) and `docker/prometheus.yml` (Compose scrape targets).
Example queries:
```promql
sum by (service) (up{job="suryarakshak-services"})
sum by (service) (rate(http_requests_total[5m]))
histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))
sum by (service, target, outcome) (service_calls_total)
```

### Running a single service locally (no Docker, in-memory data)
```bash
cd services/common && npm install
cd ../alert-service && PORT=3002 npm start
```
