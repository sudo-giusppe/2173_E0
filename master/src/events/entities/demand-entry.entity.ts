import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('demand_entries')
export class DemandEntry {
  @PrimaryColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  idpk: string;

  @Column()
  type: string;

  @Index()
  @Column()
  city: string;

  @Column({
    type: 'numeric',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  demand: number;

  @Column()
  unit: string;

  @Column({ type: 'timestamptz' })
  validUntil: Date;

  @Column({ type: 'jsonb', nullable: true })
  metaContent: unknown;

  @Column({ type: 'jsonb', nullable: true })
  constraints: unknown;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;
}
