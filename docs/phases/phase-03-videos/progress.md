# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 5/9 completed

### SI-03.1 — Object Storage Module (MinIO)
- **Status:** completed
- **Tests:** 6 passing (storage.module.spec.ts, storage.service.integration-spec.ts)
- **Observations:**
  - context7 MCP indisponível neste ambiente; docs de `@aws-sdk/client-s3` obtidas via WebSearch (já registrado em library-refs.md).

### SI-03.2 — Queue Module (BullMQ + Redis)
- **Status:** completed
- **Tests:** 1 passing (queue.module.integration-spec.ts)
- **Observations:** none

### SI-03.3 — Video Entity & Migration
- **Status:** completed
- **Tests:** 7 passing (video.entity.integration-spec.ts) + migrations.integration-spec.ts atualizado (3 migrações)
- **Observations:**
  - Corrigido bug pré-existente em `migrations.integration-spec.ts` (DDL concorrente via `Promise.all` causava deadlock/enum já-existente intermitente) — trocado para drops sequenciais.
  - Corrigido timeout pré-existente em `auth.service.integration-spec.ts` e nos specs e2e (bootstrap do AppModule completo excede os 5s padrão do Jest neste ambiente Docker/Windows) — bump para 20s.

### SI-03.4 — Upload Initiation
- **Status:** completed
- **Tests:** 3 unit + 1 integration + 4 e2e passing
- **Observations:**
  - Removido `@Max` do `class-validator` em `InitiateUploadDto.fileSizeBytes` — validar o limite de 10GB ali produzia `VALIDATION_ERROR` genérico em vez do código de domínio `VIDEO_FILE_TOO_LARGE` exigido pelo Catálogo de Erros do plano; o limite é aplicado só em `VideosService`.

### SI-03.5 — Upload Part URLs, Complete Upload & Enfileiramento
- **Status:** completed
- **Tests:** 4 integration + 4 e2e passing
- **Observations:**
  - `npm run test:e2e` sem `--runInBand` roda os arquivos `*.e2e-spec.ts` em paralelo (workers distintos), causando corrida real no banco compartilhado (FK violations, "no channel"). Sempre invocar com `-- --runInBand`, conforme já indicado no `CLAUDE.md` do nestjs-project.

### SI-03.6 — Worker Bootstrap & FFmpeg Service
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.7 — Video Processing Consumer
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.8 — Video Detail Endpoint & Access Control
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.9 — Streaming & Download Endpoints
- **Status:** pending
- **Tests:** —
- **Observations:** none
