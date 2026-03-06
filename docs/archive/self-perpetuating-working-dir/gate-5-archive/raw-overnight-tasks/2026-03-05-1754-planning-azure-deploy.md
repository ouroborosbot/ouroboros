# Planning: Deploy Ouroboros to Azure App Service

**Status**: IN_PROGRESS
**Created**: 2026-03-05

## Goal
Deploy Ouroboros Teams bot to Azure App Service in `rg-arimendelow-fhl26`, configure OAuth connections, upload manifest to production tenant, and verify end-to-end functionality.

## Scope

### In Scope
- Provision and deploy to Azure App Service via existing scripts
- Configure app secrets (provider config, OAuth connection names)
- Set up OAuth connections (Graph + ADO) on Bot Registration
- Upload deployed manifest to Teams Admin Center
- Smoke-test chat and OAuth flows
- Merge `ouroboros/deployment-readiness` to main

### Out of Scope
- Writing new deploy scripts (already done)
- Modifying managed identity support code (already done)
- Creating bot registration or managed identity (already exist)
- CI/CD pipeline setup
- Monitoring/alerting setup
- Custom domain or SSL configuration

## Completion Criteria
- [x] App Service provisioned and running (S1 Linux, Node 22, West Central US)
- [x] Managed identity attached, bot endpoint updated
- [x] App secrets configured (provider config + OAuth connection names)
- [ ] OAuth connections created on Bot Registration (Graph + ADO)
- [x] Deployed manifest sideloaded in Copilot
- [x] Basic chat works (no OAuth needed)
- [ ] OAuth flows work (Graph + ADO)
- [ ] Branch merged to main

## Code Coverage Requirements
N/A -- this is an ops/deployment task, not a code task.

## Open Questions
- (none)

## Decisions Made
- Using existing deploy scripts (`scripts/deploy-azure.sh`, `scripts/set-app-secrets.sh`)
- B1 Linux App Service Plan with Node 22
- Managed identity auth (client ID: `c404d5a9-10ae-4b06-afd5-18964f3d857e`)
- Resource group: `rg-arimendelow-fhl26` (eastus2)

## Context / References
- Bot Registration: `OuroborosBot` in `rg-arimendelow-fhl26`
- App Registration ID: `93b3681b-1565-4ff7-bf1f-1d370e247604`
- Tenant: `72f988bf-86f1-41af-91ab-2d7cd011db47`
- Subscription: `4c2988ee-571a-4995-9ab0-cc68f38aaf2b`
- Deploy script: `scripts/deploy-azure.sh`
- Secrets script: `scripts/set-app-secrets.sh`
- Startup script: `scripts/startup.sh`
- Deployed manifest: `ouroboros/manifest-deployed/`, `manifest.ouroboros.deployed.zip`
- Branch: `ouroboros/deployment-readiness`

## Notes
Steps 1-3 (create manifest, add managed identity support, write deploy scripts) are already complete.

## Progress Log
- 2026-03-05 Created
- 2026-03-05 App Service deployed (S1, West Central US — B1 had zero quota)
- 2026-03-05 Fixed PORT env var (Azure probes 8080, app was on 3978)
- 2026-03-05 Fixed MODULE_NOT_FOUND (enabled SCM_DO_BUILD_DURING_DEPLOYMENT)
- 2026-03-05 Bot live and responding via Copilot
