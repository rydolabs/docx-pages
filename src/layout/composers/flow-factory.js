import { layoutParagraph } from "../primitives/text-layout.js";
import { layoutTable } from "../primitives/table-layout.js";
import { layoutFloating } from "../primitives/floating-layout.js";

/**
 * Convert IR flow nodes into lazy layout block factories.
 * Pagination/composers consume factories and do not need to know IR details.
 */
export function createFlowFactories(flowNodes, context) {
  return (flowNodes || []).map(node => createFlowFactory(node, context));
}

export function createFlowFactory(node, {
  layoutContext,
  documentIR,
  measurer,
  fontResolver,
  fieldContext = null,
  lineBreaker = null,
  lineBreakRules = null
}) {
  const factory = ({ x, y, widthPt, flowResolver = null }) => {
    if (node.type === "paragraph") {
      return layoutParagraph(node, {
        x, y, widthPt, measurer, flowResolver,
        documentGrid: layoutContext.documentGrid,
        defaultTabStop: documentIR.settings?.defaultTabStop,
        fontResolver,
        fieldContext,
        lineBreaker,
        lineBreakRules
      });
    }
    if (node.type === "table") {
      return layoutTable(node, {
        x, y, widthPt, measurer,
        documentGrid: documentIR.settings?.compatibility?.adjustLineHeightInTable
          ? layoutContext.documentGrid
          : null,
        fontResolver,
        fieldContext,
        defaultTabStop: documentIR.settings?.defaultTabStop,
        lineBreaker,
        lineBreakRules
      });
    }
    return layoutFloating(node, {
      x, y, widthPt, resources: documentIR.resources, measurer, fontResolver,
      documentGrid: layoutContext.documentGrid,
      fieldContext,
      defaultTabStop: documentIR.settings?.defaultTabStop,
      lineBreaker, lineBreakRules
    });
  };
  factory.kind = node.type;
  return factory;
}
