import {execFile} from 'node:child_process';

// The parent also serves control-plane HTTPS. Never block its event loop while
// a guest command may need a callback, artifact stream or progress response.
export function runGuestCommand(file,args,input,{timeout=20*60*1000,maxBuffer=16*1024*1024}={}) {
 return new Promise((resolve,reject)=>{
  const child=execFile(file,args,{encoding:'utf8',timeout,maxBuffer,windowsHide:true},(error,stdout)=>{
   if(error){const failure=new Error('Guest command failed');failure.stdout=stdout;failure.code=error.code;reject(failure);}
   else resolve(stdout);
  });
  child.stdin.on('error',()=>{}); // Early child exit is handled by the callback.
  child.stdin.end(input);
 });
}
