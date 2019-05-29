FROM node

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apk add build-base make gcc g++ linux-headers python-dev libc-dev libc6-compat jq

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN yarn install --no-cache --production && \
  adduser -S nodejs && \
  chown -R nodejs /app && \
  chown -R nodejs /home/nodejs

COPY . /app/

USER nodejs

CMD ["node", "src/api"]
