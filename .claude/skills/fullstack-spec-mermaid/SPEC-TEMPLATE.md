# Spec template — `docs/specs/<feature>.md`

Kebab-case filename. All 14 sections, in order. "N/A" if a section is genuinely absent.

```
# <Feature Name>
## 1. Context        — why, problem, users
## 2. Scope          — In/Out bullets (prevents creep)
## 3. Glossary       — non-obvious domain terms (sync with src/<module>/context.md)
## 4. Functional requirements — FR-N atomic testable
## 5. Non-functional — NFR-N: perf, security, rate limits
## 6. Data model     — erDiagram + field table
## 7. API contract   — HTTP endpoints
## 8. Module boundaries — classDiagram: modules + DI
## 9. Flows          — sequenceDiagram per use case
## 10. State machines — stateDiagram-v2 per status field
## 11. Business rules — flowchart for branching
## 12. Edge cases & errors — bullets
## 13. Acceptance criteria — AC-N Given/When/Then + [layer] tag
## 14. Open questions
```

## Diagram → use case

| Type | Use for |
|---|---|
| `sequenceDiagram` | Request/response, multi-actor |
| `erDiagram` | Schema, relationships |
| `classDiagram` | Module structure, DI |
| `stateDiagram-v2` | Entity lifecycle |
| `flowchart TD` | Decision logic |
| `graph TD` | Module dep graph |

## Functional requirements — one statement, one behavior, testable

| Bad | Good |
|---|---|
| "Users log in." | "FR-1: `POST /auth/login` valid email+pw → 200 `{accessToken}` + 7-day refresh cookie." |
| "Orders paid." | "FR-7: Order `Pending`→`Confirmed` only after `PaymentGateway.charge` success. Fail → `Cancelled` + reason." |
| "Be fast." | "NFR-2: P95 `GET /orders/:id` ≤150ms warm, ≤400ms cold." |

## Acceptance criteria

Given/When/Then. Tag `[backend]` or `[e2e]`. Every FR in ≥1 AC. Each AC ≥1 test.

```
- **AC-1** `[backend]`: Given authed user, when POST valid CreateOrderDto, then 201 OrderResponseDto status=Pending.
- **AC-4** `[e2e]`: Given authed user, when checkout via HTTP, then order in list status=Confirmed.
```

## API contract format

```
### POST /orders
- **Auth**: Bearer JWT (role: customer)
- **Request**: CreateOrderDto — items[{productId:uuid, quantity:int>=1}], shippingAddressId:uuid
- **Responses**: 201 OrderResponseDto | 400 validation | 401 | 404 product | 409 stock
```

For queue features, add alongside HTTP:

```
### QUEUE inbox.<inboxId>  (dynamic — created with inbox entity)
- **Direction**: consume
- **Payload**: InboxMessageDto — id:uuid, content:string, createdAt:ISO8601
- **On failure**: → inbox.dead-letter (DLQ, x-dead-letter-routing-key)
- **Lifecycle**: assertQueue on inbox creation · deleteQueue on inbox deletion

### QUEUE inbox.dead-letter  (static DLQ)
- **Direction**: consume (DeadLetterConsumerService)
- **Payload**: original message + x-death AMQP headers
```

§9 (sequenceDiagram) for queue lifecycle:
```
sequenceDiagram
  Controller->>InboxService: createInbox(dto)
  InboxService->>PrismaRepo: insert inbox
  InboxService->>IRabbitMQService: assertQueue('inbox.<id>', dlqArgs)
  IRabbitMQService->>RabbitMQ: channel.assertQueue
  InboxService->>IRabbitMQService: startConsuming('inbox.<id>', handler)
```

## Anti-patterns

Pseudocode in spec · mega-diagrams (split) · Mermaid not rendering (quote labels with spaces, escape `()` as `["..."]`) · scattered "TBD" (use §14) · `[backend]` AC with no test plan.
