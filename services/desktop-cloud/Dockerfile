ARG BASE_IMAGE=node:24-alpine
FROM ${BASE_IMAGE}
WORKDIR /app
COPY market/package.json ./package.json
COPY market ./market
COPY services/desktop-cloud ./services/desktop-cloud
COPY plugins/naumi-enterprise/market-contract.js ./plugins/naumi-enterprise/market-contract.js
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3190 NAUMI_CLOUD_DATA=/data
CMD ["node","services/desktop-cloud/server.mjs"]
