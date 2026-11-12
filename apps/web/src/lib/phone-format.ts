import {parsePhoneNumberFromString} from 'libphonenumber-js';

/** Presentation only: partial input stays intact; storage keeps the server's canonical number. */
export function formatPhoneNumber(value:string):string {
  if(!value.startsWith('+'))return value;
  const phone=parsePhoneNumberFromString(value);
  return phone?.isValid()?phone.formatInternational():value;
}
