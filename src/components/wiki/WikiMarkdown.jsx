import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { headingId } from '@/lib/wiki';

// קישור פנימי → Link של Next (ניווט SPA ללא טעינת דף); חיצוני → טאב חדש
function SmartLink({ href = '', children }) {
  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} className="text-primary font-medium hover:underline underline-offset-4">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-medium hover:underline underline-offset-4"
    >
      {children}
    </a>
  );
}

const components = {
  h2: ({ children }) => (
    <h2
      id={headingId(childrenToText(children))}
      className="text-3xl font-bold text-primary-dark font-frank mt-10 mb-4 pb-2 border-b-2 border-primary/20 scroll-mt-28"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-2xl font-bold text-primary mt-8 mb-3 scroll-mt-28">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="text-xl font-bold text-primary-dark mt-6 mb-2">{children}</h4>,
  p: ({ children }) => <p className="leading-relaxed mb-4 text-lg">{children}</p>,
  ul: ({ children }) => <ul className="list-disc mr-6 space-y-2 mb-5 text-lg">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal mr-6 space-y-2 mb-5 text-lg">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: SmartLink,
  strong: ({ children }) => <strong className="font-bold text-primary-dark">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-r-4 border-primary/40 bg-surface-variant rounded-lg pr-4 py-2 my-4">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-neutral-200" />,
  code: ({ children }) => (
    <code dir="ltr" className="bg-surface-variant text-primary-dark px-2 py-0.5 rounded text-base font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre dir="ltr" className="bg-neutral-800 text-white p-4 rounded-lg overflow-x-auto text-sm my-4">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-neutral-200">
      <table className="w-full text-right">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-primary/10">{children}</thead>,
  th: ({ children }) => (
    <th className="p-3 font-bold text-primary-dark border-b-2 border-primary/20">{children}</th>
  ),
  td: ({ children }) => <td className="p-3 border-b border-neutral-100 align-top">{children}</td>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} className="max-w-full rounded-xl shadow-md my-4 mx-auto" loading="lazy" />
  ),
};

function childrenToText(children) {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return childrenToText(children.props.children);
  }
  return '';
}

export default function WikiMarkdown({ markdown }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
