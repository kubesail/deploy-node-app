# deploy-to-kube

[![npm version](https://img.shields.io/npm/v/deploy-to-kube.svg?style=flat-square)](https://www.npmjs.com/package/deploy-to-kube)
[![Build Status](https://img.shields.io/travis/rexxars/react-markdown/master.svg?style=flat-square)](https://travis-ci.org/rexxars/react-markdown)

Deploy your node.js app to Kubernetes with a single command. No config required.

Supports any kubernetes cluster, including the following:

- Google Kubernetes Engine
- Amazon EKS
- DigitalOcean Kubernetes
- Kubesail (completely free Kubernetes hosting)
- Custom Clusters

### Instructions

Just run `npx deploy-to-kube` in your node project.

![Example](docs/terminal-example-1.svg)

### What does this tool do?

After answering a few questions about your app, this tool can:

1. Create a Dockerfile (if needed)
1. Build a Docker image
1. Create a Kubernetes deployment file
1. Deploy your app on a Kubernetes cluster
   - Configure a free namespace on Kubesail.com (if desired)

---

deploy-to-kube is proudly sponsored by

[<img src="docs/kubesail-logo.png" alt="Kubesail" width="248">
<br/>
Kubeail - an easy, free way to try kubernetes](https://kubesail.com)

---

### Contributing

If you feel that this tool can be improved in any way, feel free to open a pull request!
