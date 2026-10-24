import { Module }         from '@nestjs/common';
import { ConfigModule }   from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from './auth/auth.module';
import { AsignacionModule } from './carga/asignacion.module';
import { AgentesModule } from './Gestor/agentes.module';
import { AsignacionCampoModule } from './asignacionapp/asignacion-campo.module';
import { SyncModule } from './asterisksync/sync.module';
import { GpsModule } from './websocket/gps.module';
import { DetalleAsignacionModule } from './asigdetalle/detalle-asignacion.module';
import {GestionesRealizadasModule} from 'src/gestionados/gestiones-realizadas.module';
import {EstadosCampanaModule} from 'src/estados/estados.module';
import { RegistroGestionModule } from './registrarapp/registro-gestion.module';
import { MapaGestionesModule } from './mapagps/mapa-gestiones.module';
import { CampaniasModule } from './campania/campania.module';
import { ImagenModule } from './imagen/imagen.module';
import { ExcelGestionesModule } from './report/report.module';
import { CargaModule } from './upload/carga.module';
import { SincronizacionCampoModule } from './mascara/syncro.module';
import { ListasModule } from './listas/listas.module';
import { DashboardGestoresModule } from './dasboard/dashboard-gestores.module';
import { AsteriskinModule } from './asteriskin/asteriskin.module';
import { IaCampoModule } from './ia/ia-campo.module';
import { ListaNegraModule } from './listblack/listblack.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:    true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    AsignacionModule,
    AgentesModule,
    AsignacionCampoModule,
    SyncModule,
    GpsModule,
    DetalleAsignacionModule,
    GestionesRealizadasModule,
    EstadosCampanaModule,
    RegistroGestionModule,
    MapaGestionesModule,
    CampaniasModule,
    ImagenModule,
    ExcelGestionesModule,
    CargaModule,
    SincronizacionCampoModule,
    ListasModule,
    DashboardGestoresModule,
    AsteriskinModule,
    IaCampoModule,
    ListaNegraModule

  ],
})
export class AppModule {}
