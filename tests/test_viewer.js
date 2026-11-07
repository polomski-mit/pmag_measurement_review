// Execute the shipped viewer against a minimal DOM and checked Canvas API.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(), handlers={}, cache=new Map(), alerts=[];
const canvas=new Proxy({}, {get(target,key){return target[key]??((...args)=>{
  for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${key}: nonfinite coordinate`);
})}});
function element(id){if(!elements.has(id))elements.set(id,{
  value:id==='filter'?'all':'',style:{},clientWidth:900,children:[],
  replaceChildren(...children){this.children=children},setAttribute(){},
  getContext(){return canvas},click(){},closest(){return null}
});return elements.get(id)}
const document={getElementById:element,createElement:()=>element(Symbol()),addEventListener:(name,fn)=>handlers[name]=fn};
const sandbox={document,window:{devicePixelRatio:1,addEventListener(){}},structuredClone,
  localStorage:{getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)},
  Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:fn=>fn(),alert:msg=>alerts.push(msg)};
const context=vm.createContext(sandbox);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
assert.equal(element('counter').textContent,'0 / 0');
element('demo').onclick();
assert.equal(element('counter').textContent,'1 / 4');
assert.equal(element('reasons').children.length,2);
assert.match(element('csd-warning').style.cssText,/#c62828/);
assert.ok(element('reasons').children.every(li=>typeof li.textContent==='string'));
function key(key){handlers.keydown({key,target:{closest:()=>false},preventDefault(){}})}
key('y');assert.equal(element('decision').textContent,'APPROVED');
key('n');assert.equal(element('decision').textContent,'REJECTED');
key('u');assert.equal(element('decision').textContent,'PENDING');
key('ArrowRight');assert.equal(element('csd-warning').hidden,true);
key('ArrowRight');assert.match(element('csd-warning').style.cssText,/#ef8c00/);
assert.equal(element('csd-warning').hidden,false);
element('note').value='Reviewed synthetic case';element('note').oninput();
key('ArrowRight');assert.equal(element('partner-card').hidden,false);
key('ArrowLeft');assert.equal(element('note').value,'Reviewed synthetic case');
element('save').onclick();assert.match(element('cache-state').textContent,/downloaded/);
assert.throws(()=>vm.runInContext('openBundle({})',context),/Unsupported review bundle/);
assert.equal(alerts.length,0);
console.log('Viewer passed: bullet reasons, CSD warnings, plots, navigation, decisions, notes, export, validation.');
