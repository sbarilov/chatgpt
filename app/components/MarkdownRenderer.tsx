"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !className;
          if (isInline) {
            return (
              <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          }
          return (
            <CodeBlock language={match?.[1]}>
              {String(children).replace(/\n$/, "")}
            </CodeBlock>
          );
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-6 mb-3">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-6 mb-3">{children}</ol>;
        },
        li({ children }) {
          return <li className="mb-1">{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-2xl font-bold mb-3 mt-4">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-lg font-bold mb-2 mt-3">{children}</h3>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-gray-500 pl-4 italic my-3">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-gray-600">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-gray-600 px-3 py-1.5 bg-gray-700 text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-gray-600 px-3 py-1.5">{children}</td>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
