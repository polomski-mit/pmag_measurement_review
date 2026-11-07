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
const document={documentElement:{dataset:{}},getElementById:element,createElement:()=>element(Symbol()),addEventListener:(name,fn)=>handlers[name]=fn};
const sandbox={document,window:{devicePixelRatio:1,addEventListener(){}},structuredClone,
  localStorage:{getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)},
  Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:fn=>fn(),alert:msg=>alerts.push(msg)};
const context=vm.createContext(sandbox);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
assert.equal(element('counter').textContent,'0 / 0');
assert.equal(document.documentElement.dataset.theme,'light');
element('theme').onclick();assert.equal(document.documentElement.dataset.theme,'dark');
assert.equal(cache.get('measurement-review-theme'),'dark');
assert.equal(element('theme').textContent,'Light mode');

element('demo').onclick();
assert.equal(element('counter').textContent,'1 / 4');
assert.equal(element('reasons').children.length,2);
assert.match(element('case-warning').className,/severity-red/);
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
 const screened=vm.runInContext("screenedRows('DEMO-01')",context);
 assert.equal(!!screened[1]._screened_out,status==='APPROVED');
 if(status==='APPROVED'){
  element('plot-view').value='raw';element('plot-view').onchange();
  assert.equal(vm.runInContext("screenedRows('DEMO-01')[1]._screened_out",context),undefined);
  element('plot-view').value='screened';element('plot-view').onchange();
 }

 assert.match(element('cache-state').textContent,/Autosaved/);
 const stored=JSON.parse([...cache.entries()].find(([key])=>key.startsWith('measurement-review:'))[1]);
 assert.equal(stored.ledger.exclusions['DEMO-01|2000-01-01T12:01:00'].status,status.toLowerCase());
}
key('ArrowRight');assert.equal(element('csd-warning').hidden,true);
assert.match(element('reasons').children[0].children[1].textContent,/Vector length is unchanged/);
assert.match(element('case-warning').className,/severity-purple/);
key('ArrowRight');assert.match(element('csd-warning').style.cssText,/#ef8c00/);
assert.match(element('reasons').children[0].children[1].textContent,/6.0°/);
assert.equal(element('csd-warning').hidden,false);
assert.match(element('case-warning').className,/severity-orange/);
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
element('theme').onclick();assert.equal(document.documentElement.dataset.theme,'light');
for(const [ratio,level] of [[0.001,'magenta'],[0.00101,'magenta'],[0.01,'magenta']]){
 const warning=vm.runInContext(`reviewWarnings({reasons:['low_moment'],evidence:{low_moment:{ratio:${ratio}}}},'exclusion',{})[0]`,context);
 assert.equal(warning.level,level);
}
assert.equal(vm.runInContext("reviewWarnings({reasons:['existing_bad_flag']},'exclusion',{})[0].level",context),'blue');
// Accepted flips rotate only direction; swaps replace membership for both specimens.
vm.runInContext(`ledger.review_candidates.find(e=>e.type==='possible_flip').status='approved'`,context);
let corrected=vm.runInContext("screenedRows('DEMO-02')[1]",context);
assert.equal(corrected.dir_dec,75);assert.equal(corrected.dir_inc,35);
vm.runInContext("drawReviewPlots(document.getElementById('plots'),screenedRows('DEMO-02'),screenedRows('DEMO-02')[1],null,{kelvinOffset:273.15})",context);
assert.equal(corrected._original.dir_dec,'285');assert.equal(corrected.magn_moment,'1e-08');
vm.runInContext(`ledger.review_candidates.find(e=>e.type==='possible_swap').status='approved'`,context);
const swapped=vm.runInContext("screenedRows('SWAP-01')",context);
assert.equal(swapped.filter(r=>r._screened_out).length,1);
assert.equal(swapped.find(r=>r._screened_changed).dir_dec,'10');
assert.equal(vm.runInContext("screenedRows('SWAP-02').find(r=>r._screened_changed).dir_dec",context),'100');
const runs=vm.runInContext("plotRuns([{x:1},{x:2,_screened_out:true},{x:3},{x:4}],r=>[r.x,0])",context);
assert.equal(runs.length,2);assert.equal(runs[0].length,1);assert.equal(runs[1].length,2);
// No preview correction is applied where approved actions conflict.
vm.runInContext(`ledger.exclusions['SWAP-01|2000-01-01T12:10:00']={status:'approved'}`,context);
assert.equal(vm.runInContext("screenedRows('SWAP-02').some(r=>r._screened_changed)",context),false);
assert.match(element('plot-state').textContent,/Conflicting/);
// Three flags for one specimen: same-session decisions accumulate in After.
vm.runInContext(`{
 const bundle=structuredClone(demoPayload),rows=bundle.context['DEMO-01'];
 const template=Object.values(bundle.ledger.exclusions)[0];
 bundle.bundle_id='same-specimen-regression';bundle.deck=[];
 bundle.ledger.exclusions={};bundle.ledger.review_candidates=[];
 rows.forEach(row=>{const id=rowIdentity(row);
  bundle.ledger.exclusions[id]={...structuredClone(template),status:'pending',specimen:row.specimen,timestamp:row.timestamp};
  bundle.deck.push({section:'exclusions',id,type:'exclusion',identity:id,specimen:row.specimen,datasets:['Synthetic regression']});
 });openBundle(bundle);
}`,context);
key('y');key('Enter');
assert.equal(element('counter').textContent,'2 / 3');
assert.equal(vm.runInContext("screenedRows('DEMO-01')[0]._screened_out",context),true);
key('n');key('Enter');
assert.equal(element('counter').textContent,'3 / 3');
assert.equal(vm.runInContext("screenedRows('DEMO-01')[0]._screened_out",context),true);
assert.equal(vm.runInContext("!!screenedRows('DEMO-01')[1]._screened_out",context),false);
key('y');key('Escape');
assert.equal(vm.runInContext("!!screenedRows('DEMO-01')[2]._screened_out",context),false);
key('y');key('Enter');
assert.equal(vm.runInContext("screenedRows('DEMO-01').filter(r=>r._screened_out).length",context),2);
element('plot-view').value='raw';element('plot-view').onchange();
assert.equal(vm.runInContext("screenedRows('DEMO-01').filter(r=>r._screened_out).length",context),0);
element('plot-view').value='screened';element('plot-view').onchange();
assert.equal(vm.runInContext("screenedRows('DEMO-01').filter(r=>r._screened_out).length",context),2);
vm.runInContext('openBundle(initial)',context);
assert.equal(vm.runInContext("screenedRows('DEMO-01').filter(r=>r._screened_out).length",context),2);
// A retained segment may not cross an excluded treatment, including repeat runs.
assert.equal(vm.runInContext("plotRuns([{treat_temp:600},{treat_temp:650},{treat_temp:625,_screened_out:true}],r=>[r.treat_temp,0]).length",context),2);
for(const axis of ['x','y'])for(const full of [true,false]){
 vm.runInContext(`drawReviewPlots(document.getElementById('plots'),screenedRows('DEMO-01'),screenedRows('DEMO-01')[1],null,{kelvinOffset:273.15,axis:'${axis}',full:${full}})`,context);
}
assert.equal(alerts.length,0);
console.log('Viewer passed: bullet reasons, CSD warnings, plots, navigation, decisions, notes, export, validation.');
