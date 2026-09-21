

export enum ConnectionName {
  INFOCALL          = 'infocall',
  SQLSERVER_MAESTRA = 'sqlserver_maestra',
  SQLSERVER_CAMPO   = 'sqlserver_campo',
  ASTERISK_1        = 'asterisk_sede1',
  ASTERISK_2        = 'asterisk_sede2',
  ASTERISK_3        = 'asterisk_sede3',
  CRERP             = 'crerp',
}


export const ASTERISK_CONNECTIONS = [
  ConnectionName.ASTERISK_1,
  ConnectionName.ASTERISK_2,
  ConnectionName.ASTERISK_3,
] as const;

export type AsteriskSede = 1 | 2 | 3;