# deploy-node-app

[![npm version](https://img.shields.io/npm/v/deploy-node-app.svg?style=flat-square)](https://www.npmjs.com/package/deploy-node-app)

Deploy your node.js app to Kubernetes or Docker with a single command. No config required.

Supports any Kubernetes cluster, including the following:

- Google Kubernetes Engine
- Amazon EKS
- DigitalOcean Kubernetes
- KubeSail (**completely free Kubernetes hosting**)
- Custom Clusters

### Instructions

Just run `npx deploy-node-app` in your node project.

![Example](https://github.com/kubesail/deploy-node-app/raw/master/docs/terminal-example-1.svg?sanitize=true)

### Prerequisites

- [Docker](https://www.docker.com/get-started)
- [NodeJS / npm](https://nodejs.org/en/) - NPM includes the `npx` utility needed to run this package without being installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) - required for creating your deployment, and recommended for managing your deployment after created

### What does this tool do?

After answering a few questions about your app, this tool can:

1. Create a Dockerfile (if needed)
1. Build a Docker image
1. Create a Kubernetes deployment file
1. Deploy your app on a Kubernetes cluster
   - Configure a free namespace on KubeSail (if desired)


### Usage and examples

```
Usage: deploy-node-app [env]

Options:
  -V, --version            output the version number
  --generate-local-env     Generates local environment variables
  -n, --no-build           Don't build and push docker container
  -d, --no-deploy          Don't deploy to kubernetes
  -O, --overwrite          Overwrite local files
  -s, --skip metamodule    name of metamodule to skip
  -f, --format [type]      Output config format [k8s|compose] (default: "compose")
  -o, --output [filename]  File for config output. "-" will write to stdout. Default is docker-compose.yaml or deployment.yaml depending on format
  -h, --help               output usage information
  ```

By default, `deploy-node-app` will write a few files to your directory, depending on the chosen output. You will be prompted if any files need to be updated or overwritten (use --overwrite to ignore prompts).

Deploying to local docker-compose:

`deploy-node-app local -f compose`

  - Writes a local Dockerfile
  - Scans depdencies for meta-modules, adding services automatically
  - Writes a local **docker-compose.yaml** based on your needs
  - Builds container image
  - Pushes container image to chosen repository
  - Calls `docker-compose up`

`deploy-node-app local -f k8s`

  - Writes a local Dockerfile
  - Scans depdencies for meta-modules, adding services automatically
  - Writes a local **kustomization.yaml** file based on your needs
  - Builds container image
  - Pushes container image to chosen repository
  - Calls `kubectl apply -k ...`

# Meta-Modules
Read more about meta-modules [here](https://github.com/create-node/create-node-app#meta-modules)

Deploy-node-app will automatically write Kubernetes or Compose configuration based on installed metamodules. Try `npm install @nodeapp/redis` and then re-run `deploy-node-app`! A local redis container will be started for you with a preconfigured driver!

---

deploy-node-app is maintained by

[<img src="docs/kubesail-logo.png" alt="Kubesail" width="160">
<br/>
Kubesail - an easy, free way to try kubernetes](https://kubesail.com)

---

### Contributing

If you feel that this tool can be improved in any way, feel free to open an issue or pull request!
