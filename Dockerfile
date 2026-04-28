FROM node:20-alpine AS base
WORKDIR /app

FROM base AS client-deps
COPY client/package.json client/package-lock.json* ./client/
WORKDIR /app/client
RUN npm install

FROM client-deps AS client-build
COPY client/ /app/client/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM nginx:1.27-alpine AS frontend
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/client/dist /usr/share/nginx/html
EXPOSE 80

FROM base AS backend
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm install
COPY server/ /app/server/
EXPOSE 4000
CMD ["npm", "run", "start"]
