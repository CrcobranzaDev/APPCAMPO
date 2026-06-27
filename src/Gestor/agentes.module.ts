import { Module }           from '@nestjs/common';
import { AgentesController } from './agentes.controller';
import { AgentesService }    from './agentes.service';
import {HistorialGestionesController} from 'src/Gestor/historial-gestiones.controller';
import {HistorialGestionesService} from 'src/Gestor/historial-gestiones.service';
import {ClientesAsignadosController} from 'src/Gestor/clientes-asignados.controller';
import {ClientesAsignadosService} from 'src/Gestor/clientes-asignados.service';
import  {GestionClientesController} from 'src/Gestor/gestion-clientes.controller';
import  {GestionClientesService} from 'src/Gestor/gestion-clientes.service';

@Module({
  controllers: [AgentesController,HistorialGestionesController,ClientesAsignadosController,GestionClientesController],
  providers:   [AgentesService,HistorialGestionesService,ClientesAsignadosService,GestionClientesService],
      exports:     [AgentesService,HistorialGestionesService,ClientesAsignadosService,GestionClientesService],
})
export class AgentesModule {}
