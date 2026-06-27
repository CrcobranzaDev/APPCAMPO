import { Module }      from '@nestjs/common';
import { JwtModule }   from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GpsService }  from 'src/websocket/gps.gateway';
import {GpsController} from 'src/websocket/gps.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:      config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '10h' },
      }),
    }),
  ],
   controllers: [GpsController],
  providers: [GpsService],
  exports:   [GpsService],
})
export class GpsModule {}
