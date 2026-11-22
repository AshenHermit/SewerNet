import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { MatrixService } from './matrix/matrix.service';

describe('HealthController', () => {
  it('health_is_unauthenticated_and_does_not_call_matrix', async () => {
    const matrixRequest = jest.fn();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MatrixService)
      .useValue({
        login: matrixRequest,
        getRoomState: matrixRequest,
        syncRoomList: matrixRequest,
        sync: matrixRequest,
        getRoomMembers: matrixRequest,
        getRoomThreads: matrixRequest,
        getRoomAliases: matrixRequest,
        setReadMarkers: matrixRequest,
        proxy: matrixRequest,
      })
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);

    try {
      const address = app.getHttpServer().address();
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
      expect(matrixRequest).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
