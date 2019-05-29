FROM node

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apt-get update && apt-get install -y build-essential python-dev jq

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN yarn install --no-cache --production && \
  adduser -S nodejs && \
  chown -R nodejs /app && \
  chown -R nodejs /home/nodejs

COPY . /app/

USER nodejs

CMD ["node", "src/api"]
