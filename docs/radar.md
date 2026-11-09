# FocusTrack on Radar and Kubernetes

The primary demo URL is `https://focustrack.cnh.radarhq.io`. Vercel is the fallback.
The orchestrator performs Radar MCP and cluster operations; the build manager
prepares and validates the release files.

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
the public hostname to this exact Service in `team-focustrack`.

**Route.** `deploy/httproute.yaml` retains the starter's HTTPRoute for
`focustrack.cnh.radarhq.io`, referencing Gateway `cnh` in namespace `gateway`.
The starter explicitly says this route is inert inside the team's virtual cluster
because there is no Gateway there. The host platform provides the real public
routing and HTTPS termination. Do not install an ingress controller or change the
Service to NodePort or LoadBalancer to expose this app.

**Secret.** `app-credentials` stores the Elastic endpoint and API key inside the
cluster. Nelson creates it himself in Radar Cloud: choose the team's cluster,
Resources → Secrets → Create Secret, name it `app-credentials`, choose namespace
`team-focustrack` and type `Opaque`, then enter keys `es-url` and `es-api-key`
under `stringData` in the UI and apply. `es-url` is the Elastic base HTTPS URL;
`es-api-key` is the encoded API key value without the `ApiKey ` prefix. The
Deployment's `secretKeyRef` passes these as `ES_URL` and `ES_API_KEY` at runtime.
A reference does not create the Secret. Missing keys stop the container from
starting. Never paste the values into chat, git, Docker build arguments, or logs.
After changing a value, the orchestrator restarts the Deployment through Radar so new
Pods read the new environment. The orchestrator reported this Secret created at
11:35 MT. Argo CD leaves this manually created Secret alone.

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
The Application is named `app-focustrack` and lives in `team-focustrack`, using
the preinstalled project `team-focustrack`. It does not live in namespace
`argocd`. This team-specific Application name deliberately differs from the
starter's name `app`; use this name when inspecting or syncing it through Radar.
If an existing Application named `app` already owns these resources, the orchestrator
must arrange the ownership handover before enabling this one; do not run two
Applications reconciling the same Deployment and Service.

## From merge to the live URL

1. Worker A's scaffold must provide `package.json`, `package-lock.json`, an npm
   `build` script, and Next.js configuration with `output: "standalone"`. The
   Dockerfile installs with `npm ci`, builds in a separate stage, and copies
   `.next/standalone`, `.next/static`, and `public` to the production image.
   It creates an empty `public` directory if none exists. It runs `node server.js`
   as non-root, listening on `0.0.0.0:8080`. Elastic credentials are runtime-only.
2. The team is `focustrack`: namespace `team-focustrack`, Argo CD project
   `team-focustrack`, public URL `https://focustrack.cnh.radarhq.io`. The Radar
   cluster id is looked up once in Radar and used on every Radar MCP call.
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
6. Once the first image is public and the Secret exists, the orchestrator applies
   `argocd/application.yaml` once through Radar after Nelson approves the release
   checkpoint. Later releases need no manual manifest apply. Argo CD notices the bot commit, updates the Deployment's image,
   starts replacement Pods, and waits for readiness before sending them traffic.
   The orchestrator can refresh/sync through Radar instead of waiting for git polling.
7. The orchestrator confirms that the expected source SHA's action succeeded, the
   remote Kustomize tag matches it, the Application synced the expected bot/git
   revision, and the live Deployment uses that SHA image with ready Pods. Then
   open `https://focustrack.cnh.radarhq.io`, check `/healthz` and `/readyz`, and
   exercise the intended app feature. A green old Deployment does not prove the
   new code deployed. FocusTrack's health response deliberately has no version
   field; use the live image tag plus synced git revision to verify provenance.

## Manager handoff and validation

Use Radar's cluster list to find the entry named exactly `focustrack`; record its
id as `<cluster-id>` and pass it as `cluster` on every subsequent Radar MCP call.
Pass namespace `team-focustrack` wherever supported. Never select the platform
cluster `cnh` or another team's cluster. Keep all owned application changes in
git; direct cluster edits will be undone by self-heal. No kubectl or Radar
operations were performed by this worker.

The probe tests use the scaffold's Vitest runner:

