FROM node

# Deploy-node-app v0.2.0

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apt-get update && apt-get install -y build-essential python-dev jq bash curl wget nginx

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN yarn install --no-cache && \
  useradd -ms /bin/bash nodejs && \
  chown -R nodejs /app && \
  chown -R nodejs /home/nodejs

# TODO: Add nginx configuration for /app/build directory

COPY . /app/

USER nodejs

CMD ["node", "src/api"]
