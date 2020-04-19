# Node.js start-on-change example

`deploy-node-app`'s default skaffold setup will syncronize files from the project directory into the remote container, but it's up to the container to do things with those changes! In otherwords, we do not _restart_ the container on changes, we just sync the files.

Take a look at the "package.json" file in this directory:

- We've installed `nodemon`, a tool that will restart our process when files change
- We've defined a "development" environment which has a different "entrypoint": "npm run development"
- In our "package.json", we've setup 'development' to mean nodemon!

This means `deploy-node-app development` features live reloading, and there was no container specific knowledge required other than defining a custom "entrypoint"!
