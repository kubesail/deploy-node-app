# Published as kubesail/dna-test:14

FROM node:16-bullseye-slim

ARG TARGETARCH
ENV TARGETARCH=${TARGETARCH:-amd64}

RUN apt-get update -yqq && \
  apt-get install -yqq bash curl git && \
  curl -Ls https://storage.googleapis.com/kubernetes-release/release/v1.18.1/bin/linux/$TARGETARCH/kubectl -o /usr/local/bin/kubectl && \
  chmod +x /usr/local/bin/kubectl && \
  curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash && \
  mv kustomize /usr/local/bin/kustomize && \
  curl -s -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-$TARGETARCH && \
  chmod +x skaffold && \
  mv skaffold /usr/local/bin/skaffold
