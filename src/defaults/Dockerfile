FROM node

# Deploy-node-app v0.2.0

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apt-get update && apt-get install -y build-essential python-dev jq bash curl wget

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN yarn install --no-cache && \
  useradd -ms /bin/bash nodejs && \
  chown -R nodejs /app && \
  chown -R nodejs /home/nodejs

COPY . /app/

# Run build step if necessary
RUN cat package.json | jq --exit-status ".scripts.build" && \
  yarn build || echo "No build step found in package.json, skipping"

# Install nginx if there's any static content
RUN [ -f "build/index.html" ] && \
  apt-get install -y nginx && \
  sed -i 's/root \/var\/www\/html/root \/app\/build/' /etc/nginx/sites-enabled/default || \
  echo "No static content found, not installing nginx"

USER nodejs

CMD ["node", "src/api"]
