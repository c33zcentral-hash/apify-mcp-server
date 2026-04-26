/**
 * TypeScript types for Gutsy AI Pro integration
 * Based on the interop contract defined in docs/interop/gutsy-ai-pro-contract.md
 */

// Base job response interface
export type JobCreateAccepted = {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  createdAt: string;
  estimatedCompletionSeconds?: number;
  statusUrl: string;
  resultUrl: string;
}

// Error response interface
export type ErrorResponse = {
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

// CAD Generation Request
export type CadJobCreateRequest = {
  prompt: string;
  units: 'mm' | 'cm' | 'in';
  format: 'step' | 'iges' | 'x_t';
  constraints?: {
    maxBoundingBox?: {
      x: number;
      y: number;
      z: number;
    };
    minWallThickness?: number;
  };
  quality?: 'draft' | 'balanced' | 'high';
  metadata?: Record<string, string>;
}

// CAD Job Status Response
export type CadJobStatusResponse = {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  progress?: number;
  stage?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

// CAD Job Result Response
export type CadJobResultResponse = {
  jobId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'expired';
  createdAt: string;
  completedAt?: string;
  outputs?: {
    kind: 'cad';
    format: 'step' | 'iges' | 'x_t';
    sizeBytes: number;
    downloadUrl: string;
    expiresAt: string;
  }[];
  error?: string;
}

// Mesh Generation Request
export type MeshJobCreateRequest = {
  prompt: string;
  inputFormat: 'step' | 'iges' | 'x_t' | 'obj' | 'stl';
  inputFileUrl: string;
  outputFormats: ('obj' | 'glb' | 'stl' | 'ply' | 'fbx')[];
  mesh: {
    targetPolycount: number;
    remeshMode: 'adaptive' | 'uniform';
  };
  quality?: 'draft' | 'balanced' | 'high';
  metadata?: Record<string, string>;
}

// Mesh Job Status Response (same as CAD)
export type MeshJobStatusResponse = CadJobStatusResponse;

// Mesh Job Result Response
export type MeshJobResultResponse = {
  jobId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'expired';
  createdAt: string;
  completedAt?: string;
  outputs?: {
    kind: 'mesh';
    format: 'obj' | 'glb' | 'stl' | 'ply' | 'fbx';
    sizeBytes: number;
    downloadUrl: string;
    expiresAt: string;
  }[];
  error?: string;
}

// Job Cancellation Response
export type JobCancelResponse = {
  jobId: string;
  status: 'cancelled' | 'running' | 'completed';
}

// Common headers
export type RequestHeaders = {
  'Content-Type': 'application/json';
  'Accept': 'application/json';
  'Authorization'?: string;
  'X-Idempotency-Key': string;
  'X-Request-Id'?: string;
}

export type ResponseHeaders = {
  'X-Request-Id': string;
  'X-Contract-Version': string;
  'Retry-After'?: string;
}

// Configuration for Gutsy AI Pro client
export type GutsyClientConfig = {
  baseUrl: string;
  apiToken?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}
