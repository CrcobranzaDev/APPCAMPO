import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ConnectionName } from 'src/database/constants/connection-names';

@Injectable()
export class ReclutamientoInternoService {
  constructor(
    @InjectDataSource(ConnectionName.CRERP)
    private readonly dsCrerp: DataSource,
  ) {}

  async crearVacante(input: any): Promise<{ uuid: string }> {
    const titulo = typeof input?.titulo === 'string' ? input.titulo.trim() : '';
    if (!titulo) throw new BadRequestException('El campo "titulo" es obligatorio');

    const plazas = input?.plazas ?? 1;
    if (!Number.isInteger(plazas) || plazas < 1) {
      throw new BadRequestException('El campo "plazas" debe ser un entero mayor a cero');
    }

    const runner = this.dsCrerp.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      let solicitudId = input?.solicitud_id;

      if (solicitudId == null) {
        const puestos = await runner.query('SELECT id FROM mof_puestos LIMIT 1');
        const usuarios = await runner.query('SELECT id FROM usuarios LIMIT 1');
        if (!puestos.length || !usuarios.length) {
          throw new BadRequestException('Se requiere al menos un puesto y un usuario');
        }

        const codigo = `SOL-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const solicitud = await runner.query(
          `INSERT INTO solicitudes_personal
             (codigo, puesto_id, cantidad, motivo, solicitante_id, estado,
              aprobador_id, decidido_en)
           VALUES (?, ?, ?, 'OTRO', ?, 'APROBADA', ?, NOW())`,
          [codigo, puestos[0].id, plazas, usuarios[0].id, usuarios[0].id],
        );
        solicitudId = solicitud.insertId;
      }

      const uuid = randomUUID();
      await runner.query(
        `INSERT INTO vacantes
           (uuid, solicitud_id, titulo, plazas, estado, publicada_en)
         VALUES (?, ?, ?, ?, 'ACTIVA', NOW())`,
        [uuid, solicitudId, titulo, plazas],
      );

      await runner.commitTransaction();
      return { uuid };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
