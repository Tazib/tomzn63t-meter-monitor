# One image runs both the web app (`npm start`) and the poller (`npm run poller`).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Full install: the poller, seeds and migrations use tsx and drizzle-kit at runtime.
RUN npm ci

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Dhaka
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
