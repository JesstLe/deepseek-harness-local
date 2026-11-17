FROM node:24.19.0-alpine
WORKDIR /app
COPY market/package.json ./package.json
COPY market ./market
COPY plugins/naumi-enterprise/market-contract.js ./plugins/naumi-enterprise/market-contract.js
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3190 NAUMI_MARKET_DB=/data/market.sqlite
EXPOSE 3190
CMD ["node","market/server.mjs"]
