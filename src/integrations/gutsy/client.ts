/**
 * HTTP client for Gutsy AI Pro integration
 * Implements the interop contract defined in docs/interop/gutsy-ai-pro-contract.md
 */

import log from '@apify/log';

import type {
    CadJobCreateRequest,
    CadJobResultResponse,
    CadJobStatusResponse,
    ErrorResponse,
    GutsyClientConfig,
    JobCancelResponse,
    JobCreateAccepted,
    MeshJobCreateRequest,
    MeshJobResultResponse,
    RequestHeaders,
} from './types.js';

export class GutsyClient {
    private config: Required<GutsyClientConfig>;

    constructor(config: GutsyClientConfig) {
        this.config = {
            baseUrl: config.baseUrl,
            apiToken: config.apiToken || '',
            timeout: config.timeout || 30000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
        };
    }

    /**
   * Create a CAD generation job
   */
    async createCadJob(request: CadJobCreateRequest, idempotencyKey: string): Promise<JobCreateAccepted> {
        return this.makeRequest<JobCreateAccepted>('POST', '/cad/jobs', request, {
            'X-Idempotency-Key': idempotencyKey,
        });
    }

    /**
   * Get CAD job status
   */
    async getCadJobStatus(jobId: string): Promise<CadJobStatusResponse> {
        return this.makeRequest<CadJobStatusResponse>('GET', `/cad/jobs/${jobId}`);
    }

    /**
   * Get CAD job result
   */
    async getCadJobResult(jobId: string): Promise<CadJobResultResponse> {
        return this.makeRequest<CadJobResultResponse>('GET', `/cad/jobs/${jobId}/result`);
    }

    /**
   * Create a mesh generation job
   */
    async createMeshJob(request: MeshJobCreateRequest, idempotencyKey: string): Promise<JobCreateAccepted> {
        return this.makeRequest<JobCreateAccepted>('POST', '/mesh/jobs', request, {
            'X-Idempotency-Key': idempotencyKey,
        });
    }

    /**
   * Get mesh job status
   */
    async getMeshJobStatus(jobId: string): Promise<CadJobStatusResponse> {
        return this.makeRequest<CadJobStatusResponse>('GET', `/mesh/jobs/${jobId}`);
    }

    /**
   * Get mesh job result
   */
    async getMeshJobResult(jobId: string): Promise<MeshJobResultResponse> {
        return this.makeRequest<MeshJobResultResponse>('GET', `/mesh/jobs/${jobId}/result`);
    }

    /**
   * Cancel a job (CAD or mesh)
   */
    async cancelJob(jobId: string): Promise<JobCancelResponse> {
        return this.makeRequest<JobCancelResponse>('POST', `/jobs/${jobId}/cancel`);
    }

    /**
   * Make HTTP request with retry logic and error handling
   */
    private async makeRequest<T>(
        method: string,
        path: string,
        body?: unknown,
        additionalHeaders: Partial<RequestHeaders> = {},
    ): Promise<T> {
        const url = `${this.config.baseUrl}${path}`;
        const requestId = this.generateRequestId();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Request-Id': requestId,
            'X-Contract-Version': '1.0',
            ...additionalHeaders,
        };

        if (this.config.apiToken) {
            headers.Authorization = `Bearer ${this.config.apiToken}`;
        }

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                const responseText = await response.text();
                let responseData: unknown;

                try {
                    responseData = JSON.parse(responseText);
                } catch {
                    throw new Error(`Invalid JSON response: ${responseText}`);
                }

                // Handle error responses
                if (!response.ok) {
                    const errorResponse = responseData as ErrorResponse;
                    const error = new Error(
                        `Gutsy AI Pro API error: ${errorResponse.error?.message || 'Unknown error'}`,
                    );
                    (error as { statusCode?: number }).statusCode = response.status;
                    (error as { errorCode?: string }).errorCode = errorResponse.error?.code;
                    (error as { retryable?: boolean }).retryable = errorResponse.error?.retryable;
                    (error as { retryAfter?: string | null }).retryAfter = response.headers.get('Retry-After');
                    throw error;
                }

                return responseData as T;
            } catch (error) {
                lastError = error as Error;

                // Don't retry on client errors (4xx) except 429 (rate limit)
                if (error instanceof Error && (error as { statusCode?: number }).statusCode) {
                    const { statusCode } = (error as { statusCode?: number });
                    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
                        throw error;
                    }
                }

                // Don't retry on the last attempt
                if (attempt === this.config.maxRetries) {
                    break;
                }

                // Calculate retry delay with exponential backoff and jitter
                const baseDelay = this.config.retryDelay * 2 ** attempt;
                const jitter = Math.random() * 0.3 * baseDelay; // Up to 30% jitter
                const retryDelay = baseDelay + jitter;

                // If we have a Retry-After header, use that instead
                const { retryAfter } = (error as { retryAfter?: string });
                if (retryAfter) {
                    const delay = parseInt(retryAfter, 10) * 1000;
                    if (!Number.isNaN(delay) && delay > 0) {
                        await this.sleep(delay);
                        continue;
                    }
                }

                log.info(`Retrying request to ${path} after ${retryDelay}ms (attempt ${attempt + 1}/${this.config.maxRetries})`, {
                    requestId,
                    error: error instanceof Error ? error.message : String(error),
                });

                await this.sleep(retryDelay);
            }
        }

        throw lastError || new Error(`Failed to complete request to ${path} after ${this.config.maxRetries} retries`);
    }

    /**
   * Generate a unique request ID
   */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
   * Sleep for the specified number of milliseconds
   */
    private async sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
    }
}
