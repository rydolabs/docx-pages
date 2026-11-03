import React from 'react';
import { createDocxReactBindings } from './factory.js';

const bindings = createDocxReactBindings(React);
export const DocxViewer = bindings.DocxViewer;
export const useDocxViewer = bindings.useDocxViewer;
