import {isIP} from 'node:net';
import {domainToASCII} from 'node:url';

export const CONSENT_VERSION = '2026-11-05.1';
export const CATEGORIES = ['Fashion','Elektronik','Kecantikan','Makanan','Aksesoris','Lainnya'];
const forbidden = /[\p{Cc}\p{Cf}<>]/u;
export function validateRegistration(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {errors:{form:'Data formulir tidak valid.'}};
  const allowed = ['fullName','email','whatsapp','storeName','category','domain','noDomain','city','description','consent','consentVersion','website','challenge'];
  if (Object.keys(input).some(k=>!allowed.includes(k))) errors.form = 'Data formulir tidak dikenal.';
  const str = (key,min,max,optional=false) => {
    const raw = input[key];
    if (optional && (raw === undefined || raw === '')) return null;
    if(typeof raw !== 'string') { errors[key]='Isi kolom ini dengan benar.';return ''; }
    const value=raw.normalize('NFC').trim();
    if(optional && !value)return null;
    if(value.length<min||value.length>max||forbidden.test(value))errors[key]=`Gunakan ${min}–${max} karakter tanpa karakter kontrol atau tanda HTML.`;
    return value;
  };
  const fullName=str('fullName',2,100), email=str('email',3,254)?.toLowerCase(),storeName=str('storeName',1,100);
  if(fullName&&!/^[\p{L}\p{M} .’'\-]+$/u.test(fullName))errors.fullName='Gunakan huruf, spasi, titik, apostrof, atau tanda hubung.';
  if(email&&!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email))errors.email='Masukkan alamat email yang valid.';
  let whatsapp=str('whatsapp',8,24,true);
  if(whatsapp){whatsapp=whatsapp.replace(/[ ()-]/g,'').replace(/^0/,'+62').replace(/^62/,'+62');if(!/^\+628[1-9][0-9]{6,10}$/.test(whatsapp))errors.whatsapp='Gunakan nomor Indonesia, misalnya 081234567890.';}
  const category=str('category',1,30);if(!CATEGORIES.includes(category))errors.category='Pilih kategori produk.';
  let domain=str('domain',1,253,true);
  if(typeof input.noDomain !== 'boolean')errors.noDomain='Pilihan domain tidak valid.';
  if(input.noDomain && domain)errors.domain='Kosongkan domain bila belum memiliki domain.';
  if(domain){domain=domainToASCII(domain.toLowerCase());if(!domain||isIP(domain)||!domain.includes('.')||domain.endsWith('.')||domain.split('.').some(v=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v))||/\.(?:localhost|local|internal|test|invalid)$/.test(domain))errors.domain='Masukkan domain tanpa https:// atau alamat halaman.';}
  const city=str('city',1,100,true),description=str('description',1,500,true);
  if(input.consent!==true||input.consentVersion!==CONSENT_VERSION)errors.consent='Setujui kebijakan privasi terbaru sebelum melanjutkan.';
  if(input.website!=='' && input.website!==undefined)errors.form='Pendaftaran tidak dapat diproses.';
  return {errors,data:{fullName,email,whatsapp,storeName,category,domain:domain||null,city,description,consentVersion:CONSENT_VERSION}};
}
