# Gutsy AI Pro Interop Contract (MCP Server ↔ External 3D Service)

## Purpose and scope

This document defines a **TypeScript-first integration contract** between `@apify/actors-mcp-server` and an external 3D generation service referred to as **Gutsy AI Pro**.

Goals:
- Keep this repository TypeScript-only (no embedded native CAD/mesh pipeline).
- Use explicit HTTP contracts for CAD and mesh generation.
- Support long-running generation jobs safely.
- Provide clear security and versioning boundaries for local and hosted deployments.

Non-goals:
- Defining internal implementation details of the external 3D service.
- Replacing MCP tool-level schemas in this repository.

---

## 1) HTTP API contract: endpoints, schemas, and errors

### 1.1 Base URL

- **Local deployment** (developer machine): `http://127.0.0.1:8787/v1`
- **Hosted deployment** (production/staging): `https://api.gutsy-ai-pro.example.com/v1`

All endpoint paths below are relative to the selected base URL.

### 1.2 Common headers

#### Request headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer <token>` (hosted required; local optional)
- `X-Idempotency-Key: <uuid-v4>` (required on job creation)
- `X-Request-Id: <uuid-v4>` (recommended for traceability)

#### Response headers
- `X-Request-Id: <uuid-v4>`
- `X-Contract-Version: 1.0`
- `Retry-After: <seconds>` (for `429` and `503` responses)

### 1.3 CAD generation

#### `POST /cad/jobs`
Create a long-running CAD generation job.

**Request schema (`CadJobCreateRequest`)**
```json
{
  "prompt": "parametric desk lamp with cable channel",
  "units": "mm",
  "format": "step",
  "constraints": {
    "maxBoundingBox": { "x": 280, "y": 180, "z": 120 },
    "minWallThickness": 1.2
  },
  "quality": "balanced",
  "metadata": {
    "projectId": "proj_123",
    "source": "apify-mcp-server"
  }
}
```

**Field notes**
- `prompt` (`string`, required): natural language design intent.
- `units` (`"mm" | "cm" | "in"`, required).
- `format` (`"step" | "iges" | "x_t"`, required).
- `constraints` (`object`, optional): geometry constraints.
- `quality` (`"draft" | "balanced" | "high"`, optional, default `balanced`).
- `metadata` (`record<string,string>`, optional, max 20 keys).

**Response (`202 Accepted`)**
```json
{
  "jobId": "cad_job_01JABCDEF...",
  "status": "queued",
  "createdAt": "2026-01-15T10:45:12.124Z",
  "estimatedCompletionSeconds": 90,
  "statusUrl": "/cad/jobs/cad_job_01JABCDEF...",
  "resultUrl": "/cad/jobs/cad_job_01JABCDEF.../result"
}
```

#### `GET /cad/jobs/{jobId}`
Get job status.

**Response (`200 OK`)**
```json
{
  "jobId": "cad_job_01JABCDEF...",
  "status": "running",
  "progress": 57,
  "stage": "feature-construction",
  "createdAt": "2026-01-15T10:45:12.124Z",
  "updatedAt": "2026-01-15T10:46:00.024Z",
  "error": null
}
```

`status` enum:
- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `expired`

#### `GET /cad/jobs/{jobId}/result`
Fetch final artifact metadata and signed download URLs.

**Response (`200 OK`, when `status=succeeded`)**
```json
{
  "jobId": "cad_job_01JABCDEF...",
  "status": "succeeded",
  "outputs": [
    {
      "kind": "cad",
      "format": "step",
      "sizeBytes": 582144,
      "sha256": "3f5e...",
      "downloadUrl": "https://downloads.example.com/...",
      "expiresAt": "2026-01-15T11:50:00.000Z"
    }
  ]
}
```

### 1.4 Mesh generation

#### `POST /mesh/jobs`
Create a long-running mesh generation job.

**Request schema (`MeshJobCreateRequest`)**
```json
{
  "prompt": "ergonomic gamepad shell",
  "style": "industrial",
  "outputFormats": ["obj", "glb"],
  "mesh": {
    "targetPolycount": 120000,
    "watertight": true,
    "uvUnwrap": true
  },
  "scale": {
    "unit": "mm",
    "longestEdge": 220
  },
  "metadata": {
    "projectId": "proj_123",
    "source": "apify-mcp-server"
  }
}
```

**Response (`202 Accepted`)** has same envelope as CAD creation with `mesh_job_...` id.

#### `GET /mesh/jobs/{jobId}` and `GET /mesh/jobs/{jobId}/result`
Same behavior as CAD endpoints, but `outputs[*].kind = "mesh"` and format is one of `obj`, `stl`, `ply`, `glb`, `fbx`.

### 1.5 Cancellation endpoint

#### `POST /jobs/{jobId}/cancel`
Attempts cancellation for CAD or mesh jobs.

**Response (`202 Accepted`)**
```json
{
  "jobId": "cad_job_01JABCDEF...",
  "status": "cancelled",
  "updatedAt": "2026-01-15T10:46:24.000Z"
}
```

### 1.6 Standard error model

