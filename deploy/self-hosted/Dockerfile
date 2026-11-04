# syntax=docker/dockerfile:1
FROM node@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && node node_modules/@prisma/engines/scripts/postinstall.js
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN node node_modules/typescript/bin/tsc src/lib/self-hosted/config.ts src/lib/self-hosted/storage-root.ts --outDir /compiled --module es2022 --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop && mv /compiled/config.js /compiled/config.mjs && mv /compiled/storage-root.js /compiled/storage-root.mjs
RUN node --input-type=module -e "import {build} from 'esbuild'; await build({entryPoints:['scripts/self-hosted-issue-admin.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'/compiled/issue-admin.mjs'})"
# Keep Prisma CLI only in the one-shot migration target.
FROM node@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS migration
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /compiled ./self-hosted
COPY --from=build --chown=node:node /app/self-hosted/launch.mjs ./self-hosted/launch.mjs
RUN printf '{"private":true}' > package.json && chmod 755 /app && chown -R node:node /app/self-hosted
USER node
ENTRYPOINT ["node", "self-hosted/launch.mjs", "migrate"]
FROM build AS dependencies
RUN npm prune --omit=dev --ignore-scripts
FROM node@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/src/modules/regions/data ./src/modules/regions/data
COPY --from=build --chown=node:node /app/scripts/security ./scripts/security
COPY --from=build --chown=node:node /app/scripts/webpack ./scripts/webpack
COPY --from=build --chown=node:node /app/next.config.js /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /compiled ./self-hosted
COPY --from=build --chown=node:node /app/self-hosted/launch.mjs ./self-hosted/launch.mjs
RUN chmod 755 /app && chown -R node:node /app/self-hosted && chmod -R u+rX /app/self-hosted
USER node
EXPOSE 3000
ENTRYPOINT ["node", "self-hosted/launch.mjs"]
