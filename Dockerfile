FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json yarn.lock ./
COPY patches ./patches
COPY sources/team-config ./sources/team-config
RUN yarn install --frozen-lockfile --ignore-engines

FROM deps AS builder
ARG APP_ENV=production
ARG EXPO_PUBLIC_POSTHOG_API_KEY=""
ARG EXPO_PUBLIC_REVENUE_CAT_STRIPE=""
ARG EXPO_PUBLIC_HAPPY_SERVER_URL="https://top1vibe.com/api/v3"
ARG EXPO_PUBLIC_GENOME_HUB_URL="https://top1vibe.com/genome/v3"
ARG BASE_PATH=""

ENV NODE_ENV=production \
    APP_ENV=${APP_ENV} \
    EXPO_NO_TELEMETRY=1 \
    EXPO_PUBLIC_POSTHOG_API_KEY=${EXPO_PUBLIC_POSTHOG_API_KEY} \
    EXPO_PUBLIC_REVENUE_CAT_STRIPE=${EXPO_PUBLIC_REVENUE_CAT_STRIPE} \
    EXPO_PUBLIC_HAPPY_SERVER_URL=${EXPO_PUBLIC_HAPPY_SERVER_URL} \
    EXPO_PUBLIC_GENOME_HUB_URL=${EXPO_PUBLIC_GENOME_HUB_URL}

COPY . .
RUN yarn expo export --platform web --output-dir dist --clear

# Rewrite asset paths for sub-path deployment (e.g. /webappv3)
RUN if [ -n "$BASE_PATH" ]; then \
      echo "Rewriting asset paths with base path: $BASE_PATH" && \
      find dist -name '*.html' -exec sed -i \
        -e "s|href=\"/_expo/|href=\"${BASE_PATH}/_expo/|g" \
        -e "s|href=\"/assets/|href=\"${BASE_PATH}/assets/|g" \
        -e "s|href=\"/favicon|href=\"${BASE_PATH}/favicon|g" \
        -e "s|src=\"/_expo/|src=\"${BASE_PATH}/_expo/|g" \
        -e "s|src=\"/assets/|src=\"${BASE_PATH}/assets/|g" {} + && \
      find dist -name '*.js' -exec sed -i \
        -e "s|\"/_expo/|\"${BASE_PATH}/_expo/|g" \
        -e "s|\"/assets/|\"${BASE_PATH}/assets/|g" {} + ; \
    fi

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
ARG BASE_PATH=""
COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Replace the default nginx config with a base-path-aware variant when BASE_PATH is set.
# nginx-unprivileged runs as non-root, so we need to switch to root temporarily.
USER root
RUN if [ -n "$BASE_PATH" ]; then \
      echo "server { \
        listen 8080; \
        location ${BASE_PATH}/ { \
          alias /usr/share/nginx/html/; \
          index index.html; \
          try_files \$uri \$uri/ ${BASE_PATH}/index.html; \
        } \
        location = ${BASE_PATH} { return 301 ${BASE_PATH}/; } \
      }" > /etc/nginx/conf.d/default.conf; \
    fi
USER nginx

# Fall back to copied nginx.conf when no BASE_PATH
COPY nginx.conf /tmp/nginx-default.conf
RUN if [ -z "$(cat /etc/nginx/conf.d/default.conf 2>/dev/null)" ]; then \
      cp /tmp/nginx-default.conf /etc/nginx/conf.d/default.conf; \
    fi

EXPOSE 8080
