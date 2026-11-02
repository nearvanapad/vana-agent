import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Model text as React elements. Raw HTML is never rendered; links open in a new tab. */
export function Md({ text }: { text: string }) {
  return (
    <div className="md space-y-3 leading-relaxed break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2 hover:text-accent-hi">
              {children}
            </a>
          ),
          code: ({ children, className }) =>
            className ? (
              <code className={`${className} font-mono text-[0.85em]`}>{children}</code>
            ) : (
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
            ),
          pre: ({ children }) => <pre className="overflow-x-auto rounded-well bg-surface-2 p-3 text-sm">{children}</pre>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line px-2 py-1 text-left font-medium text-text-2">{children}</th>,
          td: ({ children }) => <td className="border-b border-line/60 px-2 py-1 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-line pl-3 text-text-2">{children}</blockquote>,
          img: () => null,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
