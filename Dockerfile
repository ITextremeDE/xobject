FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN mkdir -p apps/server/node_modules && npm ci --omit=dev --ignore-scripts --workspace @xobject/server --workspace @xobject/contracts

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG RELEASE_VERSION=0.0.0-unreleased
ARG VCS_REF=unpublished
LABEL org.opencontainers.image.title="xObject" \
      org.opencontainers.image.authors="Jürgen Schadek / ITextreme" \
      org.opencontainers.image.source="https://github.com/ITextremeDE/xobject" \
      org.opencontainers.image.url="https://xobject.org" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version=$RELEASE_VERSION \
      org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production LISTEN_HOST=0.0.0.0 PORT=4100
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/package.json /app/LICENSE /app/NOTICE ./
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/contracts ./packages/contracts
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 CMD node -e "const http=require('node:http'),u=new URL(process.env.BASE_URL),q=http.get({hostname:'127.0.0.1',port:process.env.PORT,path:'/healthz',headers:{Host:u.host}},r=>{r.resume();if(r.statusCode!==200)process.exitCode=1});q.on('error',()=>process.exit(1));q.setTimeout(3000,()=>{q.destroy();process.exit(1)})"
CMD ["node", "apps/server/dist/main.js"]
