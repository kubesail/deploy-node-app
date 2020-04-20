FROM node:12

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app

EXPOSE 3000

ARG ENV=production
ENV NODE_ENV $ENV
ENV CI=true

COPY --chown=node:node package.json yarn.loc[k] .npmr[c] ./
RUN yarn install
COPY --chown=node:node . .

CMD ["npm", "start"]