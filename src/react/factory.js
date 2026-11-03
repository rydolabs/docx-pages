import { openDocx } from '../docx-viewer.js';

export function createDocxReactBindings(React, { openDocxImpl = openDocx } = {}) {
  if (!React?.Component || !React?.createElement) throw new Error('React runtime is required');

  class DocxViewer extends React.Component {
    constructor(props) {
      super(props);
      this.host = null;
      this.runId = 0;
      this.result = null;
      this.controller = null;
      this.setHost = node => { this.host = node; };
    }
    componentDidMount() { this.renderDocx(); }
    componentDidUpdate(prev) {
      if (prev.source !== this.props.source || prev.options !== this.props.options || prev.revisions !== this.props.revisions || prev.changesPanel !== this.props.changesPanel || prev.fonts !== this.props.fonts) this.renderDocx();
    }
    componentWillUnmount() { this.cancel(); }
    cancel() {
      this.runId++;
      this.controller?.abort?.();
      this.controller = null;
      this.result?.dispose?.();
      this.result = null;
    }
    async renderDocx() {
      this.cancel();
      if (!this.host || this.props.source == null) return;
      const runId = ++this.runId;
      const controller = new AbortController();
      this.controller = controller;
      try {
        const result = await openDocxImpl(this.props.source, this.host, buildReactOptions(this.props, controller.signal, this.reviewHost));
        if (runId !== this.runId) { result?.dispose?.(); return; }
        this.result = result;
        this.props.onLoad?.(result);
      } catch (error) {
        if (error?.name !== 'AbortError') this.props.onError?.(error);
      }
    }
    render() {
      const { source, options, onLoad, onError, revisions, changesPanel, fonts, ...divProps } = this.props;
      if (!changesPanel) return React.createElement('div', { ...divProps, ref:this.setHost, 'data-docx-viewer-react':'true' });
      const wrapperProps = { ...divProps, 'data-docx-viewer-react-wrapper':'true' };
      const viewer = React.createElement('div', { ref:this.setHost, 'data-docx-viewer-react':'true' });
      const panel = React.createElement('aside', { ref:node => { this.reviewHost=node; }, 'data-docx-viewer-changes-panel':'true' });
      return React.createElement('div', wrapperProps, viewer, panel);
    }
  }

  function useDocxViewer(source, options = {}) {
    if (!React.useEffect || !React.useRef || !React.useState || !React.useCallback) {
      throw new Error('useDocxViewer requires React with Hooks support');
    }
    const viewerRef = React.useRef(null);
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    React.useEffect(() => {
      const target = viewerRef.current;
      if (!target || source == null) { setResult(null); return undefined; }
      const controller = new AbortController();
      let active = true;
      setLoading(true); setError(null);
      let current = null;
      setResult(null);
      openDocxImpl(source, target, { ...(options || {}), signal:controller.signal })
        .then(next => { current = next; if (active) setResult(next); else next?.dispose?.(); })
        .catch(err => { if (active && err?.name !== 'AbortError') setError(err); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; controller.abort(); current?.dispose?.(); };
    }, [source, options]);
    return {
      viewerRef, result, loading, error,
      changes: result?.changeIndex || EMPTY_CHANGE_INDEX,
      nextChange: React.useCallback((opts) => result?.changeNavigation?.next(opts) || null, [result]),
      previousChange: React.useCallback((opts) => result?.changeNavigation?.previous(opts) || null, [result]),
      selectChange: React.useCallback((id, opts) => result?.changeNavigation?.goTo(id, opts) || null, [result])
    };
  }

  return { DocxViewer, useDocxViewer };
}

const EMPTY_CHANGE_INDEX = Object.freeze({ items:Object.freeze([]), counts:Object.freeze({ total:0, insert:0, delete:0, moveFrom:0, moveTo:0 }) });

function buildReactOptions(props, signal, reviewHost) {
  const options = { ...(props.options || {}), signal };
  if (props.revisions !== undefined && options.revisions === undefined) options.revisions = props.revisions;
  if (props.fonts !== undefined && options.fonts === undefined) options.fonts = props.fonts;
  if (props.changesPanel && options.changesPanel === undefined) {
    options.changesPanel = typeof props.changesPanel === 'object' && props.changesPanel !== true
      ? { ...props.changesPanel, target: props.changesPanel.target || reviewHost }
      : reviewHost;
  }
  return options;
}
