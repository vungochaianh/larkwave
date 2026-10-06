import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EngineModule } from '../engine/engine.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Global so the app-wide JwtAuthGuard (registered in AppModule) can resolve
 * JwtService. Secret/expiry are passed explicitly per sign/verify call.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), EngineModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
