const fs = require('fs');
const vm = require('vm');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
let listener = null;
const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const calls=[];
async function fetchMock(url, options={}) {
  calls.push({url:String(url),headers:options.headers||{}});
  if (String(url).endsWith('/api/auth/session')) {
    return new Response(JSON.stringify({accessToken:'token-1'}), {status:200,headers:{'content-type':'application/json'}});
  }
  if (/\/backend-api\/files\/file-ai-1\/download/.test(String(url))) {
    if (!String(options.headers?.Authorization||'').includes('token-1')) return new Response('no',{status:401});
    return new Response(png, {status:200,headers:{'content-type':'image/png','content-length':String(png.length)}});
  }
  return new Response('missing',{status:404});
}
const ctx={
  console, URL, Uint8Array, ArrayBuffer, Response, Headers, Request, AbortController,
  setTimeout,clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:fetchMock,
  chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}}}
};
vm.createContext(ctx);vm.runInContext(code,ctx,{timeout:5000});
if(!listener) throw Error('listener missing');
function invoke(message){return new Promise((resolve,reject)=>{const keep=listener(message,{},resolve);if(!keep) reject(Error('listener did not keep channel'));setTimeout(()=>reject(Error('timeout')),2000);});}
(async()=>{
 const result=await invoke({type:'ROCKWELL_RESOLVE_CHATGPT_ASSET',assetPointer:'sediment://file-ai-1',sourceUrl:'https://chatgpt.com/c/test',maxBytes:1024*1024});
 if(!result.ok||!result.dataUrl.startsWith('data:image/png;base64,')) throw Error('resolver failed '+JSON.stringify(result));
 if(!calls.some(c=>/backend-api\/files\/file-ai-1\/download/.test(c.url))) throw Error('download endpoint not tried');
 console.log(JSON.stringify({ok:true,calls:calls.length,mime:result.mime,size:result.size}));
})().catch(e=>{console.error(e);process.exit(1);});
