---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:32-03:00"
  docs/phases/phase-03-videos/context.md: "2026-07-13T19:58:44-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-07-13T20:01:07-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar upload direto ao armazenamento de arquivos de vídeo de até 10GB (via multipart presigned), processamento assíncrono automático (extração de metadados + thumbnail via FFmpeg), URL única por vídeo, e reprodução via streaming/download — com armazenamento de objetos, fila e worker reais subindo via Docker Compose junto com o backend.

---

## Step Implementations

### SI-03.1 — Object Storage Module (MinIO)

**Description:** Sobe o serviço de armazenamento de objetos (MinIO, S3-compatible) no Compose e implementa o `StorageModule`/`StorageService` que encapsula todas as operações de armazenamento usadas pelo resto da fase (multipart upload, presigned GET, bootstrap do bucket).

**Technical actions:**

- Adicionar serviço `minio` a `nestjs-project/compose.yaml` (imagem `minio/minio:latest`, comando `server /data --console-address ":9001"`, portas `9000`/`9001`, env `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, healthcheck via `curl -f http://localhost:9000/minio/health/live`, volume nomeado `minio_data`); adicionar `src/config/storage.config.ts` (`registerAs('storage', ...)`) com host/porta/bucket/credenciais lidos de env, e as novas chaves em `src/config/env.validation.ts` (Joi).
- Instalar `@aws-sdk/client-s3@^3.700.0` e `@aws-sdk/s3-request-presigner@^3.700.0` (per `videos/TD-02`, `videos/TD-06`).
- Implementar `StorageModule` (`src/storage/storage.module.ts`) + `StorageService` (`src/storage/storage.service.ts`): construção do `S3Client` (`endpoint` = host do serviço Compose `minio`, `forcePathStyle: true`, credenciais do config); `onModuleInit` chama `ensureBucketExists()` (HeadBucket → CreateBucket se ausente) para o bucket único definido em `videos/TD-03`.
- Implementar em `StorageService`: `createMultipartUpload(key)`, `getUploadPartUrl(key, uploadId, partNumber)`, `completeMultipartUpload(key, uploadId, parts)`, `abortMultipartUpload(key, uploadId)`, `getObjectStream(key)`, `getDownloadUrl(key, { attachment?, filename? })` (presigned GET, com `ResponseContentDisposition` quando `attachment`), e os helpers de chave `videoKey(videoId, ext)` / `thumbnailKey(videoId)` (prefixo `videos/{videoId}/...` por `videos/TD-03`).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| storage.service.integration-spec.ts | Integration | bucket é criado automaticamente; ciclo completo de multipart (create → part url → complete) contra MinIO real; `getDownloadUrl` retorna URL válida e resolvível |
| storage.module.spec.ts | Unit | módulo compila com a configuração |

**Dependencies:** None

**Acceptance criteria:**

- Subindo `docker compose up -d`, o serviço `minio` fica saudável e o bucket configurado existe automaticamente após o boot da API.
- `StorageService.createMultipartUpload` + `getUploadPartUrl` + `completeMultipartUpload` completam um upload multipart real contra o MinIO do Compose, sem qualquer parte do arquivo passar pelo processo da API.
- `StorageService.getDownloadUrl` retorna uma URL pré-assinada que, ao ser requisitada diretamente, retorna o objeto (ou 206 com `Range`).

---

### SI-03.2 — Queue Module (BullMQ + Redis)

**Description:** Sobe o Redis no Compose e registra a fila `video-processing` via `@nestjs/bullmq`, usada para desacoplar o processamento de vídeo do ciclo de requisição/resposta.

**Technical actions:**

- Adicionar serviço `redis` a `compose.yaml` (imagem `redis:7-alpine`, healthcheck `redis-cli ping`, volume nomeado `redis_data` com AOF habilitado via `command: redis-server --appendonly yes`); adicionar `src/config/queue.config.ts` (`registerAs('queue', ...)`) com host/porta lidos de env (host = nome do serviço Compose `redis`, nunca `localhost`), e validação Joi correspondente.
- Instalar `@nestjs/bullmq@^11.0.4`, `bullmq@^5.80.0`, `ioredis@^5.10.0`.
- Implementar `QueueModule` (`src/queue/queue.module.ts`): `BullModule.forRootAsync` (conexão a partir do `queueConfig`) + `BullModule.registerQueue({ name: 'video-processing' })`, exportado para ser reaproveitado tanto pela API (produtor) quanto pelo worker (consumidor).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| queue.module.integration-spec.ts | Integration | conecta ao Redis real do Compose; um job adicionado à fila é lido de volta (`queue.getJob`) |

**Dependencies:** None

**Acceptance criteria:**

- Subindo `docker compose up -d`, o serviço `redis` fica saudável.
- Um job adicionado à fila `video-processing` via `Queue.add` é persistido no Redis real do Compose e pode ser recuperado por id.

---

### SI-03.3 — Video Entity & Migration

**Description:** Define a entidade `Video` (ligada ao `Channel`) e a migração que cria a tabela `videos`, com o ciclo de status (`videos/TD-07`) e os campos de armazenamento/metadados decididos em `videos/TD-03`/`TD-04`.

**Technical actions:**

- Definir `VideoStatus` enum (`draft`, `processing`, `ready`, `failed`) e a entidade `Video` (`src/videos/entities/video.entity.ts`) per o Modelo de Dados abaixo, com `@ManyToOne(() => Channel)`.
- Criar `VideosModule` mínimo (`src/videos/videos.module.ts`) registrando `TypeOrmModule.forFeature([Video])`, e importá-lo em `AppModule`.
- Gerar a migração `<timestamp>-CreateVideos.ts` (`npm run migration:generate` contra o `db` do Compose) criando a tabela `videos` com FK para `channels`, coluna de status (enum/check), e os índices do Modelo de Dados.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| video.entity.integration-spec.ts | Integration | FK obrigatória para `channels`; `status` default `draft`; enum rejeita valores inválidos; campos de metadados aceitam `NULL` |

**Dependencies:** None

**Acceptance criteria:**

- Rodando a migração contra o `db` do Compose, a tabela `videos` é criada com FK válida para `channels` e todas as colunas do Modelo de Dados.
- Inserir uma linha sem `channel_id` viola a constraint de FK/NOT NULL.

---

### SI-03.4 — Upload Initiation (pré-cadastro como rascunho + multipart create)

**Description:** Endpoint que pré-cadastra o vídeo como rascunho e inicia o upload multipart, entregando ao cliente o `uploadId` necessário para o restante do fluxo.

**Technical actions:**

- Criar `InitiateUploadDto` (`title`, `originalFileName`, `fileSizeBytes`, `mimeType`) com `class-validator` — `fileSizeBytes` limitado a 10GB (`10 * 1024**3` bytes); mimeType restrito a `video/*`.
- Implementar `VideosService.initiateUpload(channelId, dto)`: valida o tamanho declarado (lança `VIDEO_FILE_TOO_LARGE` se exceder o limite), cria a linha `Video` (`status: draft`, `originalFileKey` derivado do novo id + extensão do `originalFileName`), chama `StorageService.createMultipartUpload(key)` e persiste o `uploadId` retornado.
- Implementar `VideosController` (`POST /videos/upload/initiate`, autenticado, resolve o canal do usuário corrente reaproveitando o padrão de `@CurrentUser()`/resolução de canal já usado em `channels/`), decorators `@nestjs/swagger`, resposta `201` com `{ videoId, uploadId }`.
- Adicionar `VIDEO_FILE_TOO_LARGE` ao catálogo de erros do domínio, propagado pelo filtro de exceções já existente (`videos/TD-08`/convenção herdada da Fase 02).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| videos.service.spec.ts | Unit | validação de tamanho (branch de erro) e geração da chave de storage |
| videos.service.integration-spec.ts | Integration | linha `draft` persistida corretamente com `uploadId` real do MinIO |
| videos.e2e-spec.ts | E2E | `POST /videos/upload/initiate`: 201 com `videoId`+`uploadId`; 400 quando acima de 10GB; 401 sem autenticação |

**Dependencies:** SI-03.1, SI-03.3

**Acceptance criteria:**

- `POST /videos/upload/initiate` com corpo válido retorna `201` com `{ videoId, uploadId }`, e a linha correspondente existe no banco com `status: draft`.
- `POST /videos/upload/initiate` com `fileSizeBytes` acima de 10GB retorna `400` com `VIDEO_FILE_TOO_LARGE`.
- `POST /videos/upload/initiate` sem token de acesso retorna `401`.

---

### SI-03.5 — Upload Part URLs, Complete Upload & Enfileiramento

**Description:** Endpoints para obter URLs pré-assinadas por parte e finalizar o upload multipart, disparando o processamento assíncrono ao completar.

**Technical actions:**

- Implementar `POST /videos/:id/upload/parts/:partNumber` (dono do vídeo apenas): exige `status: draft` com `uploadId` presente (senão `VIDEO_UPLOAD_NOT_IN_PROGRESS`, 409); retorna a URL pré-assinada da parte via `StorageService.getUploadPartUrl`.
- Criar `CompleteUploadDto` (`parts: { partNumber, etag }[]`) e implementar `POST /videos/:id/upload/complete` (dono apenas): chama `StorageService.completeMultipartUpload`, marca `status: processing`, e enfileira o job `process-video` (`{ videoId }`) na fila `video-processing` com `attempts: 3` e `backoff: { type: 'exponential', delay: 5000 }` (per `videos/TD-01`/`TD-07`).
- Injetar a fila em `VideosService` via `@InjectQueue('video-processing')`.
- Tratar idempotência: completar um upload que não está mais em `draft` retorna `VIDEO_UPLOAD_ALREADY_COMPLETED` (409).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| videos.service.integration-spec.ts | Integration | complete flips status para `processing` e enfileira um job real (verificado via `Queue.getJob`) |
| videos.e2e-spec.ts | E2E | fluxo feliz de part-url + complete; 409 ao completar duas vezes; 403/404 para não-dono |

**Dependencies:** SI-03.2, SI-03.4

**Acceptance criteria:**

- `POST /videos/:id/upload/parts/:n` do dono retorna uma URL pré-assinada válida enquanto o vídeo está `draft`.
- `POST /videos/:id/upload/complete` do dono flips o vídeo para `processing` e um job `process-video` correspondente existe na fila `video-processing`.
- Completar o mesmo upload uma segunda vez retorna `409` com `VIDEO_UPLOAD_ALREADY_COMPLETED`.
- Requisições de um usuário que não é dono do vídeo retornam `404`.

---

### SI-03.6 — Worker Bootstrap & FFmpeg Service

**Description:** Cria o processo/container separado do video worker e o serviço que encapsula as chamadas ao FFmpeg/ffprobe (extração de metadados + geração de thumbnail).

**Technical actions:**

- Criar `Dockerfile.worker` (mesma base do `Dockerfile.dev`, adicionando `apt-get install -y ffmpeg`) e o serviço `worker` em `compose.yaml` (mesmo contexto de build, `command: node dist/worker/main.js` em produção / `ts-node src/worker/main.ts` em dev, `depends_on` de `db`, `redis` e `minio` saudáveis).
- Criar `src/worker/main.ts`: bootstrap via `NestFactory.createApplicationContext(WorkerModule)` (sem HTTP listener).
- Criar `WorkerModule` (`src/worker/worker.module.ts`) importando `ConfigModule`, `TypeOrmModule` (mesma configuração de datasource da API), `StorageModule`, `QueueModule` e o módulo de vídeos (para o `Video` repository).
- Instalar `fluent-ffmpeg@^2.1.3` e `@types/fluent-ffmpeg`; implementar `FfmpegService` (`src/worker/ffmpeg.service.ts`) com `extractMetadata(filePath)` (retorna `durationInSeconds`, `width`, `height`, `codec`, `container`, `bitrateKbps` per `videos/TD-04`) e `generateThumbnail(filePath, outputPath)` (1 frame, `timemarks: ['10%']`).

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| ffmpeg.service.integration-spec.ts | Integration | roda `ffprobe`/`ffmpeg` reais (imagem do worker) contra um vídeo de fixture pequeno; valida os campos de metadados e a geração do arquivo de thumbnail |

**Dependencies:** SI-03.1, SI-03.2, SI-03.3

**Acceptance criteria:**

- Subindo `docker compose up -d`, o serviço `worker` inicia e conecta a `db`, `redis` e `minio`.
- `FfmpegService.extractMetadata` retorna os 6 campos de metadados de `videos/TD-04` para um vídeo de fixture real.
- `FfmpegService.generateThumbnail` produz um arquivo de imagem válido no caminho informado.

---

### SI-03.7 — Video Processing Consumer

**Description:** Consumidor da fila que executa o processamento de fato: baixa o arquivo original, extrai metadados, gera thumbnail, publica no storage e atualiza o status do vídeo — incluindo o caminho de falha.

**Technical actions:**

- Implementar `VideoProcessingConsumer` (`src/worker/video-processing.consumer.ts`, `@Processor('video-processing')` estendendo `WorkerHost`): em `process(job)`, baixa o arquivo original (`StorageService.getObjectStream` → arquivo temporário local), roda `FfmpegService.extractMetadata` + `generateThumbnail`, envia a thumbnail para o storage (`StorageService` + `thumbnailKey`), atualiza a linha `Video` (campos de metadados, `thumbnailKey`, `status: ready`), e remove os arquivos temporários.
- Implementar o caminho de falha: exceções não tratadas propagam para o BullMQ (que reaplica `attempts`/`backoff` configurados em SI-03.5); um handler `@OnWorkerEvent('failed')` marca o vídeo como `failed` (com `failureReason`) somente quando `job.attemptsMade >= job.opts.attempts` (todas as tentativas exauridas).
- Tornar a atualização final idempotente (upsert-style) para tolerar reprocessamento de um job já concluído sem efeitos colaterais duplicados.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| video-processing.consumer.spec.ts | Unit | lógica de branching com storage/ffmpeg/repositório mockados |
| video-processing.consumer.integration-spec.ts | Integration | execução completa contra MinIO/Redis/DB reais do Compose: `draft`→`processing`→`ready` com metadados e thumbnail persistidos; caso de falha forçada termina em `failed` após esgotar as tentativas |

**Dependencies:** SI-03.5, SI-03.6

**Acceptance criteria:**

- Um vídeo que completa o upload (SI-03.5) é automaticamente processado pelo worker e transita para `status: ready`, com `durationInSeconds`, `width`, `height`, `codec`, `container`, `bitrateKbps` e `thumbnailKey` preenchidos.
- Um arquivo de thumbnail existe no storage na chave esperada (`videos/{id}/thumbnail.jpg`) após o processamento.
- Um processamento que falha em todas as tentativas configuradas deixa o vídeo em `status: failed` com `failureReason` preenchido.

---

### SI-03.8 — Video Detail Endpoint & Access Control

**Description:** Endpoint mínimo para consultar um vídeo (incluindo seu status), com a regra de acesso decidida em `videos/TD-08`: dono vê em qualquer status, os demais só quando `ready`.

**Technical actions:**

- Implementar `GET /videos/:id` como rota pública (`@Public()`), com resolução best-effort do usuário autenticado (decodifica o `Authorization` header quando presente, reaproveitando o `JwtService` já configurado — sem exigir token).
- Implementar `VideosService.findForViewer(id, viewerUserId?)`: se `status !== 'ready'`, exige que `viewerUserId` seja o dono do canal do vídeo (senão lança `VIDEO_NOT_FOUND`, 404 — esconde a existência); se `ready`, retorna para qualquer visitante.
- Criar `VideoResponseDto` (id, title, status, duração/metadados — `null` até `ready` —, createdAt), excluindo campos internos de storage (`originalFileKey`, `thumbnailKey`, `uploadId`).
- Adicionar `VIDEO_NOT_FOUND` ao catálogo de erros e decorators `@nestjs/swagger` no endpoint.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| videos.service.spec.ts | Unit | branch de visibilidade dono/não-dono |
| videos.e2e-spec.ts | E2E | dono vê o próprio vídeo em `draft`/`processing`/`failed`; anônimo ou outro usuário recebe 404 fora de `ready`; qualquer visitante recebe 200 quando `ready` |

**Dependencies:** SI-03.3

**Acceptance criteria:**

- `GET /videos/:id` pelo dono retorna `200` com o status atual, em qualquer estágio do ciclo de vida.
- `GET /videos/:id` por um usuário anônimo ou não-dono retorna `404` com `VIDEO_NOT_FOUND` enquanto o vídeo não está `ready`.
- `GET /videos/:id` por qualquer visitante retorna `200` quando o vídeo está `ready`.

---

### SI-03.9 — Streaming & Download Endpoints

**Description:** Entrega a reprodução via streaming e o download do vídeo através de redirecionamento para URL pré-assinada no MinIO (per `videos/TD-06`), reaproveitando a regra de visibilidade da SI-03.8.

**Technical actions:**

- Implementar `GET /videos/:id/stream` e `GET /videos/:id/download`, reaproveitando `VideosService.findForViewer` (mesma regra de visibilidade da SI-03.8) e adicionalmente exigindo `status === 'ready'` para qualquer visitante — incluindo o dono — senão `VIDEO_NOT_READY` (409).
- Em caso de sucesso, responder `302` redirecionando para `StorageService.getDownloadUrl(originalFileKey, { attachment: false })` em `/stream`, e `{ attachment: true, filename: originalFileName }` em `/download`.
- Adicionar decorators `@nestjs/swagger` (documentando a resposta `302`) e `VIDEO_NOT_READY` ao catálogo de erros.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| videos.e2e-spec.ts | E2E | `/stream` e `/download` redirecionam (302) para uma URL do MinIO quando `ready`; `409` quando não `ready`; `404` para não-dono fora de `ready` |

**Dependencies:** SI-03.1, SI-03.8

**Acceptance criteria:**

- `GET /videos/:id/stream` de um vídeo `ready` retorna `302` para uma URL pré-assinada do MinIO que, ao ser seguida com um header `Range`, responde `206 Partial Content`.
- `GET /videos/:id/download` de um vídeo `ready` retorna `302` para uma URL pré-assinada com `Content-Disposition: attachment`.
- Ambos os endpoints retornam `409` com `VIDEO_NOT_READY` quando o vídeo ainda não está `ready` (mesmo para o dono).

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | Identificador único usado diretamente na URL pública (`videos/TD-05`) |
| channel_id | uuid | FK → channels.id, NOT NULL | Dono do vídeo |
| title | varchar(255) | NOT NULL | Informado no início do upload |
| status | enum(`draft`,`processing`,`ready`,`failed`) | NOT NULL, default `draft` | Ciclo de vida per `videos/TD-07` |
| original_file_key | varchar(512) | NOT NULL | Chave no storage, `videos/{id}/original.<ext>` (`videos/TD-03`) |
| original_file_name | varchar(255) | NOT NULL | Nome original enviado pelo cliente (usado em `Content-Disposition` no download) |
| file_size_bytes | bigint | NOT NULL | Tamanho declarado no início do upload (≤ 10GB) |
| upload_id | varchar(255) | nullable | Id do multipart upload no storage; preenchido em `draft`, mantido após `complete` para auditoria |
| thumbnail_key | varchar(512) | nullable | `videos/{id}/thumbnail.jpg`; preenchido pelo worker |
| duration_in_seconds | float | nullable | Preenchido pelo worker (`videos/TD-04`) |
| width | int | nullable | Preenchido pelo worker |
| height | int | nullable | Preenchido pelo worker |
| codec | varchar(50) | nullable | Preenchido pelo worker |
| container | varchar(50) | nullable | Preenchido pelo worker |
| bitrate_kbps | int | nullable | Preenchido pelo worker |
| failure_reason | text | nullable | Preenchido quando `status: failed` |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Relations:** Video → Channel (many-to-one, `channel_id`)
**Indexes:** `(channel_id)` — não-único, para consultas futuras por canal (Fase 04)

---

### API Contracts

#### POST /videos/upload/initiate (SI-03.4)

**Request headers:**
- Authorization: Bearer <access_token>

**Request body:**
- title: string, required — 1-255 chars
- originalFileName: string, required
- fileSizeBytes: number, required — inteiro positivo, máximo `10 * 1024**3` (10GB)
- mimeType: string, required — deve iniciar com `video/`

**Response 201:**
- videoId: string (uuid)
- uploadId: string

**Error responses:**
- 400 VIDEO_FILE_TOO_LARGE: quando `fileSizeBytes` excede 10GB
- 400 validation error: corpo inválido (campos ausentes/mal formatados)
- 401: sem token de acesso válido

#### POST /videos/:id/upload/parts/:partNumber (SI-03.5)

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- url: string (URL pré-assinada `UploadPart`)

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou não pertence ao usuário autenticado
- 409 VIDEO_UPLOAD_NOT_IN_PROGRESS: vídeo não está `draft` ou não tem `uploadId` ativo

#### POST /videos/:id/upload/complete (SI-03.5)

**Request headers:**
- Authorization: Bearer <access_token>

**Request body:**
- parts: `{ partNumber: number, etag: string }[]`, required — mínimo 1 item

**Response 204:** _(nenhum corpo — enfileira o processamento e flips o status)_

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou não pertence ao usuário autenticado
- 409 VIDEO_UPLOAD_ALREADY_COMPLETED: upload já foi completado anteriormente
- 400 validation error: `parts` ausente ou vazio

#### GET /videos/:id (SI-03.8)

**Request headers:**
- Authorization: Bearer <access_token> (opcional — rota pública com resolução best-effort do usuário)

**Response 200:**
- id, title, status, durationInSeconds, width, height, codec, container, bitrateKbps (metadados `null` até `ready`), createdAt

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente, ou existente mas não `ready` e o visitante não é o dono

#### GET /videos/:id/stream (SI-03.9)

**Request headers:**
- Authorization: Bearer <access_token> (opcional)
- Range: bytes=... (opcional — repassado nativamente pelo MinIO após o redirect)

**Response 302:**
- Location: URL pré-assinada `GetObject` no MinIO

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente, ou não `ready` e o visitante não é o dono
- 409 VIDEO_NOT_READY: vídeo existe e o visitante é o dono, mas o status ainda não é `ready`

#### GET /videos/:id/download (SI-03.9)

**Request headers:**
- Authorization: Bearer <access_token> (opcional)

**Response 302:**
- Location: URL pré-assinada `GetObject` no MinIO com `response-content-disposition=attachment; filename="..."`

**Error responses:**
- 404 VIDEO_NOT_FOUND: mesma regra do `/stream`
- 409 VIDEO_NOT_READY: mesma regra do `/stream`

---

### Authorization Matrix

| Endpoint | Public | Authenticated | Role |
|----------|--------|----------------|------|
| POST /videos/upload/initiate | | ✓ | Dono do canal (usuário autenticado) |
| POST /videos/:id/upload/parts/:partNumber | | ✓ | Dono do vídeo |
| POST /videos/:id/upload/complete | | ✓ | Dono do vídeo |
| GET /videos/:id | ✓ (apenas quando `ready`) | ✓ (sempre, se dono) | Dono vê em qualquer status; demais só quando `ready` |
| GET /videos/:id/stream | ✓ (apenas quando `ready`) | ✓ (apenas quando `ready`) | Igual ao anterior — `ready` é exigido até para o dono |
| GET /videos/:id/download | ✓ (apenas quando `ready`) | ✓ (apenas quando `ready`) | Igual ao anterior |

---

### Error Catalog

_Formato de erro já definido em `openapi-docs-nestjs`/Fase 02: `{ statusCode, error, message }` via filtro de exceções de domínio — não redefinido aqui._

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_FILE_TOO_LARGE | 400 | O arquivo excede o limite de 10GB | POST /videos/upload/initiate com `fileSizeBytes` > 10GB |
| VIDEO_NOT_FOUND | 404 | Vídeo não encontrado | Vídeo inexistente, ou existente mas não `ready` e o visitante não é o dono (em qualquer endpoint de vídeo) |
| VIDEO_UPLOAD_NOT_IN_PROGRESS | 409 | Upload não está em andamento para este vídeo | POST /videos/:id/upload/parts/:n quando o vídeo não está `draft` ou não tem `uploadId` ativo |
| VIDEO_UPLOAD_ALREADY_COMPLETED | 409 | Upload já foi completado | POST /videos/:id/upload/complete quando o vídeo não está mais `draft` |
| VIDEO_NOT_READY | 409 | Vídeo ainda não está pronto para reprodução/download | GET /videos/:id/stream ou /download quando o status não é `ready` (mesmo para o dono) |

---

### Events/Messages

| Event | Payload | Publisher | Consumer | Delivery |
|-------|---------|-----------|----------|----------|
| process-video (queue: `video-processing`) | `{ videoId: string }` | VideosService (ao completar o upload) | VideoProcessingConsumer (worker) | ack-required — BullMQ com `attempts: 3`, `backoff: exponential(5000ms)`; após esgotar tentativas, o consumidor marca o vídeo como `failed` |

---

## Dependency Map

```
SI-03.1 (no deps)
├── SI-03.4
│   └── SI-03.5
│       └── SI-03.7
├── SI-03.6
│   └── SI-03.7
└── SI-03.9

SI-03.2 (no deps)
├── SI-03.5
└── SI-03.6

SI-03.3 (no deps)
├── SI-03.4
├── SI-03.6
└── SI-03.8
    └── SI-03.9
```

## Deliverables

- [x] Upload de vídeo de até 10GB via multipart presigned funcional, sem qualquer parte do arquivo passando pela API
- [x] Pré-cadastro automático do vídeo como `draft` ao iniciar o upload
- [x] Processamento automático (metadados + thumbnail) após o upload completo, via fila real
- [x] URL única por vídeo (UUID da entidade), sem conflito
- [x] Streaming (redirect + presigned URL via MinIO) e download funcionando
- [x] Ciclo de status refletido no banco (`draft` → `processing` → `ready`/`failed`), com retry automático e falha terminal após esgotar tentativas
- [x] MinIO, Redis e o worker de vídeo sobem via `docker compose up -d` junto com API, banco e Mailpit
- [x] Migração cria a tabela `videos` com FK para `channels`
- [x] All SI tests pass in nestjs-project (`docker compose exec nestjs-api npm test -- --runInBand`, mais `docker compose exec worker npx jest --runInBand src/worker` para os testes de FFmpeg)
- [x] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e -- --runInBand`)
- [x] Type-check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [x] Lint passes (`docker compose exec nestjs-api npm run lint`)
