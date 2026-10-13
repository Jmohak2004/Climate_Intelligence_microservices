# One Dockerfile for every backend service.
#   docker build -f docker/service.Dockerfile --build-arg SERVICE=weather-service .
FROM node:20-alpine AS deps
ARG SERVICE
WORKDIR /app
COPY services/common/package.json ./common/
COPY services/${SERVICE}/package.json ./service/
RUN cd common && npm install --omit=dev && cd ../service && npm install --omit=dev && mkdir -p node_modules

FROM node:20-alpine
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app/service
COPY --from=deps /app/common/node_modules /app/common/node_modules
COPY --from=deps /app/service/node_modules ./node_modules
COPY services/common/ /app/common/
COPY services/${SERVICE}/ ./
RUN rm -rf /app/common/test test
USER node
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/healthz || exit 1
CMD ["node", "src/index.js"]
