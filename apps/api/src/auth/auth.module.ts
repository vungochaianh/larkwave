import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthProvidersService } from './oauth-providers.service';

/**
 * Global so the app-wide JwtAuthGuard (registered in AppModule) can resolve
 * JwtService. Secret/expiry are passed explicitly per sign/verify call.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, OAuthProvidersService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
