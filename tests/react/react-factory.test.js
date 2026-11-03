import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocxReactBindings } from '../../src/react/factory.js';

class Component { constructor(props){ this.props=props; } }
const React = { Component, createElement:(type,props,...children)=>({type,props:{...(props||{}),children}}) };

test('React factory exposes a class component without changing the core package surface', () => {
  const api = createDocxReactBindings(React);
  assert.equal(typeof api.DocxViewer, 'function');
  const instance = new api.DocxViewer({ source:null, className:'x' });
  const vnode = instance.render();
  assert.equal(vnode.type, 'div');
  assert.equal(vnode.props.className, 'x');
  assert.equal(vnode.props['data-docx-viewer-react'], 'true');
});

test('hook reports a clear requirement on React runtimes without Hooks', () => {
  const { useDocxViewer } = createDocxReactBindings(React);
  assert.throws(() => useDocxViewer(null), /Hooks support/);
});

test('React component accepts simple revisions and changesPanel props', () => {
  const api = createDocxReactBindings(React);
  const instance = new api.DocxViewer({ source:null, revisions:true, changesPanel:true, className:'shell' });
  const vnode = instance.render();
  assert.equal(vnode.type,'div');
  assert.equal(vnode.props['data-docx-viewer-react-wrapper'],'true');
  assert.equal(vnode.props.className,'shell');
  assert.equal(vnode.props.children.length,2);
  assert.equal(vnode.props.children[0].props['data-docx-viewer-react'],'true');
  assert.equal(vnode.props.children[1].props['data-docx-viewer-changes-panel'],'true');
});

test('React component refreshes when simple props change', () => {
  const api = createDocxReactBindings(React);
  const instance = new api.DocxViewer({ source:'a', revisions:false, fonts:true });
  let calls=0; instance.renderDocx=()=>{calls++;};
  instance.props={source:'a',revisions:true,fonts:true};
  instance.componentDidUpdate({source:'a',revisions:false,fonts:true});
  assert.equal(calls,1);
});
