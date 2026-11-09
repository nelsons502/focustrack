# FocusTrack on Radar and Kubernetes

The primary demo URL is `https://<team-name>.cnh.radarhq.io`. Vercel is the fallback.
The manager handles cluster operations; this platform work only prepares files.

## What each piece does

**Container image and GHCR.** An image packages the app, its dependencies, and Node
so every Pod runs the same build. GitHub Container Registry (GHCR) stores it at
`ghcr.io/nelsons502/focustrack`. The image workflow publishes both the full source
commit SHA tag and `latest`. Kubernetes uses the SHA after the first successful
build, which gives each rollout a specific version instead of a moving target.
Nelson must make the GHCR package public once: GitHub repository → Packages →
focustrack → Package settings → Change visibility → Public. The public cluster
pulls without registry credentials. The GitHub repository must also be public so
Argo CD can read it without credentials.

**Deployment and Pod.** A Pod is a running copy of the container. The Deployment
in `deploy/deployment.yaml` keeps two copies running and replaces them gradually
when the image changes. Each requests 100m CPU (one tenth of a CPU) and 128 MiB of
memory, with limits of 500m CPU and 512 MiB. The limit allows more memory than the
starter's tiny Node server because Next.js runs here. Both copies and the extra
Pod during a rollout fit the starter's stated team budget. Containers run as
user/group 1000 without extra capabilities or a Kubernetes API token.

**Service.** Pods can be replaced and get new addresses. `deploy/service.yaml`
provides the stable name `app`, accepts port 80, and forwards to the matching
Pods on port 8080. Keep the Service name and port: the hackathon platform routes
the public hostname to this exact Service in `team-<team-name>`.

**Route.** `deploy/httproute.yaml` retains the starter's HTTPRoute for
`<team-name>.cnh.radarhq.io`, referencing Gateway `cnh` in namespace `gateway`.
The starter explicitly says this route is inert inside the team's virtual cluster
because there is no Gateway there. The host platform provides the real public
routing and HTTPS termination. Do not install an ingress controller or change the
Service to NodePort or LoadBalancer to expose this app.

**Secret.** `app-credentials` stores the Elastic endpoint and API key inside the
cluster. Nelson creates it himself in Radar Cloud: choose the team's cluster,
Resources → Secrets → Create Secret, name it `app-credentials`, choose namespace
`team-<team-name>` and type `Opaque`, then enter keys `es-url` and `es-api-key`
under `stringData` in the UI and apply. `es-url` is the Elastic base HTTPS URL;
`es-api-key` is the encoded API key value without the `ApiKey ` prefix. The
Deployment's `secretKeyRef` passes these as `ES_URL` and `ES_API_KEY` at runtime.
A reference does not create the Secret. Missing keys stop the container from
starting. Never paste the values into chat, git, Docker build arguments, or logs.
After changing a value, the manager restarts the Deployment through Radar so new
Pods read the new environment. Argo CD leaves this manually created Secret alone.

**Probes.** `/healthz` always returns HTTP 200 with `{"status":"ok"}` when the app
can handle requests. Kubernetes uses it for liveness: restart a stuck app, without
restarting healthy Node processes just because Elastic is down. A startup probe
allows up to about a minute before liveness and readiness start. `/readyz` makes
an authenticated, uncached GET to `ES_URL` using `Authorization: ApiKey ...`, with
a two-second timeout and redirects rejected. An Elastic 2xx response means ready
(HTTP 200); missing configuration, other statuses, network failures, and timeouts
mean HTTP 503 with a generic body. Readiness's three-second probe timeout exceeds
the Elastic timeout. Unready Pods stop receiving Service traffic; an Elastic
outage can therefore make the public app unavailable without causing restarts.
Both route handlers are dynamic, so builds do not ping Elastic and responses are
not frozen into the image. Neither endpoint returns the Elastic URL or key.

**Argo CD Application and GitOps.** GitOps means the files in git describe what
should run. `argocd/application.yaml` tells Argo CD to watch this repository's
`main` branch, build the Kustomize configuration under `deploy/`, and reconcile
the team namespace. Kustomize combines the three manifests and replaces image
`app` with the GHCR name and tag in `deploy/kustomization.yaml`. Automatic sync
deploys changes, self-heal restores accidental edits, and prune removes resources
that this Application previously managed and that are later removed from git.
The Application is named `app-<team-name>` and lives in `team-<team-name>`, using
the preinstalled project `team-<team-name>`. It does not live in namespace
`argocd`. This team-specific Application name deliberately differs from the
starter's name `app`; use this name when inspecting or syncing it through Radar.
If an existing Application named `app` already owns these resources, the manager
must arrange the ownership handover before enabling this one; do not run two
Applications reconciling the same Deployment and Service.

## From merge to the live URL

1. Worker A's scaffold must provide `package.json`, `package-lock.json`, an npm
   `build` script, and Next.js configuration with `output: "standalone"`. The
   Dockerfile installs with `npm ci`, builds in a separate stage, and copies
   `.next/standalone`, `.next/static`, and `public` to the production image.
   It creates an empty `public` directory if none exists. It runs `node server.js`
   as non-root, listening on `0.0.0.0:8080`. Elastic credentials are runtime-only.
2. The manager replaces the literal team placeholder throughout `deploy/`,
   `argocd/`, and this document before deployment. Until then the namespace and
   hostnames are intentionally invalid placeholders. The cluster id placeholder
   is documentation only. Use one literal replacement for the team name across
   these files; do not substitute a guessed name.
