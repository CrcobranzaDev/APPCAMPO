import { Controller, Get } from '@nestjs/common';
import { AgentesService }  from './agentes.service';

// ══════════════════════════════════════════════════════════
//  AGENTES CONTROLLER
//  GET /App/campo/agentes  →  público, sin JWT
// ══════════════════════════════════════════════════════════

@Controller('agentes')
export class AgentesController {

  constructor(private readonly agentesService: AgentesService) {}

  @Get('users')
  async getAgentes() {
    return this.agentesService.getAgentes();
  }

  
}