All non-2xx responses use `ErrorResponse`:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "units must be one of mm, cm, in",
    "retryable": false,
    "details": {
      "field": "units"
    }
  },
  "requestId": "req_01JABCDE...",
  "timestamp": "2026-01-15T10:45:13.004Z"
}
```

Error code catalog:
- `INVALID_ARGUMENT` (`400`)
- `UNAUTHORIZED` (`401`)
- `FORBIDDEN` (`403`)
- `NOT_FOUND` (`404`)
- `CONFLICT` (`409`)
- `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` (`409`)
- `RATE_LIMITED` (`429`, retryable)
- `UPSTREAM_TIMEOUT` (`504`, retryable)
- `SERVICE_UNAVAILABLE` (`503`, retryable)
- `INTERNAL` (`500`, retryability service-defined)

---

## 2) Timeouts, retries, and idempotency for long-running jobs

### 2.1 Client-side timeout policy (MCP server → Gutsy AI Pro)

- `POST /cad/jobs`, `POST /mesh/jobs`: **30s request timeout**.
- `GET .../jobs/{jobId}`: **15s request timeout**.
- `GET .../result`: **30s request timeout**.
- Cancellation: **15s request timeout**.

If HTTP times out but request may have reached server, caller must use the same idempotency key when retrying job creation.

### 2.2 Retry policy

Use bounded exponential backoff with jitter:
- Initial delay: `500ms`
- Backoff multiplier: `2.0`
- Max delay: `10s`
- Max attempts: `5` for create/status/result requests

Retry only when:
- HTTP `429`, `503`, `504`
- network transport failures (connect reset, DNS/transient I/O)

Do **not** retry:
- `400`, `401`, `403`, `404`, `409` (except safe status polling after ambiguous create timeout)

Honor `Retry-After` when provided.

### 2.3 Idempotency key requirements

For job-creation endpoints, client **must** send `X-Idempotency-Key`:
- Format: UUID v4
- Scope: unique per logical job request
- Retention window on service side: minimum **24 hours**

Service behavior:
- Same key + identical payload → return original `202` with same `jobId`.
- Same key + different payload → `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.

### 2.4 Job lifecycle and polling

Recommended polling schedule after job creation:
- Poll every `2s` for first minute.
- Then every `5s` until terminal state.
- Stop polling at **15 minutes** unless caller explicitly extends deadline.

Terminal states: `succeeded`, `failed`, `cancelled`, `expired`.

---

## 3) Security and authentication expectations

### 3.1 Local deployment expectations

For localhost-only development:
- Default transport may allow **no auth** only when bound to loopback (`127.0.0.1`).
- If bound to any non-loopback interface, bearer token becomes mandatory.
- CORS should default to deny-all except explicitly configured local origins.
- Signed result URLs should have short TTL (≤ 15 minutes).

### 3.2 Hosted deployment expectations

Hosted integrations must enforce:
- `Authorization: Bearer <token>` on all endpoints.
- TLS 1.2+ only.
- Token scopes at minimum:
  - `cad:write`, `cad:read`
  - `mesh:write`, `mesh:read`
  - `jobs:cancel`
- Per-tenant rate limiting and audit logging with request ID correlation.
- Secret storage through environment/runtime secret manager only (never committed).

### 3.3 Data handling

- Prompts and metadata may contain sensitive product data; treat as confidential.
- Avoid logging raw prompts in production unless explicitly opted in.
- Log structured events with redaction rules for secrets and URLs.

---

## 4) Versioning and compatibility policy (TypeScript-only repository)

### 4.1 Contract versioning

- Contract major version is encoded in path: `/v1/...`.
- Backward-compatible additions allowed in `v1`:
  - New optional request fields
  - New optional response fields
  - New non-breaking enum values only if client is resilient to unknown values
- Breaking changes require `/v2/...`.

### 4.2 TypeScript boundary rules in this repo

To keep this repository TypeScript-only and safe:
- Integration should be through typed HTTP client interfaces and JSON schemas only.
- No native CAD SDK binaries, Python bridges, or platform-specific runtime dependencies in this repo.
- Unknown/forward fields from external service must be preserved or safely ignored, never crash core MCP flows.

### 4.3 Runtime validation and generated types

- Validate all external service responses at runtime (schema validation before use).
- Keep shared TypeScript types near integration boundary (e.g., `src/integrations/gutsy/types.ts`).
- Treat external API as untrusted input; parse, narrow, then map to MCP tool response types.

### 4.4 Change management

- Patch releases: documentation clarifications or non-breaking client hardening.
- Minor releases: backward-compatible endpoint/field support in `/v1`.
- Major releases: introducing `/v2` or removing deprecated `/v1` behavior.

When external service introduces breaking changes, pin client behavior to known contract version until migration is complete.

---

## Appendix: recommended TypeScript interface shapes (illustrative)

```ts
export interface JobCreateAccepted {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  createdAt: string;
  estimatedCompletionSeconds?: number;
  statusUrl: string;
  resultUrl: string;
}

export interface ErrorResponse {
  error: {
    code:
      | 'INVALID_ARGUMENT'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
      | 'RATE_LIMITED'
      | 'UPSTREAM_TIMEOUT'
      | 'SERVICE_UNAVAILABLE'
      | 'INTERNAL';
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}
```

This appendix is non-normative; the normative contract is defined by the HTTP sections above.
