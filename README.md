# LinkForge

A production-oriented URL Shortener and Link Management Platform.

## Technology Stack

### Frontend

- React
- Vite
- JavaScript
- Tailwind CSS
- React Router
- Axios
- TanStack Query
- Recharts

### Backend

- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ

### Testing and Documentation

- Vitest
- Supertest
- Swagger / OpenAPI
- Docker

## Project Architecture

LinkForge follows a modular monolith architecture with separate frontend and backend applications.

- `client/` — React frontend
- `server/` — Express backend
- `docs/` — Project documentation

## Development

### Prerequisites

- Node.js 26+
- npm 11+
- PostgreSQL 18
- Redis 7

Install dependencies:

    npm ci

Start development servers:

    npm run dev

## Project Status

Phase 10: Local deployment, operational hardening, and verification completed (2026-11-23).

**Completed:** Docker recovery, dependency security remediation, API hardening, migrations, 325 automated tests, frontend build, deployment checks, actual short-link redirect, and normal authentication/session verification.
**Scope note:** Public production deployment is not included. Google account linking remains deferred. See [docs/operations.md](docs/operations.md) for operational limitations.

## Operations Documentation

See [docs/operations.md](docs/operations.md) for deployment, migrations, health checks, security controls, dependency audits, and recovery guidance.
