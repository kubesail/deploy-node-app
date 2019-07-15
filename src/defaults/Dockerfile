FROM node

# Built by deploy-node-app

WORKDIR /app

ENV NODE_ENV="production"

# Add common build deps
RUN apt-get update && apt-get install -y build-essential python-dev jq bash curl wget nginx && \
  sed -i 's/root \/var\/www\/html/root \/app\/build/' /etc/nginx/sites-enabled/default && \
  useradd -ms /bin/bash nodejs

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN chown -R nodejs /app /home/nodejs \
  /etc/nginx /var/log/nginx /var/lib/nginx /usr/share/nginx

USER nodejs


RUN yarn install

COPY . /app/

# Run build step if necessary
RUN if jq --exit-status ".scripts.build" package.json; then yarn build; fi

CMD ["node", "src/api"]
