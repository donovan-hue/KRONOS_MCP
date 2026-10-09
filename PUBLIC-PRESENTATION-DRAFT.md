# KRONOS MCP

A read-only Model Context Protocol server connecting compatible clients to the existing KRONOS API over stdio.

## Current tools

- `kronos_contracts`: describes declared tool contracts.
- `kronos_me`: retrieves the authenticated service identity and permissions.
- `kronos_status`: retrieves a compact service health summary.
- `kronos_health`: checks the upstream health endpoint.

The three protected tools require their respective permissions. All four tools are read-only.

## Verification

The local test suite passed 65 tests, including authorization, tool contracts, error handling, and stdio execution with isolated HTTP fixtures.

Live verification is separate from local tests. Neither local tests nor live verification constitutes a security certification.

## Scope

This is an initial integration foundation, not a complete AI platform. It does not currently provide AI content generation, arbitrary third-party connectors, data publishing, or data deletion.

Review the existing README for installation and configuration instructions.

Never commit credentials, tokens, or environment files.

Project: https://github.com/donovan-hue/KRONOS_MCP
