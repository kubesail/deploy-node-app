# **deploy-node-app**

[![npm version](https://img.shields.io/npm/v/deploy-node-app.svg?style=flat-square)](https://www.npmjs.com/package/deploy-node-app)

### Deploy apps to Kubernetes, with zero config!

`deploy-node-app` will prompt you with a minimal set of questions required to deploy your app to any Kubernetes cluster. If zero-config with no lock-in sounds too good to be true - remember this project is in **beta** :wink:. However, it mostly works, and `deploy-node-app` also supports more than just Node.js projects! Try it on a Python or Ruby project or a static site project!

Once you've run `deploy-node-app` in your project, you can commit your `.dna.json` file and use `deploy-node-app` with no prompts in the future (works great for CI too!)

If you don't have a Kubernetes cluster, don't worry! This tool can automatically provision a free [KubeSail.com](https://kubesail.com) cluster for you!


## Instructions

Just run `npx deploy-node-app` in your node project.

![Example](https://github.com/kubesail/deploy-node-app/raw/master/docs/terminal-example-1.svg?sanitize=true)

## What does this tool do?

`deploy-node-app` is a project bootstrapper, powered by [Skaffold](https://github.com/GoogleContainerTools/skaffold). After answering a few questions about your app, this tool can:

1. Create a Dockerfile, skaffold.yaml and all the YAML Kubernetes!
2. Automatically provision common dependencies (like redis and postgres)!
3. Develop and deploy your app on any Kubernetes cluster!

Essentially, `deploy-node-app` supercharges any web applications with awesome tools and best practices.

With `deploy-node-app`, any codebase can have:

1. Local and remote development!
2. Infrastructure-as-code with no effort!
3. Zero downtime, rolling deployments!
4. Free hosting, including SSL and custom domains! (provided by [KubeSail](https://kubesail.com))

## Usage and examples

```
Usage: deploy-node-app [env] [action]

Options:
  -V, --version                        output the version number
  -w, --write                          Write files to project (writes out Dockerfile, skaffold.yaml, etc)
  -u, --update                         Update existing files (default: false)
  -f, --force                          Dont prompt if possible (default: false)
  -l, --label [foo=bar,tier=service]   Add labels to created Kubernetes resources
  -t, --target <path/to/project>       Target project directory (default: ".")
  -c, --config <path/to/kubeconfig>    Kubernetes configuration file (default: "~/.kube/config")
  -m, --modules <redis,postgres>       Explicitly add modules
```

By default, `deploy-node-app` will write a few files to your directory, and by default files won't be touched if they've been modified. `deploy-node-app` by itself is the same as `deploy-node-app production deploy`

Simply run `npx deploy-node-app` in your repository. The tool will attempt to prompt you when it needs answers to questions, and do it's best to bootstrap your application. Take a look at [supported languages](https://github.com/kubesail/deploy-node-app/tree/master/src/languages) - we're always looking to add more!

## Tests-as-examples

Take a look at [/test](https://github.com/kubesail/deploy-node-app/tree/master/test) for a growing list of examples!

## Dependencies

`deploy-node-app` knows about dependencies! For example, if you install a redis or postgres driver for Node.js, Python, Ruby [and more](https://github.com/kubesail/deploy-node-app/tree/master/src/languages), `deploy-node-app` will automatically create Redis or Postgres deployments that work with your app!

## Suggested tools:

- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) - required for creating your deployment, and recommended for managing your deployment after created
- [Skaffold](https://skaffold.dev/docs/install/) - Kubernetes workflow utility

---

deploy-node-app is created and maintained by

[<img src="docs/kubesail-logo.png" alt="Kubesail" width="160">
<br/>
KubeSail - Kubernetes for Human Beings](https://kubesail.com)

---

### Contributing

If you feel that this tool can be improved in any way, feel free to open an issue or pull request!
