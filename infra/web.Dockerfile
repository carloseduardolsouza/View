# Build context: repo root.  docker build -f infra/web.Dockerfile -t view/web:1.0.0 .
FROM node:24-alpine AS build
RUN npm i -g pnpm@10
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @view/web... && pnpm --filter @view/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
