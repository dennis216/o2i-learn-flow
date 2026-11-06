// Run locally, then inspect /__auth-refresh-test with the browser. No real accounts or network fixtures.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),baseline=process.env.O2I_AUTH_REFRESH_BASELINE==='1';
const fixture=fileURLToPath(new URL('./fixtures/auth-refresh-state.tsx',import.meta.url));
const server=await createServer({configFile:false,root,plugins:[react(),{
 name:'auth-refresh-fixture',enforce:'pre',
 transform(code,id){if(baseline&&id.endsWith('/src/pages/Admin.tsx'))return code.replace('authLoading || (accessLoading && !isAdmin)','authLoading || accessLoading');},
 configureServer(vite){vite.middlewares.use('/__auth-refresh-test',async (_req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__auth-refresh-test','<div id="root"></div><script type="module" src="/scripts/admin-access/fixtures/auth-refresh-app.tsx"></script>'));}catch(error){next(error);}});}
}],resolve:{alias:[{find:'@/contexts/AuthContext',replacement:fixture},{find:'@/integrations/supabase/client',replacement:fixture},{find:'@',replacement:root+'src'}]},server:{host:'127.0.0.1',port:baseline?5198:5197,strictPort:true}});
await server.listen();console.log(JSON.stringify({url:`http://127.0.0.1:${baseline?5198:5197}/__auth-refresh-test`,baseline,synthetic_only:true}));
