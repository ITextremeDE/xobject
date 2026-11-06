/** Bounded SSE framing over fetch (cookie session + explicit CSRF header). */
export async function consumeEvents(response:Response,receive:(event:string,data:unknown)=>void){
 const reader=response.body?.getReader();if(!reader)throw new Error('Missing event stream');
 const decoder=new TextDecoder();let buffer='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');if(buffer.length>65536)throw new Error('Event frame too large');let end:number;
  while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=frame.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim();const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(event&&data)receive(event,JSON.parse(data));}
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
