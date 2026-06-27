document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';

// vitest-browser-svelte appends a plain <div> to body as the render container.
const style = document.createElement('style');
style.textContent = 'body > div { height: 100%; }';
document.head.appendChild(style);
