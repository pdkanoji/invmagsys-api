FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p uploads logs

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001
RUN chown -R nodeuser:nodejs /app
USER nodeuser
EXPOSE 3000
CMD ["node", "src/server.js"]
