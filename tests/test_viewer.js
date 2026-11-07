// Execute the shipped viewer against a minimal DOM and checked Canvas API.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(), handlers={}, cache=new Map(), alerts=[],plotLabels=[];
const canvas=new Proxy({}, {get(target,key){return target[key]??((...args)=>{
  for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${key}: nonfinite coordinate`);
})}});
canvas.fillText=(value,x,y)=>{assert.ok(Number.isFinite(x)&&Number.isFinite(y));plotLabels.push(value)};
function element(id){if(!elements.has(id))elements.set(id,{
  value:id==='filter'?'all':'',style:{},clientWidth:900,children:[],
  replaceChildren(...children){this.children=children},append(...children){this.children.push(...children)},setAttribute(){},
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
assert.ok(plotLabels.some(label=>label.startsWith('SELECTED: DEMO-01')));
assert.ok(plotLabels.some(label=>label.startsWith('SELECTED H ·')));
assert.ok(plotLabels.some(label=>label.startsWith('SELECTED V ·')));
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
assert.equal(vm.runInContext('entry(current()).status',context),'pending');
vm.runInContext('position=filtered().length-1;render()',context);
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
// Cardinal directions match PmagPy Demag: East/Down downward, rotation about Z.
for(const [dec,inc,rotation,expectedH,expectedV] of [[0,0,0,[1,0],[1,0]],[90,0,0,[0,-1],[0,0]],[0,90,0,[0,0],[0,-1]],[0,-90,0,[0,0],[0,1]],[90,0,90,[1,0],[1,0]],[0,0,90,[0,1],[0,0]]]){
 const v=vm.runInContext(`zijderveldProjection({dir_dec:${dec},dir_inc:${inc},magn_moment:2},${rotation},2)`,context);
 for(const [actual,expected] of [[v.horizontal,expectedH],[v.vertical,expectedV]])actual.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<1e-12));
}
assert.equal(alerts.length,0);
console.log('Viewer passed: bullet reasons, CSD warnings, plots, navigation, decisions, notes, export, validation.');
(async()=>{
// Repeat choices require confirmation and update screened plots immediately.
vm.runInContext(`{
 const bundle=structuredClone(demoPayload),rows=bundle.context['DEMO-01'];
 const repeated={...rows[1],timestamp:'2000-01-01T13:00:00',_review_identity:'DEMO-01|2000-01-01T13:00:00',dir_csd:'1'};rows.push(repeated);
 bundle.bundle_id='repeat-regression';bundle.repeat_groups={'repeat-test':{group_id:'repeat-test',specimen:'DEMO-01',treat_temp:Number(rows[1].treat_temp),signature:'signature-test',identities:[rowIdentity(rows[1]),rowIdentity(repeated)]}};openBundle(bundle);
}`,context);
assert.equal(element('repeat-review').hidden,true);
assert.equal(vm.runInContext('reviewStage',context),'quality');
element('finish-quality').onclick();assert.equal(element('stage-dialog').open,true);
element('stage-cancel').onclick();assert.equal(vm.runInContext('reviewStage',context),'quality');
element('finish-quality').onclick();await element('stage-apply').onclick();
assert.equal(vm.runInContext('reviewStage',context),'repeats');
assert.equal(element('quality-navigation').hidden,true);
assert.match(element('repeat-status').textContent,/1 of 1 temperature groups/);
element('repeat-member').value='DEMO-01|2000-01-01T13:00:00';element('repeat-open').onclick();
assert.equal(element('vector-context').value,'local');assert.equal(element('yes').disabled,true);
element('repeat-choose').onclick();key('Escape');
assert.equal(vm.runInContext('Object.keys(ledger.repeat_selections||{}).length',context),0);
element('repeat-choose').onclick();key('Enter');
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].selected_identity",context),'DEMO-01|2000-01-01T13:00:00');
assert.match(element('repeat-status').textContent,/0 repeated/);
assert.equal(vm.runInContext("screenedRows('DEMO-01').find(r=>r.timestamp==='2000-01-01T12:01:00')._screened_out",context),true);
console.log('Repeat picker passed: explicit selection, cancel/confirm, zoom, same-session screened plots.');

// Every repeat has clickable, separately numbered callouts, even when coincident.
const repeatCanvas=element('plots');
repeatCanvas.getBoundingClientRect=()=>({left:10,top:20,width:450,height:parseFloat(repeatCanvas.style.height)/2});
const labelHits=repeatCanvas._repeatHitTargets.filter(h=>h.kind==='label');
assert.equal(new Set(labelHits.map(h=>h.identity)).size,2);
assert.equal(labelHits.length,10); // moment, CSD, directions, H and V for each
const firstIdentity=labelHits[0].identity;
const savedWinner=vm.runInContext("ledger.repeat_selections['repeat-test'].selected_identity",context);
const pointHit=repeatCanvas._repeatHitTargets.find(h=>h.kind==='point'&&h.identity===firstIdentity);
repeatCanvas.onclick({clientX:10+(pointHit.x+9)/2,clientY:20+(pointHit.y+9)/2});
assert.match(element('repeat-status').textContent,/overlap/i);
const firstLabel=labelHits[0];
repeatCanvas.onclick({clientX:10+(firstLabel.x+18)/2,clientY:20+(firstLabel.y+9)/2});
assert.equal(element('repeat-member').value,firstIdentity);
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].selected_identity",context),savedWinner);
const buttons=element('repeat-options').children;
assert.equal(buttons.length,2);
assert.equal(buttons[0].textContent.includes('SELECTED'),true);
buttons[1].onclick();
assert.equal(element('repeat-member').value,savedWinner);
console.log('Repeat plots passed: all candidates shown, overlap handling, scaled-canvas clicks, clickable candidate list, no implicit save.');

element('repeat-all-bad').onclick();assert.equal(element('confirm-dialog').open,true);key('Escape');
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].selected_identity",context),savedWinner);

// Rejecting every repeat is explicit, reversible, and screens out all candidates.
element('repeat-all-bad').onclick();assert.match(element('confirm-message').textContent,/ALL 2/);key('Escape');
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].all_bad",context),undefined);
element('repeat-all-bad').onclick();key('Enter');
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].all_bad",context),true);
assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].selected_identity",context),null);
assert.equal(vm.runInContext("repeatGroups().filter(g=>!repeatResolved(g)).length",context),0);
assert.equal(vm.runInContext("screenedRows('DEMO-01').filter(r=>initial.repeat_groups['repeat-test'].identities.includes(rowIdentity(r))).every(r=>r._screened_out)",context),true);
element('repeat-choose').onclick();key('Enter');assert.equal(vm.runInContext("ledger.repeat_selections['repeat-test'].all_bad",context),undefined);
// Agreeing reliable neighbors support an all-candidates warning; no extrapolation.
vm.runInContext(`{
 const r={specimen:'CHECK',dir_dec:'0',dir_inc:'30',dir_csd:'1',magn_moment:'1e-8',quality:'g',timestamp:'test'};
 const neighbors=[{...r,treat_temp:768},{...r,treat_temp:778}];
 const group={specimen:'CHECK',treat_temp:773};
 globalThis.allBadConcern=repeatConcern(group,[{...r,dir_dec:'180',dir_inc:'-30'},{...r,magn_moment:'1e-11'}],neighbors);
 globalThis.oneGoodConcern=repeatConcern(group,[r,{...r,magn_moment:'1e-11'}],neighbors);
 globalThis.missingConcern=repeatConcern(group,[{...r,dir_csd:'15'}],neighbors.slice(0,1));
 globalThis.noisyConcern=repeatConcern(group,[{...r,dir_csd:'15'}],neighbors.map(n=>({...n,dir_csd:'5'})));
}`,context);
assert.equal(vm.runInContext('allBadConcern.reasons.length',context),2);
assert.equal(vm.runInContext('oneGoodConcern',context),null);assert.equal(vm.runInContext('missingConcern',context),null);assert.equal(vm.runInContext('noisyConcern',context),null);

// Returning to quality review hides repeat UI; handoff removes approved bad rows.
element('back-quality').onclick();
assert.equal(element('repeat-review').hidden,true);
vm.runInContext(`{
 const bundle=structuredClone(demoPayload),rows=bundle.context['DEMO-01'];
 const repeated={...rows[1],timestamp:'2000-01-01T13:00:00',_review_identity:'DEMO-01|2000-01-01T13:00:00'};
 rows.push(repeated);bundle.bundle_id='quality-first-regression';
 bundle.repeat_groups={g:{group_id:'g',specimen:'DEMO-01',treat_temp:Number(rows[1].treat_temp),signature:'test',identities:[rowIdentity(rows[1]),rowIdentity(repeated)]}};
 bundle.ledger.exclusions[rowIdentity(rows[1])].status='approved';openBundle(bundle);
}`,context);
element('finish-quality').onclick();await element('stage-apply').onclick();
assert.equal(vm.runInContext('repeatGroups().length',context),0);
assert.equal(vm.runInContext("repeatContext['DEMO-01'].some(r=>r.timestamp==='2000-01-01T12:01:00')",context),false);
assert.equal(element('case').hidden,true);
element('theme').onclick();assert.equal(element('case').hidden,true);
// Manual preview supports unsuggested measurements without changing decisions.
element('demo').onclick();
element('manual-model').value='arrow-x';
const beforePreview=vm.runInContext('JSON.stringify(ledger)',context),beforeCache=JSON.stringify([...cache]);
element('manual-preview-button').onclick();assert.equal(element('manual-preview-button').textContent,'Stop flip preview');assert.match(element('manual-preview-values').textContent,/Preview:/);assert.equal(vm.runInContext('JSON.stringify(ledger)',context),beforePreview);assert.equal(JSON.stringify([...cache]),beforeCache);
element('manual-preview-button').onclick();assert.equal(element('manual-preview-button').textContent,'Preview loading flip');assert.equal(vm.runInContext('JSON.stringify(ledger)',context),beforePreview);element('manual-preview-button').onclick();
element('manual-propose').onclick();key('Escape');assert.equal(vm.runInContext('JSON.stringify(ledger)',context),beforePreview);
element('manual-propose').onclick();key('Enter');
assert.equal(vm.runInContext("current().id.startsWith('manual-flip:')",context),true);assert.equal(vm.runInContext('entry(current()).status',context),'pending');assert.equal(element('decision').textContent,'PENDING');assert.doesNotMatch(element('reasons').children[0].children[0].textContent,/NaN/);
vm.runInContext("if(ledger.exclusions[current().identity])ledger.exclusions[current().identity].status='pending'",context);
key('y');key('Enter');assert.equal(vm.runInContext("ledger.review_candidates.find(e=>e.origin==='manual').status",context),'approved');
element('manual-revisit').onclick();assert.equal(element('filter').value,'rejected');assert.equal(vm.runInContext("ledger.review_candidates.find(e=>e.origin==='manual').status",context),'approved');
console.log('Two-stage review passed: explicit apply prompt, cancellation, separate screen, bad rows removed, singleton skipped.');
// A second approved action is blocked with links; existing decisions stay intact.
vm.runInContext("const flipCard=initial.deck.find(c=>entry(c).origin==='manual');jumpToDecision(flipCard);entry(flipCard).status='pending';ledger.exclusions[flipCard.identity]||={status:'pending',reasons:['high_csd']};if(!initial.deck.some(c=>c.section==='exclusions'&&c.id===flipCard.identity))initial.deck.push({...flipCard,section:'exclusions',id:flipCard.identity,type:'exclusion'});ledger.exclusions[flipCard.identity].status='approved'",context);
const conflictBefore=vm.runInContext('JSON.stringify(ledger)',context);key('y');
assert.equal(element('stage-dialog').open,true);assert.equal(element('stage-apply').disabled,true);assert.ok(element('stage-conflicts').children.length>0);assert.equal(vm.runInContext('JSON.stringify(ledger)',context),conflictBefore);
element('stage-conflicts').children[0].children.find(n=>n.textContent.startsWith('Review exclusion')).onclick();assert.equal(element('stage-dialog').open,false);assert.equal(vm.runInContext('current().type',context),'exclusion');
// Reopen at an undecided case, wrapping from the saved position; completed reviews stay at the end.
vm.runInContext("initial.deck.forEach(c=>entry(c).status='approved');entry(initial.deck[1]).status='pending';position=initial.deck.length-1;resumeToUndecided()",context);
assert.equal(vm.runInContext('position',context),1);
vm.runInContext("entry(initial.deck[1]).status='approved';resumeToUndecided()",context);
assert.equal(vm.runInContext('position===initial.deck.length-1',context),true);
console.log('Resume passed: next undecided, wraparound, completed review at end.');
const distances=vm.runInContext(`flipNeighborDistances({specimen:'T',timestamp:'s',treat_temp:400,dir_dec:30,dir_inc:40},'arrow-x',[{specimen:'T',timestamp:'a',treat_temp:390,dir_dec:330,dir_inc:-40},{specimen:'T',timestamp:'b',treat_temp:410,dir_dec:330,dir_inc:-40},{specimen:'T',timestamp:'c',treat_temp:395,dir_dec:0,dir_inc:0,_screened_out:true}])`,context);
assert.equal(distances.length,2);assert.ok(distances.every(d=>d.before>90&&d.after<.00001));assert.equal(vm.runInContext("angularDistance({dir_dec:359,dir_inc:0},{dir_dec:1,dir_inc:0})",context).toFixed(1),'2.0');
console.log('Flip distances passed: spherical angles, wraparound, screened neighbors.');


})().catch(error=>{console.error(error);process.exitCode=1});

const zoomCheck=vm.runInContext(`(()=>{const rows=[1,1.2,1.1,89].map((csd,i)=>({dir_csd:csd,magn_moment:1e-8,treat_temp:900+i}));rows.push({...rows[0],_screened_out:true,dir_csd:1000});return {zoom:zoomPlotRows(rows).map(r=>!!r._plot_hidden),full:zoomPlotRows(rows,true).map(r=>!!r._plot_hidden)}})()`,context);
assert.deepEqual(Array.from(zoomCheck.zoom),[false,false,false,true,true]);
assert.deepEqual(Array.from(zoomCheck.full),[false,false,false,false,true]);
console.log('Zoom filtering passed: excluded observations ignored, outliers hidden only in zoom.');
