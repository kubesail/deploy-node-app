FROM node:12-slim

# Built by deploy-node-app

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apt-get update && apt-get install -y nginx && \
  sed -i 's/root \/var\/www\/html/root \/app\/build/' /etc/nginx/sites-enabled/default && \
  chown -R node /app /home/node /etc/nginx /var/log/nginx /var/lib/nginx /usr/share/nginx

USER node

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN npm install --production --no-cache

COPY . /app/

CMD ["node", "src/index.js"]
