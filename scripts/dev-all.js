import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version:appVersion}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const children=[];
let stopping=false;

function stopChildren(){
 if(stopping)return;
 stopping=true;
 for(const child of children){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');}
}

function monitor(child,label){
 child.once('error',error=>{console.error(`${label} could not start: ${error.message}`);process.exitCode=1;stopChildren();});
 child.once('exit',(code,signal)=>{
  if(!stopping){
   console.error(`${label} stopped${signal?` (${signal})`:` with exit code ${code}`}.`);
   process.exitCode=code||1;
   stopChildren();
  }
 });
}

process.on('SIGINT',stopChildren);
process.on('SIGTERM',stopChildren);

const api=spawn(process.execPath,['server/index.js'],{
 cwd:root,
 env:{...process.env,HOST:'127.0.0.1',PORT:'8787'},
 stdio:'inherit'
});
children.push(api);
monitor(api,'ImpactFlow API');

try{
 let ready=false;
 for(let attempt=0;attempt<180;attempt++){
  if(api.exitCode!==null||api.signalCode!==null)throw new Error('The API exited before it became ready. Check whether port 8787 is already in use.');
  try{
   const response=await fetch('http://127.0.0.1:8787/health');
   const health=await response.json();
   if(response.ok&&health.ok&&health.service==='impactflow-api'){
    if(health.version!==appVersion)throw new Error(`An older or different ImpactFlow API is already using port 8787 (found ${health.version||'unversioned'}, expected ${appVersion}). Stop that Terminal process with Ctrl+C, then run “npm run dev:all” again.`);
    ready=true;break;
   }
  }catch{}
  await delay(500);
 }
 if(!ready)throw new Error('The API did not become ready within 90 seconds.');

 console.log('ImpactFlow API is ready. Starting the website at http://localhost:5173');
 const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{
  cwd:root,
  stdio:'inherit'
 });
 children.push(vite);
 monitor(vite,'ImpactFlow website');
}catch(error){
 console.error(error.message);
 process.exitCode=1;
 stopChildren();
}
