const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
code = code.replace(/\}\)\(\);\s*$/, 'globalThis.__rt={activeChatGptBranch,archiveMediaBlocks,chatGptAssetId};})();');
const document = {
  location:{hostname:'chatgpt.com',href:'https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},
  title:'Media Chat', body:{innerText:'',querySelectorAll(){return [];}}, querySelector(){return null;}, querySelectorAll(){return [];}
};
const ctx={console,URL,WeakMap,Map,Set,Date,Math,JSON,String,Number,Boolean,Array,Object,RegExp,document,location:document.location,window:{location:document.location},globalThis:null,
chrome:{runtime:{onMessage:{addListener(){}},sendMessage:async()=>({ok:false})},storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}}},
fetch:async()=>{},AbortController,setTimeout,clearTimeout,btoa:s=>Buffer.from(s).toString('base64')};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const mapping={
 n1:{parent:null,message:{id:'u1',author:{role:'user'},content:{content_type:'multimodal_text',parts:['请看图',{content_type:'image_asset_pointer',asset_pointer:'file-service://file-user-1',width:1024,height:768}]},metadata:{attachments:[{id:'file-user-1',name:'input.png',mime_type:'image/png'}]}}},
 n2:{parent:'n1',message:{id:'tool1',author:{role:'tool',name:'image_gen'},recipient:'all',channel:'commentary',content:{content_type:'multimodal_text',parts:[{content_type:'image_asset_pointer',asset_pointer:'sediment://file-ai-1',metadata:{width:1536,height:1024}}]},metadata:{}}},
 n3:{parent:'n2',message:{id:'a2',author:{role:'assistant'},recipient:'all',channel:'final',content:{parts:['完成。',{type:'generated_image',image_url:{url:'https://files.oaiusercontent.com/file-ai-2.png'}}]},metadata:{model_slug:'gpt-5-6-thinking'}}}
};
const messages=ctx.__rt.activeChatGptBranch({current_node:'n3',mapping},{id:'chatgpt',assistantLabel:'ChatGPT'},{includeUserImages:true,includeAiImages:true,includeAttachments:true,mediaMode:'full'});
if(messages.length!==2) throw Error('expected 2 visible messages, got '+messages.length);
const userImages=messages[0].blocks.filter(b=>b.type==='image');
const aiImages=messages.filter(m=>m.role==='assistant').flatMap(m=>m.blocks.filter(b=>b.type==='image'));
if(userImages.length<1) throw Error('user archive image missing');
if(aiImages.length<2) throw Error('AI archive images missing: '+aiImages.length);
if(!aiImages.some(b=>b.assetPointer==='sediment://file-ai-1'&&b.fileId==='file-ai-1')) throw Error('sediment asset pointer not parsed');
if(!aiImages.some(b=>/^https:\/\/files\.oaiusercontent\.com\//.test(b.src))) throw Error('direct generated URL not parsed');
console.log(JSON.stringify({messages:messages.length,userImages:userImages.length,aiImages:aiImages.length,fileId:aiImages[0].fileId}));
