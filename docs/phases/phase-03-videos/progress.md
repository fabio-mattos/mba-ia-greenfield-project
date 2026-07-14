# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 6/9 completed

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
- **Status:** completed
- **Tests:** 1 module compile + 3 ffmpeg integration passing
- **Observations:**
  - `WorkerModule` precisa registrar `Video`, `Channel` E `User` em `TypeOrmModule.forFeature` — o grafo de relações (`Video.channel` → `Channel.user`) só resolve se todas as entidades da cadeia estiverem registradas em algum `forFeature` importado pelo módulo; faltando uma, o TypeORM falha ao montar os metadados com "Entity metadata for X was not found".
  - Testes que dependem do binário `ffmpeg` real (este arquivo e o do worker consumer na próxima SI) rodam via `docker compose exec worker ...`, não `nestjs-api` (que não tem FFmpeg instalado, por design — videos/TD-04). O restante da suíte roda em `nestjs-api` como antes.
  - Container `worker` roda o processo continuamente (`command: npm run start:worker`), ao contrário de `nestjs-api` que fica ocioso por padrão — o worker é um serviço de background que precisa estar de fato ativo para a fila ser consumida.

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
