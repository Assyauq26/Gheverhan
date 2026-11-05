FROM node@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2
WORKDIR /app
COPY platform/registration/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY platform/registration/src ./src
USER 1000:1000
CMD ["node","src/server.mjs"]
