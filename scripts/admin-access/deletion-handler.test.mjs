import assert from 'node:assert/strict';
import test from 'node:test';
import {handleDeleteUser} from '../../supabase/functions/admin-delete-user/handler.ts';
const owner='c0000000-0000-4000-8000-000000000001',target='c0000000-0000-4000-8000-000000000002';
function fixture({superAdmin=true,auth=true,rpcError=null,deleteError=null,throwDelete=false,auditError=false}={}){
 const calls=[],preview={email:'target@example.test',can_delete:true,blockers:[],personal_data:[]};
 const user={auth:{getUser:async()=>({data:{user:auth?{id:owner}:null},error:null})},rpc:async(name,args)=>{
  calls.push([name,args]);return name==='is_super_admin'?{data:superAdmin,error:null}:{data:preview,error:rpcError};
 }};
 const admin={auth:{admin:{deleteUser:async(id,soft)=>{calls.push(['deleteUser',id,soft]);if(throwDelete)throw Error('Network');return {error:deleteError};}}},from:table=>({
  delete:()=>({eq:async(column,id)=>{calls.push(['cleanup',table,column,id]);return {error:auditError};}}),
  insert:async row=>{calls.push(['audit',row]);return {error:auditError};},
 })};
 const req=(body,authorization='Bearer synthetic')=>new Request('http://localhost/admin-delete-user',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify(body)});
 return {calls,user,admin,req};
}
test('authorization and invalid input never invoke Auth deletion',async()=>{
 for(const options of [{auth:false},{superAdmin:false}]){const f=fixture(options);const response=await handleDeleteUser(f.req({userId:target,action:'delete',email:'target@example.test'}),f.user,f.admin);assert.equal(response.status,options.auth===false?401:403);assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));}
 const f=fixture();for(const body of [{userId:owner,action:'delete',email:'x'},{userId:'invalid',action:'delete'},{userId:target,action:'delete'}]){assert.ok((await handleDeleteUser(f.req(body),f.user,f.admin)).status>=400);}assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));
});
test('preview is read-only; deletion requires the preparation RPC and hard deletion',async()=>{
 const f=fixture();assert.equal((await handleDeleteUser(f.req({userId:target,action:'preview'}),f.user,f.admin)).status,200);assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));
 const response=await handleDeleteUser(f.req({userId:target,action:'delete',email:'target@example.test'}),f.user,f.admin);assert.deepEqual(await response.json(),{success:true});
 assert.deepEqual(f.calls.slice(-2),[['prepare_user_deletion',{_user_id:target,_email:'target@example.test'}],['deleteUser',target,false]]);
});
test('protected accounts, incorrect confirmation and linked content stop before deletion',async()=>{
 for(const code of ['42501','23503','P0002']){const f=fixture({rpcError:{code,message:'Synthetic rejection'}});const response=await handleDeleteUser(f.req({userId:target,action:'delete',email:'wrong'}),f.user,f.admin);assert.equal(response.status,code==='42501'?403:code==='P0002'?404:409);assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));}
});
test('Auth failure or unknown response clears grant, records failure and never reports success',async()=>{
 for(const options of [{deleteError:{message:'Synthetic failure'}},{throwDelete:true},{deleteError:{message:'failure'},auditError:true}]){
  const f=fixture(options),response=await handleDeleteUser(f.req({userId:target,action:'delete',email:'target@example.test'}),f.user,f.admin),body=await response.json();
  assert.equal(response.status,409);assert.equal(body.success,undefined);assert.ok(f.calls.some(c=>c[0]==='cleanup'));assert.ok(f.calls.some(c=>c[0]==='audit'&&c[1].outcome==='failed'));assert.equal(body.auditFailed,!!options.auditError);
 }
});
