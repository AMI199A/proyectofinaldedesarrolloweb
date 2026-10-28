FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

ARG VITE_API_URL=http://localhost:4000/api
ARG VITE_KC_URL=http://localhost:8081
ARG VITE_KC_REALM=jarvis
ARG VITE_KC_CLIENT_ID=jarvis-web
ENV VITE_API_URL=$VITE_API_URL \
    VITE_KC_URL=$VITE_KC_URL \
    VITE_KC_REALM=$VITE_KC_REALM \
    VITE_KC_CLIENT_ID=$VITE_KC_CLIENT_ID

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
