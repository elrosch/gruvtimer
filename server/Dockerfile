# gruvtimer sync server: official PocketBase binary + this repo's migrations,
# also serving the web app. Build from the repository root:
#   docker build -f server/Dockerfile -t gruvtimer-pocketbase .

# The web app is platform independent, so it is built once on the host platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src src
RUN npm run build

FROM alpine:3.22
# keep in sync with the version the migrations are tested against
ARG PB_VERSION=0.40.5
ARG TARGETARCH
RUN apk add --no-cache ca-certificates tzdata \
    && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin \
    && rm /tmp/pb.zip

COPY server/pb_migrations /pb_migrations
COPY --from=web /app/dist /pb_public
COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8090
VOLUME /pb_data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q --spider http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
