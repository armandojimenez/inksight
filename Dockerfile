# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production dependencies only
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Run
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup -g 1001 nestjs && \
    adduser -u 1001 -G nestjs -s /bin/sh -D nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN mkdir -p uploads && chown nestjs:nestjs uploads

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main.js"]
