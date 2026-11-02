# Final image only copies what scripts/build-release.mjs staged (everything is built locally, D12).
# node:24-alpine is multi-arch (amd64 and arm64, D17); the code and its two dependencies are plain JavaScript.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/frontend \
    HOST_PROC=/host/proc \
    HOST_SYS=/host/sys
WORKDIR /app
COPY release/backend/deps ./node_modules
COPY release/backend/package.json ./package.json
COPY release/backend/src ./src
COPY release/frontend ./frontend
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
