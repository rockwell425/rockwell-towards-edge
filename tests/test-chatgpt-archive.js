const fs = require('fs');
const vm = require('vm');
let code = fs.readFileSync(require('path').join(__dirname,'..','content.js'),'utf8');
code = code.replace(/\}\)\(\);\s*$/, 'globalThis.__rt={activeChatGptBranch,prettifyModelLabel,modelMatchFromText,MessageCollector,mergeCapturedMessage};})();');
const listeners=[];
const document = {
  location:{hostname:'chatgpt.com',href:'https://chatgpt.com/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},
  title:'Synthetic ChatGPT',
  body:{innerText:'', querySelectorAll(){return [];}},
  querySelector(){return null;},
  querySelectorAll(){return [];},
  scrollingElement:{scrollTop:0,scrollHeight:1000,clientHeight:800},
  documentElement:{scrollTop:0,scrollHeight:1000,clientHeight:800}
};
const context = {
  console, URL, WeakMap, Map, Set, Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp,
  document,
  location:document.location,
  globalThis:null,
  window:{scrollY:0,innerHeight:800,scrollTo(){}, location:document.location},
  chrome:{runtime:{onMessage:{addListener(fn){listeners.push(fn)}},sendMessage(){return Promise.resolve({ok:false})}},storage:{local:{get(){return Promise.resolve({})},set(){return Promise.resolve()},remove(){return Promise.resolve()}}}},
  getComputedStyle(){return {overflowY:'visible'}},
  MutationObserver:class{observe(){} disconnect(){}},
  requestAnimationFrame(fn){fn()},
  fetch(){throw new Error('not used')},
  AbortController,
  Blob, FileReader:class{}, Image:class{},
  setTimeout, clearTimeout, btoa: s=>Buffer.from(s,'binary').toString('base64'),
  Node:{DOCUMENT_POSITION_FOLLOWING:4,DOCUMENT_POSITION_PRECEDING:2}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(code,context,{timeout:5000});
const rt=context.__rt;
if(!rt) throw new Error('exports missing');
const platform={id:'chatgpt',assistantLabel:'ChatGPT'};
const payload={
 title:'Long conversation', current_node:'n6', mapping:{
  n0:{id:'n0',parent:null,message:{id:'m0',author:{role:'system'},content:{parts:['hidden']}}},
  n1:{id:'n1',parent:'n0',message:{id:'m1',author:{role:'user'},content:{parts:['第一问']},create_time:1}},
  n2:{id:'n2',parent:'n1',message:{id:'m2',author:{role:'assistant'},content:{parts:['第一答']},metadata:{model_slug:'gpt-5-6-sol'},recipient:'all',channel:'final',create_time:2}},
  n3:{id:'n3',parent:'n2',message:{id:'m3',author:{role:'assistant'},content:{parts:['hidden analysis']},metadata:{},recipient:'all',channel:'analysis'}},
  n4:{id:'n4',parent:'n3',message:{id:'m4',author:{role:'user'},content:{parts:['第二问']},create_time:3}},
  n5:{id:'n5',parent:'n4',message:{id:'m5',author:{role:'assistant'},content:{parts:['```js\nconsole.log(1)\n```']},metadata:{model_slug:'gpt5.6sol'},recipient:'all',channel:'final',create_time:4}},
  n6:{id:'n6',parent:'n5',message:{id:'m6',author:{role:'assistant'},content:{parts:['tool hidden']},metadata:{},recipient:'image_gen',channel:'commentary'}}
 }};
const msgs=rt.activeChatGptBranch(payload,platform);
if(msgs.length!==4) throw new Error('expected 4 visible messages, got '+msgs.length);
if(msgs[1].modelLabel!=='GPT-5.6 Sol') throw new Error('model slug normalize failed: '+msgs[1].modelLabel);
if(msgs[3].blocks[0].type!=='code') throw new Error('code fence parse failed');
const c=new rt.MessageCollector(platform,'auto',{});
c.addMessages(msgs);
c.addMessage({id:'conversation-turn-1',role:'assistant',order:1,modelLabel:'',blocks:[{type:'paragraph',text:'第一答',runs:[{text:'第一答'}]},{type:'image',src:'https://x/img.png',alt:'AI图'}],plainText:'第一答',captureSource:'dom'});
if(c.values().length!==4) throw new Error('DOM/API merge duplicated message');
if(!c.values()[1].blocks.some(b=>b.type==='image')) throw new Error('DOM media not merged');
console.log(JSON.stringify({messages:msgs.length,model:msgs[1].modelLabel,merged:c.values().length,code:msgs[3].blocks[0].language}));
