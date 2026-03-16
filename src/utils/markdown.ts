import katex from 'katex';

// Simple Markdown to HTML converter
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  let processed = markdown;
  const mathBlocks: string[] = [];
  
  // Extract and render Block Math $$...$$
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
    try {
      const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
      mathBlocks.push(html);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    } catch(e) { return match; }
  });
  
  // Extract and render Inline Math $...$
  processed = processed.replace(/\$([^$\n]+?)\$/g, (match, math) => {
    try {
      const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
      mathBlocks.push(html);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    } catch(e) { return match; }
  });

  processed = processed
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
    
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
    
    // Italic
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    
    // Lists
    .replace(/^\* (.+)/gim, '<li class="ml-4">• $1</li>')
    .replace(/^- (.+)/gim, '<li class="ml-4">• $1</li>')
    
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br />')
    
    // Wrap in paragraphs
    .replace(/^(.+)/g, '<p class="mb-4">$1</p>');

  // Put math blocks back in
  processed = processed.replace(/__MATH_BLOCK_(\d+)__/g, (match, index) => {
    return mathBlocks[parseInt(index, 10)] || match;
  });
    
  return processed;
}

// Sanitize HTML to prevent XSS
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed[^>]*>.*?<\/embed>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}
