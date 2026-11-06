import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/icons/',import.meta.url),source=await readFile(new URL('xobject.svg',root));
for(const [name,size] of [['favicon-32',32],['apple-touch-180',180],['icon-192',192],['icon-512',512]])await sharp(source).resize(size,size).png().toFile(new URL(`${name}.png`,root).pathname);
// Maskable safe zone: all meaningful content fits inside the central 80%.
await sharp({create:{width:512,height:512,channels:4,background:'#171717'}}).composite([{input:await sharp(source).resize(400).png().toBuffer(),left:56,top:56}]).png().toFile(new URL('maskable-512.png',root).pathname);
const card=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#171717"/><text x="600" y="390" fill="white" text-anchor="middle" font-family="sans-serif" font-size="112" font-weight="600">xObject</text></svg>');
await sharp(card).composite([{input:await sharp(source).resize(150).png().toBuffer(),top:120,left:525}]).png().toFile(new URL('share.png',root).pathname);
// ICO wraps the PNG-encoded 32px image; modern Windows browsers accept this format.
const png=await readFile(new URL('favicon-32.png',root)),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile(new URL('../favicon.ico',root),Buffer.concat([header,png]));
