# Web image - builds the React SPA and serves it with nginx, which also
# terminates HTTPS and reverse-proxies /api to the backend.
# Build context is the repository root (see docker-compose.yml).

# ---- Stage 1: build the static site ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies with the locked versions for reproducible builds.
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

# App source and production build.
COPY frontend/ ./
# Empty by default => the app calls "/api" on the same origin (served below).
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV GENERATE_SOURCEMAP=false
RUN yarn build

# ---- Stage 2: serve with nginx ----
FROM nginx:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80 443
