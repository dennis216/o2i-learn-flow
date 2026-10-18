import katex from "katex";

export interface MathIssue {
  offset: number;
  message: string;
}

export interface MathAnalysis {
  renderContent: string;
  issues: MathIssue[];
}

/** Convert the XLSX template's delimiters for remark-math only; never change the source cell. */
export function analyzeQuestionBankMath(content: string): MathAnalysis {
  const issues: MathIssue[] = [];
  let renderContent = "";
  let index = 0;

  const checkLatex = (body: string, displayMode: boolean, offset: number) => {
    if (!body.trim()) {
      issues.push({ offset, message: "Math expression is empty" });
      return;
    }
    try {
      katex.renderToString(body, { displayMode, throwOnError: true });
    } catch (error) {
      issues.push({
        offset,
        message: `LaTeX cannot be rendered: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  while (index < content.length) {
    // Markdown code is literal text, not mathematical content.
    if (content.startsWith("```", index)) {
      const end = content.indexOf("```", index + 3);
      const next = end < 0 ? content.length : end + 3;
      renderContent += content.slice(index, next);
      index = next;
      continue;
    }
    if (content[index] === "`") {
      const end = content.indexOf("`", index + 1);
      const next = end < 0 ? content.length : end + 1;
      renderContent += content.slice(index, next);
      index = next;
      continue;
    }
    if (content.startsWith("\\$", index)) {
      renderContent += "\\$";
      index += 2;
      continue;
    }

    const opener = content.startsWith("\\(", index)
      ? { close: "\\)", display: false, length: 2 }
      : content.startsWith("\\[", index)
        ? { close: "\\]", display: true, length: 2 }
        : content.startsWith("$$", index)
          ? { close: "$$", display: true, length: 2 }
          : content[index] === "$"
            ? { close: "$", display: false, length: 1 }
            : null;

    if (opener) {
      const bodyStart = index + opener.length;
      let end = content.indexOf(opener.close, bodyStart);
      while (end >= 0 && content[end - 1] === "\\" && opener.close[0] === "$") {
        end = content.indexOf(opener.close, end + opener.close.length);
      }
      if (end < 0) {
        issues.push({ offset: index, message: `Unclosed math delimiter: ${content.slice(index, bodyStart)}` });
        renderContent += content.slice(index);
        break;
      }

      const body = content.slice(bodyStart, end);
      checkLatex(body, opener.display, index);
      if (content[index] === "\\") {
        renderContent += opener.display ? `\n$$\n${body}\n$$\n` : `$${body}$`;
      } else {
        renderContent += content.slice(index, end + opener.close.length);
      }
      index = end + opener.close.length;
      continue;
    }

    if (content.startsWith("\\)", index) || content.startsWith("\\]", index)) {
      issues.push({ offset: index, message: `Unexpected closing math delimiter: ${content.slice(index, index + 2)}` });
      renderContent += content.slice(index, index + 2);
      index += 2;
      continue;
    }

    renderContent += content[index];
    index += 1;
  }

  return { renderContent, issues };
}
