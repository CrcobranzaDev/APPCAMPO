// lista-negra.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('list_negras')
@Unique(['documento', 'campaingId'])
export class ListaNegra {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'documento', length: 20 })
  documento: string;

  @Column({ name: 'campaing_id', length: 20 })
  campaingId: string;

  @Column({ name: 'act', type: 'int', default: 1 })
  act: number; // 1 activo, 0 desactivado
}