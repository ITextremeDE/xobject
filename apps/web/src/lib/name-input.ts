export type NamePart={id:string;text:string};
export const nameInputText=(parts:NamePart[])=>parts.map(part=>part.text).join(' ');
/** Keep untouched structured identities; an edited name is entered as one text value. */
export function nameInputValue(parts:NamePart[],text:string,newId:()=>string):NamePart[]|null{
 if(text===nameInputText(parts))return parts;
 if(!text)return null;
 return [{id:parts[0]?.id??newId(),text}];
}
