FROM kubesail/node:12

# Built by deploy-node-app

WORKDIR /app

ENV NODE_ENV="production"

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN chown -R nodejs /app /home/nodejs \
  /etc/nginx /var/log/nginx /var/lib/nginx /usr/share/nginx

USER nodejs

RUN yarn install --production

COPY . /app/

CMD ["node", "src/index.js"]