3. A merge/push to `main` triggers `.github/workflows/image.yml` (`build-and-deploy`).
   Manual `workflow_dispatch` also works when run against `main`; other refs are
   skipped. Like the starter, pushes changing only Markdown and/or
   `deploy/kustomization.yaml` skip a build. A configuration-only edit to that
   file is still reconciled by Argo CD using the existing image tag.
4. The action logs into GHCR using `GITHUB_TOKEN` with `packages: write`, builds,
   and publishes `ghcr.io/nelsons502/focustrack:<full commit SHA>` and `:latest`.
   It then changes `newTag` in `deploy/kustomization.yaml` to that full source SHA
   and commits `deploy: <full commit SHA> [skip ci]` onto current `main`. The bot
   commit has its own different SHA. Only the action pushes this tag update to
   `main`; this worker never pushes. The initial checked-in `latest` is replaced
   by the first action; wait for that SHA update before bootstrapping Argo CD.
5. As in the starter, builds are serialized and the bot retries its push on top
   of freshly fetched `main` up to five times to preserve concurrent merges. The
   workflow has `contents: write` for this bot commit. Repository rules must allow
   this action to push the tag commit. If rules reject it, image publication alone
   will not advance the deployed tag; the manager must resolve the repository
   policy before relying on automatic releases. After a run, fetch/rebase the bot
   commit before the next authorized push. The bot commit does not loop into
   another build (GITHUB_TOKEN pushes do not trigger another push workflow;
   the path filter and skip marker also protect this flow).
6. Once the first image is public and the Secret exists, the manager applies
   `argocd/application.yaml` once through Radar. Later releases need no manual
   manifest apply. Argo CD notices the bot commit, updates the Deployment's image,
   starts replacement Pods, and waits for readiness before sending them traffic.
   The manager can refresh/sync through Radar instead of waiting for git polling.
7. The manager confirms that the expected source SHA's action succeeded, the
   remote Kustomize tag matches it, the Application synced the expected bot/git
   revision, and the live Deployment uses that SHA image with ready Pods. Then
   open `https://<team-name>.cnh.radarhq.io`, check `/healthz` and `/readyz`, and
   exercise the intended app feature. A green old Deployment does not prove the
   new code deployed. FocusTrack's health response deliberately has no version
   field; use the live image tag plus synced git revision to verify provenance.

## Manager handoff and validation

Use Radar's cluster list to find the entry named exactly `<team-name>`; record its
id as `<cluster-id>` and pass it as `cluster` on every subsequent Radar MCP call.
Pass namespace `team-<team-name>` wherever supported. Never select the platform
cluster `cnh` or another team's cluster. Keep all owned application changes in
git; direct cluster edits will be undone by self-heal. No kubectl or Radar
operations were performed by this worker.

The dependency-free probe test suites run with Node 22's TypeScript stripping:

```sh
node --experimental-strip-types --test app/healthz/route.test.mjs app/readyz/route.test.mjs
```

They cover independent liveness, authenticated readiness, unsuccessful Elastic
responses, missing credentials, network failure, and the actual abort deadline.
The production Docker build and full scaffold checks still require Worker A's
files. After those land, validate the standalone build and container startup with
runtime credentials supplied outside git, then let the manager verify live probes.

Adapted from the [official starter](https://github.com/skyhook-io/cnh-starter):
the GHCR build/tag/bot-commit pattern, Kustomize image replacement, two replicas,
Service name and port, HTTPRoute, and in-team-namespace Argo CD project and sync
policy. Deliberate changes are the full SHA tag (the starter uses seven characters),
team-specific Application name, multistage Next.js image, runtime Elastic Secret
references, meaningful readiness, startup probe, larger memory limit, and explicit
numeric non-root identity with no mounted Kubernetes API credentials. The bot uses
standard `sed` instead of the starter's `yq`, avoiding an additional tool assumption.

## Radar story — presentation draft

This is an evidence template, not a claim that deployment or investigation happened.

| Moment (America/Denver) | Evidence to capture | Status |
| --- | --- | --- |
| First hour | Namespace Checks screenshot before app changes | Not yet captured |
| First successful release | Timeline event, source SHA, image tag, ready Pods, public URL | Not yet verified |
| Feature releases or a real failure | Timeline diff and the decision it informed | Not yet recorded |
| AI investigation | Question, target, findings, evidence, and action or all-clear | Not yet run |
| 16:00 | Checks screenshot after changes, same namespace filter | Not yet captured |
| Presentation | Explain whom FocusTrack helps and one decision Radar informed | Draft after evidence exists |

The manager should run at least one hosted AI investigation on the running app;
an all-clear after a release counts. Never deliberately break the app. Investigations
start private; the person who starts it must present it or deliberately share it
(sharing exposes it to all hackathon teams). Findings need primary evidence before
changing the app. Use these pages after replacing the placeholders:

- Timeline: `https://app.radarhq.io/c/<cluster-id>/timeline`.
- Application: `https://app.radarhq.io/c/<cluster-id>/resources/applications?resource=team-<team-name>/app-<team-name>&apiGroup=argoproj.io`.
- Deployment/investigation target: `https://app.radarhq.io/c/<cluster-id>/resources/deployments?resource=team-<team-name>/app`.
- Team Checks before and after: `https://app.radarhq.io/checks?scope=<cluster-id>&namespace=team-<team-name>`.
- Hosted investigations: `https://app.radarhq.io/c/<cluster-id>/investigations`.

## If the cluster breaks

Switch the presentation to the team's Vercel fallback deployment; the manager
records its actual URL when available. Configure `ES_URL` and `ES_API_KEY` in
Vercel's environment settings, never in git. Keep the last known good fallback
available, and use Radar evidence to explain the cluster problem without spending
the demo debugging. Vercel deployment and its URL are managed outside this worker.
