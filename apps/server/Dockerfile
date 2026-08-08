# The Playwright image is pinned to the same version as the playwright package,
# because it ships the exact browser build that version expects. Bump both
# together or Chromium will not launch.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV BUN_INSTALL=/usr/local
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

# Browsers live in the base image, not in node_modules.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS http://localhost:8080/healthz || exit 1

USER pwuser
CMD ["bun", "run", "src/main.ts"]
