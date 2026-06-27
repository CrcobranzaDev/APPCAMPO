import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';


@Injectable()
export class EncryptionService {
  constructor(private readonly configService: ConfigService) {}

  private getKey(): CryptoJS.lib.WordArray {
    const claveSecreta = this.configService.get<string>('CLAVE_SECRETA');
    if (!claveSecreta) throw new Error('CLAVE_SECRETA no configurada en el archivo .env');
    return CryptoJS.SHA256(claveSecreta);
  }

  private getFixedIV(): CryptoJS.lib.WordArray {
    const claveSecreta = this.configService.get<string>('CLAVE_SECRETA');
    return CryptoJS.MD5(claveSecreta + '_iv_fijo'); 
  }



  encriptar(textoPlano: string): string {
    if (!textoPlano) return textoPlano;

    const valor = String(textoPlano).trim();
    if (!valor) return textoPlano;

    try {
      const key = this.getKey();
      const iv  = this.getFixedIV(); 

      const encrypted = CryptoJS.AES.encrypt(valor, key, {
        iv,
        mode:    CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return 'ENC:' + CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
    } catch (error) {
      console.error('Error al encriptar:', error);
      return textoPlano;
    }
  }

  encriptarCampos(data: any, campos: string[]): any {
    const result = { ...data };
    campos.forEach(campo => {
      const val = result[campo];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        result[campo] = this.encriptar(String(val));
      }
    });
    return result;
  }

 

  desencriptar(textoEncriptado: string): string {
  if (!textoEncriptado) return textoEncriptado;

  
  if (!textoEncriptado.startsWith('ENC:')) {
    const encIndex = textoEncriptado.indexOf('ENC:');
    if (encIndex === -1) return textoEncriptado; 

  
    const prefix       = textoEncriptado.slice(0, encIndex);
    const encPart      = textoEncriptado.slice(encIndex);
    const decryptedEnd = this.desencriptar(encPart); 

    return prefix + decryptedEnd;
  }

  try {
    const key        = this.getKey();
    const iv         = this.getFixedIV();
    const ciphertext = CryptoJS.enc.Base64.parse(textoEncriptado.slice(4));

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext } as any,
      key,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Error al desencriptar:', error);
    return textoEncriptado;
  }
}

  desencriptarCampos(data: any, campos: string[]): any {
    const result = { ...data };
    campos.forEach(campo => {
      if (result[campo]) result[campo] = this.desencriptar(result[campo]);
    });
    return result;
  }
}