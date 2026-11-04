FROM node@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2
WORKDIR /app/platform/installer
COPY platform/installer/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY platform/installer/ ./
COPY platform/installer-web/ /app/platform/installer-web/
USER 1000:1000
CMD ["node","src/server.mjs"]
