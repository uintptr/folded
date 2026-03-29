FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js content.css ./
EXPOSE 8080
CMD ["node", "server.js"]
