/** Ordered shutdown for the isolated V1 benchmark; every owned resource is attempted. */
export async function cleanupV1Benchmark(resources:{
 clients:readonly {close():Promise<unknown>}[];
 runtime?:{app:{close():Promise<unknown>}};
 fixture?:{db:{destroy():Promise<unknown>};pool:{ended:boolean;end():Promise<unknown>}};
 removeOwnContainer:()=>Promise<unknown>;
}){
 const failures:Error[]=[];
 async function attempt(step:string,close:()=>Promise<unknown>){
  try{await close();}catch(cause){failures.push(new Error(`V1 benchmark cleanup failed: ${step}`,{cause}));}
 }
 for(const [index,client] of resources.clients.entries())await attempt(`MCP client ${index+1}`,()=>client.close());
 if(resources.runtime)await attempt('application',()=>resources.runtime!.app.close());
 if(resources.fixture){
  await attempt('database',()=>resources.fixture!.db.destroy());
  if(!resources.fixture.pool.ended)await attempt('database pool',()=>resources.fixture!.pool.end());
 }
 await attempt('owned container',resources.removeOwnContainer);
 if(failures.length)throw new AggregateError(failures,'V1 benchmark cleanup did not complete successfully');
}
