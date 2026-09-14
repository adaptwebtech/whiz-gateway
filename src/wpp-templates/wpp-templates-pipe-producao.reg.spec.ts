import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { WppTemplatesController } from './wpp-templates.controller';

/**
 * Regressão — criação de template sob o pipe REAL de produção.
 *
 * O incidente: criar template com variáveis NOMEADAS falhava com
 * "HTTP 400 ON POST | /wpp/{waba}/message_templates - property parameter_format
 * should not exist". A requisição morria NO GATEWAY: nunca chegou à Meta.
 *
 * Causa: `CreateTemplateDto` não declarava `parameter_format`, e o pipe global de
 * `main.ts` roda com `whitelist: true` + `forbidNonWhitelisted: true`. O
 * `@UsePipes(new ValidationPipe({ whitelist: false }))` do controller NÃO salva:
 * pipes global e de controller rodam em sequência, o global primeiro.
 *
 * Por que a suíte existente ficou verde: `wpp-templates.controller.spec.ts` monta
 * o app com `whitelist: false`, que não é o pipe que roda de verdade. Esta suíte
 * monta com a MESMA configuração de `main.ts`.
 *
 * AC-1: POST create com `parameter_format: NAMED` → 2xx e body íntegro no forward.
 * AC-2: os `example.body_text_named_params` dentro de `components[]` sobrevivem
 *       (o `whitelist` poda propriedade de topo, não conteúdo de array solto).
 * AC-3: POST edição (`POST /wpp/:templateId`) também aceita `parameter_format`.
 * AC-4: `POSITIONAL` passa igual — o gateway não inventa contrato próprio.
 * AC-5: propriedade DESCONHECIDA continua recusada — o pipe não virou enfeite.
 */
describe('Templates /wpp sob o ValidationPipe de produção (regressão)', () => {
  const mockWppService = { forward: jest.fn() };
  let app: INestApplication<App>;

  // O payload exato do incidente, encurtado no texto do corpo.
  const payloadDoIncidente = {
    name: 'confirmao_agendamento',
    category: 'UTILITY',
    language: 'pt_BR',
    parameter_format: 'NAMED',
    components: [
      {
        type: 'body',
        text: 'Olá {{nome_do_paciente}}, {{saudacao}}!',
        example: {
          body_text_named_params: [
            { param_name: 'nome_do_paciente', example: 'Vanderlúcia' },
            { param_name: 'saudacao', example: 'Bom dia' },
          ],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Remarcar consulta' },
          { type: 'QUICK_REPLY', text: 'Cancelar consulta' },
        ],
      },
    ],
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [WppTemplatesController],
      providers: [
        WppAuthFilter,
        { provide: WppService, useValue: mockWppService },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<App>();
    // EXATAMENTE o de main.ts. Não afrouxar: é a divergência que escondeu o bug.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { id: 'tpl123', status: 'PENDING', category: 'UTILITY' },
    });
  });

  it('AC-1: POST message_templates com parameter_format NAMED → não é recusado pelo pipe', async () => {
    // Arrange / Act
    const res = await request(app.getHttpServer())
      .post('/wpp/2270416106570338/message_templates')
      .send(payloadDoIncidente);

    // Assert
    expect(res.status).toBe(200);
    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      '2270416106570338/message_templates',
      expect.objectContaining({
        body: expect.objectContaining({ parameter_format: 'NAMED' }),
      }),
    );
  });

  it('AC-2: components[] chega íntegro, com os example.body_text_named_params', async () => {
    // Arrange / Act
    await request(app.getHttpServer())
      .post('/wpp/2270416106570338/message_templates')
      .send(payloadDoIncidente)
      .expect(200);

    // Assert
    const { body } = mockWppService.forward.mock.calls[0][2] as {
      body: typeof payloadDoIncidente;
    };
    expect(body.components).toEqual(payloadDoIncidente.components);
  });

  it('AC-3: POST de EDIÇÃO também aceita parameter_format', async () => {
    // Arrange
    mockWppService.forward.mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    // Act / Assert
    await request(app.getHttpServer())
      .post('/wpp/tpl123')
      .send({ category: 'UTILITY', parameter_format: 'NAMED', components: [] })
      .expect(200);

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'tpl123',
      expect.objectContaining({
        body: expect.objectContaining({ parameter_format: 'NAMED' }),
      }),
    );
  });

  it('AC-4: POSITIONAL passa igual — o gateway não inventa contrato próprio', async () => {
    // Arrange / Act / Assert
    await request(app.getHttpServer())
      .post('/wpp/waba456/message_templates')
      .send({
        name: 'hello_world',
        category: 'UTILITY',
        language: 'pt_BR',
        parameter_format: 'POSITIONAL',
        components: [{ type: 'BODY', text: 'Olá {{1}}' }],
      })
      .expect(200);

    expect(mockWppService.forward).toHaveBeenCalledWith(
      'POST',
      'waba456/message_templates',
      expect.objectContaining({
        body: expect.objectContaining({ parameter_format: 'POSITIONAL' }),
      }),
    );
  });

  it('AC-5: propriedade desconhecida continua recusada', async () => {
    // Arrange / Act
    const res = await request(app.getHttpServer())
      .post('/wpp/waba456/message_templates')
      .send({ ...payloadDoIncidente, campo_que_nao_existe: 'x' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockWppService.forward).not.toHaveBeenCalled();
  });
});
