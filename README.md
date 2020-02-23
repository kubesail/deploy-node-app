# deploy-node-app

[![npm version](https://img.shields.io/npm/v/deploy-node-app.svg?style=flat-square)](https://www.npmjs.com/package/deploy-node-app)

Develop and deploy Node.js apps with Kubernetes, with zero config!

Supports any Kubernetes cluster, including the following:

- Minikube
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
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) - required for creating your deployment, and recommended for managing your deployment after created
- [Skaffold](https://skaffold.dev/docs/install/) - Kubernetes workflow utility

### What does this tool do?

After answering a few questions about your app, this tool can:

1. Create a Dockerfile and all the YAML for developing on and deploying to Kubernetes!
2. Automatically provision common dependencies (like redis and postgres)!
3. Deploy your app on any Kubernetes cluster

Essentially, `deploy-node-app` supercharges any Node application with awesome tools and best practices. With `deploy-node-app`, any codebase can have:

1. Local and remote development!
2. Infrastructure-as-code with no effort!
3. Zero downtime, rolling deployments!
4. Free hosting, including SSL and custom domains! (provided by [KubeSail](https://kubesail.com))

### Usage and examples

```
Usage: deploy-node-app [env] [action] [options]

Examples:

  # Deploy to production
  deploy-node-app
  deploy-node-app production deploy

  # Develop your app!
  deploy-node-app local dev

Options:
  -V, --version        output the version number
  -h, --help           output usage information
  -n, --no-write       dont write anything to the repo, just use defaults
  -u, --update         Update existing files (Dockerfile, skaffold.yaml, etc.)
```

By default, `deploy-node-app` will write a few files to your directory, and by default files won't be touched if they've been modified.

# Simplest Usage

Simply run `npx deploy-node-app` in your Node.js repository. The tool will attempt to prompt you when it needs answers to questions, but should happily support almost all Node.js applications, including static front-end's created by `create-react-app`.

# Dependencies

`deploy-node-app` knows about dependencies! For example, if you install `redis`, or `pg`, `deploy-node-app` will automatically create Redis or Postgres deployments that work with your app!

---

deploy-node-app is maintained by

[<img src="docs/kubesail-logo.png" alt="Kubesail" width="160">
<br/>
KubeSail - Kubernetes for Human Beings](https://kubesail.com)

---

### Contributing

If you feel that this tool can be improved in any way, feel free to open an issue or pull request!
