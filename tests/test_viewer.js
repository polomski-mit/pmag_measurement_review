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
  getContext(){return canvas},click(){},closest(){return null},showModal(){this.open=true},close(){this.open=false}
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
assert.ok(element('reasons').children.every(li=>li.children[0].textContent&&li.children[1].textContent));
assert.match(element('reasons').children.map(li=>li.children[1].textContent).join(' '),/14.0°/);
assert.match(element('reasons').children.map(li=>li.children[1].textContent).join(' '),/log interpolation/);
function key(key){handlers.keydown({key,target:{closest:()=>false},preventDefault(){}})}
const savedBefore=JSON.stringify([...cache]);
key('y');assert.equal(element('confirm-dialog').open,true);
assert.equal(element('decision').textContent,'PENDING');
assert.equal(JSON.stringify([...cache]),savedBefore);
key('Escape');assert.equal(element('confirm-dialog').open,false);
assert.equal(element('counter').textContent,'1 / 4');
for(const [choice,status] of [['y','APPROVED'],['n','REJECTED'],['u','PENDING']]){
 key(choice);key('Enter');assert.equal(element('counter').textContent,'2 / 4');
 key('ArrowLeft');assert.equal(element('decision').textContent,status);
 assert.match(element('cache-state').textContent,/Autosaved/);
 const stored=JSON.parse([...cache.values()][0]);
 assert.equal(stored.ledger.exclusions['DEMO-01|2000-01-01T12:01:00'].status,status.toLowerCase());
}
key('ArrowRight');assert.equal(element('csd-warning').hidden,true);
assert.match(element('reasons').children[0].children[1].textContent,/Vector length is unchanged/);
key('ArrowRight');assert.match(element('csd-warning').style.cssText,/#ef8c00/);
assert.match(element('reasons').children[0].children[1].textContent,/6.0°/);
assert.equal(element('csd-warning').hidden,false);
element('note').value='Reviewed synthetic case';element('note').oninput();
key('ArrowRight');assert.equal(element('partner-card').hidden,false);
assert.match(element('reasons').children[0].children[1].textContent,/Both must improve/);
key('ArrowLeft');assert.equal(element('note').value,'Reviewed synthetic case');
element('save').onclick();assert.match(element('cache-state').textContent,/downloaded/);
assert.throws(()=>vm.runInContext('openBundle({})',context),/Unsupported review bundle/);
// Confirming under a status filter must not skip the next remaining case.
element('filter').value='pending';element('filter').onchange();
key('y');key('Enter');assert.equal(element('counter').textContent,'1 / 3');
assert.match(element('title').textContent,/DEMO-02/);
// Reopening restores confirmed decisions from local autosave.
element('demo').onclick();assert.match(element('totals').textContent,/1 approved/);
key('ArrowRight');key('ArrowRight');key('ArrowRight');
key('u');key('Enter');assert.equal(element('counter').textContent,'4 / 4');
assert.match(element('cache-state').textContent,/End of review list/);
assert.equal(alerts.length,0);
console.log('Viewer passed: bullet reasons, CSD warnings, plots, navigation, decisions, notes, export, validation.');
