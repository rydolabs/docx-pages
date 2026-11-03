import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocxReactBindings } from '../../src/react/factory.js';

class Component { constructor(props){ this.props=props; } }
const React = { Component, createElement:(type,props,...children)=>({type,props:{...(props||{}),children}}) };

function deferred(){
  let resolve, reject;
  const promise=new Promise((res,rej)=>{resolve=res; reject=rej;});
  return {promise,resolve,reject};
}
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }

test('rapid source changes abort the old run and dispose a stale late result', async () => {
  const a=deferred(), b=deferred();
  const calls=[]; const loads=[];
  const openDocxImpl=(source,target,options)=>{
    calls.push({source,target,signal:options.signal});
    return source==='a'?a.promise:b.promise;
  };
  const { DocxViewer }=createDocxReactBindings(React,{openDocxImpl});
  const instance=new DocxViewer({source:'a',onLoad:r=>loads.push(r.name)});
  instance.host={};
  const runA=instance.renderDocx();
  instance.props={source:'b',onLoad:r=>loads.push(r.name)};
  const runB=instance.renderDocx();
  assert.equal(calls.length,2);
  assert.equal(calls[0].signal.aborted,true);
  let staleDisposed=0;
  a.resolve({name:'a',dispose(){staleDisposed++;}});
  await runA;
  assert.equal(staleDisposed,1);
  assert.deepEqual(loads,[]);
  let currentDisposed=0;
  b.resolve({name:'b',dispose(){currentDisposed++;}});
  await runB;
  assert.deepEqual(loads,['b']);
  instance.componentWillUnmount();
  assert.equal(currentDisposed,1);
  assert.equal(calls[1].signal.aborted,true);
});

test('unmount aborts a pending render and AbortError is not forwarded to onError', async () => {
  const d=deferred(); let seenSignal; const errors=[];
  const { DocxViewer }=createDocxReactBindings(React,{openDocxImpl:(_s,_t,o)=>{seenSignal=o.signal; return d.promise;}});
  const instance=new DocxViewer({source:'doc',onError:e=>errors.push(e)});
  instance.host={};
  const run=instance.renderDocx();
  instance.componentWillUnmount();
  assert.equal(seenSignal.aborted,true);
  const err=new Error('aborted'); err.name='AbortError'; d.reject(err);
  await run;
  assert.deepEqual(errors,[]);
});

test('real render errors reach onError while the component stays reusable', async () => {
  let count=0; const errors=[];
  const { DocxViewer }=createDocxReactBindings(React,{openDocxImpl:async()=>{count++; if(count===1) throw new Error('boom'); return {dispose(){}};}});
  const instance=new DocxViewer({source:'a',onError:e=>errors.push(e.message)}); instance.host={};
  await instance.renderDocx();
  assert.deepEqual(errors,['boom']);
  instance.props={source:'b',onError:e=>errors.push(e.message)};
  await instance.renderDocx();
  assert.ok(instance.result);
  instance.componentWillUnmount();
});

test('StrictMode-like mount/unmount/remount does not let the first instance win late', async () => {
  const first=deferred(), second=deferred(); let call=0; const loads=[];
  const openDocxImpl=()=> (++call===1?first.promise:second.promise);
  const { DocxViewer }=createDocxReactBindings(React,{openDocxImpl});
  const one=new DocxViewer({source:'same',onLoad:()=>loads.push('first')}); one.host={};
  const p1=one.renderDocx(); one.componentWillUnmount();
  const two=new DocxViewer({source:'same',onLoad:()=>loads.push('second')}); two.host={};
  const p2=two.renderDocx();
  let disposed=0; first.resolve({dispose(){disposed++;}}); second.resolve({dispose(){}});
  await Promise.all([p1,p2]);
  assert.equal(disposed,1);
  assert.deepEqual(loads,['second']);
  two.componentWillUnmount();
});

test('factory can be created without browser globals (SSR import contract)', () => {
  const oldDoc=globalThis.document; const oldWin=globalThis.window;
  try {
    delete globalThis.document; delete globalThis.window;
    const { DocxViewer }=createDocxReactBindings(React,{openDocxImpl:async()=>({dispose(){}})});
    const instance=new DocxViewer({source:null});
    assert.equal(instance.render().type,'div');
  } finally {
    if(oldDoc!==undefined) globalThis.document=oldDoc;
    if(oldWin!==undefined) globalThis.window=oldWin;
  }
});