```sh
npm test -- app/healthz/route.test.ts app/readyz/route.test.ts
```

Run all release checks with `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run build`. Build the cluster image locally with
`docker build --platform linux/amd64 -t focustrack:c-platform-check .`.
Run it on port 8080 with runtime credentials passed as environment variables;
`/healthz` must return 200 independently, and `/readyz` must return 200 with live
Elastic credentials or 503 when they are absent. Never bake credentials into the image.

The tests cover independent liveness, authenticated readiness, unsuccessful Elastic
responses, missing credentials, network failure, and the actual abort deadline.
Worker A's scaffold is included in this branch. Local checks and the Docker smoke
test are recorded below; cluster rollout verification remains a separate
orchestrator checkpoint.

Adapted from the [official starter](https://github.com/skyhook-io/cnh-starter):
the GHCR build/tag/bot-commit pattern, Kustomize image replacement, two replicas,
Service name and port, HTTPRoute, and in-team-namespace Argo CD project and sync
policy. Deliberate changes are the full SHA tag (the starter uses seven characters),
team-specific Application name, multistage Next.js image, runtime Elastic Secret
references, meaningful readiness, startup probe, larger memory limit, and explicit
numeric non-root identity with no mounted Kubernetes API credentials. The bot uses
standard `sed` instead of the starter's `yq`, avoiding an additional tool assumption.

## Branch policy check

At 11:42 MT on November 9, the GitHub API reported that `main` has no classic
branch protection (HTTP 404, "Branch not protected"). Effective branch rules and
repository rulesets both returned empty lists. No branch policy presently blocks
the image workflow's `GITHUB_TOKEN` push to `deploy/kustomization.yaml`; no settings
were changed. The repository default token permission is read-only, and this
workflow explicitly requests `contents: write` and `packages: write`.
This does not prove a future workflow push succeeded: verify the
first actual image workflow and bot commit after merge.

## Local release validation

At 11:43 MT, `npm run typecheck`, `npm run lint`, `npm test` (13 tests), and
`npm run build` all passed. Muse Wonder reviewed the Codex-authored platform diff
and returned `VERDICT: MEETS` with no findings at 11:47 MT.
The Linux amd64 build stalled for more than seven minutes in `npm ci` under
local emulation and was stopped. An independent container request reached the
npm registry with HTTP 200. A native Linux arm64 build was also limited by a slow base-image download.
The full Dockerfile build remains unverified locally. The image workflow builds
on its GitHub-hosted Ubuntu runner after merge.

At 11:53 MT, the locally built standalone bundle passed an actual Linux amd64
container smoke test using the cached Node 22 Alpine image with the bundle
mounted read-only. Node ran as uid 1000 on port 8080: home and `/healthz` returned
200; `/readyz` returned 503 without credentials and 200 with live Elastic
credentials passed only through the process environment. This verifies the
standalone runtime and real probe connectivity, not the incomplete image build. No cluster deployment,
Radar investigation, or Checks screenshot has been performed by the build manager.

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

The orchestrator should run at least one hosted AI investigation on the running app;
an all-clear after a release counts. Never deliberately break the app. Investigations
start private; the person who starts it must present it or deliberately share it
(sharing exposes it to all hackathon teams). Findings need primary evidence before
changing the app. Use these pages after replacing the placeholders:

- Timeline: `https://app.radarhq.io/c/<cluster-id>/timeline`.
- Application: `https://app.radarhq.io/c/<cluster-id>/resources/applications?resource=team-focustrack/app-focustrack&apiGroup=argoproj.io`.
- Deployment/investigation target: `https://app.radarhq.io/c/<cluster-id>/resources/deployments?resource=team-focustrack/app`.
- Team Checks before and after: `https://app.radarhq.io/checks?scope=<cluster-id>&namespace=team-focustrack`.
- Hosted investigations: `https://app.radarhq.io/c/<cluster-id>/investigations`.

## If the cluster breaks

Switch the presentation to the Vercel fallback at
`https://focustrack-cnh.vercel.app`. Configure `ES_URL` and `ES_API_KEY` in
Vercel's environment settings, never in git. Keep the last known good fallback
available, and use Radar evidence to explain the cluster problem without spending
the demo debugging. Vercel continues to build pull-request previews and serves as the fallback deployment.
