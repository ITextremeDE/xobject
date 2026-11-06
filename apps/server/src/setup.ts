import {z} from 'zod';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {connect,assertCurrentSchema} from './database.js';
import {passwordCrypto} from './auth.js';

const administrator=z.object({name:z.string().trim().min(1).max(200),email:z.email().trim().toLowerCase(),password:z.string().min(12).max(128)}).strict();
export async function createFirstAdministrator(databaseURL:string,values:unknown){
  const args=administrator.parse(values),{db,pool}=connect(databaseURL);
  try{
    await assertCurrentSchema(pool);
    const hash=await passwordCrypto.hash(args.password);
    await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      if((await sql`SELECT 1 FROM sys_users LIMIT 1`.execute(tx)).rows.length)throw new Error('Initial setup is already complete. Manage accounts from an Administrator session.');
      const id=v7();
      await sql`INSERT INTO sys_users(id,name,email,email_verified,created_at,updated_at,is_admin,must_change_password) VALUES(${id},${args.name},${args.email},false,now(),now(),true,false)`.execute(tx);
      await sql`INSERT INTO sys_accounts(id,user_id,account_id,provider_id,password,created_at,updated_at) VALUES(${v7()},${id},${id},'credential',${hash},now(),now())`.execute(tx);
      await sql`INSERT INTO sys_journal(id,change_id,entity_kind,entity_id,field_key,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,'user',${id}::uuid,'created',${JSON.stringify({name:args.name,email:args.email,isAdmin:true})}::jsonb,${id})`.execute(tx);
    });
  }finally{await db.destroy();}
}
export async function assertSetupAvailable(databaseURL:string){
  const {db,pool}=connect(databaseURL);
  try{await assertCurrentSchema(pool);if((await pool.query('SELECT 1 FROM sys_users LIMIT 1')).rowCount)throw new Error('Initial setup is already complete. Manage accounts from an Administrator session.');}
  finally{await db.destroy();if(!pool.ended)await pool.end();}
}
export async function administratorInput(){
  const {ADMIN_NAME:name,ADMIN_EMAIL:email,ADMIN_PASSWORD:password}=process.env;
  if(name&&email&&password)return {name,email,password};
  if(name||email||password)throw new Error('Provide all ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD, or none for interactive setup.');
  if(!process.stdin.isTTY)throw new Error('Use an interactive terminal, or supply ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD securely.');
  const prompts=await import('@inquirer/prompts');
  const enteredName=await prompts.input({message:'Administrator name:',validate:value=>value.trim().length>0&&value.trim().length<=200||'Enter a name (1–200 characters).'});
  const enteredEmail=await prompts.input({message:'Administrator email:',validate:value=>z.email().safeParse(value.trim()).success||'Enter a valid email address.'});
  const enteredPassword=await prompts.password({message:'Administrator password:',mask:true,validate:value=>value.length>=12&&value.length<=128||'Use 12–128 characters.'});
  await prompts.password({message:'Repeat password:',mask:true,validate:value=>value===enteredPassword||'Passwords do not match.'});
  return {name:enteredName,email:enteredEmail,password:enteredPassword};
}
