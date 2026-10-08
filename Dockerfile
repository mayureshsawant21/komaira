FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Database and uploaded images live here — mount a persistent volume at /app/data and /app/uploads.
VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3000
CMD ["node", "server.js"]
