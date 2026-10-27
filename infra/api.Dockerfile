# Build context: repo root.  docker build -f infra/api.Dockerfile -t view/api:1.0.0 .
FROM node:24-alpine AS deps
RUN npm i -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @view/api...

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# shortcut: runs TypeScript through tsx (contracts ship as .ts source); precompile when startup time or image size matters
CMD ["node_modules/.bin/tsx", "src/server.ts"]
