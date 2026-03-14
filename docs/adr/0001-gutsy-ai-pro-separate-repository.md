# ADR 0001: Keep Gutsy AI Pro in a dedicated repository

- **Status:** Accepted
- **Date:** 2026-03-14

## Context

This repository hosts `@apify/actors-mcp-server`, an MCP server package focused on exposing Apify Actors and related MCP tooling.
Its implementation, tooling, and runtime model are centered on a Node.js + TypeScript server.

A proposal was raised to add Gutsy AI Pro capabilities directly into this codebase.
Gutsy AI Pro targets a different runtime/toolchain profile, including Python and Windows-centric CAD/3D dependencies (for example Blender/OpenSCAD style workflows).

## Decision

Gutsy AI Pro is treated as a separate product and must live in a dedicated repository.

## Rationale

1. **Scope clarity**
   - `@apify/actors-mcp-server` should remain focused on MCP tooling for Apify Actors.
   - Expanding this package into a full Python/CAD runtime would blur ownership and increase maintenance risk.

2. **Runtime stack mismatch**
   - Current stack: Node.js/TypeScript MCP server.
   - Proposed Gutsy AI Pro stack: Python + Windows/CAD toolchain.
   - Combining these stacks in one package would complicate CI/CD, dependency management, local development, and operational support.

3. **Product boundary and release safety**
   - Separate repositories allow independent versioning, release cadence, and incident isolation.
   - This reduces blast radius for regressions across unrelated runtime concerns.

## Integration boundary

This repository may integrate with the future Gutsy AI Pro / 3D system **only through stable MCP or API contracts**.

Specifically:
- Allowed: calling external services/tools over MCP or HTTP APIs.
- Not allowed: embedding Python/Blender/OpenSCAD runtime or toolchain directly inside `@apify/actors-mcp-server`.

## Migration note for stakeholders

When planning work items, do **not** implement Python, Blender, OpenSCAD, or Windows CAD runtime features directly in this package.

Instead:
- Build and maintain those capabilities in the dedicated Gutsy AI Pro repository.
- Expose required functionality via explicit MCP/API contracts consumed by this server.
