import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import * as XLSX from 'xlsx';
import { ConnectionName }         from 'src/database/constants/connection-names';
import { ReasignarClientesDto, CambiarEstadoDto, ImportarClientesDto } from 'src/Gestor/dto/gestion-clientes.dto';

// ══════════════════════════════════════════════════════════
//  GESTION CLIENTES SERVICE
//
//  Reglas de negocio:
//  - Solo se opera sobre clientes con estado ACTIVO
//  - Clientes DESACTIVADO o GESTIONADO son ignorados siempre
//  - No existe la acción REACTIVAR / ACTIVAR
//
//  POST /gestion-clientes/reasignar   → reasignar a otro gestor  (solo ACTIVOS)
//  POST /gestion-clientes/desactivar  → estado DESACTIVADO       (solo ACTIVOS)
// ══════════════════════════════════════════════════════════

@Injectable()
export class GestionClientesService {

  private readonly logger = new Logger(GestionClientesService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════
  //  HELPER: filtra IDs dejando solo los que tienen
  //  estado ACTIVO en la base de datos.
  //  Devuelve los IDs válidos y el detalle de ignorados.
  // ══════════════════════════════════════════════════════
  private async filtrarSoloActivos(ids: number[]): Promise<{
    idsActivos:   number[];
    ignorados:    { id: number; estado: string }[];
  }> {
    const placeholders = ids.map((_, i) => `@${i}`).join(',');

    const estadosResult: { id: number; estado: string }[] = await this.dsCampo.query(
      `SELECT id, estado FROM clientes_asignados WHERE id IN (${placeholders})`,
      ids,
    );

    // Indexamos para lookup rápido
    const estadoMap = new Map(estadosResult.map(r => [r.id, r.estado]));

    const idsActivos: number[]                      = [];
    const ignorados:  { id: number; estado: string }[] = [];

    for (const id of ids) {
      const estado = estadoMap.get(id) ?? 'NO_ENCONTRADO';
      if (estado === 'ACTIVO') {
        idsActivos.push(id);
      } else {
        ignorados.push({ id, estado });
      }
    }

    return { idsActivos, ignorados };
  }

  // ══════════════════════════════════════════════════════
  //  REASIGNAR CLIENTES — usa SP_ReasignarClientes
  //  Solo opera sobre clientes ACTIVOS
  // ══════════════════════════════════════════════════════
  async reasignar(dto: ReasignarClientesDto, usuarioAdmin: string): Promise<any> {

    const { ids, usuario_nuevo, nombre_nuevo, motivo } = dto;

    this.logger.log(`Reasignando ${ids.length} clientes solicitados a ${usuario_nuevo} por ${usuarioAdmin}`);

    const { idsActivos, ignorados } = await this.filtrarSoloActivos(ids);

    if (!idsActivos.length) {
      return {
        reasignados: 0,
        ignorados:   ignorados.length,
        detalle:     ignorados,
        usuario_nuevo,
        nombre_nuevo,
        mensaje: `Ningún cliente puede ser reasignado. ${ignorados.length} cliente(s) ignorado(s) por estado DESACTIVADO o GESTIONADO`,
      };
    }

    await this.dsCampo.query(
      `EXEC SP_ReasignarClientes @0, @1, @2, @3, @4`,
      [
        JSON.stringify(idsActivos), // @ids          → '[1,2,3]'
        usuario_nuevo,              // @usuario_nuevo
        nombre_nuevo,               // @nombre_nuevo
        motivo ?? null,             // @motivo
        usuarioAdmin,               // @usuario_admin
      ],
    );

    this.logger.log(`Reasignación completada: ${idsActivos.length} clientes → ${usuario_nuevo}` +
      (ignorados.length ? `, ${ignorados.length} ignorado(s)` : ''));

    return {
      reasignados:  idsActivos.length,
      ignorados:    ignorados.length,
      detalle:      ignorados.length ? ignorados : undefined,
      usuario_nuevo,
      nombre_nuevo,
      mensaje: `${idsActivos.length} cliente(s) reasignado(s) a ${nombre_nuevo}` +
        (ignorados.length ? `, ${ignorados.length} ignorado(s) por estado DESACTIVADO o GESTIONADO` : ''),
    };
  }

  // ══════════════════════════════════════════════════════
  //  CAMBIAR ESTADO — solo permite DESACTIVADO
  //  Solo opera sobre clientes ACTIVOS
  // ══════════════════════════════════════════════════════
  async cambiarEstado(dto: CambiarEstadoDto): Promise<any> {

    const { ids, estado } = dto;

    // Solo se permite desactivar; reactivar ya no existe
    if (estado !== 'DESACTIVADO') {
      throw new BadRequestException(
        `Estado inválido: "${estado}". La única operación permitida es DESACTIVADO`,
      );
    }

    this.logger.log(`Desactivando ${ids.length} clientes solicitados`);

    const { idsActivos, ignorados } = await this.filtrarSoloActivos(ids);

    if (!idsActivos.length) {
      return {
        afectados: 0,
        ignorados: ignorados.length,
        detalle:   ignorados,
        estado,
        mensaje: `Ningún cliente puede ser desactivado. ${ignorados.length} cliente(s) ignorado(s) por estado DESACTIVADO o GESTIONADO`,
      };
    }

    await this.dsCampo.query(
      `EXEC SP_DesactivarClientes @0`,
      [JSON.stringify(idsActivos)],
    );

    this.logger.log(`${idsActivos.length} clientes desactivados` +
      (ignorados.length ? `, ${ignorados.length} ignorado(s)` : ''));

    return {
      afectados: idsActivos.length,
      ignorados: ignorados.length,
      detalle:   ignorados.length ? ignorados : undefined,
      estado,
      mensaje: `${idsActivos.length} cliente(s) desactivado(s) correctamente` +
        (ignorados.length ? `, ${ignorados.length} ignorado(s) por estado DESACTIVADO o GESTIONADO` : ''),
    };
  }

  // ══════════════════════════════════════════════════════
  //  IMPORTAR MASIVO (Excel)
  //  Acciones válidas: REASIGNAR, DESACTIVAR
  //  Solo opera sobre clientes ACTIVOS
  // ══════════════════════════════════════════════════════
  async importar(buffer: Buffer, accion: string, usuario_admin: string): Promise<any> {

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const filas    = XLSX.utils.sheet_to_json(sheet) as any[];

    if (!filas.length) throw new BadRequestException('El archivo está vacío');

    const accionNorm = accion.toUpperCase().trim();

    // Validar acción antes de procesar
    if (!['REASIGNAR', 'DESACTIVAR'].includes(accionNorm)) {
      throw new BadRequestException(
        `Acción inválida: "${accion}". Use REASIGNAR o DESACTIVAR`,
      );
    }

    // Extraer IDs del Excel
    const ids: number[] = filas
      .map(f => {
        const key = Object.keys(f).find(k => k.toLowerCase().trim() === 'id');
        return key ? Number(f[key]) : null;
      })
      .filter((id): id is number => id !== null && !isNaN(id));

    if (!ids.length) throw new BadRequestException('No se encontraron IDs válidos en el archivo');

    // Filtrar: solo ACTIVOS pueden ser operados
    const { idsActivos, ignorados } = await this.filtrarSoloActivos(ids);

    if (!idsActivos.length) {
      return {
        procesados: 0,
        ignorados:  ignorados.length,
        detalle:    ignorados,
        mensaje:    `Ningún cliente puede ser procesado. ${ignorados.length} cliente(s) ignorado(s) por estado DESACTIVADO o GESTIONADO`,
      };
    }

    const resumenIgnorados = ignorados.length
      ? `, ${ignorados.length} ignorado(s) por estado DESACTIVADO o GESTIONADO`
      : '';

    // ── REASIGNAR ────────────────────────────────────────
    if (accionNorm === 'REASIGNAR') {

      // Agrupar IDs válidos por gestor destino
      const porGestor = new Map<string, number[]>();

      filas.forEach(f => {
        const idKey     = Object.keys(f).find(k => k.toLowerCase().trim() === 'id');
        const gestorKey = Object.keys(f).find(k =>
          k.toLowerCase().trim().replace(/\s/g, '_') === 'usuario_gestor',
        );
        if (!idKey || !gestorKey) return;

        const id     = Number(f[idKey]);
        const gestor = String(f[gestorKey]).trim().toLowerCase();

        if (!gestor || !idsActivos.includes(id)) return;

        if (!porGestor.has(gestor)) porGestor.set(gestor, []);
        porGestor.get(gestor)!.push(id);
      });

      for (const [usuario_nuevo, gIds] of porGestor.entries()) {
        await this.dsCampo.query(
          `EXEC SP_ReasignarClientes @0, @1, @2, @3, @4`,
          [JSON.stringify(gIds), usuario_nuevo, usuario_nuevo, null, usuario_admin],
        );
      }

      return {
        procesados: idsActivos.length,
        ignorados:  ignorados.length,
        detalle:    ignorados.length ? ignorados : undefined,
        mensaje:    `${idsActivos.length} cliente(s) reasignado(s)${resumenIgnorados}`,
      };
    }

    // ── DESACTIVAR ───────────────────────────────────────
    if (accionNorm === 'DESACTIVAR') {
      await this.dsCampo.query(
        `EXEC SP_DesactivarClientes @0`,
        [JSON.stringify(idsActivos)],
      );
      return {
        procesados: idsActivos.length,
        ignorados:  ignorados.length,
        detalle:    ignorados.length ? ignorados : undefined,
        mensaje:    `${idsActivos.length} cliente(s) desactivado(s)${resumenIgnorados}`,
      };
    }
  }

  // ══════════════════════════════════════════════════════
  //  IMPORTAR DESDE REQUEST (multipart)
  // ══════════════════════════════════════════════════════
  async importarDesdeRequest(req: any): Promise<any> {

    const parts   = req.parts();
    let fileBuffer: Buffer | null = null;
    let accion        = '';
    let usuario_admin = 'sistema';

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileBuffer = Buffer.concat(chunks);
      } else {
        if (part.fieldname === 'accion')        accion        = part.value as string;
        if (part.fieldname === 'usuario_admin') usuario_admin = part.value as string;
      }
    }

    if (!fileBuffer) throw new BadRequestException('No se recibió archivo');
    if (!accion)     throw new BadRequestException('No se recibió acción');

    return this.importar(fileBuffer, accion, usuario_admin);
  }
}