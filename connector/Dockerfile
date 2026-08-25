FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && apk add --no-cache curl
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://master:3000/health || exit 1
CMD ["node", "dist/main"]

