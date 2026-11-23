# LinkForge Operations Guide

Last verified: 2026-11-23

## Architecture

- Frontend: React, Vite, Tailwind CSS, Nginx
- Backend: Node.js 26, Express 5
- Database: PostgreSQL 18, Prisma 7
- Cache and queue: Redis 7, BullMQ
- Reverse proxy: Caddy 2
- Tests: Vitest and Supertest
- Deployment: Docker Compose, WSL 2

## Environment

Required configuration:

- .env.docker
- server/secrets/firebase-service-account.json (required by the current unconditional Compose bind mount; Firebase Authentication itself is optional)

Never commit environment files, credentials, passwords or tokens.

## Deployment

Validate configuration:

    docker compose --env-file .env.docker config -q

Build images:

    docker compose --env-file .env.docker build

Start services:

    docker compose --env-file .env.docker up -d

Check status:

    docker compose --env-file .env.docker ps

View logs:

    docker compose --env-file .env.docker logs --tail=100

## Database migrations

Run:

    docker compose --env-file .env.docker run --rm migrate

The migration service executes prisma migrate deploy.
Review migration output before considering deployment complete.

## Security

Verified API controls:

- Runs as non-root user node (UID 1000).
- All Linux capabilities dropped.
- no-new-privileges enabled.
- Firebase service account mounted read-only by Compose; the mount is currently unconditional, although Firebase Authentication is optional at application level.

All primary services have health checks and unless-stopped restart policies.
Docker JSON logs use 10 MB rotation with five files retained.

Known hardening gaps:

- No explicit CPU or memory limits.
- Read-only root filesystems are not enabled.
- Caddy master process runs as root.
- Nginx uses a root master and unprivileged workers.

Do not impose resource limits without workload testing.

## Logging and runtime monitoring

Docker uses the json-file logging driver:

- Maximum log file size: 10 MB.
- Maximum retained files: 5 per container.
- Approximate nominal retention capacity: 50 MB per container.

Inspect service logs:

    docker compose --env-file .env.docker logs --tail=100

Inspect recent logs for selected services:

    docker compose --env-file .env.docker logs --since 30m api redis

Check container health:

    docker compose --env-file .env.docker ps -a

Inspect restart counts and OOM status:

    docker compose --env-file .env.docker ps -q | ForEach-Object { docker inspect $_ --format '{{.Name}}: restart_count={{.RestartCount}}, oom_killed={{.State.OOMKilled}}, exit_code={{.State.ExitCode}}' }

Inspect current resource usage:

    docker stats --no-stream

Verified 2026-11-23:

- All six containers have the configured log rotation settings.
- Five primary services were healthy.
- No unexpected restarts or OOM kills were observed.
- Current resource usage was low.
- Caddy and frontend logs included expected periodic health-check requests.

Limitations:

- These checks are manual and point-in-time.
- Centralized log aggregation, continuous metrics collection, dashboards, and automated alerts are not configured.
- Resource usage has not been validated under production-level load.

## Dependency security

Run complete audit:

    npm audit

Run production audit:

    npm audit --omit=dev

Verified 2026-11-23:

- Both audits reported zero vulnerabilities.
- effect is pinned to 3.22.1.
- Prisma remains at 7.10.1.
- Existing Firebase gRPC override is preserved.

Avoid npm audit fix --force without reviewing major-version changes.

## Tests and builds

Run tests:

    npm test

Build frontend:

    npm run build

Verified 2026-11-23:

- 29 test files passed.
- 347 tests passed; zero failed.

Some backend tests emitted localhost Redis ECONNREFUSED messages despite passing assertions. Review test Redis configuration separately.

## Health endpoints

- Frontend: http://app.linkforge.test/
- Short-link domain: http://go.linkforge.test/
- API liveness: http://app.linkforge.test/api/v1/health/live
- API readiness: http://app.linkforge.test/api/v1/health/ready

The current .test configuration uses local HTTP. It is not a public production-domain deployment.

## Data safety

Persistent volumes:

- linkforge-postgres-data
- linkforge-redis-data
- linkforge-caddy-data
- linkforge-caddy-config

Never use docker compose down -v or volume/system prune commands as routine cleanup. They can destroy application data.

Keep verified recovery backups separate from active Docker storage.

## Verification status

Verified 2026-11-23:

- Docker storage relocated to D:.
- All five primary services healthy.
- API dependency remediation deployed.
- API hardening applied and verified.
- Six database migrations found; none pending.
- Both npm audits reported zero vulnerabilities.
- All automated tests passed.
- Frontend production build succeeded.
- Frontend, API liveness, and API readiness endpoints returned HTTP 200.
- Short-link redirect through Caddy returned HTTP 302 to the stored destination.

Final functional verification (2026-11-23):

- Short code Axk6J3F4 returned HTTP 302 through Caddy to its stored LeetCode destination.
- Normal email/password sign-in succeeded.
- Authenticated dashboard loaded successfully.
- Session persisted after browser refresh.
- Sign-out returned the browser to the login page.
- Google sign-in/account linking remains deferred.

Local Phase 10 deployment verification completed. Public production launch remains separate because the current configuration uses local .test domains and HTTP.

## Backup and restore validation

A PostgreSQL custom-format backup was created and verified on 2026-11-23.

Validation performed:

- Backup archive integrity inspected using pg_restore --list.
- SHA-256 checksum verified.
- Backup restored into an isolated linkforge_restore_test database.
- All 12 table row counts matched the original database.
- The live application database was not modified.

Important:

- The restore test database is retained until explicit cleanup approval.
- The validated backup is stored locally and is not an off-device disaster-recovery copy.
- Maintain encrypted off-device backups and a defined retention policy before public production deployment.

Never restore over the live database without a separately verified recovery plan.
