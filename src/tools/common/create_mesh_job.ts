/**
 * Tool for creating mesh generation jobs via Gutsy AI Pro integration
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import log from '@apify/log';

import { GutsyClient } from '../../integrations/gutsy/client.js';
import type { MeshJobCreateRequest } from '../../integrations/gutsy/types.js';
import type { InternalToolArgs, ToolEntry, ToolInputSchema } from '../../types.js';
import { compileSchema } from '../../utils/ajv.js';
import { buildMCPResponse } from '../../utils/mcp.js';

/**
 * Zod schema for create-mesh-job tool arguments
 */
const createMeshJobArgs = z.object({
    prompt: z.string()
        .min(1)
        .describe('Natural language description of the desired mesh output'),
    inputFormat: z.enum(['step', 'iges', 'x_t', 'obj', 'stl'])
        .describe('Format of the input file'),
    inputFileUrl: z.string()
        .url()
        .describe('URL of the input file to process'),
    outputFormats: z.array(z.enum(['obj', 'glb', 'stl', 'ply', 'fbx']))
        .min(1)
        .describe('Desired output formats for the mesh'),
    mesh: z.object({
        targetPolycount: z.number()
            .min(100)
            .describe('Target polygon count for the mesh'),
        remeshMode: z.enum(['adaptive', 'uniform'])
            .describe('Remeshing mode'),
    }).describe('Mesh generation parameters'),
    quality: z.enum(['draft', 'balanced', 'high'])
        .optional()
        .default('balanced')
        .describe('Quality level for the mesh generation'),
});

export const createMeshJobTool: ToolEntry = Object.freeze({
    type: 'internal',
    name: 'create-mesh-job',
    description: 'Create a mesh generation job using Gutsy AI Pro service',
    inputSchema: z.toJSONSchema(createMeshJobArgs) as ToolInputSchema,
    ajvValidate: compileSchema(z.toJSONSchema(createMeshJobArgs)),
    call: async (toolArgs: InternalToolArgs) => {
        let prompt: string | undefined;

        try {
            const parsed = createMeshJobArgs.parse(toolArgs);
            prompt = parsed.prompt;
            const { inputFormat, inputFileUrl, outputFormats, mesh, quality } = parsed;

            // Get configuration from environment variables
            const baseUrl = process.env.GUTSY_AI_PRO_BASE_URL || 'http://127.0.0.1:8787/v1';
            const apiToken = process.env.GUTSY_AI_PRO_API_TOKEN;

            if (!apiToken && baseUrl.includes('gutsy-ai-pro.example.com')) {
                return buildMCPResponse({
                    texts: ['Error: GUTSY_AI_PRO_API_TOKEN is required for hosted deployments'],
                    isError: true,
                });
            }

            const client = new GutsyClient({
                baseUrl,
                apiToken,
            });

            const request: MeshJobCreateRequest = {
                prompt,
                inputFormat,
                inputFileUrl,
                outputFormats,
                mesh,
                quality,
            };

            const idempotencyKey = randomUUID();
            const result = await client.createMeshJob(request, idempotencyKey);

            log.info('Created mesh job', { jobId: result.jobId, prompt: prompt.substring(0, 50) });

            return buildMCPResponse({
                texts: [
                    `Mesh job created successfully`,
                    `Job ID: ${result.jobId}`,
                    `Status: ${result.status}`,
                    `Created at: ${result.createdAt}`,
                    result.estimatedCompletionSeconds ? `Estimated completion: ${result.estimatedCompletionSeconds} seconds` : '',
                    `Status URL: ${result.statusUrl}`,
                    `Result URL: ${result.resultUrl}`,
                ].filter(Boolean),
                structuredContent: {
                    jobId: result.jobId,
                    status: result.status,
                    createdAt: result.createdAt,
                    estimatedCompletionSeconds: result.estimatedCompletionSeconds,
                    statusUrl: result.statusUrl,
                    resultUrl: result.resultUrl,
                },
            });
        } catch (error) {
            const errorPrompt = prompt || 'unknown prompt';
            log.error('Failed to create mesh job', { error, prompt: errorPrompt });
            return buildMCPResponse({
                texts: [`Error: ${error instanceof Error ? error.message : 'Failed to create mesh job'}`],
                isError: true,
            });
        }
    },
} as const);
